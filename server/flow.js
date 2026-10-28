// Plain-English edits to flow_lines. Sends the current lines plus the instruction to
// Claude, gets back a list of operations, applies them under the user's RLS client.
// Needs ANTHROPIC_API_KEY in the environment; without it the endpoint says so.

const MODEL = process.env.FLOW_MODEL || 'claude-sonnet-4-5';

const TOOL = {
  name: 'apply_flow_changes',
  description: 'Apply the changes the user asked for to their flow lines.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One sentence, past tense, saying what changed.' },
      ops: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['insert', 'update', 'delete'] },
            id: { type: 'integer', description: 'Required for update and delete' },
            row: {
              type: 'object',
              description: 'Fields to set. For insert, bucket, name, amount and cadence are required.',
              properties: {
                bucket: { type: 'string', enum: ['income_person1', 'income_person2', 'give', 'save', 'live', 'person1', 'person2'] },
                category: { type: 'string' }, name: { type: 'string' }, amount: { type: 'number' },
                cadence: { type: 'string', enum: ['biweekly', 'monthly', 'six_months', 'annual', 'once'] },
                next_due: { type: 'string', description: 'YYYY-MM-DD or empty' }, start_date: { type: 'string' }, end_date: { type: 'string' },
                paid_how: { type: 'string' }, note: { type: 'string' }, active: { type: 'boolean' },
              },
            },
          },
          required: ['op'],
        },
      },
    },
    required: ['summary', 'ops'],
  },
};

export function registerFlowRoutes(app) {
  app.post('/api/flow/prompt', async (req, res) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(400).json({ error: 'Plain-English edits need ANTHROPIC_API_KEY set in Vercel. Edit the lines directly for now.' });
    const instruction = String(req.body?.instruction || '').trim();
    if (!instruction) return res.status(400).json({ error: 'Say what to change.' });
    try {
      const { data: lines, error } = await req.supabase.from('flow_lines').select('*').order('bucket').order('sort');
      if (error) throw error;
      const { data: cfg } = await req.supabase.from('app_config').select('person_1_name, person_2_name').limit(1).maybeSingle();
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const system = `You maintain a household's Give/Save/Live budget lines. Today is ${today}. person1 is ${cfg?.person_1_name || 'Person 1'}, person2 is ${cfg?.person_2_name || 'Person 2'}. Buckets: income_person1/income_person2 are paychecks (usually biweekly), give/save/live are the three buckets' outflows, person1/person2 are personal spending. Amounts are per occurrence at the given cadence. Use existing categories where they fit (Housing, Food, Cars, Utilities, Other, Tithe, Pledges, Retirement). Prefer update over delete+insert. If the request is ambiguous, make the smallest reasonable change and say what you assumed in the summary. Never touch lines the user did not mention.`;
      const body = {
        model: MODEL, max_tokens: 1500, system,
        tools: [TOOL], tool_choice: { type: 'tool', name: 'apply_flow_changes' },
        messages: [{ role: 'user', content: `Current lines (JSON):\n${JSON.stringify(lines.map(l => ({ id: l.id, bucket: l.bucket, category: l.category, name: l.name, amount: Number(l.amount), cadence: l.cadence, next_due: l.next_due, end_date: l.end_date, paid_how: l.paid_how, active: l.active })))}\n\nRequest: ${instruction}` }],
      };
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) return res.status(502).json({ error: j.error?.message || 'Claude did not answer' });
      const call = (j.content || []).find(c => c.type === 'tool_use');
      if (!call) return res.status(502).json({ error: 'No changes came back' });
      const { summary, ops } = call.input;
      const clean = row => { const o = {}; for (const k of ['bucket', 'category', 'name', 'amount', 'cadence', 'next_due', 'start_date', 'end_date', 'paid_how', 'note', 'active']) if (row?.[k] !== undefined) o[k] = row[k] === '' ? null : row[k]; o.updated_at = new Date().toISOString(); return o; };
      let n = 0;
      for (const op of ops || []) {
        if (op.op === 'insert') { const row = clean(op.row); row.user_id = req.userId; const { error: e } = await req.supabase.from('flow_lines').insert(row); if (e) throw e; n++; }
        else if (op.op === 'update' && op.id) { const { error: e } = await req.supabase.from('flow_lines').update(clean(op.row)).eq('id', op.id); if (e) throw e; n++; }
        else if (op.op === 'delete' && op.id) { const { error: e } = await req.supabase.from('flow_lines').delete().eq('id', op.id); if (e) throw e; n++; }
      }
      res.json({ summary: summary || `${n} change${n === 1 ? '' : 's'} applied.`, applied: n });
    } catch (e) {
      console.error('flow prompt', e); res.status(500).json({ error: e.message });
    }
  });
}
