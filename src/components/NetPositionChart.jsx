import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label, theme }) => {
  if (!active || !payload || !payload.length) return null;
  const fmt = (v) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const d = payload[0]?.payload;
  return (
    <div style={{
      backgroundColor: theme?.cardBg || '#5A5A5A',
      border: `1px solid ${theme?.border || '#6D8196'}`,
      borderRadius: '0.5rem',
      padding: '0.75rem',
      fontSize: '0.8125rem',
    }}>
      <p style={{ color: theme?.textMuted || '#CBCBCB', marginBottom: '0.5rem' }}>{label}</p>
      <p style={{ color: theme?.text || '#FFFFE3', fontWeight: '600', marginBottom: '0.25rem' }}>
        Net Position: {fmt(d?.netPosition)}
      </p>
      <p style={{ color: theme?.success || '#7BAF9A', fontSize: '0.75rem' }}>
        Checking: {fmt(d?.totalChecking)}
      </p>
      <p style={{ color: theme?.danger || '#C47B7B', fontSize: '0.75rem' }}>
        Cards: {fmt(d?.totalCards)}
      </p>
    </div>
  );
};

export default function NetPositionChart({ data, theme }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: theme?.textDimmed || '#6D8196', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
        No snapshot data yet
      </div>
    );
  }

  const hasNegative = data.some(d => d.netPosition < 0);
  const accentColor = theme?.accent || '#6D8196';

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="netPositionGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
            <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
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
          width={70}
        />
        <Tooltip content={<CustomTooltip theme={theme} />} />
        {hasNegative && (
          <ReferenceLine y={0} stroke={theme?.textDimmed || '#6D8196'} strokeDasharray="3 3" />
        )}
        <Area
          type="monotone"
          dataKey="netPosition"
          stroke={accentColor}
          strokeWidth={2}
          fill="url(#netPositionGradient)"
          dot={false}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
