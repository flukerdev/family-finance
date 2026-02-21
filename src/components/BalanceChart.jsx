import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const CustomTooltip = ({ active, payload, label, theme }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      backgroundColor: theme?.cardBg || '#5A5A5A',
      border: `1px solid ${theme?.border || '#6D8196'}`,
      borderRadius: '0.5rem',
      padding: '0.75rem',
    }}>
      <p style={{ color: theme?.textMuted || '#CBCBCB', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{label}</p>
      <p style={{ color: theme?.text || '#FFFFE3', fontSize: '0.875rem', fontWeight: 600 }}>
        ${payload[0].value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
};

export default function BalanceChart({ data, color, label, theme }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: theme?.textDimmed || '#6D8196', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
        No snapshot data yet
      </div>
    );
  }

  const gradientId = `gradient-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={theme?.cardBg || '#5A5A5A'} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: theme?.textDimmed || '#6D8196', fontSize: 11 }}
          axisLine={{ stroke: theme?.border || '#6D8196' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: theme?.textDimmed || '#6D8196', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toLocaleString()}`}
          width={65}
        />
        <Tooltip content={<CustomTooltip theme={theme} />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
