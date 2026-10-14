// ─── Payoff + P&L routes ───────────────────────────────────────────────────────
// Mounted at /api by server/index.js AFTER requireAuth, so every handler has
// req.supabase (RLS-scoped client) and req.userId.
//
//   GET  /api/payoff/rules                       list allocation rules
//   POST /api/payoff/rules                       { pattern, bucket, card_id? } upsert
//   DELETE /api/payoff/rules/:id
//   GET  /api/payoff/:card_id?start=&end=        statement window, transactions w/ allocations, transfers
//   POST /api/payoff/allocate                    { plaid_transaction_id, bucket, save_rule?, card_id? }
//   POST /api/payoff/complete                    { card_id, period_start, period_end, due_date, statement_amount, allocations, transfers }
//   GET  /api/pnl?month=YYYY-MM                  household income statement for a calendar month
//
// Money never moves. These endpoints only compute what to move and record what you did.

import { Router } from 'express';

const router = Router();

export const BUCKETS = ['give', 'save', 'live', 'person1', 'person2', 'marriage_starter'];

// Plaid detailed categories that are internal money movement, not income or spending.
const INTERNAL_DETAILED = new Set([
  'TRANSFER_IN_ACCOUNT_TRANSFER',
  'TRANSFER_OUT_ACCOUNT_TRANSFER',
  'TRANSFER_IN_SAVINGS',
  'TRANSFER_OUT_SAVINGS',
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
  'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
  'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
]);

// ─── Date helpers (all YYYY-MM-DD strings, no timezone games) ────────────────
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = s => new Date(`${s}T00:00:00Z`);
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const daysInMonth = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
// Date in (year, month0) on `day`, clamped to month length (so "31" works in Feb).
const onDay = (y, m0, day) => ymd(new Date(Date.UTC(y, m0, Math.min(day, daysInMonth(y, m0)))));

// Most recent occurrence of `day` on or before `today`.
function lastOccurrence(today, day) {
  const t = parse(today);
  let y = t.getUTCFullYear(), m = t.getUTCMonth();
  let candidate = onDay(y, m, day);
  if (candidate > today) { m -= 1; if (m < 0) { m = 11; y -= 1; } candidate = onDay(y, m, day); }
  return candidate;
}
// First occurrence of `day` strictly after `from`.
function nextOccurrence(from, day) {
  const f = parse(from);
  let y = f.getUTCFullYear(), m = f.getUTCMonth();
  let candidate = onDay(y, m, day);
  if (candidate <= from) { m += 1; if (m > 11) { m = 0; y += 1; } candidate = onDay(y, m, day); }
  return candidate;
}

// Statement window for a card given its close day. Returns { start, end, due }.
export function statementWindow(card, today = ymd(new Date())) {
  const closeDay = card.statement_close_day || 1;
  const end = lastOccurrence(today, closeDay);
  const prevEnd = lastOccurrence(addDays(end, -1), closeDay);
  const start = addDays(prevEnd, 1);
  const due = card.due_day ? nextOccurrence(end, card.due_day) : null;
  return { start, end, due };
}

// ─── Allocation ──────────────────────────────────────────────────────────────
const num = v => Math.round((Number(v) || 0) * 100) / 100;

function matchRule(txn, rules, cardId) {
  const hay = `${txn.merchant_name || ''} ${txn.name || ''}`.toLowerCase();
  // Card-specific rules win over global ones; longer patterns win over shorter.
  const sorted = [...rules]
    .filter(r => !r.card_id || r.card_id === cardId)
    .sort((a, b) => (b.card_id ? 1 : 0) - (a.card_id ? 1 : 0) || b.pattern.length - a.pattern.length);
  return sorted.find(r => hay.includes(r.pattern.toLowerCase())) || null;
}

export function allocateTransactions(txns, { rules, overrides, defaultBucket, cardId }) {
  return txns.map(t => {
    const override = overrides[t.plaid_transaction_id];
    if (override) return { ...t, bucket: override.bucket, source: 'manual', note: override.note || null };
    const rule = matchRule(t, rules, cardId);
    if (rule) return { ...t, bucket: rule.bucket, source: 'rule', rule_id: rule.id, rule_pattern: rule.pattern };
    return { ...t, bucket: defaultBucket, source: 'default' };
  });
}

// Sum by bucket, then turn that into the transfers needed into the paying account.
export function buildTransfers(allocated, payingBucket) {
  const totals = {};
  for (const t of allocated) totals[t.bucket] = num((totals[t.bucket] || 0) + Number(t.amount));
  const transfers = Object.entries(totals)
    .filter(([b, amt]) => b !== payingBucket && amt > 0)
    .map(([b, amt]) => ({ from: b, to: payingBucket, amount: amt }))
    .sort((a, b) => b.amount - a.amount);
  const total = num(Object.values(totals).reduce((s, v) => s + v, 0));
  return { totals, transfers, total };
}

async function loadRulesAndOverrides(supabase, txnIds) {
  const [{ data: rules }, { data: overrides }] = await Promise.all([
    supabase.from('allocation_rules').select('*'),
    txnIds.length
      ? supabase.from('transaction_allocations').select('*').in('plaid_transaction_id', txnIds)
      : Promise.resolve({ data: [] }),
  ]);
  const overrideMap = {};
  (overrides || []).forEach(o => { overrideMap[o.plaid_transaction_id] = o; });
  return { rules: rules || [], overrides: overrideMap };
}

async function loadCard(supabase, cardId) {
  const { data } = await supabase.from('credit_cards').select('*').eq('card_id', cardId).maybeSingle();
  return data;
}

// Transactions for a card. app_account_type is the card_id for flexible mappings,
// or `${card_id}_total` for legacy rows.
function cardTxnQuery(supabase, cardId, start, end) {
  return supabase.from('transactions').select('*')
    .in('app_account_type', [cardId, `${cardId}_total`])
    .gte('date', start).lte('date', end)
    .order('date', { ascending: false });
}

// ─── Rules ───────────────────────────────────────────────────────────────────
router.get('/payoff/rules', async (req, res) => {
  const { data, error } = await req.supabase.from('allocation_rules').select('*').order('pattern');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rules: data || [] });
});

router.post('/payoff/rules', async (req, res) => {
  const { pattern, bucket, card_id = null } = req.body || {};
  if (!pattern || typeof pattern !== 'string' || pattern.trim().length < 2) return res.status(400).json({ error: 'pattern must be at least 2 characters' });
  if (!BUCKETS.includes(bucket)) return res.status(400).json({ error: `bucket must be one of ${BUCKETS.join(', ')}` });
  const { data, error } = await req.supabase.from('allocation_rules')
    .upsert({ user_id: req.userId, pattern: pattern.trim(), bucket, card_id }, { onConflict: 'user_id,pattern,card_id' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rule: data });
});

router.delete('/payoff/rules/:id', async (req, res) => {
  const { error } = await req.supabase.from('allocation_rules').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── Allocate one transaction (and optionally save it as a rule) ─────────────
router.post('/payoff/allocate', async (req, res) => {
  const { plaid_transaction_id, bucket, note = null, save_rule = false, card_id = null } = req.body || {};
  if (!plaid_transaction_id) return res.status(400).json({ error: 'plaid_transaction_id required' });
  if (!BUCKETS.includes(bucket)) return res.status(400).json({ error: `bucket must be one of ${BUCKETS.join(', ')}` });

  const { error } = await req.supabase.from('transaction_allocations')
    .upsert({ user_id: req.userId, plaid_transaction_id, bucket, note, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,plaid_transaction_id' });
  if (error) return res.status(500).json({ error: error.message });

  let rule = null;
  if (save_rule) {
    const { data: txn } = await req.supabase.from('transactions')
      .select('merchant_name, name').eq('plaid_transaction_id', plaid_transaction_id).maybeSingle();
    const pattern = (txn?.merchant_name || txn?.name || '').trim();
    if (pattern.length >= 2) {
      const { data } = await req.supabase.from('allocation_rules')
        .upsert({ user_id: req.userId, pattern, bucket, card_id }, { onConflict: 'user_id,pattern,card_id' })
        .select().single();
      rule = data;
    }
  }
  res.json({ success: true, rule });
});

// ─── Complete a payoff ───────────────────────────────────────────────────────
router.post('/payoff/complete', async (req, res) => {
  const { card_id, period_start, period_end, due_date = null, statement_amount = null, allocations = {}, transfers = [] } = req.body || {};
  if (!card_id || !period_start || !period_end) return res.status(400).json({ error: 'card_id, period_start, period_end required' });
  const { data, error } = await req.supabase.from('payoffs')
    .upsert({ user_id: req.userId, card_id, period_start, period_end, due_date, statement_amount, allocations, transfers, paid_at: new Date().toISOString() },
      { onConflict: 'user_id,card_id,period_end' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ payoff: data });
});

router.get('/payoff/history', async (req, res) => {
  const { data, error } = await req.supabase.from('payoffs').select('*').order('period_end', { ascending: false }).limit(36);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ payoffs: data || [] });
});

// ─── The payoff view for one card ────────────────────────────────────────────
router.get('/payoff/:card_id', async (req, res) => {
  try {
    const cardId = req.params.card_id;
    const card = await loadCard(req.supabase, cardId);
    if (!card) return res.status(404).json({ error: `No credit card configured with card_id '${cardId}'. Set it up under Accounts.` });

    const computed = statementWindow(card);
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const start = dateRe.test(req.query.start || '') ? req.query.start : computed.start;
    const end = dateRe.test(req.query.end || '') ? req.query.end : computed.end;
    const payingBucket = card.paid_from_bucket || 'live';

    const [{ data: txns, error: txnErr }, { data: snap }, { data: prior }] = await Promise.all([
      cardTxnQuery(req.supabase, cardId, start, end),
      req.supabase.from('balance_snapshots').select('cards, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      req.supabase.from('payoffs').select('*').eq('card_id', cardId).eq('period_end', end).maybeSingle(),
    ]);
    if (txnErr) return res.status(500).json({ error: txnErr.message });

    const list = (txns || []).filter(t => !t.pending);
    const { rules, overrides } = await loadRulesAndOverrides(req.supabase, list.map(t => t.plaid_transaction_id));
    const allocated = allocateTransactions(list, { rules, overrides, defaultBucket: payingBucket, cardId });
    const { totals, transfers, total } = buildTransfers(allocated, payingBucket);

    const snapCard = snap?.cards?.[cardId] || null;
    res.json({
      card,
      period: { start, end, due: computed.due, computed: start === computed.start && end === computed.end },
      paying_bucket: payingBucket,
      transactions: allocated,
      pending_count: (txns || []).length - list.length,
      totals,
      transfers,
      transactions_total: total,
      statement_balance: snapCard?.statement ?? null,
      current_balance: snapCard?.total ?? null,
      balance_as_of: snap?.created_at || null,
      completed: prior || null,
    });
  } catch (err) {
    console.error('GET /api/payoff/:card_id', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Monthly P&L ─────────────────────────────────────────────────────────────
function pfc(t) {
  try { return t.personal_finance_category ? JSON.parse(t.personal_finance_category) : null; } catch { return null; }
}
const isCardType = (type, cardIds) => cardIds.has(type) || cardIds.has(type.replace(/_total$/, ''));

router.get('/pnl', async (req, res) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : ymd(new Date()).slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = `${month}-${pad(daysInMonth(y, m - 1))}`;

    const [{ data: txns, error }, { data: cards }, { data: cfg }] = await Promise.all([
      req.supabase.from('transactions').select('*').gte('date', start).lte('date', end).eq('pending', false),
      req.supabase.from('credit_cards').select('*'),
      req.supabase.from('app_config').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (error) return res.status(500).json({ error: error.message });

    const cardIds = new Set((cards || []).map(c => c.card_id).concat(['blue', 'gold', 'discover']));
    const payingBucketByCard = {};
    (cards || []).forEach(c => { payingBucketByCard[c.card_id] = c.paid_from_bucket || 'live'; });

    const all = txns || [];
    const { rules, overrides } = await loadRulesAndOverrides(req.supabase, all.map(t => t.plaid_transaction_id));

    const income = [];        // negative amounts on checking accounts (Plaid: negative = money in)
    const spending = [];      // positive amounts anywhere (cards + checking), refunds net against them
    const internal = [];      // transfers, card payments: excluded from both

    for (const t of all) {
      const cat = pfc(t);
      const detailed = cat?.detailed || '';
      const primary = cat?.primary || 'OTHER';
      const type = t.app_account_type || 'unmapped';
      const onCard = isCardType(type, cardIds);

      if (INTERNAL_DETAILED.has(detailed) || (onCard && Number(t.amount) < 0 && /PAYMENT|TRANSFER/.test(detailed))) {
        internal.push({ ...t, primary, detailed });
        continue;
      }
      if (!onCard && Number(t.amount) < 0) {
        income.push({ ...t, primary, detailed, bucket: type });
        continue;
      }
      // Spending: allocate card charges to a bucket the same way payoff does; checking debits belong to their account.
      let bucket = type;
      if (onCard) {
        const cardId = type.replace(/_total$/, '');
        const [a] = allocateTransactions([t], { rules, overrides, defaultBucket: payingBucketByCard[cardId] || 'live', cardId });
        bucket = a.bucket;
      }
      spending.push({ ...t, primary, detailed, bucket });
    }

    const sumBy = (arr, key) => {
      const out = {};
      for (const t of arr) { const k = t[key] || 'OTHER'; out[k] = num((out[k] || 0) + Math.abs(Number(t.amount)) * (Number(t.amount) < 0 ? -1 : 1)); }
      return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
    };
    const incomeTotal = num(income.reduce((s, t) => s + Math.abs(Number(t.amount)), 0));
    const spendTotal = num(spending.reduce((s, t) => s + Number(t.amount), 0));

    // Live plan: the fixed monthly lines in app_config. Column names per CLAUDE.md.
    const liveKeys = ['monthly_rent', 'monthly_groceries', 'monthly_gas', 'monthly_date_nights', 'monthly_power', 'monthly_gym', 'monthly_insurance', 'monthly_subscriptions'];
    const livePlan = {};
    let livePlanTotal = 0;
    if (cfg) for (const k of liveKeys) if (cfg[k] != null) { livePlan[k.replace(/^monthly_/, '')] = num(cfg[k]); livePlanTotal = num(livePlanTotal + Number(cfg[k])); }
    const liveActual = num(spending.filter(t => t.bucket === 'live').reduce((s, t) => s + Number(t.amount), 0));

    res.json({
      month, start, end,
      income: { total: incomeTotal, by_bucket: sumBy(income, 'bucket'), by_category: sumBy(income, 'primary'), items: income },
      spending: { total: spendTotal, by_bucket: sumBy(spending, 'bucket'), by_category: sumBy(spending, 'primary'), items: spending },
      net: num(incomeTotal - spendTotal),
      live: { planned: livePlan, planned_total: livePlanTotal, actual: liveActual, variance: num(livePlanTotal - liveActual) },
      internal: { count: internal.length, total: num(internal.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)), items: internal },
      transaction_count: all.length,
    });
  } catch (err) {
    console.error('GET /api/pnl', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
