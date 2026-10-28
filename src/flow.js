// Flow math: turns flow_lines rows into the monthly Give/Save/Live picture.
// Pure functions, no React, so the server can reuse them.

export const CADENCES = [['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['six_months', 'Every 6 months'], ['annual', 'Yearly'], ['once', 'One time']];
export const BUCKETS = ['income_person1', 'income_person2', 'give', 'save', 'live', 'person1', 'person2'];

export const monthly = (amount, cadence) => {
  const a = Number(amount) || 0;
  return cadence === 'biweekly' ? a * 26 / 12 : cadence === 'six_months' ? a / 6 : cadence === 'annual' ? a / 12 : cadence === 'once' ? 0 : a;
};

export const isActive = (l, today) => {
  if (l.active === false) return false;
  if (l.start_date && l.start_date > today) return false;
  if (l.end_date && l.end_date < today) return false;
  return true;
};

export const todayNY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// Advance a date by one cadence step (ISO date strings).
export const advance = (iso, cadence) => {
  const d = new Date(`${iso}T00:00:00`);
  if (cadence === 'biweekly') d.setDate(d.getDate() + 14);
  else if (cadence === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (cadence === 'six_months') d.setMonth(d.getMonth() + 6);
  else if (cadence === 'annual') d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
};

// Build the sankey node/link lists. Returns { nodes, links, totals }.
export function buildFlow(lines, config, names, today = todayNY()) {
  const L = lines.filter(l => isActive(l, today));
  const giveP = Number(config?.split_give ?? 0.20), saveP = Number(config?.split_save ?? 0.15);
  const inc = { person1: 0, person2: 0 };
  L.filter(l => l.bucket.startsWith('income_')).forEach(l => { inc[l.bucket.replace('income_', '')] += monthly(l.amount, l.cadence); });
  const totalInc = inc.person1 + inc.person2;
  const sum = b => L.filter(l => l.bucket === b).reduce((t, l) => t + monthly(l.amount, l.cadence), 0);
  const live = sum('live');
  const shares = { person1: totalInc ? inc.person1 / totalInc : 0.5, person2: totalInc ? inc.person2 / totalInc : 0.5 };

  const nodes = [], links = [];
  const node = (id, group, order, label) => { if (!nodes.find(n => n.id === id)) nodes.push({ id, group, order, label: label || id }); return id; };
  const link = (s, t, v) => { if (v > 0.5) links.push({ source: s, target: t, value: v }); };

  // Column 0: sources
  const srcs = [];
  ['person1', 'person2'].forEach((p, i) => {
    if (inc[p] <= 0) return;
    const id = node(`inc_${p}`, 'income', i, `${names[p]} paycheck`); srcs.push(p);
    const give = inc[p] * giveP, save = inc[p] * saveP, lv = live * shares[p];
    const rest = inc[p] - give - save - lv;
    link(id, node('give', 'give', 0, 'Give'), give);
    link(id, node('save', 'save', 1, 'Save'), save);
    link(id, node('live', 'live', 2, 'Live'), lv);
    link(id, node('person1', 'person', 3, names.person1), rest / 2);
    link(id, node('person2', 'person', 4, names.person2), rest / 2);
  });

  // Column 2: outflows per bucket, grouped by category, residuals computed
  const outflows = (bucket, group, startOrder, residualLabel, residualGroup) => {
    const rows = L.filter(l => l.bucket === bucket);
    const byCat = {};
    rows.forEach(l => { const k = l.category || l.name; byCat[k] = byCat[k] || { amount: 0, color: null, names: [] }; byCat[k].amount += monthly(l.amount, l.cadence); byCat[k].names.push(l.name); if (l.color) byCat[k].color = l.color; });
    let o = startOrder, used = 0;
    Object.entries(byCat).forEach(([k, v]) => { const id = node(`${bucket}:${k}`, v.color || group, o++, k); nodes.find(n => n.id === id).detail = v.names.join(', '); link(bucket, id, v.amount); used += v.amount; });
    return { used, o };
  };
  const giveIn = totalInc * giveP, saveIn = totalInc * saveP;
  let { used: giveOut, o } = outflows('give', 'give', 0);
  if (giveIn - giveOut > 0.5) link('give', node('give:residual', 'give', o, 'Accrues in Give'), giveIn - giveOut);
  const sv = outflows('save', 'save', 20);
  const saveGap = sv.used - saveIn;
  if (saveGap > 0.5) { node('drawdown', 'danger', 9, 'Save balance drawdown'); links.push({ source: 'drawdown', target: 'save', value: saveGap }); }
  else if (-saveGap > 0.5) link('save', node('save:residual', 'save', sv.o, 'Stays in Save'), -saveGap);
  outflows('live', 'live', 40);
  ['person1', 'person2'].forEach((p, i) => {
    const v = links.filter(l => l.target === p).reduce((t, l) => t + l.value, 0) - L.filter(l => l.bucket === p).reduce((t, l) => t + monthly(l.amount, l.cadence), 0);
    outflows(p, 'person', 60 + i * 5);
    if (v > 0.5) link(p, node(`${p}:residual`, 'person', 69 + i, `${names[p]} spending`), v);
  });

  const totals = { income: totalInc, give: giveIn, save: saveIn, live, saveOut: sv.used, saveGap, personal: totalInc - giveIn - saveIn - live };
  return { nodes, links, totals };
}

// Lines with a date coming up (for the Home "coming up" card)
export function upcoming(lines, today = todayNY(), days = 45) {
  const lim = new Date(`${today}T00:00:00`); lim.setDate(lim.getDate() + days);
  const limIso = lim.toISOString().slice(0, 10);
  return lines.filter(l => l.active !== false && l.next_due && l.next_due <= limIso && (!l.end_date || l.end_date >= l.next_due))
    .sort((a, b) => a.next_due.localeCompare(b.next_due));
}
