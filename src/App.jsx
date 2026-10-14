import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { themes, cardColor } from './theme';
import { API_URL } from './api';
import Privacy from './Privacy';
import CloseView from './components/CloseView';
import PlaidLink from './components/PlaidLink';
import AccountMappingUI from './components/AccountMappingUI';

// ─── Flip ────────────────────────────────────────────────────────────────────
// Four screens: Home (what's due, where the money sits), Close (payoff + P&L),
// Activity (transactions), Settings. No onboarding, no score, no charts to decode.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MISSING_ENV = [!supabaseUrl && 'VITE_SUPABASE_URL', !supabaseKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean);
if (MISSING_ENV.length) {
  document.body.innerHTML = `<div style="font-family:Inter,system-ui,sans-serif;padding:2rem;max-width:520px;margin:10vh auto;color:#E8ECF1;background:#171A20;border-radius:12px">
    <h2 style="margin:0 0 .5rem">Flip is not configured</h2><p>Missing: <code>${MISSING_ENV.join('</code>, <code>')}</code>. Add them in Vercel → Settings → Environment Variables and redeploy.</p></div>`;
  throw new Error(`Missing env: ${MISSING_ENV.join(', ')}`);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const authFetch = async (url, options = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { ...(options.headers || {}) };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return fetch(url, { ...options, headers });
};

const fmt = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = s => s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const relTime = iso => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`; return `${Math.round(h / 24)} days ago`;
};
const BUCKET_ORDER = ['live', 'person1', 'person2', 'give', 'save'];
const LIVE_LINES = [
  ['monthly_rent', 'Mortgage + HOA'], ['monthly_power', 'Power'], ['monthly_groceries', 'Groceries'], ['monthly_gas', 'Gas'],
  ['monthly_gym', 'Gym'], ['monthly_insurance', 'Insurance'], ['monthly_date_nights', 'Date nights'], ['monthly_subscriptions', 'Subscriptions'],
];

export default function App() {
  const [themeMode, setThemeMode] = useState(() => { try { return localStorage.getItem('flipThemeMode') || 'dark'; } catch { return 'dark'; } });
  const theme = themes[themeMode];
  useEffect(() => { try { localStorage.setItem('flipThemeMode', themeMode); } catch {} document.body.style.background = theme.bg; document.documentElement.style.colorScheme = themeMode; }, [themeMode]);
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (window.location.pathname === '/privacy') return <Privacy theme={theme} />;
  if (session === undefined) return <Centered theme={theme}>Loading…</Centered>;
  if (!session) return <Auth theme={theme} s={s} />;
  return <Shell theme={theme} s={s} session={session} themeMode={themeMode} setThemeMode={setThemeMode} />;
}

// ─── Auth: email + password, with reset ──────────────────────────────────────
function Auth({ theme, s }) {
  const [mode, setMode] = useState(window.location.pathname === '/reset' ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') setMode('reset'); });
    return () => sub.subscription.unsubscribe();
  }, []);
  const go = async (fn) => { setBusy(true); setMsg(''); try { await fn(); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  const login = () => go(async () => { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; });
  const signup = () => go(async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error; setMsg('Account created. Check your email to confirm, then sign in.'); setMode('login');
  });
  const forgot = () => go(async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` });
    if (error) throw error; setMsg('Reset link sent. Open it on this device.');
  });
  const reset = () => go(async () => {
    const { error } = await supabase.auth.updateUser({ password }); if (error) throw error;
    window.history.replaceState({}, '', '/'); setMsg('Password updated.'); setMode('login');
  });
  return (
    <Centered theme={theme}>
      <div style={{ ...s.card, width: '100%', maxWidth: 380 }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 2 }}>Flip</div>
        <div style={{ color: theme.textMuted, fontSize: '0.85rem', marginBottom: '1rem' }}>
          {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create an account' : mode === 'forgot' ? 'Reset your password' : 'Choose a new password'}
        </div>
        {mode !== 'reset' && <input style={s.input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />}
        {mode !== 'forgot' && <input style={s.input} type="password" placeholder={mode === 'reset' ? 'New password' : 'Password'} value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? login() : mode === 'signup' ? signup() : reset())} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
        <button disabled={busy} onClick={mode === 'login' ? login : mode === 'signup' ? signup : mode === 'forgot' ? forgot : reset} style={{ ...s.primaryBtn, width: '100%', marginTop: 4 }}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Save password'}
        </button>
        {msg && <div style={{ ...s.note, marginTop: 10 }}>{msg}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          {mode === 'login' ? <>
            <button style={s.linkBtn} onClick={() => setMode('forgot')}>Forgot password</button>
            <button style={s.linkBtn} onClick={() => setMode('signup')}>Create account</button>
          </> : <button style={s.linkBtn} onClick={() => setMode('login')}>Back to sign in</button>}
        </div>
      </div>
    </Centered>
  );
}

// ─── Shell: data + navigation ────────────────────────────────────────────────
function Shell({ theme, s, session, themeMode, setThemeMode }) {
  const [view, setView] = useState('home');
  const [closeCard, setCloseCard] = useState(null);
  const [config, setConfig] = useState(null);
  const [cards, setCards] = useState([]);
  const [items, setItems] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [summaries, setSummaries] = useState({});   // card_id -> payoff summary
  const [owed, setOwed] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState('');

  const personNames = { person1: config?.person_1_name || 'Person 1', person2: config?.person_2_name || 'Person 2' };
  const bucketLabel = b => ({ live: 'Live', give: 'Give', save: 'Save', person1: personNames.person1, person2: personNames.person2, marriage_starter: 'Marriage Starter' })[b] || b;
  const bucketColor = b => ({ live: theme.live, give: theme.give, save: theme.save, person1: theme.mat, person2: theme.mara })[b] || theme.accent;

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('app_config').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
    setConfig(data || {});
  }, []);
  const loadCards = useCallback(async () => { const r = await authFetch(`${API_URL}/api/credit-cards`); const j = await r.json(); setCards(j.credit_cards || []); return j.credit_cards || []; }, []);
  const loadItems = useCallback(async () => { const { data } = await supabase.from('plaid_items').select('item_id, institution_name, last_synced'); setItems(data || []); }, []);
  const loadSnapshot = useCallback(async () => {
    const { data } = await supabase.from('balance_snapshots').select('buckets, cards, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
    setSnapshot(data || null);
  }, []);
  const loadSummaries = useCallback(async (cardList) => {
    const out = {};
    await Promise.all((cardList || cards).map(async c => {
      try { const r = await authFetch(`${API_URL}/api/payoff/${c.card_id}`); const j = await r.json(); if (r.ok) out[c.card_id] = j; } catch {}
    }));
    setSummaries(out);
  }, [cards]);
  const loadOwed = useCallback(async () => { try { const r = await authFetch(`${API_URL}/api/payoff/reimbursements`); setOwed(await r.json()); } catch {} }, []);

  const sync = useCallback(async (force = false) => {
    setSyncing(true);
    try {
      await Promise.all([
        authFetch(`${API_URL}/api/sync_transactions${force ? '?force=true' : ''}`, { method: 'POST' }),
        authFetch(`${API_URL}/api/sync_balances${force ? '?force=true' : ''}`, { method: 'POST' }),
      ]);
    } catch (e) { console.error(e); }
    finally { setSyncing(false); }
  }, []);

  const refreshAll = useCallback(async (force = false) => {
    const c0 = await loadCards();
    await Promise.all([loadItems(), loadSnapshot(), loadSummaries(c0), loadOwed()]);   // paint what we have
    await sync(force);                                                                 // then talk to Plaid
    const c = await loadCards();
    await Promise.all([loadItems(), loadSnapshot(), loadSummaries(c), loadOwed()]);
  }, [sync, loadCards, loadItems, loadSnapshot, loadSummaries, loadOwed]);

  useEffect(() => { (async () => { await loadConfig(); await refreshAll(false); setLoaded(true); })(); }, []);
  // Coming back to Home after a payoff or a mapping change: re-read local state, no Plaid call.
  useEffect(() => { if (view === 'home' && cards.length) { loadSummaries(cards); loadOwed(); loadSnapshot(); } }, [view]);

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(''), 2500); };
  const lastSynced = items.reduce((m, i) => i.last_synced && (!m || i.last_synced > m) ? i.last_synced : m, null);

  const props = { theme, s, session, config, setConfig, cards, items, snapshot, summaries, owed, syncing, loaded, lastSynced, personNames, bucketLabel, bucketColor,
    refreshAll, loadConfig, loadCards, loadItems, loadOwed, showToast, setView, setCloseCard, themeMode, setThemeMode };

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 6rem' }}>
        {view === 'home' && <Home {...props} />}
        {view === 'close' && (
          <CloseView theme={theme} authFetch={authFetch} apiUrl={API_URL} creditCards={cards} initialCardId={closeCard}
            config={{ person1Name: personNames.person1, person2Name: personNames.person2 }}
            onRefresh={async () => { await refreshAll(true); }} />
        )}
        {view === 'activity' && <Activity {...props} />}
        {view === 'settings' && <Settings {...props} />}
      </div>
      {toast && <div style={s.toast}>{toast}</div>}
      <nav style={s.nav}><div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', justifyContent: 'space-around' }}>
        {[['home', 'Home', 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'], ['close', 'Close', 'M20 6L9 17l-5-5'], ['activity', 'Activity', 'M4 6h16M4 12h16M4 18h16'], ['settings', 'Settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']].map(([k, label, d]) => (
          <button key={k} onClick={() => { setView(k); if (k !== 'close') setCloseCard(null); }} style={{ ...s.navBtn, color: view === k ? theme.accent : theme.textDimmed }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
            <span>{label}</span>
          </button>
        ))}
      </div></nav>
    </div>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────
function Home({ theme, s, cards, snapshot, summaries, owed, syncing, lastSynced, bucketLabel, bucketColor, refreshAll, setView, setCloseCard, loaded }) {
  const byDue = [...cards].sort((a, b) => (summaries[a.card_id]?.readiness?.days_until_due ?? 99) - (summaries[b.card_id]?.readiness?.days_until_due ?? 99));
  return (
    <main style={{ padding: '0 1rem' }} className="fade">
      <Header title="Flip" theme={theme} sub={syncing ? 'Syncing with your banks…' : `Synced ${relTime(lastSynced)}`}
        right={<button onClick={() => refreshAll(true)} disabled={syncing} aria-label="Refresh" style={{ ...s.iconBtn, ...(syncing ? { opacity: 0.5 } : {}) }}><span className={syncing ? 'spin' : ''} style={{ display: 'inline-block' }}>↻</span></button>} />

      {owed?.pending_total > 0 && (
        <div style={{ ...s.card, borderColor: theme.warning }}>
          <div style={s.label}>Save is owed</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{fmt(owed.pending_total)}</div>
          <div style={{ fontSize: '0.8rem', color: theme.textMuted }}>Fronted for a card payoff. Mark it moved in Close once it clears.</div>
        </div>
      )}

      <div style={s.label}>Cards</div>
      {!loaded && cards.length === 0 && [0, 1].map(i => <div key={i} style={{ ...s.card, height: 62 }} className="shimmer" />)}
      {loaded && cards.length === 0 && <div style={s.card}><div style={{ color: theme.textMuted }}>No cards yet. Add one in Settings.</div></div>}
      {byDue.map(c => {
        const sm = summaries[c.card_id]; const rd = sm?.readiness; const paid = !!sm?.completed; const unlinked = sm && sm.linked === false;
        const tone = unlinked ? theme.textDimmed : paid ? theme.success : !rd || rd.after_payment == null ? theme.textMuted : rd.short ? theme.danger : rd.below_cushion ? theme.warning : theme.success;
        const status = unlinked ? 'Not connected' : !sm ? '…' : paid ? 'Paid' : rd?.after_payment == null ? 'Needs a refresh' : rd.short ? `Short ${fmt(-rd.after_payment)}` : rd.below_cushion ? 'Under cushion' : 'Covered';
        const due = sm?.period?.due;
        const dueText = unlinked ? 'Link it in Settings' : rd?.days_until_due == null ? '' : paid ? `paid · was due ${fmtDate(due)}` : rd.days_until_due < 0 ? `${-rd.days_until_due}d overdue` : rd.days_until_due === 0 ? 'due today' : `due ${fmtDate(due)} · ${rd.days_until_due}d`;
        const cc = cardColor(theme, c);
        return (
          <button key={c.card_id} onClick={() => { setCloseCard(c.card_id); setView('close'); }} style={{ ...s.card, ...s.rowBtn, borderLeft: `4px solid ${cc}` }}>
            <div style={{ width: 34, height: 24, borderRadius: 5, background: cc, marginRight: 12, flex: '0 0 auto', opacity: 0.95 }} />
            <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: '0.8rem', color: theme.textMuted }}>{dueText}{!paid && !unlinked && sm?.needs_review_count ? ` · ${sm.needs_review_count} to review` : ''}</div>
            </div>
            <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
              <div style={{ fontWeight: 700, color: tone }}>{status}</div>
              <div style={{ fontSize: '0.8rem', color: theme.textMuted }}>{sm && !unlinked ? fmt(sm.statement?.amount) : ''}</div>
            </div>
            <span style={{ color: theme.textDimmed, marginLeft: 8 }}>›</span>
          </button>
        );
      })}

      <div style={{ ...s.label, marginTop: '1rem' }}>Where the money sits</div>
      <div style={s.card}>
        {!snapshot && <div style={{ color: theme.textMuted }}>No balances yet. Connect your bank in Settings, then Refresh.</div>}
        {snapshot && BUCKET_ORDER.filter(b => snapshot.buckets?.[b] != null).map(b => (
          <div key={b} style={s.row}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: bucketColor(b), marginRight: 10 }} />
            <span style={{ flex: 1 }}>{bucketLabel(b)}</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(snapshot.buckets[b])}</span>
          </div>
        ))}
        {snapshot && cards.filter(c => snapshot.cards?.[c.card_id]).map(c => (
          <div key={c.card_id} style={{ ...s.row, color: theme.textMuted }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: cardColor(theme, c), marginRight: 10 }} />
            <span style={{ flex: 1 }}>{c.label} balance</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(snapshot.cards[c.card_id].total)}</span>
          </div>
        ))}
        {snapshot && <div style={{ fontSize: '0.7rem', color: theme.textDimmed, marginTop: 6 }}>as of {relTime(snapshot.created_at)}</div>}
      </div>
    </main>
  );
}

// ─── Activity ────────────────────────────────────────────────────────────────
function Activity({ theme, s, cards, bucketLabel, bucketColor }) {
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const load = async (offset = 0) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: '60', offset: String(offset) }); if (filter) p.set('account_type', filter);
      const r = await authFetch(`${API_URL}/api/transactions?${p}`); const j = await r.json();
      setRows(prev => offset ? [...prev, ...j.transactions] : j.transactions); setTotal(j.total || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(0); }, [filter]);
  const typeLabel = t => cards.find(c => c.card_id === t)?.label || bucketLabel(t);
  const groups = rows.reduce((g, t) => { (g[t.date] = g[t.date] || []).push(t); return g; }, {});
  return (
    <main style={{ padding: '0 1rem' }} className="fade">
      <Header title="Activity" theme={theme} right={
        <select value={filter} onChange={e => setFilter(e.target.value)} style={s.select}>
          <option value="">All accounts</option>
          {BUCKET_ORDER.map(b => <option key={b} value={b}>{bucketLabel(b)}</option>)}
          {cards.map(c => <option key={c.card_id} value={c.card_id}>{c.label}</option>)}
        </select>} />
      {Object.entries(groups).map(([date, txns]) => (
        <div key={date}>
          <div style={{ ...s.label, marginTop: '0.75rem' }}>{new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          {txns.map(t => (
            <div key={t.plaid_transaction_id} style={s.row}>
              <span style={{ width: 8, height: 8, borderRadius: cards.some(c => c.card_id === t.app_account_type) ? 2 : 4, background: cards.some(c => c.card_id === t.app_account_type) ? cardColor(theme, cards.find(c => c.card_id === t.app_account_type)) : bucketColor(t.app_account_type), marginRight: 10, flex: '0 0 auto' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant_name || t.name}</div>
                <div style={{ fontSize: '0.7rem', color: theme.textDimmed }}>{typeLabel(t.app_account_type)}{t.pending ? ' · pending' : ''}</div>
              </div>
              <div style={{ fontWeight: 600, color: t.amount < 0 ? theme.success : theme.text, fontVariantNumeric: 'tabular-nums' }}>{t.amount < 0 ? '+' : ''}{fmt(Math.abs(t.amount))}</div>
            </div>
          ))}
        </div>
      ))}
      {rows.length < total && <button onClick={() => load(rows.length)} disabled={loading} style={{ ...s.secondaryBtn, width: '100%', marginTop: '1rem' }}>{loading ? '…' : `Show more (${total - rows.length} left)`}</button>}
      {!loading && rows.length === 0 && <div style={{ color: theme.textMuted, textAlign: 'center', padding: '2rem' }}>Nothing here yet.</div>}
    </main>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────
function Settings({ theme, s, session, config, cards, items, personNames, loadConfig, loadCards, loadItems, refreshAll, showToast, themeMode, setThemeMode }) {
  const [form, setForm] = useState(null);
  useEffect(() => { if (config) setForm({ ...config }); }, [config]);
  const [cardEdit, setCardEdit] = useState(null);
  const [mapKey, setMapKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveConfig = async () => {
    const keys = ['person_1_name', 'person_2_name', 'cushion', ...LIVE_LINES.map(([k]) => k)];
    const row = { user_id: session.user.id, updated_at: new Date().toISOString() };
    keys.forEach(k => { if (form[k] !== undefined && form[k] !== '') row[k] = form[k]; });
    const { error } = await supabase.from('app_config').upsert(row, { onConflict: 'user_id' });
    if (error) showToast(error.message); else { showToast('Saved'); await loadConfig(); }
  };
  const saveCard = async () => {
    const r = await authFetch(`${API_URL}/api/credit-cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cardEdit) });
    const j = await r.json(); if (!r.ok) return showToast(j.error || 'Could not save');
    setCardEdit(null); await loadCards(); showToast('Card saved');
  };
  const removeItem = async (item) => {
    if (!window.confirm(`Disconnect ${item.institution_name}? Its transactions stay; Plaid billing for it stops.`)) return;
    await authFetch(`${API_URL}/api/items/${item.item_id}`, { method: 'DELETE' }); await loadItems(); showToast('Disconnected');
  };
  const deleteAccount = async () => {
    const r = await authFetch(`${API_URL}/api/account`, { method: 'DELETE' });
    if (r.ok) { await supabase.auth.signOut(); } else showToast('Could not delete');
  };
  const num = (k, v) => setForm(f => ({ ...f, [k]: v === '' ? '' : Number(v) }));
  const livePlanTotal = form ? LIVE_LINES.reduce((t, [k]) => t + (Number(form[k]) || 0), 0) : 0;

  return (
    <main style={{ padding: '0 1rem' }} className="fade">
      <Header title="Settings" theme={theme} />

      <div style={s.label}>Cards</div>
      <div style={s.card}>
        {cards.map(c => (
          <div key={c.card_id} style={s.row}>
            <div style={{ width: 28, height: 20, borderRadius: 4, background: cardColor(theme, c), marginRight: 10, flex: '0 0 auto' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: '0.75rem', color: theme.textMuted }}>due the {ordinal(c.due_day)} · closes the {c.statement_close_day ? ordinal(c.statement_close_day) : '?'} · paid from {personNames[c.paid_from_bucket] || 'Live'}</div>
            </div>
            <button style={s.linkBtn} onClick={() => setCardEdit({ ...c })}>edit</button>
          </div>
        ))}
        <button style={{ ...s.linkBtn, marginTop: 6 }} onClick={() => setCardEdit({ card_id: '', label: '', due_day: 1, statement_close_day: null, paid_from_bucket: 'live' })}>+ add a card</button>
        {cardEdit && (
          <div style={{ ...s.sub, marginTop: 10 }}>
            {!cards.some(c => c.card_id === cardEdit.card_id) && <Field label="Short id (e.g. discover)"><input style={s.input} value={cardEdit.card_id} onChange={e => setCardEdit({ ...cardEdit, card_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></Field>}
            <Field label="Name"><input style={s.input} value={cardEdit.label} onChange={e => setCardEdit({ ...cardEdit, label: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Due day"><input style={s.input} type="number" min="1" max="31" value={cardEdit.due_day || ''} onChange={e => setCardEdit({ ...cardEdit, due_day: Number(e.target.value) })} /></Field>
              <Field label="Statement closes"><input style={s.input} type="number" min="1" max="31" value={cardEdit.statement_close_day || ''} onChange={e => setCardEdit({ ...cardEdit, statement_close_day: e.target.value ? Number(e.target.value) : null })} /></Field>
            </div>
            <Field label="Paid from">
              <select style={s.select} value={cardEdit.paid_from_bucket} onChange={e => setCardEdit({ ...cardEdit, paid_from_bucket: e.target.value })}>
                <option value="live">Live</option><option value="person1">{personNames.person1}</option><option value="person2">{personNames.person2}</option>
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 8 }}><button style={s.primaryBtn} onClick={saveCard}>Save</button><button style={s.secondaryBtn} onClick={() => setCardEdit(null)}>Cancel</button></div>
          </div>
        )}
      </div>

      <div style={s.label}>Banks</div>
      <div style={s.card}>
        {items.map(i => (
          <div key={i.item_id} style={s.row}>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{i.institution_name}</div><div style={{ fontSize: '0.75rem', color: theme.textMuted }}>synced {relTime(i.last_synced)}</div></div>
            <button style={{ ...s.linkBtn, color: theme.danger }} onClick={() => removeItem(i)}>disconnect</button>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <PlaidLink authFetch={authFetch} onSuccess={async () => { showToast('Connected. Map the accounts below.'); await loadItems(); setMapKey(k => k + 1); }} />
        </div>
        <div style={{ ...s.sub, marginTop: 10 }}>
          <div style={{ ...s.label, marginTop: 0 }}>Which account is which</div>
          <AccountMappingUI key={mapKey + items.length} theme={theme} authFetch={authFetch} person1Name={personNames.person1} person2Name={personNames.person2}
            onMappingSaved={async () => { showToast('Mapped. Syncing…'); await refreshAll(true); showToast('Synced'); }} isSyncing={false} />
        </div>
      </div>

      {form && (
        <>
          <div style={s.label}>Household</div>
          <div style={s.card}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Person 1"><input style={s.input} value={form.person_1_name || ''} onChange={e => setForm({ ...form, person_1_name: e.target.value })} /></Field>
              <Field label="Person 2"><input style={s.input} value={form.person_2_name || ''} onChange={e => setForm({ ...form, person_2_name: e.target.value })} /></Field>
            </div>
            <Field label="Cushion to keep in an account after paying a card"><input style={s.input} type="number" value={form.cushion ?? ''} onChange={e => num('cushion', e.target.value)} /></Field>
            <div style={{ ...s.label, marginTop: 10 }}>Live plan · {fmt(livePlanTotal)} / month</div>
            {LIVE_LINES.map(([k, label]) => (
              <div key={k} style={{ ...s.row, padding: '0.25rem 0' }}>
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{label}</span>
                <input style={{ ...s.input, width: 110, margin: 0, textAlign: 'right' }} type="number" value={form[k] ?? ''} onChange={e => num(k, e.target.value)} />
              </div>
            ))}
            <div style={{ fontSize: '0.75rem', color: theme.textDimmed, margin: '6px 0 10px' }}>These are only used for "planned vs actual" on the P&L.</div>
            <button style={s.primaryBtn} onClick={saveConfig}>Save</button>
          </div>
        </>
      )}

      <div style={s.label}>Appearance</div>
      <div style={{ ...s.card, ...s.row }}>
        <span style={{ flex: 1 }}>Theme</span>
        <div style={{ display: 'flex', background: theme.cardBgElevated, borderRadius: 999, padding: 2 }}>
          {['light', 'dark'].map(m => <button key={m} onClick={() => setThemeMode(m)} style={{ ...s.linkBtn, padding: '0.35rem 0.9rem', borderRadius: 999, background: themeMode === m ? theme.accent : 'transparent', color: themeMode === m ? theme.onAccent : theme.textMuted }}>{m === 'light' ? 'Light' : 'Dark'}</button>)}
        </div>
      </div>

      <div style={s.label}>Account</div>
      <div style={s.card}>
        <div style={{ fontSize: '0.85rem', color: theme.textMuted, marginBottom: 8 }}>{session.user.email}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={s.secondaryBtn} onClick={() => supabase.auth.signOut()}>Sign out</button>
          <a href="/privacy" style={{ ...s.secondaryBtn, textDecoration: 'none', display: 'inline-block' }}>Privacy policy</a>
          {!confirmDelete ? <button style={{ ...s.linkBtn, color: theme.danger }} onClick={() => setConfirmDelete(true)}>Delete account…</button>
            : <button style={{ ...s.secondaryBtn, borderColor: theme.danger, color: theme.danger }} onClick={deleteAccount}>Really delete everything</button>}
        </div>
      </div>
    </main>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────
const Header = ({ title, sub, right, theme }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'calc(1rem + env(safe-area-inset-top)) 0 0.5rem' }}>
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: theme.text, letterSpacing: -0.3 }}>{title}</h1>
      {sub && <div style={{ fontSize: '0.75rem', color: theme.textDimmed, marginTop: 2 }}>{sub}</div>}
    </div>{right}
  </div>
);
const Field = ({ label, children }) => <label style={{ display: 'block', fontSize: '0.75rem', opacity: 0.8, marginTop: 6 }}>{label}{children}</label>;
const Centered = ({ theme, children }) => <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'Inter, system-ui, sans-serif' }}>{children}</div>;
function ordinal(n) { if (!n) return ''; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

const makeStyles = (theme) => ({
  card: { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '0.9rem', margin: '0.5rem 0', color: theme.text },
  sub: { background: theme.cardBgElevated, borderRadius: 10, padding: '0.75rem' },
  label: { fontSize: '0.72rem', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, margin: '0.9rem 0 0.25rem' },
  row: { display: 'flex', alignItems: 'center', padding: '0.5rem 0', borderBottom: `1px solid ${theme.border}` },
  rowBtn: { display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer', textAlign: 'left', font: 'inherit' },
  input: { display: 'block', width: '100%', boxSizing: 'border-box', background: theme.cardBgElevated, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '0.55rem 0.7rem', fontSize: '1rem', margin: '4px 0 8px', fontFamily: 'inherit' },
  select: { background: theme.cardBgElevated, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '0.5rem 0.6rem', fontSize: '1rem', fontFamily: 'inherit', minHeight: 44 },
  iconBtn: { background: theme.cardBgElevated, border: `1px solid ${theme.border}`, color: theme.text, width: 44, height: 44, borderRadius: 22, fontSize: '1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { background: theme.accent, color: theme.onAccent, border: 'none', borderRadius: 12, padding: '0.8rem 1rem', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 },
  secondaryBtn: { background: 'transparent', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '0.7rem 0.9rem', fontWeight: 500, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 },
  linkBtn: { background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '0.9rem', padding: '0.5rem 0.25rem', fontFamily: 'inherit', minHeight: 36 },
  note: { background: theme.accentBg, color: theme.textMuted, borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.8rem' },
  nav: { position: 'fixed', bottom: 0, left: 0, right: 0, padding: '0.4rem 0 calc(0.9rem + env(safe-area-inset-bottom))', background: theme.bg, borderTop: `1px solid ${theme.border}`, zIndex: 50 },
  navBtn: { background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minWidth: 72, minHeight: 48, borderRadius: 10 },
  toast: { position: 'fixed', bottom: 'calc(5rem + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', background: theme.text, color: theme.bg, padding: '0.5rem 0.9rem', borderRadius: 999, fontSize: '0.85rem', zIndex: 100 },
});

// Global styles (fonts, resets, keyframes)
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  * { box-sizing: border-box; }
  body { margin: 0; -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; }
  input, select, button { font-family: inherit; touch-action: manipulation; }
  button { transition: transform .08s ease, filter .12s ease, background .15s ease; }
  @media (hover: hover) { button:hover:not(:disabled) { filter: brightness(1.08); } }
  button:active:not(:disabled) { transform: scale(0.98); }
  input:focus, select:focus { outline: 2px solid rgba(143,184,222,.6); outline-offset: 1px; }
  .fade { animation: fadeIn .18s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .shimmer { position: relative; overflow: hidden; }
  .shimmer::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent); animation: shimmer 1.2s infinite; }
  @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
document.head.appendChild(styleSheet);
