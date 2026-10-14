import { useState, useEffect, useMemo } from 'react';

// ─── Close view: Payoff (per card) + P&L (per calendar month) ────────────────
// Everything here reads from /api/payoff/* and /api/pnl. Money never moves.

const BUCKET_ORDER = ['live', 'person1', 'person2', 'give', 'save', 'marriage_starter'];
const fmt = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = s => s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const fmtDateLong = s => s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
const shiftMonth = (ymd, n) => { const d = new Date(`${ymd}T00:00:00`); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const titleCase = s => (s || 'Other').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function CloseView({ theme, authFetch, apiUrl, creditCards, config, onRefresh }) {
  const [tab, setTab] = useState('payoff');
  const bucketMeta = useMemo(() => ({
    live: { label: 'Live', color: theme.live },
    person1: { label: config.person1Name || 'Person 1', color: theme.mat },
    person2: { label: config.person2Name || 'Person 2', color: theme.mara },
    give: { label: 'Give', color: theme.give },
    save: { label: 'Save', color: theme.save },
    marriage_starter: { label: 'Marriage Starter', color: theme.accent },
  }), [theme, config.person1Name, config.person2Name]);

  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem 0.25rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: theme.text, margin: 0 }}>Close</h2>
        <div style={s.segment}>
          {['payoff', 'pnl'].map(k => (
            <button key={k} onClick={() => setTab(k)} style={{ ...s.segmentBtn, ...(tab === k ? s.segmentBtnActive : {}) }}>
              {k === 'payoff' ? 'Payoff' : 'P&L'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 1rem 6rem' }}>
        {tab === 'payoff'
          ? <Payoff theme={theme} s={s} authFetch={authFetch} apiUrl={apiUrl} creditCards={creditCards} bucketMeta={bucketMeta} onRefresh={onRefresh} />
          : <Pnl theme={theme} s={s} authFetch={authFetch} apiUrl={apiUrl} bucketMeta={bucketMeta} />}
      </div>
    </main>
  );
}

// ─── Payoff ──────────────────────────────────────────────────────────────────
function Payoff({ theme, s, authFetch, apiUrl, creditCards, bucketMeta, onRefresh }) {
  const cards = creditCards || [];
  const [cardId, setCardId] = useState(() => pickDefaultCard(cards));
  const [range, setRange] = useState(null);           // null = server-computed current statement
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [picker, setPicker] = useState(null);         // transaction being reallocated
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState([]);

  useEffect(() => { if (!cardId && cards.length) setCardId(pickDefaultCard(cards)); }, [cards.length]);

  const load = async () => {
    if (!cardId) return;
    setLoading(true); setError(null);
    try {
      const q = range ? `?start=${range.start}&end=${range.end}` : '';
      const r = await authFetch(`${apiUrl}/api/payoff/${cardId}${q}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to load');
      setData(j);
    } catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [cardId, range?.start, range?.end]);

  const loadRules = async () => {
    const r = await authFetch(`${apiUrl}/api/payoff/rules`); const j = await r.json(); setRules(j.rules || []);
  };
  useEffect(() => { if (showRules) loadRules(); }, [showRules]);

  const refresh = async () => {
    setRefreshing(true);
    try { await onRefresh?.(); await load(); } finally { setRefreshing(false); }
  };

  const allocate = async (txn, bucket, saveRule) => {
    setPicker(null);
    // optimistic
    setData(d => d && ({ ...d, transactions: d.transactions.map(t => t.plaid_transaction_id === txn.plaid_transaction_id ? { ...t, bucket, source: 'manual' } : t) }));
    await authFetch(`${apiUrl}/api/payoff/allocate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plaid_transaction_id: txn.plaid_transaction_id, bucket, save_rule: saveRule, card_id: saveRule ? null : undefined }),
    });
    await load();
  };

  const deleteRule = async (id) => {
    await authFetch(`${apiUrl}/api/payoff/rules/${id}`, { method: 'DELETE' });
    await loadRules(); await load();
  };

  const complete = async () => {
    if (!data) return;
    const amount = data.statement_balance ?? data.transactions_total;
    await authFetch(`${apiUrl}/api/payoff/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: cardId, period_start: data.period.start, period_end: data.period.end, due_date: data.period.due,
        statement_amount: amount, allocations: data.totals, transfers: data.transfers,
      }),
    });
    await load();
  };

  const stepPeriod = (dir) => {
    if (!data) return;
    const { start, end } = data.period;
    if (dir < 0) setRange({ start: shiftMonth(start, -1), end: addDays(start, -1) });
    else setRange({ start: addDays(end, 1), end: shiftMonth(end, 1) });
  };

  if (!cards.length) return <Empty theme={theme} text="No cards configured yet. Connect a card under Accounts and map it as a credit card." />;

  const payingLabel = data ? bucketMeta[data.paying_bucket]?.label || data.paying_bucket : '';
  const toPay = data ? (data.statement_balance ?? data.transactions_total) : 0;
  const mismatch = data && data.statement_balance != null && Math.abs(data.statement_balance - data.transactions_total) > 0.5;

  return (
    <>
      {/* Card chips */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.5rem 0' }}>
        {cards.map(c => (
          <button key={c.card_id} onClick={() => { setCardId(c.card_id); setRange(null); }}
            style={{ ...s.chip, ...(c.card_id === cardId ? s.chipActive : {}) }}>
            {c.label || c.card_id}
            <span style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: 6 }}>due {ordinal(c.due_day)}</span>
          </button>
        ))}
      </div>

      {error && <div style={{ ...s.card, borderColor: theme.danger, color: theme.dangerLight }}>{error}</div>}
      {loading && !data && <p style={{ color: theme.textMuted, textAlign: 'center', padding: '2rem' }}>Loading…</p>}

      {data && (
        <>
          {/* Statement header */}
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => stepPeriod(-1)} style={s.iconBtn}>‹</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Statement</div>
                <div style={{ fontWeight: 600 }}>{fmtDate(data.period.start)} – {fmtDate(data.period.end)}</div>
                {data.period.due && <div style={{ fontSize: '0.75rem', color: theme.textMuted }}>Due {fmtDateLong(data.period.due)}</div>}
              </div>
              <button onClick={() => stepPeriod(1)} style={s.iconBtn}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <Stat label="Statement balance" value={data.statement_balance != null ? fmt(data.statement_balance) : '—'} sub={data.balance_as_of ? `Plaid, ${relTime(data.balance_as_of)}` : 'not synced'} theme={theme} />
              <Stat label="Charges in window" value={fmt(data.transactions_total)} sub={`${data.transactions.length} transactions${data.pending_count ? `, ${data.pending_count} pending` : ''}`} theme={theme} />
            </div>
            {mismatch && (
              <div style={{ ...s.note, marginTop: '0.5rem' }}>
                Statement and window differ by {fmt(Math.abs(data.statement_balance - data.transactions_total))}. Adjust the window with ‹ › until they match, or check your close day in Settings.
              </div>
            )}
            <button onClick={refresh} disabled={refreshing} style={{ ...s.secondaryBtn, marginTop: '0.75rem', width: '100%' }}>
              {refreshing ? 'Pulling from Plaid…' : 'Refresh from Plaid'}
            </button>
          </div>

          {/* Transfers */}
          <div style={s.card}>
            <div style={s.sectionTitle}>Transfers to make</div>
            {data.transfers.length === 0
              ? <p style={{ color: theme.textMuted, margin: '0.25rem 0' }}>Nothing to move. Everything on this statement is {payingLabel}'s.</p>
              : data.transfers.map((t, i) => (
                <div key={i} style={s.transferRow}>
                  <Dot color={bucketMeta[t.from]?.color} />
                  <span style={{ flex: 1 }}>{bucketMeta[t.from]?.label || t.from} → {bucketMeta[t.to]?.label || t.to}</span>
                  <strong>{fmt(t.amount)}</strong>
                </div>
              ))}
            <div style={{ ...s.transferRow, borderTop: `1px solid ${theme.border}`, marginTop: '0.5rem', paddingTop: '0.5rem' }}>
              <span style={{ flex: 1 }}>Then pay the card from {payingLabel}</span>
              <strong style={{ fontSize: '1.1rem' }}>{fmt(toPay)}</strong>
            </div>
            {data.completed
              ? <div style={{ ...s.note, background: theme.successBg, color: theme.successLight, marginTop: '0.75rem' }}>Marked paid {relTime(data.completed.paid_at)} · {fmt(data.completed.statement_amount)}</div>
              : <button onClick={complete} style={{ ...s.primaryBtn, marginTop: '0.75rem', width: '100%' }}>I made these transfers and paid the card</button>}
          </div>

          {/* By bucket */}
          <div style={s.card}>
            <div style={s.sectionTitle}>By bucket</div>
            {BUCKET_ORDER.filter(b => data.totals[b] != null).map(b => (
              <Bar key={b} label={bucketMeta[b]?.label || b} value={data.totals[b]} max={data.transactions_total} color={bucketMeta[b]?.color} theme={theme} />
            ))}
          </div>

          {/* Transactions */}
          <div style={{ ...s.sectionTitle, padding: '0.5rem 0.25rem 0.25rem' }}>Review each charge <span style={{ fontWeight: 400, color: theme.textMuted }}>· tap a bucket to change it</span></div>
          {data.transactions.length === 0 && <Empty theme={theme} text="No transactions in this window yet. Tap Refresh from Plaid." />}
          {data.transactions.map(t => (
            <div key={t.plaid_transaction_id} style={s.txnRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant_name || t.name}</div>
                <div style={{ fontSize: '0.7rem', color: theme.textDimmed }}>{fmtDate(t.date)}{t.source === 'rule' ? ` · rule "${t.rule_pattern}"` : t.source === 'manual' ? ' · set by you' : ''}</div>
              </div>
              <div style={{ textAlign: 'right', marginLeft: 8 }}>
                <div style={{ fontWeight: 600, color: t.amount < 0 ? theme.success : theme.text }}>{t.amount < 0 ? '+' : ''}{fmt(Math.abs(t.amount))}</div>
                <button onClick={() => setPicker(t)} style={{ ...s.bucketTag, background: bucketMeta[t.bucket]?.color || theme.accent }}>{bucketMeta[t.bucket]?.label || t.bucket}</button>
              </div>
            </div>
          ))}

          <button onClick={() => setShowRules(v => !v)} style={{ ...s.linkBtn, marginTop: '1rem' }}>{showRules ? 'Hide rules' : `Manage rules`}</button>
          {showRules && (
            <div style={s.card}>
              <div style={s.sectionTitle}>Allocation rules</div>
              {rules.length === 0 && <p style={{ color: theme.textMuted }}>No rules yet. When you reassign a charge, tick "always" to create one.</p>}
              {rules.map(r => (
                <div key={r.id} style={s.transferRow}>
                  <Dot color={bucketMeta[r.bucket]?.color} />
                  <span style={{ flex: 1 }}>"{r.pattern}" → {bucketMeta[r.bucket]?.label || r.bucket}{r.card_id ? ` (${r.card_id} only)` : ''}</span>
                  <button onClick={() => deleteRule(r.id)} style={s.linkBtn}>remove</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {picker && (
        <BucketPicker txn={picker} bucketMeta={bucketMeta} theme={theme} s={s}
          onClose={() => setPicker(null)} onPick={(bucket, saveRule) => allocate(picker, bucket, saveRule)} />
      )}
    </>
  );
}

function BucketPicker({ txn, bucketMeta, theme, s, onClose, onPick }) {
  const [always, setAlways] = useState(false);
  const merchant = txn.merchant_name || txn.name;
  return (
    <div style={s.sheetBackdrop} onClick={onClose}>
      <div style={s.sheet} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{merchant}</div>
        <div style={{ fontSize: '0.8rem', color: theme.textMuted, marginBottom: '0.75rem' }}>{fmt(Math.abs(txn.amount))} · {fmtDateLong(txn.date)} · who pays for this?</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {BUCKET_ORDER.map(b => (
            <button key={b} onClick={() => onPick(b, always)}
              style={{ ...s.secondaryBtn, borderColor: bucketMeta[b].color, ...(txn.bucket === b ? { background: bucketMeta[b].color, color: '#fff' } : {}) }}>
              {bucketMeta[b].label}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '0.75rem', fontSize: '0.85rem', color: theme.textMuted }}>
          <input type="checkbox" checked={always} onChange={e => setAlways(e.target.checked)} />
          Always put "{merchant}" there
        </label>
      </div>
    </div>
  );
}

// ─── P&L ─────────────────────────────────────────────────────────────────────
function Pnl({ theme, s, authFetch, apiUrl, bucketMeta }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCats, setShowCats] = useState(true);
  const [showInternal, setShowInternal] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await authFetch(`${apiUrl}/api/pnl?month=${month}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed to load');
        setData(j);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [month]);

  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const step = n => setMonth(shiftMonth(`${month}-01`, n).slice(0, 7));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
        <button onClick={() => step(-1)} style={s.iconBtn}>‹</button>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <button onClick={() => step(1)} style={s.iconBtn}>›</button>
      </div>
      {error && <div style={{ ...s.card, borderColor: theme.danger, color: theme.dangerLight }}>{error}</div>}
      {loading && !data && <p style={{ color: theme.textMuted, textAlign: 'center', padding: '2rem' }}>Loading…</p>}
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <Stat label="Income" value={fmt(data.income.total)} theme={theme} color={theme.success} boxed />
            <Stat label="Spending" value={fmt(data.spending.total)} theme={theme} color={theme.danger} boxed />
            <Stat label="Net" value={fmt(data.net)} theme={theme} color={data.net >= 0 ? theme.success : theme.danger} boxed />
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>Live: planned vs actual</div>
            <Bar label={`Planned ${fmt(data.live.planned_total)}`} value={data.live.planned_total} max={Math.max(data.live.planned_total, data.live.actual)} color={theme.textDimmed} theme={theme} />
            <Bar label={`Actual ${fmt(data.live.actual)}`} value={data.live.actual} max={Math.max(data.live.planned_total, data.live.actual)} color={data.live.variance >= 0 ? theme.success : theme.danger} theme={theme} />
            <div style={{ fontSize: '0.8rem', color: theme.textMuted, marginTop: 4 }}>
              {data.live.variance >= 0 ? `${fmt(data.live.variance)} under plan` : `${fmt(-data.live.variance)} over plan`}
              {data.live.planned_total === 0 && ' · set your Live lines in Settings to get a plan number'}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>Spending by bucket</div>
            {Object.entries(data.spending.by_bucket).map(([b, v]) => (
              <Bar key={b} label={bucketMeta[b]?.label || titleCase(b)} value={v} max={data.spending.total} color={bucketMeta[b]?.color || theme.accent} theme={theme} />
            ))}
          </div>

          <div style={s.card}>
            <button onClick={() => setShowCats(v => !v)} style={{ ...s.sectionTitle, ...s.linkBtn, padding: 0 }}>Spending by category {showCats ? '▾' : '▸'}</button>
            {showCats && Object.entries(data.spending.by_category).map(([c, v]) => (
              <Bar key={c} label={titleCase(c)} value={v} max={data.spending.total} color={theme.accent} theme={theme} />
            ))}
          </div>

          {Object.keys(data.income.by_category).length > 0 && (
            <div style={s.card}>
              <div style={s.sectionTitle}>Income</div>
              {Object.entries(data.income.by_bucket).map(([b, v]) => (
                <Bar key={b} label={`into ${bucketMeta[b]?.label || titleCase(b)}`} value={v} max={data.income.total} color={theme.success} theme={theme} />
              ))}
            </div>
          )}

          <button onClick={() => setShowInternal(v => !v)} style={s.linkBtn}>
            {data.internal.count} transfers and card payments excluded ({fmt(data.internal.total)}) {showInternal ? '▾' : '▸'}
          </button>
          {showInternal && data.internal.items.map(t => (
            <div key={t.plaid_transaction_id} style={{ ...s.txnRow, opacity: 0.7 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant_name || t.name}</div>
                <div style={{ fontSize: '0.7rem', color: theme.textDimmed }}>{fmtDate(t.date)} · {titleCase(t.detailed)}</div>
              </div>
              <div style={{ fontWeight: 600 }}>{fmt(Math.abs(t.amount))}</div>
            </div>
          ))}
          <div style={{ fontSize: '0.7rem', color: theme.textDimmed, textAlign: 'center', padding: '1rem 0' }}>
            {data.transaction_count} transactions · {fmtDate(data.start)} to {fmtDate(data.end)}
          </div>
        </>
      )}
    </>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, theme, color, boxed }) {
  return (
    <div style={boxed ? { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '0.6rem 0.5rem', textAlign: 'center' } : {}}>
      <div style={{ fontSize: '0.65rem', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: boxed ? '1rem' : '1.25rem', fontWeight: 700, color: color || theme.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: theme.textDimmed }}>{sub}</div>}
    </div>
  );
}
function Bar({ label, value, max, color, theme }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div style={{ margin: '0.4rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
        <span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: theme.cardBgElevated, marginTop: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color }} />
      </div>
    </div>
  );
}
const Dot = ({ color }) => <span style={{ width: 10, height: 10, borderRadius: 5, background: color || '#999', display: 'inline-block', marginRight: 8 }} />;
const Empty = ({ theme, text }) => <p style={{ color: theme.textMuted, textAlign: 'center', padding: '1.5rem 1rem' }}>{text}</p>;

function pickDefaultCard(cards) {
  if (!cards?.length) return null;
  // The card whose due date is soonest from today
  const today = new Date().getDate();
  const sorted = [...cards].sort((a, b) => ((a.due_day - today + 31) % 31) - ((b.due_day - today + 31) % 31));
  return sorted[0].card_id;
}
function ordinal(n) { if (!n) return ''; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function relTime(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return 'just now'; if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; return `${Math.round(h / 24)}d ago`;
}

const makeStyles = (theme) => ({
  card: { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '0.9rem', margin: '0.6rem 0', color: theme.text },
  sectionTitle: { fontSize: '0.75rem', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.4rem' },
  segment: { display: 'flex', background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 2 },
  segmentBtn: { background: 'transparent', border: 'none', color: theme.textMuted, padding: '0.35rem 0.8rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  segmentBtnActive: { background: theme.accent, color: '#fff' },
  chip: { flex: '0 0 auto', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: 999, padding: '0.45rem 0.9rem', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  chipActive: { background: theme.accent, borderColor: theme.accent, color: '#fff' },
  iconBtn: { background: theme.cardBgElevated, border: 'none', color: theme.text, width: 34, height: 34, borderRadius: 17, fontSize: '1.2rem', cursor: 'pointer' },
  primaryBtn: { background: theme.success, color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem 1rem', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' },
  secondaryBtn: { background: 'transparent', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '0.6rem 0.8rem', fontWeight: 500, fontSize: '0.9rem', cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '0.85rem', padding: '0.25rem' },
  note: { background: theme.accentBg, color: theme.textMuted, borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.8rem' },
  transferRow: { display: 'flex', alignItems: 'center', padding: '0.35rem 0', fontSize: '0.95rem' },
  txnRow: { display: 'flex', alignItems: 'center', padding: '0.6rem 0.25rem', borderBottom: `1px solid ${theme.border}`, color: theme.text },
  bucketTag: { border: 'none', color: '#fff', borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', marginTop: 2 },
  sheetBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 50 },
  sheet: { width: '100%', maxWidth: 520, margin: '0 auto', background: theme.cardBg, color: theme.text, borderRadius: '16px 16px 0 0', padding: '1rem 1rem 1.5rem', border: `1px solid ${theme.border}` },
});
