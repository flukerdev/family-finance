import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';

// BudgetHealthChart: A projection chart showing how the LIVE account
// balance changes from today through end of month. Paydays create upward steps,
// known expenses (rent, Blue Amex) create downward drops, plus a daily burn rate
// for projected remaining variable expenses.

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
      <p style={{ color: theme?.textMuted || '#CBCBCB', marginBottom: '0.25rem' }}>{label}</p>
      <p style={{ color: theme?.text || '#FFFFE3', fontWeight: '600' }}>
        Balance: {fmt(payload[0]?.value)}
      </p>
      {payload[0]?.payload?.event && (
        <p style={{ color: theme?.textMuted || '#CBCBCB', fontSize: '0.75rem' }}>
          {payload[0].payload.event}
        </p>
      )}
    </div>
  );
};

export default function BudgetHealthChart({ budgetProjection, config, latestSnapshot, theme }) {
  if (!budgetProjection || !latestSnapshot) {
    return (
      <div style={{ color: theme?.textDimmed || '#6D8196', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
        No data available
      </div>
    );
  }

  const today = new Date();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Build discrete events (paydays, rent, blue amex)
  const events = [];

  // Starting point
  events.push({ date: new Date(today), balance: latestSnapshot.live, event: 'Today', isKey: true });

  // Gather paydays within the month
  const paydays = [];
  let maraNext = new Date(2026, 0, 23);
  while (maraNext < today) maraNext.setDate(maraNext.getDate() + 14);
  let matNext = new Date(2026, 0, 30);
  while (matNext < today) matNext.setDate(matNext.getDate() + 14);
  for (let i = 0; i < 8; i++) {
    if (maraNext <= matNext) {
      if (maraNext > today && maraNext <= endOfMonth) {
        paydays.push({ date: new Date(maraNext), type: 'mara', amount: config.splits?.maraLive || 656 });
      }
      maraNext.setDate(maraNext.getDate() + 14);
    } else {
      if (matNext > today && matNext <= endOfMonth) {
        paydays.push({ date: new Date(matNext), type: 'mat', amount: config.splits?.matLive || 984 });
      }
      matNext.setDate(matNext.getDate() + 14);
    }
  }

  // Add payday events
  paydays.forEach(p => {
    events.push({ date: p.date, delta: p.amount, event: `${p.type === 'mat' ? 'Mat' : 'Mara'} Payday (+$${p.amount})`, isKey: true });
  });

  // Add rent if due this month
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (config.monthlyBills?.rent) {
    const rentDate = new Date(lastDay);
    if (rentDate > today) {
      events.push({ date: rentDate, delta: -config.monthlyBills.rent, event: `Rent (-$${config.monthlyBills.rent})`, isKey: true });
    }
  }

  // Add Blue Amex total if due this month
  const blueTotal = latestSnapshot.blue_total || 0;
  if (blueTotal > 0 && config.dueDates?.blue) {
    const blueDate = new Date(today.getFullYear(), today.getMonth(), config.dueDates.blue);
    if (blueDate > today && blueDate <= endOfMonth) {
      events.push({ date: blueDate, delta: -blueTotal, event: `Blue Amex (-$${Math.round(blueTotal)})`, isKey: true });
    }
  }

  // End of month marker
  events.push({ date: new Date(endOfMonth), event: 'End of Month', isKey: true });

  // Sort by date
  events.sort((a, b) => a.date - b.date);

  // Calculate daily burn rate for remaining variable expenses
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const monthProgress = dayOfMonth / daysInMonth;
  const monthlyVariableExpenses = (config.monthlyBills?.groceries || 0) + (config.monthlyBills?.gas || 0) +
    (config.monthlyBills?.dateNights || 0) + (config.monthlyBills?.power || 0) +
    (config.monthlyBills?.gym || 0) + (config.monthlyBills?.insurance || 0);
  const projectedRemainingExpenses = monthlyVariableExpenses * (1 - monthProgress);
  const dailyBurn = daysRemaining > 0 ? projectedRemainingExpenses / daysRemaining : 0;

  // Build cumulative balance with discrete events
  let running = latestSnapshot.live;
  const discretePoints = events.map((evt, i) => {
    if (i === 0) {
      return { ...evt, balance: running };
    }
    if (evt.delta) running += evt.delta;
    return { ...evt, balance: Math.round(running * 100) / 100 };
  });

  // Now interpolate daily points AND apply daily burn rate
  const dataPoints = [];
  for (let i = 0; i < discretePoints.length; i++) {
    const current = discretePoints[i];
    dataPoints.push({
      label: formatDate(current.date),
      balance: current.balance,
      event: current.event,
      isKey: current.isKey,
      rawDate: current.date,
    });

    if (i < discretePoints.length - 1) {
      const next = discretePoints[i + 1];
      const daysBetween = Math.round((next.date - current.date) / (1000 * 60 * 60 * 24));

      if (daysBetween > 1) {
        let interpBalance = current.balance;
        for (let d = 1; d < daysBetween; d++) {
          interpBalance -= dailyBurn;
          const interpDate = new Date(current.date);
          interpDate.setDate(interpDate.getDate() + d);
          dataPoints.push({
            label: formatDate(interpDate),
            balance: Math.round(interpBalance * 100) / 100,
            isKey: false,
            rawDate: interpDate,
          });
        }
      }
    }
  }

  const lineColor = budgetProjection.isOverBudget ? (theme?.danger || '#C47B7B') : (theme?.success || '#7BAF9A');

  // Y-axis domain
  const allValues = dataPoints.map(d => d.balance);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues);
  const yMin = Math.floor(minVal / 500) * 500 - 500;
  const yMax = Math.ceil(maxVal / 500) * 500 + 500;

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={dataPoints} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme?.cardBg || '#5A5A5A'} vertical={false} />

          {/* Cushion band */}
          <ReferenceArea
            y1={0}
            y2={config.cushion || 150}
            fill={theme?.textDimmed || '#6D8196'}
            fillOpacity={0.1}
            label={{ value: 'Cushion', fill: theme?.textDimmed || '#6D8196', fontSize: 10, position: 'insideRight' }}
          />

          {/* Zero line */}
          <ReferenceLine y={0} stroke={theme?.danger || '#C47B7B'} strokeDasharray="4 4" strokeOpacity={0.5} />

          <XAxis
            dataKey="label"
            tick={{ fill: theme?.textDimmed || '#6D8196', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: theme?.border || '#6D8196' }}
            interval={0}
            tickFormatter={(value) => {
              const isKeyDate = dataPoints.find(dp => dp.label === value && dp.isKey);
              return isKeyDate ? value : '';
            }}
          />
          <YAxis
            tick={{ fill: theme?.textDimmed || '#6D8196', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v.toLocaleString()}`}
            width={65}
            domain={[yMin, yMax]}
          />
          <Tooltip content={<CustomTooltip theme={theme} />} />
          <Line
            type="monotone"
            dataKey="balance"
            stroke={lineColor}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={(props) => {
              const { cx, cy, payload } = props;
              if (!payload.isKey) return null;
              return (
                <circle
                  key={`dot-${props.index}`}
                  cx={cx} cy={cy} r={2.5}
                  fill={lineColor}
                  stroke={lineColor}
                  strokeWidth={1}
                />
              );
            }}
            animationDuration={800}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem', flexWrap: 'wrap', fontSize: '0.6875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <div style={{ width: 12, height: 12, backgroundColor: `${theme?.textDimmed || '#6D8196'}20`, border: `1px solid ${theme?.textDimmed || '#6D8196'}40` }} />
          <span style={{ color: theme?.textMuted || '#CBCBCB' }}>Cushion zone</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <div style={{ width: 12, height: 3, backgroundColor: lineColor }} />
          <span style={{ color: theme?.textMuted || '#CBCBCB' }}>Projected balance</span>
        </div>
      </div>
    </div>
  );
}
