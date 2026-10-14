import { useState, useEffect, useMemo } from 'react';
import { cardColor } from '../theme';

// ─── Close view: Payoff (per card) + P&L (per calendar month) ────────────────
// Everything here reads from /api/payoff/* and /api/pnl. Money never moves.

const BUCKET_ORDER = ['live', 'person1', 'person2', 'give', 'save', 'marriage_starter'];
const fmt = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = s => s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const fmtDateLong = s => s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
const shiftMonth = (ymd, n) => { const d = new Date(`${ymd}T00:00:00`); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const titleCase = s => (s || 'Other').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function CloseView({ theme, authFetch, apiUrl, creditCards, config, onRefresh, initialCardId = null }) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'calc(1rem + env(safe-area-inset-top)) 1rem 0.25rem' }} className="fade">
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: theme.text, margin: 0, letterSpacing: -0.3 }}>Close</h2>
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
          ? <Payoff theme={theme} s={s} authFetch={authFetch} apiUrl={apiUrl} creditCards={creditCards} bucketMeta={bucketMeta} onRefresh={onRefresh} initialCardId={initialCardId} />
          : <Pnl theme={theme} s={s} authFetch={authFetch} apiUrl={apiUrl} bucketMeta={bucketMeta} />}
      </div>
    </main>
  );
}

// ─── Payoff ──────────────────────────────────────────────────────────────────
function Payoff({ theme, s, authFetch, apiUrl, creditCards, bucketMeta, onRefresh, initialCardId }) {
  const cards = creditCards || [];
  const [cardId, setCardId] = useState(() => initialCardId || pickDefaultCard(cards));
  const [range, setRange] = useState(null);           // null = server-computed current statement
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [picker, setPicker] = useState(null);         // transaction being reallocated from the list
  const [reviewing, setReviewing] = useState(false);  // card-stack review queue open
  const [editingStatement, setEditingStatement] = useState(false);
  const [statementInput, setStatementInput] = useState('');
  const [periodInput, setPeriodInput] = useState({ start: '', end: '' });
  const [showCharges, setShowCharges] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState([]);
  const [owed, setOwed] = useState(null);             // pending reimbursements to Save

  useEffect(() => { if (!cardId && cards.length) setCardId(pickDefaultCard(cards)); }, [cards.length]);

  const loadOwed = async () => {
    try { const r = await authFetch(`${apiUrl}/api/payoff/reimbursements`); const j = await r.json(); setOwed(j); } catch {}
  };
  useEffect(() => { loadOwed(); }, []);

  const setRoute = async (front) => {
    if (!data) return;
    await authFetch(`${apiUrl}/api/payoff/route`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId, period_start: data.period.start, period_end: data.period.end, due_date: data.period.due, front }),
    });
    await load();
  };
  const markReimbursed = async (item) => {
    await authFetch(`${apiUrl}/api/payoff/reimbursements/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payoff_id: item.payoff_id, index: item.index }) });
    await loadOwed();
  };

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

  const loadRules = async () => { const r = await authFetch(`${apiUrl}/api/payoff/rules`); const j = await r.json(); setRules(j.rules || []); };
  useEffect(() => { if (showRules) loadRules(); }, [showRules]);

  const refresh = async () => { setRefreshing(true); try { await onRefresh?.(); await load(); } finally { setRefreshing(false); } };

  // Allocate one charge. Every decision also teaches a merchant rule (save_rule defaults true server-side).
  const allocate = async (txn, bucket, { reload = true } = {}) => {
    setData(d => d && ({ ...d, transactions: d.transactions.map(t => t.plaid_transaction_id === txn.plaid_transaction_id ? { ...t, bucket, source: 'manual', needs_review: false } : t) }));
    await authFetch(`${apiUrl}/api/payoff/allocate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plaid_transaction_id: txn.plaid_transaction_id, bucket, card_id: null }),
    });
    if (reload) await load();
  };

  const saveStatement = async () => {
    const amt = Number(String(statementInput).replace(/[^0-9.]/g, ''));
    if (!(amt >= 0) || !data) return;
    const ok = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
    await authFetch(`${apiUrl}/api/payoff/statement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId, period_start: ok(periodInput.start) ? periodInput.start : data.period.start,
        period_end: ok(periodInput.end) ? periodInput.end : data.period.end, due_date: data.period.due, statement_amount: amt }),
    });
    setEditingStatement(false); setRange(null); await load();
  };

  const deleteRule = async (id) => { await authFetch(`${apiUrl}/api/payoff/rules/${id}`, { method: 'DELETE' }); await loadRules(); await load(); };

  const complete = async () => {
    if (!data) return;
    await authFetch(`${apiUrl}/api/payoff/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId, period_start: data.period.start, period_end: data.period.end, due_date: data.period.due,
        statement_amount: data.statement.amount, allocations: data.totals, transfers: [...data.transfers, ...(data.routing?.reimbursements || [])] }),
    });
    await load(); await loadOwed();
  };

  const stepPeriod = (dir) => {
    if (!data) return;
    const { start, end } = data.period;
    if (dir < 0) setRange({ start: shiftMonth(start, -1), end: addDays(start, -1) });
    else setRange({ start: addDays(end, 1), end: shiftMonth(end, 1) });
  };

  if (!cards.length) return <Empty theme={theme} text="No cards configured yet. Connect a card under Accounts and map it as a credit card." />;

  const card = cards.find(c => c.card_id === cardId);
  const payingLabel = data ? bucketMeta[data.paying_bucket]?.label || data.paying_bucket : '';
  const rd = data?.readiness;
  const st = data?.statement;
  const reviewQueue = data ? data.transactions.filter(t => t.needs_review) : [];
  const tone = !rd || rd.after_payment == null ? 'neutral' : rd.short ? 'danger' : rd.below_cushion ? 'warning' : 'ok';
  const toneColor = { danger: theme.danger, warning: theme.warning, ok: theme.success, neutral: theme.textMuted }[tone];
  const paid = !!data?.completed;
  const dueText = rd?.days_until_due == null ? '' : paid ? 'paid' : rd.days_until_due === 0 ? 'due today' : rd.days_until_due === 1 ? 'due tomorrow' : rd.days_until_due < 0 ? `${-rd.days_until_due}d overdue` : `${rd.days_until_due} days`;
  const toneFinal = paid ? theme.success : toneColor;

  return (
    <>
      {/* Card chips */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.5rem 0', scrollbarWidth: 'none' }}>
        {cards.map(c => (
          <button key={c.card_id} ref={el => { if (el && c.card_id === cardId) el.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }}
            onClick={() => { setCardId(c.card_id); setRange(null); setEditingStatement(false); }}
            style={{ ...s.chip, ...(c.card_id === cardId ? { background: cardColor(theme, c), borderColor: cardColor(theme, c), color: theme.onAccent } : { borderColor: cardColor(theme, c) }) }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: c.card_id === cardId ? theme.onAccent : cardColor(theme, c), display: 'inline-block', marginRight: 8, opacity: 0.9 }} />
            {c.label || c.card_id}<span style={{ fontSize: '0.7rem', opacity: 0.8, marginLeft: 6 }}>due {ordinal(c.due_day)}</span>
          </button>
        ))}
      </div>

      {error && <div style={{ ...s.card, borderColor: theme.danger, color: theme.dangerLight }}>{error}</div>}
      {loading && !data && <p style={{ color: theme.textMuted, textAlign: 'center', padding: '2rem' }}>Loading…</p>}

      {owed && owed.reimbursements.some(i => i.status === 'pending') && (
        <div style={{ ...s.card, borderColor: theme.warning }}>
          <div style={s.sectionTitle}>Save is owed {fmt(owed.pending_total)}</div>
          {owed.reimbursements.filter(i => i.status === 'pending').map(i => (
            <div key={`${i.payoff_id}-${i.index}`} style={s.transferRow}>
              <Dot color={bucketMeta[i.from]?.color} />
              <span style={{ flex: 1, fontSize: '0.9rem' }}>{bucketMeta[i.from]?.label || i.from} → {bucketMeta[i.to]?.label || i.to} <span style={{ color: theme.textDimmed, fontSize: '0.75rem' }}>· fronted {fmtDate(i.paid_at?.slice(0, 10))} for {i.card_id}</span></span>
              <strong style={{ marginRight: 8 }}>{fmt(i.amount)}</strong>
              <button onClick={() => markReimbursed(i)} style={s.linkBtn}>moved</button>
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* ── 1. Readiness: the one thing that matters ── */}
          <div style={{ ...s.card, borderColor: toneFinal, borderWidth: 2 }} className="fade">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 22, height: 15, borderRadius: 3, background: cardColor(theme, card), display: 'inline-block', flex: '0 0 auto' }} />{card?.label}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: toneFinal, whiteSpace: 'nowrap' }}>{data.period.due ? `${fmtDate(data.period.due)} · ${dueText}` : ''}</div>
            </div>

            {paid ? (
              <>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: theme.success, marginTop: '0.4rem' }}>Paid ✓</div>
                <div style={{ fontSize: '0.9rem', color: theme.textMuted }}>{fmt(data.completed.statement_amount)} on {fmtDateLong(String(data.completed.paid_at).slice(0, 10))}{data.completed.auto ? ' (payment seen on the card)' : ''}. Nothing left to do for this statement.</div>
              </>
            ) : rd?.after_payment == null ? (
              <div style={{ ...s.note, marginTop: '0.6rem' }}>No balance for {payingLabel} yet. Tap Refresh to pull balances from Plaid.</div>
            ) : (
              <>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: toneColor, marginTop: '0.4rem', lineHeight: 1.1 }}>
                  {rd.short ? 'Short' : rd.below_cushion ? 'Tight' : 'Covered'}
                </div>
                <div style={{ fontSize: '0.95rem', color: theme.text, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                  {rd.short
                    ? <>{payingLabel} needs <b>{fmt(-rd.after_payment)}</b> more to pay this card{rd.cushion ? `, ${fmt(rd.shortfall)} to keep the cushion` : ''}.</>
                    : rd.below_cushion ? <><b>{fmt(rd.after_payment)}</b> left after paying, under your {fmt(rd.cushion)} cushion.</> : <><b>{fmt(rd.after_payment)}</b> left in {payingLabel} after paying.</>}
                </div>
                <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 4, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: theme.textMuted }}>{payingLabel} today</span><span>{fmt(rd.paying_balance)}</span>
                  <span style={{ color: theme.textMuted }}>+ transfers in</span><span style={{ color: theme.success }}>{fmt(rd.transfers_in)}</span>
                  <span style={{ color: theme.textMuted }}>− statement</span><span style={{ color: theme.danger }}>{fmt(st.amount)}</span>
                  <span style={{ fontWeight: 600, borderTop: `1px solid ${theme.border}`, paddingTop: 4 }}>After paying</span><span style={{ fontWeight: 700, color: toneColor, borderTop: `1px solid ${theme.border}`, paddingTop: 4 }}>{fmt(rd.after_payment)}</span>
                </div>
              </>
            )}

            {/* Statement line */}
            <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.7rem', background: theme.cardBgElevated, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.7rem', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Statement {fmtDate(data.period.start)} – {fmtDate(data.period.end)}</div>
                {editingStatement ? (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input autoFocus inputMode="decimal" value={statementInput} onChange={e => setStatementInput(e.target.value)} placeholder="New balance on the statement"
                        onKeyDown={e => e.key === 'Enter' && saveStatement()}
                        style={{ flex: 1, minWidth: 0, background: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '1rem' }} />
                      <button onClick={saveStatement} style={{ ...s.primaryBtn, padding: '0.4rem 0.8rem' }}>Save</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: '0.8rem', color: theme.textMuted }}>
                      <span>Period</span>
                      <input type="date" value={periodInput.start} onChange={e => setPeriodInput(p => ({ ...p, start: e.target.value }))} style={{ background: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 6, padding: '0.25rem 0.4rem' }} />
                      <span>to</span>
                      <input type="date" value={periodInput.end} onChange={e => setPeriodInput(p => ({ ...p, end: e.target.value }))} style={{ background: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 6, padding: '0.25rem 0.4rem' }} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: theme.textDimmed, marginTop: 4 }}>Use the dates printed on the statement. Plaid dates charges a day late, so the window lines up as-is.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmt(st.amount)}</span>
                    <span style={{ fontSize: '0.75rem', color: theme.textDimmed }}>
                      {st.source === 'entered' ? 'from your statement' : st.source === 'plaid' ? 'from Plaid' : 'sum of charges, confirm against your statement'}
                    </span>
                  </div>
                )}
              </div>
              {!editingStatement && <button onClick={() => { setStatementInput(st.entered ?? ''); setPeriodInput({ start: data.period.start, end: data.period.end }); setEditingStatement(true); }} style={s.linkBtn}>{st.source === 'entered' ? 'edit' : 'enter'}</button>}
            </div>
            {Math.abs(st.difference) > 0.5 && (
              <div style={{ fontSize: '0.75rem', color: theme.textMuted, marginTop: 6 }}>
                Statement is {fmt(Math.abs(st.difference))} {st.difference > 0 ? 'more' : 'less'} than the charges listed here (carryover or a neighboring cycle). Counted toward {payingLabel}.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
              <button onClick={() => stepPeriod(-1)} style={s.iconBtn}>‹</button>
              <button onClick={refresh} disabled={refreshing} style={{ ...s.secondaryBtn, flex: 1 }}>{refreshing ? 'Pulling from Plaid…' : 'Refresh from Plaid'}</button>
              <button onClick={() => stepPeriod(1)} style={s.iconBtn}>›</button>
            </div>
          </div>

          {/* ── 2. Review queue ── */}
          {reviewQueue.length > 0 ? (
            <button onClick={() => setReviewing(true)} style={{ ...s.card, width: '100%', textAlign: 'left', cursor: 'pointer', borderColor: theme.accent, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: theme.accent, color: theme.onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{reviewQueue.length}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{reviewQueue.length === 1 ? '1 charge needs' : `${reviewQueue.length} charges need`} a bucket</div>
                <div style={{ fontSize: '0.8rem', color: theme.textMuted }}>Tap through them. Each answer teaches a rule, so this list shrinks every month.</div>
              </div>
              <span style={{ color: theme.accent, fontSize: '1.4rem' }}>›</span>
            </button>
          ) : (
            <div style={{ ...s.note, background: theme.successBg, color: theme.successLight, margin: '0.6rem 0' }}>Every charge on this statement has a bucket.</div>
          )}

          {/* ── 3. Transfers ── */}
          <div style={s.card}>
            <div style={s.sectionTitle}>Transfers to make</div>
            {data.transfers.length === 0
              ? <p style={{ color: theme.textMuted, margin: '0.25rem 0' }}>Nothing to move. Everything on this statement is {payingLabel}'s.</p>
              : data.transfers.map((t, i) => (
                <div key={i} style={s.transferRow}>
                  <Dot color={bucketMeta[t.from]?.color} />
                  <span style={{ flex: 1 }}>{bucketMeta[t.from]?.label || t.from} → {bucketMeta[t.to]?.label || t.to}
                    {t.kind === 'front' && <span style={{ color: theme.textDimmed, fontSize: '0.75rem' }}> · fronting {bucketMeta[t.fronted_for]?.label}</span>}
                    {data.routing?.slow_sources?.includes(t.from) && <span style={{ color: theme.warning, fontSize: '0.75rem' }}> · takes days to clear</span>}
                  </span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(t.amount)}</strong>
                </div>
              ))}
            {data.routing?.can_front && !data.completed && (
              <button onClick={() => setRoute(!data.routing.front_from)} style={{ ...s.secondaryBtn, width: '100%', marginTop: '0.5rem', borderColor: theme.warning, fontSize: '0.85rem' }}>
                {data.routing.front_from ? 'Undo: pay from Marriage Starter directly' : 'Need the cash now: front it from Save'}
              </button>
            )}
            {data.routing?.reimbursements?.length > 0 && (
              <div style={{ ...s.note, marginTop: '0.5rem' }}>
                Then, once it clears: {data.routing.reimbursements.map((r, i) => <span key={i}>{bucketMeta[r.from]?.label} → {bucketMeta[r.to]?.label} {fmt(r.amount)}{i < data.routing.reimbursements.length - 1 ? '; ' : ''}</span>)}. Tracked under "Save is owed" until you mark it moved.
              </div>
            )}
            <div style={{ ...s.transferRow, borderTop: `1px solid ${theme.border}`, marginTop: '0.5rem', paddingTop: '0.5rem' }}>
              <span style={{ flex: 1 }}>Then pay the card from {payingLabel}</span>
              <strong style={{ fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums' }}>{fmt(st.amount)}</strong>
            </div>
            {data.completed
              ? <div style={{ ...s.note, background: theme.successBg, color: theme.successLight, marginTop: '0.75rem', fontWeight: 600 }}>✓ Paid {fmt(data.completed.statement_amount)} · {relTime(data.completed.paid_at)}. Nothing else to do for this card.</div>
              : <button onClick={complete} style={{ ...s.primaryBtn, marginTop: '0.75rem', width: '100%' }}>I made these transfers and paid the card</button>}
          </div>

          {/* ── 4. Detail (collapsed by default) ── */}
          <div style={s.card}>
            <div style={s.sectionTitle}>By bucket</div>
            {BUCKET_ORDER.filter(b => data.totals[b] != null).map(b => (
              <Bar key={b} label={bucketMeta[b]?.label || b} value={data.totals[b]} max={data.transactions_total} color={bucketMeta[b]?.color} theme={theme} />
            ))}
          </div>

          <button onClick={() => setShowCharges(v => !v)} style={s.linkBtn}>{showCharges ? 'Hide' : 'Show'} all {data.transactions.length} charges{data.payments?.length ? ` (${data.payments.length} payment${data.payments.length > 1 ? 's' : ''} excluded)` : ''} {showCharges ? '▾' : '▸'}</button>
          {showCharges && data.transactions.map(t => (
            <div key={t.plaid_transaction_id} style={s.txnRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant_name || t.name}</div>
                <div style={{ fontSize: '0.7rem', color: theme.textDimmed }}>{fmtDate(t.date)}{t.source === 'rule' ? ` · rule "${t.rule_pattern}"${t.needs_review ? ' (new)' : ''}` : t.source === 'manual' ? ' · set by you' : ' · needs review'}</div>
              </div>
              <div style={{ textAlign: 'right', marginLeft: 8 }}>
                <div style={{ fontWeight: 600, color: t.amount < 0 ? theme.success : theme.text }}>{t.amount < 0 ? '+' : ''}{fmt(Math.abs(t.amount))}</div>
                <button onClick={() => setPicker(t)} style={{ ...s.bucketTag, background: bucketMeta[t.bucket]?.color || theme.accent, opacity: t.needs_review ? 0.6 : 1 }}>{bucketMeta[t.bucket]?.label || t.bucket}</button>
              </div>
            </div>
          ))}

          <button onClick={() => setShowRules(v => !v)} style={{ ...s.linkBtn, marginTop: '0.5rem' }}>{showRules ? 'Hide rules' : 'Rules it has learned'} {showRules ? '▾' : '▸'}</button>
          {showRules && (
            <div style={s.card}>
              {rules.length === 0 && <p style={{ color: theme.textMuted }}>No rules yet. Every bucket you pick teaches one.</p>}
              {rules.map(r => (
                <div key={r.id} style={s.transferRow}>
                  <Dot color={bucketMeta[r.bucket]?.color} />
                  <span style={{ flex: 1, fontSize: '0.9rem' }}>"{r.pattern}" → {bucketMeta[r.bucket]?.label || r.bucket} <span style={{ color: theme.textDimmed, fontSize: '0.75rem' }}>· {r.confidence >= 2 ? 'trusted' : 'learning'} ({r.confidence})</span></span>
                  <button onClick={() => deleteRule(r.id)} style={s.linkBtn}>remove</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {picker && (
        <BucketPicker txn={picker} bucketMeta={bucketMeta} theme={theme} s={s} onClose={() => setPicker(null)}
          onPick={(bucket) => { setPicker(null); allocate(picker, bucket); }} />
      )}
      {reviewing && data && (
        <ReviewStack queue={data.transactions.filter(t => t.needs_review)} bucketMeta={bucketMeta} theme={theme} s={s}
          onPick={(txn, bucket) => allocate(txn, bucket, { reload: false })}
          onClose={async () => { setReviewing(false); await load(); }} />
      )}
    </>
  );
}

// One charge at a time. Suggested bucket is pre-highlighted; tapping it confirms (and raises
// the rule's confidence), tapping another re-teaches the rule.
function ReviewStack({ queue, bucketMeta, theme, s, onPick, onClose }) {
  const [i, setI] = useState(0);
  const [items] = useState(queue);
  const txn = items[i];
  useEffect(() => { if (!txn) onClose(); }, [txn]);
  if (!txn) return null;
  const pick = async (b) => { await onPick(txn, b); setI(n => n + 1); };
  let cat = null; try { cat = JSON.parse(txn.personal_finance_category || 'null'); } catch {}
  return (
    <div style={{ ...s.sheetBackdrop, alignItems: 'center' }} onClick={onClose}>
      <div style={{ ...s.sheet, borderRadius: 18, maxWidth: 440, margin: '0 1rem' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: theme.textMuted, marginBottom: '0.75rem' }}>
          <span>{i + 1} of {items.length}</span><button onClick={onClose} style={{ ...s.linkBtn, padding: 0 }}>Done for now</button>
        </div>
        <div style={{ height: 4, background: theme.cardBgElevated, borderRadius: 2, marginBottom: '1rem' }}><div style={{ width: `${(i / items.length) * 100}%`, height: '100%', background: theme.accent, borderRadius: 2, transition: 'width .2s' }} /></div>
        <div style={{ fontSize: '0.75rem', color: theme.textMuted }}>{fmtDateLong(txn.date)}{cat?.primary ? ` · ${titleCase(cat.primary)}` : ''}</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.15rem 0' }}>{txn.merchant_name || txn.name}</div>
        {txn.merchant_name && txn.name && txn.name.toLowerCase().replace(/[^a-z]/g, '').indexOf(txn.merchant_name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 5)) < 0 && (
          <div style={{ fontSize: '0.75rem', color: theme.textDimmed, fontFamily: 'ui-monospace, monospace' }}>bank text: {txn.name}</div>
        )}
        <div style={{ fontSize: '2rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: txn.amount < 0 ? theme.success : theme.text }}>{txn.amount < 0 ? '+' : ''}{fmt(Math.abs(txn.amount))}</div>
        <div style={{ fontSize: '0.8rem', color: theme.textMuted, margin: '0.5rem 0 0.75rem' }}>
          {txn.source === 'rule' ? `Guess: ${bucketMeta[txn.bucket]?.label} (rule "${txn.rule_pattern}", still learning). Confirm or correct.` : 'Who pays for this?'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {BUCKET_ORDER.map(b => (
            <button key={b} onClick={() => pick(b)}
              style={{ ...s.secondaryBtn, padding: '0.85rem', fontSize: '1rem', borderColor: bucketMeta[b].color, ...(txn.bucket === b && txn.source !== 'default' ? { background: bucketMeta[b].color, color: theme.onAccent } : {}) }}>
              {bucketMeta[b].label}
            </button>
          ))}
        </div>
        <button onClick={() => setI(n => n + 1)} style={{ ...s.linkBtn, width: '100%', marginTop: '0.75rem' }}>Skip this one</button>
      </div>
    </div>
  );
}

function BucketPicker({ txn, bucketMeta, theme, s, onClose, onPick }) {
  const merchant = txn.merchant_name || txn.name;
  return (
    <div style={s.sheetBackdrop} onClick={onClose}>
      <div style={s.sheet} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{merchant}</div>
        <div style={{ fontSize: '0.8rem', color: theme.textMuted, marginBottom: '0.75rem' }}>{fmt(Math.abs(txn.amount))} · {fmtDateLong(txn.date)} · who pays for this? (also teaches the rule for "{merchant}")</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {BUCKET_ORDER.map(b => (
            <button key={b} onClick={() => onPick(b)}
              style={{ ...s.secondaryBtn, padding: '0.8rem', borderColor: bucketMeta[b].color, ...(txn.bucket === b ? { background: bucketMeta[b].color, color: theme.onAccent } : {}) }}>
              {bucketMeta[b].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── P&L ─────────────────────────────────────────────────────────────────────
function MerchantLookup({ theme, s, authFetch, apiUrl }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    try { const r = await authFetch(`${apiUrl}/api/merchant?q=${encodeURIComponent(q.trim())}`); setRes(await r.json()); } finally { setBusy(false); }
  };
  return (
    <div style={s.card}>
      <div style={s.sectionTitle}>Where am I at with…</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()} placeholder="a merchant, e.g. Bonobos"
          style={{ flex: 1, minWidth: 0, background: theme.cardBgElevated, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '1rem' }} />
        <button onClick={run} disabled={busy} style={{ ...s.secondaryBtn }}>{busy ? '…' : 'Look up'}</button>
      </div>
      {res && !res.error && (
        <div style={{ marginTop: '0.75rem' }}>
          {res.count === 0 ? <p style={{ color: theme.textMuted }}>Nothing matching "{res.query}" since {''}your history starts.</p> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <Stat label="Bought" value={fmt(res.purchases)} theme={theme} boxed />
                <Stat label="Refunded" value={fmt(-res.refunds)} theme={theme} color={theme.success} boxed />
                <Stat label="Net" value={fmt(res.net)} theme={theme} color={res.net > 0 ? theme.danger : theme.success} boxed />
              </div>
              <div style={{ fontSize: '0.75rem', color: theme.textDimmed, margin: '0.4rem 0' }}>{res.count} transactions, {fmtDate(res.first)} to {fmtDate(res.last)}</div>
              {res.items.slice(0, 12).map(t => (
                <div key={t.plaid_transaction_id} style={{ ...s.txnRow, padding: '0.4rem 0.25rem' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: '0.85rem' }}><span style={{ color: theme.textDimmed }}>{fmtDate(t.date)}</span> {t.name}</div>
                  <div style={{ fontWeight: 600, color: t.amount < 0 ? theme.success : theme.text, fontVariantNumeric: 'tabular-nums' }}>{t.amount < 0 ? '+' : ''}{fmt(Math.abs(t.amount))}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {res?.error && <div style={{ color: theme.dangerLight, marginTop: 8 }}>{res.error}</div>}
    </div>
  );
}

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
      <MerchantLookup theme={theme} s={s} authFetch={authFetch} apiUrl={apiUrl} />
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
  segmentBtnActive: { background: theme.accent, color: theme.onAccent },
  chip: { flex: '0 0 auto', background: theme.cardBg, border: `1.5px solid ${theme.border}`, color: theme.text, borderRadius: 999, padding: '0.55rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 44, display: 'flex', alignItems: 'center' },
  chipActive: { background: theme.accent, borderColor: theme.accent, color: theme.onAccent },
  iconBtn: { background: theme.cardBgElevated, border: 'none', color: theme.text, width: 44, height: 44, borderRadius: 22, fontSize: '1.3rem', cursor: 'pointer' },
  primaryBtn: { background: theme.success, color: theme.onAccent, border: 'none', borderRadius: 12, padding: '0.85rem 1rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', minHeight: 48 },
  secondaryBtn: { background: 'transparent', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '0.7rem 0.8rem', fontWeight: 500, fontSize: '0.95rem', cursor: 'pointer', minHeight: 44 },
  linkBtn: { background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '0.9rem', padding: '0.5rem 0.25rem', minHeight: 36 },
  note: { background: theme.accentBg, color: theme.textMuted, borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.8rem' },
  transferRow: { display: 'flex', alignItems: 'center', padding: '0.35rem 0', fontSize: '0.95rem' },
  txnRow: { display: 'flex', alignItems: 'center', padding: '0.6rem 0.25rem', borderBottom: `1px solid ${theme.border}`, color: theme.text },
  bucketTag: { border: 'none', color: theme.onAccent, borderRadius: 999, padding: '0.3rem 0.7rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginTop: 4, minHeight: 28 },
  sheetBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', zIndex: 2000 },
  sheet: { width: '100%', maxWidth: 520, margin: '0 auto', background: theme.cardBg, color: theme.text, borderRadius: '16px 16px 0 0', padding: '1rem 1rem calc(1.5rem + env(safe-area-inset-bottom))', border: `1px solid ${theme.border}`, maxHeight: '85vh', overflowY: 'auto' },
});
