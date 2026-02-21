import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label, theme }) => {
  if (!active || !payload || !payload.length) return null;
  const fmt = (v) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div style={{
      backgroundColor: theme?.cardBg || '#5A5A5A',
      border: `1px solid ${theme?.border || '#6D8196'}`,
      borderRadius: '0.5rem',
      padding: '0.75rem',
      fontSize: '0.8125rem',
    }}>
      <p style={{ color: theme?.textMuted || '#CBCBCB', marginBottom: '0.5rem' }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, marginBottom: '0.125rem' }}>
          {entry.name}: {fmt(entry.value)}
        </p>
      ))}
    </div>
  );
};

export default function CreditCardChart({
  data,
  cardColor,
  accountColor,
  dueDay,
  statementCloseDay,
  cardName,
  accountName,
  theme,
}) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: theme?.textDimmed || '#6D8196', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
        No snapshot data yet
      </div>
    );
  }

  const gradientId = `cc-gradient-${cardName.replace(/\s+/g, '-').toLowerCase()}`;
  const overageGradientId = `cc-overage-${cardName.replace(/\s+/g, '-').toLowerCase()}`;

  // Find dates where day-of-month matches due day or statement close day for reference lines
  const dueIndices = [];
  const stmtIndices = [];
  data.forEach((d, i) => {
    if (d.dayOfMonth === dueDay) dueIndices.push(i);
    if (d.dayOfMonth === statementCloseDay) stmtIndices.push(i);
  });

  // Compute overage data: when cardTotal > accountBalance, shade the gap red
  const enrichedData = data.map(d => ({
    ...d,
    // For the red overage area, we need two fields:
    // overageTop = cardTotal when it exceeds accountBalance, else null
    // overageBase = accountBalance when there's overage, else null
    overageTop: (d.cardTotal > d.accountBalance) ? d.cardTotal : null,
    overageBase: (d.cardTotal > d.accountBalance) ? d.accountBalance : null,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={enrichedData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            {/* Account balance gradient — more visible */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={accountColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={accountColor} stopOpacity={0.05} />
            </linearGradient>
            {/* Red overage gradient */}
            <linearGradient id={overageGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme?.danger || '#C47B7B'} stopOpacity={0.25} />
              <stop offset="95%" stopColor={theme?.danger || '#C47B7B'} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme?.cardBg || '#5A5A5A'} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: theme?.textDimmed || '#6D8196', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: theme?.border || '#6D8196' }}
          />
          <YAxis
            tick={{ fill: theme?.textDimmed || '#6D8196', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v.toLocaleString()}`}
            width={65}
          />
          <Tooltip content={<CustomTooltip theme={theme} />} />

          {/* Due date reference lines — more prominent */}
          {dueIndices.map((idx) => (
            <ReferenceLine
              key={`due-${idx}`}
              x={enrichedData[idx].date}
              stroke={theme?.danger || '#C47B7B'}
              strokeOpacity={0.7}
              strokeWidth={2}
              strokeDasharray="6 4"
              label={{ value: 'Due', position: 'top', fill: theme?.danger || '#C47B7B', fontSize: 11, fontWeight: '600' }}
            />
          ))}

          {/* Statement close reference lines */}
          {stmtIndices.map((idx) => (
            <ReferenceLine
              key={`stmt-${idx}`}
              x={enrichedData[idx].date}
              stroke={theme?.textDimmed || '#6D8196'}
              strokeOpacity={0.5}
              strokeDasharray="5 5"
              label={{ value: 'Stmt', position: 'top', fill: theme?.textDimmed || '#6D8196', fontSize: 10 }}
            />
          ))}

          {/* Account balance as solid filled gradient background */}
          <Area
            type="monotone"
            dataKey="accountBalance"
            name={accountName}
            stroke={accountColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            animationDuration={800}
          />

          {/* Red overage shading — when card total exceeds account balance */}
          <Area
            type="monotone"
            dataKey="overageTop"
            name="Overage"
            stroke="none"
            fill={`url(#${overageGradientId})`}
            dot={false}
            animationDuration={800}
            connectNulls={false}
            legendType="none"
            tooltipType="none"
          />

          {/* Card total balance — solid thick line */}
          <Line
            type="monotone"
            dataKey="cardTotal"
            name={`${cardName} Total`}
            stroke={cardColor}
            strokeWidth={2.5}
            dot={false}
            animationDuration={800}
          />

          {/* Card statement balance — dashed thinner line */}
          <Line
            type="monotone"
            dataKey="cardStatement"
            name={`${cardName} Statement`}
            stroke={cardColor}
            strokeWidth={1.5}
            strokeDasharray="8 4"
            strokeOpacity={0.6}
            dot={false}
            animationDuration={800}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Custom legend */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
          <div style={{ width: 16, height: 3, backgroundColor: cardColor }} />
          <span style={{ color: theme?.textMuted || '#CBCBCB' }}>{cardName} Total</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
          <div style={{ width: 16, height: 0, borderTop: `2px dashed ${cardColor}`, opacity: 0.6 }} />
          <span style={{ color: theme?.textMuted || '#CBCBCB' }}>{cardName} Statement</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
          <div style={{ width: 16, height: 8, backgroundColor: accountColor, opacity: 0.3, borderRadius: 2 }} />
          <span style={{ color: theme?.textMuted || '#CBCBCB' }}>{accountName}</span>
        </div>
      </div>
    </div>
  );
}
