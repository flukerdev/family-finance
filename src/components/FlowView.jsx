import { useState, useEffect, useMemo, useRef } from 'react';
import { sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey';
import { buildFlow, monthly, CADENCES, BUCKETS, todayNY } from '../flow';

// ─── Flow: the Give/Save/Live picture, drawn from flow_lines and editable in place.
const fmt = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmt2 = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const ORDER = { income: 0, danger: 1, give: 2, save: 3, live: 4, person: 5 };

export default function FlowView({ theme, s, session, config, supabase, personNames, authFetch, apiUrl, showToast }) {
  const [lines, setLines] = useState(null);
  const [edit, setEdit] = useState(null);
  const [ask, setAsk] = useState('');
  const [asking, setAsking] = useState(false);
  const [askNote, setAskNote] = useState('');
  const names = { person1: personNames.person1, person2: personNames.person2 };

  const load = async () => {
    const { data, error } = await supabase.from('flow_lines').select('*').order('bucket').order('sort').order('id');
    if (error) { setLines([]); setAskNote(error.message.includes('flow_lines') ? 'The flow_lines table is not in Supabase yet. Run sql/create-flow-lines.sql.' : error.message); return; }
    setLines(data || []);
  };
  useEffect(() => { load(); }, []);

  const flow = useMemo(() => lines ? buildFlow(lines, config, names) : null, [lines, config, personNames]);
  const colorOf = g => ({ income: theme.textMuted, danger: theme.danger, give: theme.give, save: theme.save, live: theme.live, person: theme.mat, accent: theme.accent, success: theme.success })[g] || theme.accent;

  const save = async (row) => {
    const r = { ...row, user_id: session.user.id, updated_at: new Date().toISOString(), amount: Number(row.amount) || 0 };
    ['next_due', 'start_date', 'end_date'].forEach(k => { if (!r[k]) r[k] = null; });
    delete r.created_at;
    const { error } = row.id ? await supabase.from('flow_lines').update(r).eq('id', row.id) : await supabase.from('flow_lines').insert(r);
    if (error) return showToast(error.message);
    setEdit(null); await load(); showToast('Saved');
  };
  const remove = async (row) => {
    if (!window.confirm(`Remove "${row.name}"?`)) return;
    const { error } = await supabase.from('flow_lines').delete().eq('id', row.id);
    if (error) return showToast(error.message); setEdit(null); await load();
  };
  const submitAsk = async () => {
    if (!ask.trim()) return;
    setAsking(true); setAskNote('');
    try {
      const r = await authFetch(`${apiUrl}/api/flow/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction: ask }) });
      const j = await r.json();
      if (!r.ok) setAskNote(j.error || 'Could not apply that.'); else { setAskNote(j.summary || 'Applied.'); setAsk(''); await load(); }
    } catch (e) { setAskNote(e.message); } finally { setAsking(false); }
  };

  return (
    <main style={{ padding: '0 1rem' }} className="fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'calc(1rem + env(safe-area-inset-top)) 0 0.5rem' }}>
        <div><h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Flow</h1>
          {flow && <div style={{ fontSize: '0.75rem', color: theme.textDimmed, marginTop: 2 }}>{fmt(flow.totals.income)}/mo in · Give {fmt(flow.totals.give)} · Save {fmt(flow.totals.save)} · Live {fmt(flow.totals.live)}</div>}</div>
      </div>

      {!lines && <div style={{ ...s.card, height: 300 }} className="shimmer" />}
      {flow && flow.links.length > 0 && <div style={{ ...s.card, padding: '0.5rem 0.25rem' }}><Sankey flow={flow} theme={theme} colorOf={colorOf} /></div>}
      {flow && flow.totals.saveGap > 0.5 && (
        <div style={{ ...s.card, borderColor: theme.danger }}>
          <div style={s.label}>Save is running short</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: theme.danger }}>{fmt2(flow.totals.saveGap)} / month from the Save balance</div>
          <div style={{ fontSize: '0.8rem', color: theme.textMuted }}>Save lines total {fmt2(flow.totals.saveOut)} but only {fmt2(flow.totals.save)} comes in. Lines with an end date stop automatically.</div>
        </div>
      )}
      {flow && flow.links.length === 0 && <div style={s.card}><div style={{ color: theme.textMuted }}>No lines yet. Add a paycheck below and the picture draws itself.</div></div>}

      <div style={s.label}>Change it in plain English</div>
      <div style={s.card}>
        <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' }} placeholder="e.g. Add Evan Macrinaris back onto Give at $150 a month, or Mara's auto insurance went up to $850" value={ask} onChange={e => setAsk(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={s.primaryBtn} disabled={asking || !ask.trim()} onClick={submitAsk}>{asking ? 'Thinking…' : 'Apply'}</button>
          {askNote && <div style={{ fontSize: '0.8rem', color: theme.textMuted }}>{askNote}</div>}
        </div>
      </div>

      {lines && BUCKETS.map(b => {
        const rows = lines.filter(l => l.bucket === b);
        const label = b === 'income_person1' ? `${names.person1}'s paycheck` : b === 'income_person2' ? `${names.person2}'s paycheck` : b === 'person1' ? names.person1 : b === 'person2' ? names.person2 : b[0].toUpperCase() + b.slice(1);
        const tot = rows.filter(l => l.active !== false).reduce((t, l) => t + monthly(l.amount, l.cadence), 0);
        const col = colorOf(b.startsWith('income') ? 'income' : b.startsWith('person') ? 'person' : b);
        return (
          <div key={b}>
            <div style={{ ...s.label, display: 'flex', justifyContent: 'space-between' }}><span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: col, marginRight: 6 }} />{label}</span><span>{fmt2(tot)}/mo</span></div>
            <div style={s.card}>
              {rows.map(l => edit?.id === l.id ? <Editor key={l.id} row={edit} setRow={setEdit} onSave={() => save(edit)} onCancel={() => setEdit(null)} onDelete={() => remove(l)} theme={theme} s={s} names={names} />
                : <LineRow key={l.id} l={l} theme={theme} s={s} onEdit={() => setEdit({ ...l })} />)}
              {edit && !edit.id && edit.bucket === b && <Editor row={edit} setRow={setEdit} onSave={() => save(edit)} onCancel={() => setEdit(null)} theme={theme} s={s} names={names} />}
              <button style={{ ...s.linkBtn, marginTop: 4 }} onClick={() => setEdit({ bucket: b, name: '', amount: '', cadence: b.startsWith('income') ? 'biweekly' : 'monthly', category: '', sort: rows.length, active: true })}>+ add a line</button>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: '0.72rem', color: theme.textDimmed, margin: '0.5rem 0 1rem' }}>Give {Math.round((config?.split_give ?? 0.2) * 100)}% and Save {Math.round((config?.split_save ?? 0.15) * 100)}% come off each paycheck. Live is funded in proportion to take-home. What is left splits evenly. Change the percentages in Settings.</div>
    </main>
  );
}

function LineRow({ l, theme, s, onEdit }) {
  const dim = l.active === false || (l.end_date && l.end_date < todayNY());
  const cad = CADENCES.find(c => c[0] === l.cadence)?.[1] || l.cadence;
  return (
    <button onClick={onEdit} style={{ ...s.row, ...s.rowBtn, background: 'none', border: 'none', borderBottom: `1px solid ${theme.border}`, opacity: dim ? 0.5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontWeight: 600 }}>{l.name}{l.category ? <span style={{ color: theme.textDimmed, fontWeight: 400 }}> · {l.category}</span> : null}</div>
        <div style={{ fontSize: '0.75rem', color: theme.textMuted }}>{cad}{l.next_due ? ` · next ${fmtD(l.next_due)}` : ''}{l.end_date ? ` · ends ${fmtD(l.end_date)}` : ''}{l.paid_how ? ` · ${l.paid_how}` : ''}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt2(l.amount)}</div>
        {l.cadence !== 'monthly' && l.cadence !== 'once' && <div style={{ fontSize: '0.72rem', color: theme.textDimmed }}>{fmt2(monthly(l.amount, l.cadence))}/mo</div>}
      </div>
    </button>
  );
}
const fmtD = s => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

function Editor({ row, setRow, onSave, onCancel, onDelete, theme, s, names }) {
  const set = (k, v) => setRow(r => ({ ...r, [k]: v }));
  const F = ({ label, children }) => <label style={{ display: 'block', fontSize: '0.72rem', opacity: 0.8 }}>{label}{children}</label>;
  return (
    <div style={{ ...s.sub, margin: '6px 0' }}>
      <F label="Name"><input style={s.input} value={row.name} onChange={e => set('name', e.target.value)} /></F>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <F label="Amount"><input style={s.input} type="number" step="0.01" value={row.amount} onChange={e => set('amount', e.target.value)} /></F>
        <F label="How often"><select style={{ ...s.select, width: '100%', margin: '4px 0 8px' }} value={row.cadence} onChange={e => set('cadence', e.target.value)}>{CADENCES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <F label="Group (Housing, Cars…)"><input style={s.input} value={row.category || ''} onChange={e => set('category', e.target.value)} /></F>
        <F label="Bucket"><select style={{ ...s.select, width: '100%', margin: '4px 0 8px' }} value={row.bucket} onChange={e => set('bucket', e.target.value)}>{BUCKETS.map(b => <option key={b} value={b}>{b === 'income_person1' ? `${names.person1} paycheck` : b === 'income_person2' ? `${names.person2} paycheck` : b === 'person1' ? names.person1 : b === 'person2' ? names.person2 : b}</option>)}</select></F>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <F label="Next due"><input style={s.input} type="date" value={row.next_due || ''} onChange={e => set('next_due', e.target.value)} /></F>
        <F label="Ends on"><input style={s.input} type="date" value={row.end_date || ''} onChange={e => set('end_date', e.target.value)} /></F>
      </div>
      <F label="How it gets paid"><input style={s.input} value={row.paid_how || ''} onChange={e => set('paid_how', e.target.value)} placeholder="Zelle to parents, autopay Amex, Schwab pulls from Save" /></F>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', margin: '4px 0 10px' }}><input type="checkbox" checked={row.active !== false} onChange={e => set('active', e.target.checked)} /> Active</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={s.primaryBtn} onClick={onSave} disabled={!row.name || row.amount === ''}>Save</button>
        <button style={s.secondaryBtn} onClick={onCancel}>Cancel</button>
        {onDelete && <button style={{ ...s.linkBtn, color: theme.danger, marginLeft: 'auto' }} onClick={onDelete}>Remove</button>}
      </div>
    </div>
  );
}

function Sankey({ flow, theme, colorOf }) {
  const ref = useRef(null);
  const [w, setW] = useState(520);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const H = Math.max(360, 36 * flow.nodes.filter(n => ORDER[n.group] !== undefined && !['give', 'save', 'live', 'person1', 'person2'].includes(n.id) && !n.id.startsWith('inc_') && n.id !== 'drawdown').length);
  const narrow = w < 480;
  const g = useMemo(() => {
    const sk = sankey().nodeId(d => d.id).nodeWidth(10).nodePadding(narrow ? 6 : 9).nodeAlign(sankeyJustify)
      .nodeSort((a, b) => (ORDER[a.group] - ORDER[b.group]) || (a.order - b.order))
      .linkSort((a, b) => (ORDER[a.target.group] - ORDER[b.target.group]) || (a.target.order - b.target.order))
      .extent([[narrow ? 4 : 8, 6], [w - (narrow ? 4 : 8), H - 6]]);
    return sk({ nodes: flow.nodes.map(n => ({ ...n })), links: flow.links.map(l => ({ ...l })) });
  }, [flow, w, H, narrow]);
  const fs = narrow ? 10 : 11;
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width="100%" viewBox={`0 0 ${w} ${H}`} style={{ display: 'block' }} role="img" aria-label="Monthly money flow">
        <g fill="none">{g.links.map((l, i) => <path key={i} d={sankeyLinkHorizontal()(l)} stroke={colorOf(l.source.group === 'danger' ? 'danger' : l.target.group)} strokeOpacity={0.32} strokeWidth={Math.max(1, l.width)} />)}</g>
        {g.nodes.map(n => {
          const left = n.x0 < w / 2;
          return (
            <g key={n.id}>
              <title>{n.label}{n.detail ? `: ${n.detail}` : ''} · {fmt(n.value)}</title>
              <rect x={n.x0} y={n.y0} width={n.x1 - n.x0} height={Math.max(2, n.y1 - n.y0)} rx={2} fill={colorOf(n.group)} />
              <text x={left ? n.x1 + 5 : n.x0 - 5} y={(n.y0 + n.y1) / 2} dominantBaseline="central" textAnchor={left ? 'start' : 'end'} fontSize={fs} fill={theme.text} style={{ fontFamily: 'inherit' }}>
                {narrow && n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label}<tspan fill={theme.textDimmed}> {fmt(n.value)}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
