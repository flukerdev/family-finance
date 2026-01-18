import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Pay schedule configuration
const CONFIG = {
  matPayAmount: 2018.55,
  maraPayAmount: 1302.06,
  splits: {
    give: 0.20,
    save: 0.20,
    matLive: 984.00,
    maraLive: 656.00,
  },
  dueDates: {
    blue: 8,    // LIVE account pays this
    gold: 15,   // Mat's account pays this
    discover: 2, // Mara's account pays this
    rent: 'last', // Last day of month
  },
  monthlyBills: {
    rent: 2135,
    insurance: 28,
    gym: 100,
    dateNights: 200,
    power: 120,
    groceries: 500, // 125 * 4 weeks
    gas: 270, // 67.5 * 4 weeks
  }
};

// Calculate Mat and Mara's personal split from each paycheck
const matRemainder = CONFIG.matPayAmount - (CONFIG.matPayAmount * CONFIG.splits.give) - (CONFIG.matPayAmount * CONFIG.splits.save) - CONFIG.splits.matLive;
const maraRemainder = CONFIG.maraPayAmount - (CONFIG.maraPayAmount * CONFIG.splits.give) - (CONFIG.maraPayAmount * CONFIG.splits.save) - CONFIG.splits.maraLive;
CONFIG.splits.matPersonalFromMat = matRemainder / 2;
CONFIG.splits.maraPersonalFromMat = matRemainder / 2;
CONFIG.splits.matPersonalFromMara = maraRemainder / 2;
CONFIG.splits.maraPersonalFromMara = maraRemainder / 2;

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [balances, setBalances] = useState({
    give: '',
    save: '',
    live: '',
    mat: '',
    mara: '',
    blue_statement: '',
    gold_statement: '',
    discover_statement: '',
  });
  const [latestSnapshot, setLatestSnapshot] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch latest snapshot on load
  useEffect(() => {
    fetchSnapshots();
  }, []);

  const fetchSnapshots = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('balance_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Error fetching snapshots:', error);
      setMessage('Error loading data. Check your Supabase connection.');
    } else if (data && data.length > 0) {
      setLatestSnapshot(data[0]);
      setSnapshots(data);
      setBalances({
        give: data[0].give.toString(),
        save: data[0].save.toString(),
        live: data[0].live.toString(),
        mat: data[0].mat.toString(),
        mara: data[0].mara.toString(),
        blue_statement: data[0].blue_statement.toString(),
        gold_statement: data[0].gold_statement.toString(),
        discover_statement: data[0].discover_statement.toString(),
      });
    }
    setLoading(false);
  };

  const saveSnapshot = async () => {
    setSaving(true);
    setMessage('');

    const snapshot = {
      give: parseFloat(balances.give) || 0,
      save: parseFloat(balances.save) || 0,
      live: parseFloat(balances.live) || 0,
      mat: parseFloat(balances.mat) || 0,
      mara: parseFloat(balances.mara) || 0,
      blue_statement: parseFloat(balances.blue_statement) || 0,
      gold_statement: parseFloat(balances.gold_statement) || 0,
      discover_statement: parseFloat(balances.discover_statement) || 0,
    };

    const { data, error } = await supabase
      .from('balance_snapshots')
      .insert([snapshot])
      .select();

    if (error) {
      console.error('Error saving snapshot:', error);
      setMessage('Error saving. Please try again.');
    } else {
      setMessage('Balances saved!');
      setLatestSnapshot(data[0]);
      fetchSnapshots();
    }
    setSaving(false);
  };

  const handleInputChange = (field, value) => {
    setBalances(prev => ({ ...prev, [field]: value }));
  };

  // Get upcoming paydays
  const getUpcomingPaydays = () => {
    const today = new Date();
    const paydays = [];
    
    // Mara's next payday: 1/23/2026, then every 2 weeks
    let maraNext = new Date(2026, 0, 23);
    while (maraNext < today) {
      maraNext.setDate(maraNext.getDate() + 14);
    }
    
    // Mat's next payday: 1/30/2026, then every 2 weeks
    let matNext = new Date(2026, 0, 30);
    while (matNext < today) {
      matNext.setDate(matNext.getDate() + 14);
    }

    // Get next 4 paydays
    for (let i = 0; i < 4; i++) {
      if (maraNext <= matNext) {
        paydays.push({ date: new Date(maraNext), type: 'mara', amount: CONFIG.maraPayAmount });
        maraNext.setDate(maraNext.getDate() + 14);
      } else {
        paydays.push({ date: new Date(matNext), type: 'mat', amount: CONFIG.matPayAmount });
        matNext.setDate(matNext.getDate() + 14);
      }
    }

    return paydays.sort((a, b) => a.date - b.date);
  };

  // Get upcoming bills/due dates
  const getUpcomingBills = () => {
    const today = new Date();
    const bills = [];
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Check this month and next month
    for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
      const month = (currentMonth + monthOffset) % 12;
      const year = currentMonth + monthOffset > 11 ? currentYear + 1 : currentYear;

      // Discover due 2nd
      const discoverDate = new Date(year, month, 2);
      if (discoverDate >= today) {
        bills.push({ date: discoverDate, type: 'discover', name: 'Discover (Mara)', account: 'mara' });
      }

      // Blue Amex due 8th
      const blueDate = new Date(year, month, 8);
      if (blueDate >= today) {
        bills.push({ date: blueDate, type: 'blue', name: 'Blue Amex (LIVE)', account: 'live' });
      }

      // Gold Amex due 15th
      const goldDate = new Date(year, month, 15);
      if (goldDate >= today) {
        bills.push({ date: goldDate, type: 'gold', name: 'Gold Amex (Mat)', account: 'mat' });
      }

      // Rent - last day of month
      const lastDay = new Date(year, month + 1, 0);
      if (lastDay >= today) {
        bills.push({ date: lastDay, type: 'rent', name: 'Rent', account: 'live', amount: CONFIG.monthlyBills.rent });
      }
    }

    return bills.sort((a, b) => a.date - b.date).slice(0, 6);
  };

  // Calculate health score and alerts
  const calculateHealth = () => {
    if (!latestSnapshot) return { score: 0, alerts: [], positives: [] };

    const alerts = [];
    const positives = [];
    let score = 100;

    const today = new Date();
    const paydays = getUpcomingPaydays();
    const bills = getUpcomingBills();

    // Project account balances forward
    let projectedLive = latestSnapshot.live;
    let projectedMat = latestSnapshot.mat;
    let projectedMara = latestSnapshot.mara;

    // Simulate forward in time
    const events = [...bills, ...paydays].sort((a, b) => a.date - b.date);

    for (const event of events) {
      if (event.type === 'mat') {
        projectedLive += CONFIG.splits.matLive;
        projectedMat += CONFIG.splits.matPersonalFromMat;
        projectedMara += CONFIG.splits.maraPersonalFromMat;
      } else if (event.type === 'mara') {
        projectedLive += CONFIG.splits.maraLive;
        projectedMat += CONFIG.splits.matPersonalFromMara;
        projectedMara += CONFIG.splits.maraPersonalFromMara;
      }
    }

    // Check: Can Mara pay Discover by the 2nd?
    const nextDiscover = bills.find(b => b.type === 'discover');
    if (nextDiscover) {
      let maraAtDiscover = latestSnapshot.mara;
      for (const p of paydays) {
        if (p.date < nextDiscover.date) {
          if (p.type === 'mat') maraAtDiscover += CONFIG.splits.maraPersonalFromMat;
          if (p.type === 'mara') maraAtDiscover += CONFIG.splits.maraPersonalFromMara;
        }
      }
      if (maraAtDiscover < latestSnapshot.discover_statement) {
        const shortfall = latestSnapshot.discover_statement - maraAtDiscover;
        alerts.push({
          severity: 'critical',
          message: `Mara won't have enough by ${nextDiscover.date.toLocaleDateString()}. Short $${shortfall.toFixed(2)} for Discover payment.`
        });
        score -= 30;
      } else {
        positives.push(`Mara can cover Discover ($${latestSnapshot.discover_statement.toFixed(2)})`);
      }
    }

    // Check: Can Mat pay Gold by the 15th?
    const nextGold = bills.find(b => b.type === 'gold');
    if (nextGold) {
      let matAtGold = latestSnapshot.mat;
      for (const p of paydays) {
        if (p.date < nextGold.date) {
          if (p.type === 'mat') matAtGold += CONFIG.splits.matPersonalFromMat;
          if (p.type === 'mara') matAtGold += CONFIG.splits.matPersonalFromMara;
        }
      }
      if (matAtGold < latestSnapshot.gold_statement) {
        const shortfall = latestSnapshot.gold_statement - matAtGold;
        alerts.push({
          severity: 'critical',
          message: `Mat won't have enough by ${nextGold.date.toLocaleDateString()}. Short $${shortfall.toFixed(2)} for Gold Amex payment.`
        });
        score -= 30;
      } else {
        positives.push(`Mat can cover Gold Amex ($${latestSnapshot.gold_statement.toFixed(2)})`);
      }
    }

    // Check: Can LIVE pay Blue by the 8th?
    const nextBlue = bills.find(b => b.type === 'blue');
    if (nextBlue) {
      let liveAtBlue = latestSnapshot.live;
      for (const p of paydays) {
        if (p.date < nextBlue.date) {
          if (p.type === 'mat') liveAtBlue += CONFIG.splits.matLive;
          if (p.type === 'mara') liveAtBlue += CONFIG.splits.maraLive;
        }
      }
      if (liveAtBlue < latestSnapshot.blue_statement) {
        const shortfall = latestSnapshot.blue_statement - liveAtBlue;
        alerts.push({
          severity: 'critical',
          message: `LIVE won't have enough by ${nextBlue.date.toLocaleDateString()}. Short $${shortfall.toFixed(2)} for Blue Amex payment.`
        });
        score -= 30;
      } else {
        positives.push(`LIVE can cover Blue Amex ($${latestSnapshot.blue_statement.toFixed(2)})`);
      }
    }

    // Check: Can LIVE cover rent?
    const nextRent = bills.find(b => b.type === 'rent');
    if (nextRent) {
      let liveAtRent = latestSnapshot.live;
      // Subtract Blue Amex if it comes before rent
      if (nextBlue && nextBlue.date < nextRent.date) {
        liveAtRent -= latestSnapshot.blue_statement;
      }
      for (const p of paydays) {
        if (p.date < nextRent.date) {
          if (p.type === 'mat') liveAtRent += CONFIG.splits.matLive;
          if (p.type === 'mara') liveAtRent += CONFIG.splits.maraLive;
        }
      }
      if (liveAtRent < CONFIG.monthlyBills.rent) {
        const shortfall = CONFIG.monthlyBills.rent - liveAtRent;
        alerts.push({
          severity: 'warning',
          message: `LIVE may be short $${shortfall.toFixed(2)} for rent on ${nextRent.date.toLocaleDateString()}.`
        });
        score -= 20;
      } else {
        positives.push(`LIVE can cover rent ($${CONFIG.monthlyBills.rent})`);
      }
    }

    // Check personal account health
    if (latestSnapshot.mat < 50) {
      alerts.push({
        severity: 'info',
        message: `Mat's personal account is low ($${latestSnapshot.mat.toFixed(2)})`
      });
      score -= 5;
    }
    if (latestSnapshot.mara < 50) {
      alerts.push({
        severity: 'info',
        message: `Mara's personal account is low ($${latestSnapshot.mara.toFixed(2)})`
      });
      score -= 5;
    }

    // Bonus for healthy savings
    if (latestSnapshot.save > 10000) {
      positives.push(`Savings looking healthy at $${latestSnapshot.save.toLocaleString()}`);
      score = Math.min(100, score + 5);
    }

    return { score: Math.max(0, score), alerts, positives };
  };

  const { score, alerts, positives } = calculateHealth();

  const getScoreColor = (s) => {
    if (s >= 80) return '#10b981';
    if (s >= 60) return '#f59e0b';
    if (s >= 40) return '#f97316';
    return '#ef4444';
  };

  const getScoreLabel = (s) => {
    if (s >= 90) return 'Excellent';
    if (s >= 80) return 'Great';
    if (s >= 70) return 'Good';
    if (s >= 60) return 'Fair';
    if (s >= 40) return 'Needs Attention';
    return 'Critical';
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getDaysUntil = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const days = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  // Generate weekly report
  const generateWeeklyReport = () => {
    if (snapshots.length < 2) return null;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weekStart = snapshots.find(s => new Date(s.created_at) <= oneWeekAgo) || snapshots[snapshots.length - 1];
    const weekEnd = snapshots[0];

    return {
      period: 'This Week',
      changes: {
        give: weekEnd.give - weekStart.give,
        save: weekEnd.save - weekStart.save,
        live: weekEnd.live - weekStart.live,
        mat: weekEnd.mat - weekStart.mat,
        mara: weekEnd.mara - weekStart.mara,
      },
      startDate: new Date(weekStart.created_at),
      endDate: new Date(weekEnd.created_at),
    };
  };

  // Generate monthly report
  const generateMonthlyReport = () => {
    if (snapshots.length < 2) return null;

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const monthStart = snapshots.find(s => new Date(s.created_at) <= oneMonthAgo) || snapshots[snapshots.length - 1];
    const monthEnd = snapshots[0];

    // Calculate potential kickback (if LIVE ended month with surplus)
    const liveChange = monthEnd.live - monthStart.live;
    const expectedLiveChange = 0; // Should net to ~0 if perfectly balanced
    const potentialKickback = Math.max(0, monthEnd.live - 150); // 150 is the safety buffer

    return {
      period: 'This Month',
      changes: {
        give: monthEnd.give - monthStart.give,
        save: monthEnd.save - monthStart.save,
        live: monthEnd.live - monthStart.live,
        mat: monthEnd.mat - monthStart.mat,
        mara: monthEnd.mara - monthStart.mara,
      },
      potentialKickback: potentialKickback > 50 ? potentialKickback : 0,
      startDate: new Date(monthStart.created_at),
      endDate: new Date(monthEnd.created_at),
    };
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading your finances...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Family Finance</h1>
        <p style={styles.subtitle}>Mat & Mara</p>
      </header>

      <nav style={styles.nav}>
        {['dashboard', 'update', 'reports'].map(view => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            style={{
              ...styles.navButton,
              ...(currentView === view ? styles.navButtonActive : {})
            }}
          >
            {view.charAt(0).toUpperCase() + view.slice(1)}
          </button>
        ))}
      </nav>

      {currentView === 'dashboard' && (
        <main style={styles.main}>
          {/* Health Score */}
          <section style={styles.scoreSection}>
            <div style={styles.scoreCircle}>
              <svg viewBox="0 0 100 100" style={styles.scoreSvg}>
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={getScoreColor(score)}
                  strokeWidth="8"
                  strokeDasharray={`${score * 2.83} 283`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                  style={{ transition: 'stroke-dasharray 0.5s ease' }}
                />
              </svg>
              <div style={styles.scoreText}>
                <span style={{ ...styles.scoreNumber, color: getScoreColor(score) }}>{score}</span>
                <span style={styles.scoreLabel}>{getScoreLabel(score)}</span>
              </div>
            </div>
            {latestSnapshot && (
              <p style={styles.lastUpdated}>
                Last updated: {new Date(latestSnapshot.created_at).toLocaleString()}
              </p>
            )}
          </section>

          {/* Alerts */}
          {alerts.length > 0 && (
            <section style={styles.alertsSection}>
              <h2 style={styles.sectionTitle}>⚠️ Attention Needed</h2>
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.alert,
                    borderLeftColor: alert.severity === 'critical' ? '#ef4444' :
                                     alert.severity === 'warning' ? '#f59e0b' : '#3b82f6'
                  }}
                >
                  {alert.message}
                </div>
              ))}
            </section>
          )}

          {/* Positives */}
          {positives.length > 0 && (
            <section style={styles.positivesSection}>
              <h2 style={styles.sectionTitle}>✓ Looking Good</h2>
              {positives.map((msg, i) => (
                <div key={i} style={styles.positive}>
                  {msg}
                </div>
              ))}
            </section>
          )}

          {/* Account Balances */}
          {latestSnapshot && (
            <section style={styles.balancesSection}>
              <h2 style={styles.sectionTitle}>Account Balances</h2>
              <div style={styles.balancesGrid}>
                {[
                  { label: 'Give', value: latestSnapshot.give, color: '#8b5cf6' },
                  { label: 'Save', value: latestSnapshot.save, color: '#10b981' },
                  { label: 'Live', value: latestSnapshot.live, color: '#3b82f6' },
                  { label: 'Mat', value: latestSnapshot.mat, color: '#f59e0b' },
                  { label: 'Mara', value: latestSnapshot.mara, color: '#ec4899' },
                ].map(account => (
                  <div key={account.label} style={styles.balanceCard}>
                    <span style={{ ...styles.balanceLabel, color: account.color }}>{account.label}</span>
                    <span style={styles.balanceValue}>${account.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Credit Cards */}
          {latestSnapshot && (
            <section style={styles.cardsSection}>
              <h2 style={styles.sectionTitle}>Statement Balances</h2>
              <div style={styles.cardsGrid}>
                <div style={styles.cardItem}>
                  <span style={styles.cardName}>Blue Amex</span>
                  <span style={styles.cardBalance}>${latestSnapshot.blue_statement.toFixed(2)}</span>
                  <span style={styles.cardDue}>Due: 8th → LIVE</span>
                </div>
                <div style={styles.cardItem}>
                  <span style={styles.cardName}>Gold Amex</span>
                  <span style={styles.cardBalance}>${latestSnapshot.gold_statement.toFixed(2)}</span>
                  <span style={styles.cardDue}>Due: 15th → Mat</span>
                </div>
                <div style={styles.cardItem}>
                  <span style={styles.cardName}>Discover</span>
                  <span style={styles.cardBalance}>${latestSnapshot.discover_statement.toFixed(2)}</span>
                  <span style={styles.cardDue}>Due: 2nd → Mara</span>
                </div>
              </div>
            </section>
          )}

          {/* Timeline */}
          <section style={styles.timelineSection}>
            <h2 style={styles.sectionTitle}>Upcoming</h2>
            <div style={styles.timeline}>
              {[...getUpcomingBills(), ...getUpcomingPaydays()]
                .sort((a, b) => a.date - b.date)
                .slice(0, 8)
                .map((event, i) => (
                  <div key={i} style={styles.timelineItem}>
                    <div style={styles.timelineDate}>
                      <span style={styles.timelineDays}>{getDaysUntil(event.date)}</span>
                      <span style={styles.timelineDateText}>{formatDate(event.date)}</span>
                    </div>
                    <div style={{
                      ...styles.timelineDot,
                      backgroundColor: event.type === 'mat' || event.type === 'mara' ? '#10b981' : '#ef4444'
                    }} />
                    <div style={styles.timelineContent}>
                      <span style={styles.timelineTitle}>
                        {event.name || (event.type === 'mat' ? '💰 Mat Payday' : '💰 Mara Payday')}
                      </span>
                      {event.amount && (
                        <span style={{
                          ...styles.timelineAmount,
                          color: event.type === 'mat' || event.type === 'mara' ? '#10b981' : '#ef4444'
                        }}>
                          {event.type === 'mat' || event.type === 'mara' ? '+' : '-'}${event.amount.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </main>
      )}

      {currentView === 'update' && (
        <main style={styles.main}>
          <section style={styles.updateSection}>
            <h2 style={styles.sectionTitle}>Update Balances</h2>
            <p style={styles.updateHint}>Enter your current account balances and statement amounts.</p>

            <div style={styles.inputGroup}>
              <h3 style={styles.inputGroupTitle}>Checking Accounts</h3>
              {[
                { key: 'give', label: 'Give' },
                { key: 'save', label: 'Save' },
                { key: 'live', label: 'Live' },
                { key: 'mat', label: 'Mat' },
                { key: 'mara', label: 'Mara' },
              ].map(account => (
                <div key={account.key} style={styles.inputRow}>
                  <label style={styles.inputLabel}>{account.label}</label>
                  <div style={styles.inputWrapper}>
                    <span style={styles.inputPrefix}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={balances[account.key]}
                      onChange={(e) => handleInputChange(account.key, e.target.value)}
                      style={styles.input}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.inputGroup}>
              <h3 style={styles.inputGroupTitle}>Credit Card Statements</h3>
              {[
                { key: 'blue_statement', label: 'Blue Amex (LIVE)' },
                { key: 'gold_statement', label: 'Gold Amex (Mat)' },
                { key: 'discover_statement', label: 'Discover (Mara)' },
              ].map(card => (
                <div key={card.key} style={styles.inputRow}>
                  <label style={styles.inputLabel}>{card.label}</label>
                  <div style={styles.inputWrapper}>
                    <span style={styles.inputPrefix}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={balances[card.key]}
                      onChange={(e) => handleInputChange(card.key, e.target.value)}
                      style={styles.input}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
            </div>

            {message && (
              <div style={{
                ...styles.message,
                backgroundColor: message.includes('Error') ? '#fef2f2' : '#f0fdf4',
                color: message.includes('Error') ? '#dc2626' : '#16a34a'
              }}>
                {message}
              </div>
            )}

            <button
              onClick={saveSnapshot}
              disabled={saving}
              style={{
                ...styles.saveButton,
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'Saving...' : 'Save Snapshot'}
            </button>
          </section>
        </main>
      )}

      {currentView === 'reports' && (
        <main style={styles.main}>
          <section style={styles.reportsSection}>
            <h2 style={styles.sectionTitle}>Weekly Report</h2>
            {(() => {
              const report = generateWeeklyReport();
              if (!report) return <p style={styles.noData}>Need more data for weekly report</p>;
              return (
                <div style={styles.reportCard}>
                  <p style={styles.reportPeriod}>
                    {report.startDate.toLocaleDateString()} - {report.endDate.toLocaleDateString()}
                  </p>
                  <div style={styles.reportChanges}>
                    {Object.entries(report.changes).map(([key, value]) => (
                      <div key={key} style={styles.reportChange}>
                        <span style={styles.reportChangeLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                        <span style={{
                          ...styles.reportChangeValue,
                          color: value >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {value >= 0 ? '+' : ''}{value.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <h2 style={{ ...styles.sectionTitle, marginTop: '2rem' }}>Monthly Report</h2>
            {(() => {
              const report = generateMonthlyReport();
              if (!report) return <p style={styles.noData}>Need more data for monthly report</p>;
              return (
                <div style={styles.reportCard}>
                  <p style={styles.reportPeriod}>
                    {report.startDate.toLocaleDateString()} - {report.endDate.toLocaleDateString()}
                  </p>
                  <div style={styles.reportChanges}>
                    {Object.entries(report.changes).map(([key, value]) => (
                      <div key={key} style={styles.reportChange}>
                        <span style={styles.reportChangeLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                        <span style={{
                          ...styles.reportChangeValue,
                          color: value >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {value >= 0 ? '+' : ''}{value.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {report.potentialKickback > 0 && (
                    <div style={styles.kickbackAlert}>
                      🎉 Potential Kickback: ${report.potentialKickback.toFixed(2)} (${(report.potentialKickback / 2).toFixed(2)} each!)
                    </div>
                  )}
                </div>
              );
            })()}

            <h2 style={{ ...styles.sectionTitle, marginTop: '2rem' }}>Snapshot History</h2>
            <div style={styles.historyList}>
              {snapshots.slice(0, 10).map((snapshot, i) => (
                <div key={snapshot.id} style={styles.historyItem}>
                  <span style={styles.historyDate}>
                    {new Date(snapshot.created_at).toLocaleDateString()}
                  </span>
                  <span style={styles.historyTotal}>
                    Total: ${(snapshot.give + snapshot.save + snapshot.live + snapshot.mat + snapshot.mara).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    color: '#f1f5f9',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: '1rem',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #1e293b',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: '0.875rem',
  },
  header: {
    padding: '1.5rem 1rem 1rem',
    textAlign: 'center',
    borderBottom: '1px solid #1e293b',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
    margin: 0,
    letterSpacing: '-0.025em',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#64748b',
    margin: '0.25rem 0 0',
  },
  nav: {
    display: 'flex',
    gap: '0.5rem',
    padding: '1rem',
    justifyContent: 'center',
    borderBottom: '1px solid #1e293b',
  },
  navButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#94a3b8',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  navButtonActive: {
    backgroundColor: '#1e293b',
    borderColor: '#3b82f6',
    color: '#f1f5f9',
  },
  main: {
    padding: '1rem',
    maxWidth: '600px',
    margin: '0 auto',
  },
  scoreSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1.5rem 0',
  },
  scoreCircle: {
    position: 'relative',
    width: '160px',
    height: '160px',
  },
  scoreSvg: {
    width: '100%',
    height: '100%',
  },
  scoreText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
  },
  scoreNumber: {
    display: 'block',
    fontSize: '2.5rem',
    fontWeight: '700',
    lineHeight: 1,
  },
  scoreLabel: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#94a3b8',
    marginTop: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  lastUpdated: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '1rem',
  },
  sectionTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '1rem',
  },
  alertsSection: {
    marginBottom: '1.5rem',
  },
  alert: {
    padding: '0.75rem 1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    borderLeft: '3px solid',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
  },
  positivesSection: {
    marginBottom: '1.5rem',
  },
  positive: {
    padding: '0.75rem 1rem',
    backgroundColor: '#022c22',
    borderRadius: '0.5rem',
    borderLeft: '3px solid #10b981',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    color: '#a7f3d0',
  },
  balancesSection: {
    marginBottom: '1.5rem',
  },
  balancesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
  },
  balanceCard: {
    padding: '1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  balanceLabel: {
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  balanceValue: {
    fontSize: '1.25rem',
    fontWeight: '600',
  },
  cardsSection: {
    marginBottom: '1.5rem',
  },
  cardsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  cardItem: {
    padding: '0.75rem 1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  cardName: {
    fontWeight: '500',
    flex: 1,
  },
  cardBalance: {
    fontWeight: '600',
    color: '#f59e0b',
  },
  cardDue: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  timelineSection: {
    marginBottom: '1.5rem',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  timelineItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 0',
    borderBottom: '1px solid #1e293b',
  },
  timelineDate: {
    width: '80px',
    flexShrink: 0,
  },
  timelineDays: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#3b82f6',
  },
  timelineDateText: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#64748b',
  },
  timelineDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  timelineContent: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineTitle: {
    fontSize: '0.875rem',
  },
  timelineAmount: {
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  updateSection: {
    paddingBottom: '2rem',
  },
  updateHint: {
    color: '#64748b',
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
  },
  inputGroup: {
    marginBottom: '1.5rem',
  },
  inputGroupTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: '1rem',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '0.75rem',
    gap: '1rem',
  },
  inputLabel: {
    width: '100px',
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  inputWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    padding: '0 0.75rem',
  },
  inputPrefix: {
    color: '#64748b',
    marginRight: '0.25rem',
  },
  input: {
    flex: 1,
    padding: '0.75rem 0',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#f1f5f9',
    fontSize: '1rem',
    outline: 'none',
  },
  message: {
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    fontSize: '0.875rem',
  },
  saveButton: {
    width: '100%',
    padding: '1rem',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '0.75rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  reportsSection: {
    paddingBottom: '2rem',
  },
  reportCard: {
    padding: '1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.75rem',
  },
  reportPeriod: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginBottom: '1rem',
  },
  reportChanges: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
  },
  reportChange: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
  },
  reportChangeLabel: {
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  reportChangeValue: {
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  kickbackAlert: {
    marginTop: '1rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#022c22',
    borderRadius: '0.5rem',
    color: '#a7f3d0',
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  noData: {
    color: '#64748b',
    fontSize: '0.875rem',
    padding: '1rem',
    textAlign: 'center',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
  },
  historyDate: {
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  historyTotal: {
    fontSize: '0.875rem',
    fontWeight: '500',
  },
};

// Add keyframes for spinner animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
`;
document.head.appendChild(styleSheet);
