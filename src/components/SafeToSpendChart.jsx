import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer } from 'recharts';

// SafeToSpendChart: A projection chart showing how a personal account
// balance changes from today → next due date. Paydays create upward steps, the payment
// creates a downward drop. A gray "cushion band" shows the safety buffer zone.
// Now uses smooth monotone curve with daily interpolation for a polished look.

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
        <p style={{ color: theme?.textMuted || '#CBCBCB', fontSize: '0.75rem', marginTop: '0.125rem' }}>
          {payload[0].payload.event}
        </p>
      )}
    </div>
  );
};

export default function SafeToSpendChart({ disposableData, person, config, theme, person1Name, person2Name }) {
  if (!disposableData) {
    return (
      <div style={{ color: theme?.textDimmed || '#6D8196', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
        No data available
      </div>
    );
  }

  const {
    accountBalance,
    cushion,
    nextPaymentAmount,
    nextDueDate,
    paydaysBeforeDue,
    depositAmounts, // New: pre-computed exact deposit amounts from App.jsx
  } = disposableData;

  const today = new Date();
  const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Build key event data points (paydays + payment)
  const keyEvents = [];

  // Starting point: today's balance
  let runningBalance = accountBalance;
  keyEvents.push({
    date: new Date(today),
    balance: runningBalance,
    event: 'Today',
    isKey: true,
  });

  // Add payday steps with correct deposit amounts
  if (paydaysBeforeDue) {
    for (let i = 0; i < paydaysBeforeDue.length; i++) {
      const payday = paydaysBeforeDue[i];
      let amount = 0;

      // Use pre-computed depositAmounts if available (accurate), else fallback
      if (depositAmounts && depositAmounts[i] !== undefined) {
        amount = depositAmounts[i].amount;
      } else if (config?.splits) {
        // Fallback: use config splits for personal accounts
        const personalSplits = getPersonalSplitsFallback(config);
        if (person === 'mat') {
          amount = payday.type === 'mat' ? personalSplits.matFromMat : personalSplits.matFromMara;
        } else if (person === 'mara') {
          amount = payday.type === 'mat' ? personalSplits.maraFromMat : personalSplits.maraFromMara;
        } else if (person === 'live') {
          amount = payday.type === 'mat' ? (config.splits.matLive || 984) : (config.splits.maraLive || 656);
        }
      } else {
        // Last resort rough calc
        amount = payday.type === 'mat'
          ? (config?.matPayAmount || 2018.55) * 0.6 / 2
          : (config?.maraPayAmount || 1302.06) * 0.6 / 2;
      }

      runningBalance += amount;
      keyEvents.push({
        date: new Date(payday.date),
        balance: Math.round(runningBalance * 100) / 100,
        event: `${payday.type === 'mat' ? (person1Name || 'Mat') : (person2Name || 'Mara')} Payday (+$${amount.toFixed(2)})`,
        isKey: true,
      });
    }
  }

  // Payment drop
  const finalBalance = runningBalance - nextPaymentAmount;
  keyEvents.push({
    date: new Date(nextDueDate),
    balance: Math.round(finalBalance * 100) / 100,
    event: 'After Payment',
    isKey: true,
  });

  // Sort key events by date
  keyEvents.sort((a, b) => a.date - b.date);

  // Interpolate daily points between key events for smooth appearance
  const dataPoints = [];
  for (let i = 0; i < keyEvents.length; i++) {
    const current = keyEvents[i];
    dataPoints.push({
      date: formatDate(current.date),
      balance: current.balance,
      event: current.event,
      isKey: true,
      rawDate: current.date,
    });

    // Add daily interpolated points between this event and the next
    if (i < keyEvents.length - 1) {
      const next = keyEvents[i + 1];
      const daysBetween = Math.round((next.date - current.date) / (1000 * 60 * 60 * 24));

      // Only interpolate if there's more than 1 day gap
      if (daysBetween > 1) {
        for (let d = 1; d < daysBetween; d++) {
          const interpDate = new Date(current.date);
          interpDate.setDate(interpDate.getDate() + d);
          // Linear interpolation between current balance and the balance BEFORE the next event's jump
          // (balance stays flat between events, the jump happens at the event)
          dataPoints.push({
            date: formatDate(interpDate),
            balance: current.balance,
            isKey: false,
            rawDate: interpDate,
          });
        }
      }
    }
  }

  const personColor = person === 'mat' ? (theme?.mat || '#C4A46B')
    : person === 'mara' ? (theme?.mara || '#C48BA0')
    : (theme?.live || '#7B9EC5');

  // Calculate Y-axis domain
  const allValues = dataPoints.map(d => d.balance);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues);
  const yMin = Math.floor(minVal / 100) * 100 - 100;
  const yMax = Math.ceil(maxVal / 100) * 100 + 100;

  // Find the due date window start (3 days before due date)
  const dueDate = new Date(nextDueDate);
  const dueWindowStart = new Date(dueDate);
  dueWindowStart.setDate(dueWindowStart.getDate() - 3);
  const dueWindowStartLabel = formatDate(dueWindowStart);
  const dueDateLabel = formatDate(dueDate);

  // Find closest data point dates for the reference area
  const closestToWindowStart = dataPoints.reduce((best, dp) =>
    Math.abs(dp.rawDate - dueWindowStart) < Math.abs(best.rawDate - dueWindowStart) ? dp : best
  );
  const lastPoint = dataPoints[dataPoints.length - 1];

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={dataPoints} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme?.cardBg || '#5A5A5A'} vertical={false} />

          {/* Cushion band: y=0 to y=cushion */}
          <ReferenceArea
            y1={0}
            y2={cushion}
            fill={theme?.textDimmed || '#6D8196'}
            fillOpacity={0.1}
            label={{ value: 'Cushion', fill: theme?.textDimmed || '#6D8196', fontSize: 10, position: 'insideRight' }}
          />

          {/* Due date window — red band starting 3 days before due */}
          <ReferenceArea
            x1={closestToWindowStart.date}
            x2={lastPoint.date}
            fill={theme?.danger || '#C47B7B'}
            fillOpacity={0.08}
            label={{ value: 'Due', fill: theme?.danger || '#C47B7B', fontSize: 10, position: 'insideTopRight' }}
          />

          <XAxis
            dataKey="date"
            tick={{ fill: theme?.textDimmed || '#6D8196', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: theme?.border || '#6D8196' }}
            // Only show tick labels for key event dates
            interval={0}
            tickFormatter={(value) => {
              const isKeyDate = dataPoints.find(dp => dp.date === value && dp.isKey);
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
            stroke={personColor}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={(props) => {
              // Only show dots on key event dates, smaller radius
              const { cx, cy, payload } = props;
              if (!payload.isKey) return null;
              return (
                <circle
                  key={`dot-${props.index}`}
                  cx={cx} cy={cy} r={2.5}
                  fill={personColor}
                  stroke={personColor}
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
          <div style={{ width: 12, height: 12, backgroundColor: `${theme?.danger || '#C47B7B'}15`, border: `1px solid ${theme?.danger || '#C47B7B'}30` }} />
          <span style={{ color: theme?.textMuted || '#CBCBCB' }}>Due window</span>
        </div>
      </div>
    </div>
  );
}

// Fallback personal splits calculation (mirrors App.jsx getPersonalSplits)
function getPersonalSplitsFallback(config) {
  const matPay = config.matPayAmount || 2018.55;
  const maraPay = config.maraPayAmount || 1302.06;
  const giveRate = config.splits?.give || 0.2;
  const saveRate = config.splits?.save || 0.2;
  const matLive = config.splits?.matLive || 984;
  const maraLive = config.splits?.maraLive || 656;

  const matRemainder = matPay - (matPay * giveRate) - (matPay * saveRate) - matLive;
  const maraRemainder = maraPay - (maraPay * giveRate) - (maraPay * saveRate) - maraLive;

  return {
    matFromMat: matRemainder / 2,
    maraFromMat: matRemainder / 2,
    matFromMara: maraRemainder / 2,
    maraFromMara: maraRemainder / 2,
  };
}
