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
// Buckets that take days to move money out of (brokerage cash). A transfer from one of these can
// be "fronted": Save pays the paying account today, and the slow bucket reimburses Save later.
export const SLOW_SOURCES = ['marriage_starter'];
export const FRONT_FROM = 'save';

// Turn the plain transfer list into the routed plan: fronted transfers become two legs.
export function routeTransfers(transfers, frontFrom) {
  if (!frontFrom) return { plan: transfers.map(t => ({ ...t, kind: 'transfer' })), reimbursements: [] };
  const plan = [], reimbursements = [];
  for (const t of transfers) {
    if (SLOW_SOURCES.includes(t.from) && t.from !== frontFrom) {
      plan.push({ from: frontFrom, to: t.to, amount: t.amount, kind: 'front', fronted_for: t.from });
      reimbursements.push({ from: t.from, to: frontFrom, amount: t.amount, kind: 'reimbursement', status: 'pending' });
    } else plan.push({ ...t, kind: 'transfer' });
  }
  return { plan, reimbursements };
}

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
// 'Today' in the household's timezone, not the server's (Vercel runs in UTC).
const TZ = process.env.HOUSEHOLD_TZ || 'America/New_York';
export const todayLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

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
export function statementWindow(card, today = todayLocal()) {
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

// A rule becomes trusted after this many consistent confirmations; below that the
// charge still gets the rule's bucket but shows up in the review queue.
export const TRUSTED_CONFIDENCE = 2;

export function allocateTransactions(txns, { rules, overrides, defaultBucket, cardId }) {
  return txns.map(t => {
    const override = overrides[t.plaid_transaction_id];
    if (override) return { ...t, bucket: override.bucket, source: 'manual', confidence: 99, needs_review: false, note: override.note || null };
    const rule = matchRule(t, rules, cardId);
    if (rule) {
      const c = rule.confidence ?? 1;
      return { ...t, bucket: rule.bucket, source: 'rule', rule_id: rule.id, rule_pattern: rule.pattern, confidence: c, needs_review: c < TRUSTED_CONFIDENCE };
    }
    return { ...t, bucket: defaultBucket, source: 'default', confidence: 0, needs_review: true };
  });
}

// Confidence = how many of the user's own decisions agree with the rule. Derived from
// transaction_allocations joined to transactions by merchant, so no extra schema is needed.
async function attachConfidence(supabase, rules) {
  if (!rules.length) return rules;
  const { data: allocs } = await supabase.from('transaction_allocations').select('plaid_transaction_id, bucket');
  if (!allocs?.length) return rules.map(r => ({ ...r, confidence: 1 }));
  const ids = allocs.map(a => a.plaid_transaction_id);
  const names = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('transactions').select('plaid_transaction_id, merchant_name, name').in('plaid_transaction_id', ids.slice(i, i + 200));
    (data || []).forEach(t => { names[t.plaid_transaction_id] = `${t.merchant_name || ''} ${t.name || ''}`.toLowerCase(); });
  }
  return rules.map(r => {
    const pat = r.pattern.toLowerCase();
    const agree = allocs.filter(a => a.bucket === r.bucket && (names[a.plaid_transaction_id] || '').includes(pat)).length;
    return { ...r, confidence: Math.max(1, agree) };
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
  return { rules: await attachConfidence(supabase, rules || []), overrides: overrideMap };
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
  res.json({ rules: await attachConfidence(req.supabase, data || []), trusted_at: TRUSTED_CONFIDENCE });
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
  const { plaid_transaction_id, bucket, note = null, save_rule = true, card_id = null } = req.body || {};
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

// Record the official statement balance for a period (from the Amex/Discover statement).
// Stored on the payoffs row with paid_at NULL until the payoff is completed.
router.post('/payoff/statement', async (req, res) => {
  const { card_id, period_start, period_end, due_date = null, statement_amount } = req.body || {};
  if (!card_id || !period_start || !period_end || !(Number(statement_amount) >= 0)) return res.status(400).json({ error: 'card_id, period_start, period_end, statement_amount required' });
  const { data: near } = await req.supabase.from('payoffs').select('id, paid_at, period_end').eq('card_id', card_id)
    .gte('period_end', addDays(period_end, -5)).lte('period_end', addDays(period_end, 5));
  const existing = (near || [])[0] || null;
  for (const r of (near || [])) if (r.period_end !== period_end) await req.supabase.from('payoffs').delete().eq('id', r.id);
  const row = { user_id: req.userId, card_id, period_start, period_end, due_date, statement_amount: num(statement_amount), paid_at: existing?.paid_at || null };
  const { data, error } = await req.supabase.from('payoffs').upsert(row, { onConflict: 'user_id,card_id,period_end' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ payoff: data });
});

// "Need the cash now": front slow-bucket transfers from Save for this cycle (or turn it off).
router.post('/payoff/route', async (req, res) => {
  const { card_id, period_start, period_end, due_date = null, front = true } = req.body || {};
  if (!card_id || !period_start || !period_end) return res.status(400).json({ error: 'card_id, period_start, period_end required' });
  const { data: existing } = await req.supabase.from('payoffs').select('*').eq('card_id', card_id).eq('period_end', period_end).maybeSingle();
  if (existing?.paid_at) return res.status(400).json({ error: 'This payoff is already marked paid' });
  const row = { user_id: req.userId, card_id, period_start, period_end, due_date, paid_at: null,
    statement_amount: existing?.statement_amount ?? null, transfers: { front_from: front ? FRONT_FROM : null } };
  const { data, error } = await req.supabase.from('payoffs').upsert(row, { onConflict: 'user_id,card_id,period_end' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ payoff: data });
});

// Reimbursements still owed to Save by slow buckets (from completed payoffs), and marking them done.
router.get('/payoff/reimbursements', async (req, res) => {
  const { data, error } = await req.supabase.from('payoffs').select('id, card_id, period_end, paid_at, transfers').not('paid_at', 'is', null).order('paid_at', { ascending: false }).limit(60);
  if (error) return res.status(500).json({ error: error.message });
  const items = [];
  for (const p of data || []) {
    const list = Array.isArray(p.transfers) ? p.transfers : [];
    list.forEach((t, i) => { if (t.kind === 'reimbursement') items.push({ payoff_id: p.id, index: i, card_id: p.card_id, period_end: p.period_end, paid_at: p.paid_at, ...t }); });
  }
  res.json({ reimbursements: items, pending_total: num(items.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0)) });
});

router.post('/payoff/reimbursements/done', async (req, res) => {
  const { payoff_id, index } = req.body || {};
  const { data: p } = await req.supabase.from('payoffs').select('transfers').eq('id', payoff_id).maybeSingle();
  if (!p || !Array.isArray(p.transfers) || !p.transfers[index]) return res.status(404).json({ error: 'reimbursement not found' });
  const transfers = p.transfers.map((t, i) => i === index ? { ...t, status: 'done', done_at: new Date().toISOString() } : t);
  const { error } = await req.supabase.from('payoffs').update({ transfers }).eq('id', payoff_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Merchant lookup: "where am I at with Bonobos?"
router.get('/merchant', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'q must be at least 2 characters' });
  const like = `*${q.replace(/[%*,()]/g, '')}*`;
  const { data, error } = await req.supabase.from('transactions').select('plaid_transaction_id, date, amount, name, merchant_name, app_account_type, pending')
    .or(`merchant_name.ilike.${like},name.ilike.${like}`).order('date', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message });
  const rows = (data || []).filter(r => !r.pending);
  const purchases = num(rows.filter(r => Number(r.amount) > 0).reduce((s, r) => s + Number(r.amount), 0));
  const refunds = num(rows.filter(r => Number(r.amount) < 0).reduce((s, r) => s + Number(r.amount), 0));
  res.json({ query: q, count: rows.length, purchases, refunds, net: num(purchases + refunds), first: rows.length ? rows[rows.length - 1].date : null, last: rows[0]?.date || null, items: rows });
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
    let start = dateRe.test(req.query.start || '') ? req.query.start : computed.start;
    let end = dateRe.test(req.query.end || '') ? req.query.end : computed.end;
    const payingBucket = card.paid_from_bucket || 'live';

    // A saved statement for this cycle (matched by close date, +/- 3 days) pins the exact window,
    // because real statement periods drift a day or two around the nominal close day.
    const { data: priorRows } = await req.supabase.from('payoffs').select('*').eq('card_id', cardId)
      .gte('period_end', addDays(end, -3)).lte('period_end', addDays(end, 3)).order('period_end', { ascending: false }).limit(1);
    const prior = priorRows?.[0] || null;
    if (prior && !req.query.start && !req.query.end) { start = prior.period_start; end = prior.period_end; }

    const [{ data: txns, error: txnErr }, { data: snap }, { data: cfg }] = await Promise.all([
      cardTxnQuery(req.supabase, cardId, start, end),
      req.supabase.from('balance_snapshots').select('buckets, cards, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      req.supabase.from('app_config').select('cushion').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (txnErr) return res.status(500).json({ error: txnErr.message });

    // Card payments and other credits coming INTO the card are not spending: keep them out of the
    // allocation and report them separately.
    const isPayment = t => Number(t.amount) < 0 && /CREDIT_CARD_PAYMENT|^TRANSFER_IN/.test(pfc(t)?.detailed || '');
    const posted = (txns || []).filter(t => !t.pending);
    const payments = posted.filter(isPayment);
    const list = posted.filter(t => !isPayment(t));
    const { rules, overrides } = await loadRulesAndOverrides(req.supabase, list.map(t => t.plaid_transaction_id));
    const allocated = allocateTransactions(list, { rules, overrides, defaultBucket: payingBucket, cardId });
    const { totals, transfers: rawTransfers, total } = buildTransfers(allocated, payingBucket);
    const frontFrom = prior && prior.transfers && !Array.isArray(prior.transfers) ? prior.transfers.front_from || null : null;
    const routed = routeTransfers(rawTransfers, frontFrom);
    const transfers = routed.plan;
    const canFront = rawTransfers.some(t => SLOW_SOURCES.includes(t.from));

    // Statement amount: what you typed from the statement > Plaid's statement balance > window total.
    // Window totals go by transaction date and can miss credits that Amex posted to a different
    // statement, so the difference is attributed to the paying bucket rather than hidden.
    const snapCard = snap?.cards?.[cardId] || null;
    const plaidStatement = snapCard && snapCard.statement != null && snapCard.statement !== snapCard.total ? snapCard.statement : null;
    const enteredStatement = prior?.statement_amount != null ? Number(prior.statement_amount) : null;
    const statementAmount = enteredStatement ?? plaidStatement ?? total;
    const statementSource = enteredStatement != null ? 'entered' : plaidStatement != null ? 'plaid' : 'window';
    const difference = num(statementAmount - total);
    const payingBalance = snap?.buckets?.[payingBucket] ?? null;
    const transfersIn = num(transfers.reduce((s, t) => s + t.amount, 0));
    const cushion = Number(cfg?.cushion ?? 0);
    const afterPayment = payingBalance != null ? num(payingBalance + transfersIn - statementAmount) : null;
    const daysUntilDue = computed.due ? Math.round((parse(computed.due) - parse(todayLocal())) / 86400000) : null;
    const needsReview = allocated.filter(t => t.needs_review);
    // The balance sync falls back to the current balance when Plaid has no last_statement_balance,
    // so statement === total means "unknown", not "statement equals current".
    res.json({
      statement: { amount: statementAmount, source: statementSource, difference, entered: enteredStatement, plaid: plaidStatement },
      readiness: {
        paying_balance: payingBalance, transfers_in: transfersIn, after_payment: afterPayment, cushion,
        shortfall: afterPayment != null ? Math.max(0, num(cushion - afterPayment)) : null,
        short: afterPayment != null && afterPayment < 0,
        below_cushion: afterPayment != null && afterPayment >= 0 && afterPayment < cushion,
        days_until_due: daysUntilDue,
        balances_as_of: snap?.created_at || null,
      },
      routing: { front_from: frontFrom, can_front: canFront, slow_sources: SLOW_SOURCES, reimbursements: routed.reimbursements },
      needs_review_count: needsReview.length,
      needs_review_ids: needsReview.map(t => t.plaid_transaction_id),
      payments: payments.map(t => ({ date: t.date, amount: Math.abs(Number(t.amount)), name: t.merchant_name || t.name })),
      card,
      period: { start, end, due: prior?.due_date || computed.due, computed: start === computed.start && end === computed.end, pinned: !!prior },
      paying_bucket: payingBucket,
      transactions: allocated,
      pending_count: (txns || []).length - list.length,
      totals,
      transfers,
      transactions_total: total,
      statement_balance: plaidStatement,
      current_balance: snapCard?.total ?? null,
      balance_as_of: snap?.created_at || null,
      completed: prior?.paid_at ? prior : null,
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
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayLocal().slice(0, 7);
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
      const type = ({ mat: 'person1', mara: 'person2' })[t.app_account_type] || t.app_account_type || 'unmapped';
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

    // Income rows are negative in Plaid's convention; report them as positive magnitudes.
    // Spending rows keep their sign so refunds net against purchases.
    const sumBy = (arr, key, { magnitude = false } = {}) => {
      const out = {};
      for (const t of arr) { const k = t[key] || 'OTHER'; const v = magnitude ? Math.abs(Number(t.amount)) : Number(t.amount); out[k] = num((out[k] || 0) + v); }
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
      income: { total: incomeTotal, by_bucket: sumBy(income, 'bucket', { magnitude: true }), by_category: sumBy(income, 'primary', { magnitude: true }), items: income },
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
