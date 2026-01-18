import { useState, useEffect, useMemo } from 'react';
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
    blue_total: '',
    blue_statement: '',
    gold_total: '',
    gold_statement: '',
    discover_total: '',
    discover_statement: '',
  });
  const [latestSnapshot, setLatestSnapshot] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showScoreDetails, setShowScoreDetails] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState({});

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
        blue_total: (data[0].blue_total || 0).toString(),
        blue_statement: (data[0].blue_statement || 0).toString(),
        gold_total: (data[0].gold_total || 0).toString(),
        gold_statement: (data[0].gold_statement || 0).toString(),
        discover_total: (data[0].discover_total || 0).toString(),
        discover_statement: (data[0].discover_statement || 0).toString(),
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
      blue_total: parseFloat(balances.blue_total) || 0,
      blue_statement: parseFloat(balances.blue_statement) || 0,
      gold_total: parseFloat(balances.gold_total) || 0,
      gold_statement: parseFloat(balances.gold_statement) || 0,
      discover_total: parseFloat(balances.discover_total) || 0,
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
    today.setHours(0, 0, 0, 0);
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
        bills.push({ date: discoverDate, type: 'discover', name: 'Discover (Mara)', account: 'mara', dueDay: 2 });
      }

      // Blue Amex due 8th
      const blueDate = new Date(year, month, 8);
      if (blueDate >= today) {
        bills.push({ date: blueDate, type: 'blue', name: 'Blue Amex (LIVE)', account: 'live', dueDay: 8 });
      }

      // Gold Amex due 15th
      const goldDate = new Date(year, month, 15);
      if (goldDate >= today) {
        bills.push({ date: goldDate, type: 'gold', name: 'Gold Amex (Mat)', account: 'mat', dueDay: 15 });
      }

      // Rent - last day of month
      const lastDay = new Date(year, month + 1, 0);
      if (lastDay >= today) {
        bills.push({ date: lastDay, type: 'rent', name: 'Rent', account: 'live', amount: CONFIG.monthlyBills.rent });
      }
    }

    return bills.sort((a, b) => a.date - b.date).slice(0, 6);
  };

  // Get sorted credit cards by next due date
  const getSortedCreditCards = () => {
    if (!latestSnapshot) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bills = getUpcomingBills();

    const cards = [
      {
        type: 'discover',
        name: 'Discover',
        account: 'Mara',
        total: latestSnapshot.discover_total || 0,
        statement: latestSnapshot.discover_statement || 0,
        dueDay: 2,
        nextDue: bills.find(b => b.type === 'discover')?.date
      },
      {
        type: 'blue',
        name: 'Blue Amex',
        account: 'LIVE',
        total: latestSnapshot.blue_total || 0,
        statement: latestSnapshot.blue_statement || 0,
        dueDay: 8,
        nextDue: bills.find(b => b.type === 'blue')?.date
      },
      {
        type: 'gold',
        name: 'Gold Amex',
        account: 'Mat',
        total: latestSnapshot.gold_total || 0,
        statement: latestSnapshot.gold_statement || 0,
        dueDay: 15,
        nextDue: bills.find(b => b.type === 'gold')?.date
      },
    ];

    return cards.sort((a, b) => {
      if (!a.nextDue) return 1;
      if (!b.nextDue) return -1;
      return a.nextDue - b.nextDue;
    });
  };

  // Find when a statement was paid off (first occurrence of 0 balance)
  const findPaymentDate = (cardType) => {
    if (!snapshots || snapshots.length === 0) return null;

    const fieldName = `${cardType}_statement`;

    // Sort snapshots by date ascending (oldest first)
    const sortedSnapshots = [...snapshots].sort((a, b) =>
      new Date(a.created_at) - new Date(b.created_at)
    );

    // Find first snapshot where statement is 0
    const paidSnapshot = sortedSnapshots.find(s => s[fieldName] === 0);

    if (paidSnapshot) {
      return new Date(paidSnapshot.created_at);
    }

    return null;
  };

  // Calculate when an account will have enough to cover a payment
  const calculatePaymentDate = (accountType, startBalance, statementAmount, dueDate) => {
    if (statementAmount === 0) {
      return { canPay: true, dateAvailable: new Date(), details: 'Statement already paid' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let projectedBalance = startBalance;
    const paydays = getUpcomingPaydays();

    for (const payday of paydays) {
      if (payday.date > dueDate) break;

      if (accountType === 'live') {
        if (payday.type === 'mat') projectedBalance += CONFIG.splits.matLive;
        if (payday.type === 'mara') projectedBalance += CONFIG.splits.maraLive;
      } else if (accountType === 'mat') {
        if (payday.type === 'mat') projectedBalance += CONFIG.splits.matPersonalFromMat;
        if (payday.type === 'mara') projectedBalance += CONFIG.splits.matPersonalFromMara;
      } else if (accountType === 'mara') {
        if (payday.type === 'mat') projectedBalance += CONFIG.splits.maraPersonalFromMat;
        if (payday.type === 'mara') projectedBalance += CONFIG.splits.maraPersonalFromMara;
      }

      if (projectedBalance >= statementAmount) {
        return {
          canPay: true,
          dateAvailable: payday.date,
          projectedBalance,
          details: `Balance will reach $${projectedBalance.toFixed(2)} after ${payday.type === 'mat' ? 'Mat' : 'Mara'}'s paycheck on ${payday.date.toLocaleDateString()}`
        };
      }
    }

    // Check if current balance is already enough
    if (projectedBalance >= statementAmount) {
      return {
        canPay: true,
        dateAvailable: today,
        projectedBalance,
        details: `Current balance of $${projectedBalance.toFixed(2)} already covers statement of $${statementAmount.toFixed(2)}`
      };
    }

    return {
      canPay: false,
      dateAvailable: null,
      projectedBalance,
      shortfall: statementAmount - projectedBalance,
      details: `Even after all paychecks before due date, balance will only reach $${projectedBalance.toFixed(2)}, short by $${(statementAmount - projectedBalance).toFixed(2)}`
    };
  };

  // Calculate health score and alerts
  const calculateHealth = () => {
    if (!latestSnapshot) return {
      score: 0,
      alerts: [],
      positives: [],
      scoreBreakdown: {
        billsScore: 0,
        billsMax: 40,
        personalScore: 0,
        personalMax: 20,
        kickbackScore: 0,
        kickbackMax: 15,
        promptPaymentsScore: 0,
        promptPaymentsMax: 25,
        details: {
          bills: 'No data available',
          personal: 'No data available',
          kickback: 'No data available',
          promptPayments: 'No data available'
        }
      }
    };

    const alerts = [];
    const positives = [];
    const scoreBreakdown = {
      billsScore: 0,
      billsMax: 40,
      personalScore: 0,
      personalMax: 20,
      kickbackScore: 0,
      kickbackMax: 15,
      promptPaymentsScore: 0,
      promptPaymentsMax: 25,
      details: {}
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bills = getUpcomingBills();

    // Get next credit card bills
    const nextDiscover = bills.find(b => b.type === 'discover');
    const nextBlue = bills.find(b => b.type === 'blue');
    const nextGold = bills.find(b => b.type === 'gold');

    const billChecks = [];

    // Check Discover (Mara)
    if (nextDiscover) {
      const discoverCheck = calculatePaymentDate('mara', latestSnapshot.mara, latestSnapshot.discover_statement, nextDiscover.date);
      billChecks.push({
        name: 'Discover',
        account: 'Mara',
        dueDate: nextDiscover.date,
        statement: latestSnapshot.discover_statement,
        ...discoverCheck
      });

      if (latestSnapshot.discover_statement === 0) {
        positives.push({
          message: `Mara's Discover statement is paid off (Total balance: $${latestSnapshot.discover_total.toFixed(2)})`,
          details: 'Statement balance is $0.00'
        });
      } else if (discoverCheck.canPay) {
        const daysEarly = Math.ceil((nextDiscover.date - discoverCheck.dateAvailable) / (1000 * 60 * 60 * 24));
        positives.push({
          message: `Mara is on pace to cover Discover ($${latestSnapshot.discover_statement.toFixed(2)})`,
          details: discoverCheck.details,
          daysEarly
        });
      } else {
        alerts.push({
          severity: 'critical',
          message: `Mara won't have enough for Discover by ${nextDiscover.date.toLocaleDateString()}. Short $${discoverCheck.shortfall.toFixed(2)}.`,
          details: discoverCheck.details
        });
      }
    }

    // Check Gold (Mat)
    if (nextGold) {
      const goldCheck = calculatePaymentDate('mat', latestSnapshot.mat, latestSnapshot.gold_statement, nextGold.date);
      billChecks.push({
        name: 'Gold Amex',
        account: 'Mat',
        dueDate: nextGold.date,
        statement: latestSnapshot.gold_statement,
        ...goldCheck
      });

      if (latestSnapshot.gold_statement === 0) {
        positives.push({
          message: `Mat's Gold Amex statement is paid off (Total balance: $${latestSnapshot.gold_total.toFixed(2)})`,
          details: 'Statement balance is $0.00'
        });
      } else if (goldCheck.canPay) {
        const daysEarly = Math.ceil((nextGold.date - goldCheck.dateAvailable) / (1000 * 60 * 60 * 24));
        positives.push({
          message: `Mat is on pace to cover Gold Amex ($${latestSnapshot.gold_statement.toFixed(2)})`,
          details: goldCheck.details,
          daysEarly
        });
      } else {
        alerts.push({
          severity: 'critical',
          message: `Mat won't have enough for Gold Amex by ${nextGold.date.toLocaleDateString()}. Short $${goldCheck.shortfall.toFixed(2)}.`,
          details: goldCheck.details
        });
      }
    }

    // Check Blue (LIVE)
    if (nextBlue) {
      const blueCheck = calculatePaymentDate('live', latestSnapshot.live, latestSnapshot.blue_statement, nextBlue.date);
      billChecks.push({
        name: 'Blue Amex',
        account: 'LIVE',
        dueDate: nextBlue.date,
        statement: latestSnapshot.blue_statement,
        ...blueCheck
      });

      if (latestSnapshot.blue_statement === 0) {
        positives.push({
          message: `LIVE's Blue Amex statement is paid off (Total balance: $${latestSnapshot.blue_total.toFixed(2)})`,
          details: 'Statement balance is $0.00'
        });
      } else if (blueCheck.canPay) {
        const daysEarly = Math.ceil((nextBlue.date - blueCheck.dateAvailable) / (1000 * 60 * 60 * 24));
        positives.push({
          message: `LIVE is on pace to cover Blue Amex ($${latestSnapshot.blue_statement.toFixed(2)})`,
          details: blueCheck.details,
          daysEarly
        });
      } else {
        alerts.push({
          severity: 'critical',
          message: `LIVE won't have enough for Blue Amex by ${nextBlue.date.toLocaleDateString()}. Short $${blueCheck.shortfall.toFixed(2)}.`,
          details: blueCheck.details
        });
      }
    }

    // SCORING: 40 points for bills
    const billsCovered = billChecks.filter(b => b.canPay).length;
    const totalBills = billChecks.length;
    scoreBreakdown.billsScore = totalBills > 0 ? (billsCovered / totalBills) * 40 : 40;
    scoreBreakdown.details.bills = `${billsCovered} of ${totalBills} upcoming bills can be paid on time`;

    // SCORING: 20 points for personal account health
    let personalPoints = 0;
    if (latestSnapshot.mat >= 50) personalPoints += 10;
    else if (latestSnapshot.mat >= 20) personalPoints += 5;
    else alerts.push({ severity: 'info', message: `Mat's personal account is low ($${latestSnapshot.mat.toFixed(2)})`, details: 'Below $50 threshold' });

    if (latestSnapshot.mara >= 50) personalPoints += 10;
    else if (latestSnapshot.mara >= 20) personalPoints += 5;
    else alerts.push({ severity: 'info', message: `Mara's personal account is low ($${latestSnapshot.mara.toFixed(2)})`, details: 'Below $50 threshold' });

    scoreBreakdown.personalScore = personalPoints;
    scoreBreakdown.details.personal = `Mat: $${latestSnapshot.mat.toFixed(2)}, Mara: $${latestSnapshot.mara.toFixed(2)}`;

    // SCORING: 15 points for Kickback Indicator
    const kickbackProjection = calculateProjectedKickback();
    if (kickbackProjection) {
      const kickbackAmount = kickbackProjection.potentialKickback;
      if (kickbackAmount >= 200) scoreBreakdown.kickbackScore = 15;
      else if (kickbackAmount >= 100) scoreBreakdown.kickbackScore = 10;
      else if (kickbackAmount > 0) scoreBreakdown.kickbackScore = 5;
      else scoreBreakdown.kickbackScore = 0;

      scoreBreakdown.details.kickback = `Projected kickback: $${kickbackAmount.toFixed(2)} (Target: $200+)`;
    } else {
      scoreBreakdown.kickbackScore = 0;
      scoreBreakdown.details.kickback = 'Unable to calculate kickback projection';
    }

    // SCORING: 25 points for Prompt Payments
    // Find when each statement was paid off (if paid)
    const paymentDates = {
      discover: findPaymentDate('discover'),
      gold: findPaymentDate('gold'),
      blue: findPaymentDate('blue')
    };

    // Check how many cards are paid and how early
    const cardPaymentInfo = [];

    if (nextDiscover) {
      if (latestSnapshot.discover_statement === 0 && paymentDates.discover) {
        const daysEarly = Math.ceil((nextDiscover.date - paymentDates.discover) / (1000 * 60 * 60 * 24));
        cardPaymentInfo.push({ card: 'discover', daysEarly });
      }
    }

    if (nextGold) {
      if (latestSnapshot.gold_statement === 0 && paymentDates.gold) {
        const daysEarly = Math.ceil((nextGold.date - paymentDates.gold) / (1000 * 60 * 60 * 24));
        cardPaymentInfo.push({ card: 'gold', daysEarly });
      }
    }

    if (nextBlue) {
      if (latestSnapshot.blue_statement === 0 && paymentDates.blue) {
        const daysEarly = Math.ceil((nextBlue.date - paymentDates.blue) / (1000 * 60 * 60 * 24));
        cardPaymentInfo.push({ card: 'blue', daysEarly });
      }
    }

    const paidCount = cardPaymentInfo.length;
    const allPaidOverWeekEarly = cardPaymentInfo.every(info => info.daysEarly >= 7);
    const allPaidWithinWeek = cardPaymentInfo.every(info => info.daysEarly >= 0);

    let promptScore = 0;
    if (paidCount === 3 && allPaidOverWeekEarly) {
      promptScore = 25;
    } else if (paidCount === 3 && allPaidWithinWeek) {
      promptScore = 15;
    } else if (paidCount === 2 && cardPaymentInfo.every(info => info.daysEarly >= 7)) {
      promptScore = 17;
    } else if (paidCount === 2 && cardPaymentInfo.every(info => info.daysEarly >= 0)) {
      promptScore = 10;
    } else if (paidCount === 1 && cardPaymentInfo[0].daysEarly >= 7) {
      promptScore = 8;
    } else if (paidCount === 1) {
      promptScore = 5;
    } else {
      promptScore = 0;
    }

    scoreBreakdown.promptPaymentsScore = promptScore;
    scoreBreakdown.details.promptPayments = paidCount > 0
      ? `${paidCount} of 3 cards paid off (Avg ${(cardPaymentInfo.reduce((sum, info) => sum + info.daysEarly, 0) / paidCount).toFixed(1)} days early)`
      : 'No cards have been paid off yet';

    const totalScore = Math.round(
      scoreBreakdown.billsScore +
      scoreBreakdown.personalScore +
      scoreBreakdown.kickbackScore +
      scoreBreakdown.promptPaymentsScore
    );

    return { score: totalScore, alerts, positives, scoreBreakdown };
  };

  const { score, alerts, positives, scoreBreakdown } = useMemo(() => {
    return calculateHealth();
  }, [latestSnapshot, snapshots]);

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

  // Calculate projected kickback for end of month
  const calculateProjectedKickback = () => {
    if (!latestSnapshot) return null;

    // Ensure all required fields exist
    if (typeof latestSnapshot.live !== 'number' ||
        typeof latestSnapshot.blue_statement !== 'number') {
      return null;
    }

    const today = new Date();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const paydays = getUpcomingPaydays();
    const bills = getUpcomingBills();

    // Start with current LIVE balance
    let projectedLive = latestSnapshot.live;

    // Add all paychecks before end of month
    for (const payday of paydays) {
      if (payday.date <= endOfMonth) {
        if (payday.type === 'mat') projectedLive += CONFIG.splits.matLive;
        if (payday.type === 'mara') projectedLive += CONFIG.splits.maraLive;
      }
    }

    // Subtract rent if due this month
    const rentBill = bills.find(b => b.type === 'rent' && b.date <= endOfMonth);
    if (rentBill) {
      projectedLive -= CONFIG.monthlyBills.rent;
    }

    // Subtract Blue Amex statement if due this month
    const blueBill = bills.find(b => b.type === 'blue' && b.date <= endOfMonth);
    if (blueBill) {
      projectedLive -= latestSnapshot.blue_statement;
    }

    // Subtract projected remaining monthly expenses
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const monthProgress = dayOfMonth / daysInMonth;

    // Calculate how much of monthly budget should be spent so far
    const monthlyVariableExpenses = CONFIG.monthlyBills.groceries + CONFIG.monthlyBills.gas + CONFIG.monthlyBills.dateNights + CONFIG.monthlyBills.power + CONFIG.monthlyBills.gym + CONFIG.monthlyBills.insurance;
    const projectedRemainingExpenses = monthlyVariableExpenses * (1 - monthProgress);

    projectedLive -= projectedRemainingExpenses;

    // Kickback is anything above the $150 safety buffer
    const potentialKickback = Math.max(0, projectedLive - 150);
    const kickbackEach = potentialKickback / 2;

    return {
      projectedLive,
      potentialKickback,
      kickbackEach,
      details: {
        startingBalance: latestSnapshot.live,
        projectedInflows: paydays.filter(p => p.date <= endOfMonth).reduce((sum, p) =>
          sum + (p.type === 'mat' ? CONFIG.splits.matLive : CONFIG.splits.maraLive), 0),
        rent: rentBill ? CONFIG.monthlyBills.rent : 0,
        blueAmex: blueBill ? latestSnapshot.blue_statement : 0,
        projectedRemainingExpenses,
        safetyBuffer: 150,
        daysRemaining,
        monthProgress: (monthProgress * 100).toFixed(1),
      }
    };
  };

  // Generate monthly report
  const generateMonthlyReport = () => {
    if (snapshots.length < 2) return null;

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const monthStart = snapshots.find(s => new Date(s.created_at) <= oneMonthAgo) || snapshots[snapshots.length - 1];
    const monthEnd = snapshots[0];

    const kickbackProjection = calculateProjectedKickback();

    return {
      period: 'This Month',
      changes: {
        give: monthEnd.give - monthStart.give,
        save: monthEnd.save - monthStart.save,
        live: monthEnd.live - monthStart.live,
        mat: monthEnd.mat - monthStart.mat,
        mara: monthEnd.mara - monthStart.mara,
      },
      kickbackProjection,
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
            <button
              onClick={() => setExpandedDetails(prev => ({ ...prev, score: !prev.score }))}
              style={styles.detailsButton}
            >
              {expandedDetails.score ? 'Hide' : 'Show'} Details
            </button>
            {expandedDetails.score && scoreBreakdown && scoreBreakdown.details && (
              <div style={styles.detailsBox}>
                <h3 style={styles.detailsTitle}>Score Breakdown</h3>
                <div style={styles.detailsRow}>
                  <span>Bills on Time:</span>
                  <span>{(scoreBreakdown.billsScore || 0).toFixed(1)} / {scoreBreakdown.billsMax}</span>
                </div>
                <div style={styles.detailsSubtext}>{scoreBreakdown.details.bills || 'N/A'}</div>
                <div style={styles.detailsRow}>
                  <span>Personal Accounts:</span>
                  <span>{(scoreBreakdown.personalScore || 0).toFixed(1)} / {scoreBreakdown.personalMax}</span>
                </div>
                <div style={styles.detailsSubtext}>{scoreBreakdown.details.personal || 'N/A'}</div>
                <div style={styles.detailsRow}>
                  <span>Kickback Indicator:</span>
                  <span>{(scoreBreakdown.kickbackScore || 0).toFixed(1)} / {scoreBreakdown.kickbackMax}</span>
                </div>
                <div style={styles.detailsSubtext}>{scoreBreakdown.details.kickback || 'N/A'}</div>
                <div style={styles.detailsRow}>
                  <span>Prompt Payments:</span>
                  <span>{(scoreBreakdown.promptPaymentsScore || 0).toFixed(1)} / {scoreBreakdown.promptPaymentsMax}</span>
                </div>
                <div style={styles.detailsSubtext}>{scoreBreakdown.details.promptPayments || 'N/A'}</div>
                <div style={styles.detailsDivider} />
                <div style={styles.detailsRow}>
                  <span style={styles.detailsTotalLabel}>Total Score:</span>
                  <span style={styles.detailsTotalValue}>{score} / 100</span>
                </div>
              </div>
            )}
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
                  <div style={styles.alertContent}>
                    <span style={styles.alertMessage}>{alert.message}</span>
                    {alert.details && (
                      <button
                        onClick={() => setExpandedDetails(prev => ({ ...prev, [`alert-${i}`]: !prev[`alert-${i}`] }))}
                        style={styles.detailsButtonSmall}
                      >
                        {expandedDetails[`alert-${i}`] ? 'Hide' : 'Details'}
                      </button>
                    )}
                  </div>
                  {expandedDetails[`alert-${i}`] && alert.details && (
                    <div style={styles.alertDetails}>{alert.details}</div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Positives */}
          {positives.length > 0 && (
            <section style={styles.positivesSection}>
              <h2 style={styles.sectionTitle}>✓ Looking Good</h2>
              {positives.map((item, i) => {
                const msg = typeof item === 'string' ? item : item.message;
                const details = typeof item === 'object' ? item.details : null;
                return (
                  <div key={i} style={styles.positive}>
                    <div style={styles.positiveContent}>
                      <span style={styles.positiveMessage}>{msg}</span>
                      {details && (
                        <button
                          onClick={() => setExpandedDetails(prev => ({ ...prev, [`positive-${i}`]: !prev[`positive-${i}`] }))}
                          style={styles.detailsButtonSmall}
                        >
                          {expandedDetails[`positive-${i}`] ? 'Hide' : 'Details'}
                        </button>
                      )}
                    </div>
                    {expandedDetails[`positive-${i}`] && details && (
                      <div style={styles.positiveDetails}>{details}</div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {/* Account Balances & Credit Cards Combined */}
          {latestSnapshot && (
            <section style={styles.balancesSection}>
              <h2 style={styles.sectionTitle}>Accounts Overview</h2>
              <div style={styles.accountsGrid}>
                {/* Give Account - No Card */}
                <div style={styles.accountWithCard}>
                  <div style={styles.accountBalanceCard}>
                    <span style={{ ...styles.balanceLabel, color: '#8b5cf6' }}>Give</span>
                    <span style={styles.balanceValue}>${latestSnapshot.give.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Save Account - No Card */}
                <div style={styles.accountWithCard}>
                  <div style={styles.accountBalanceCard}>
                    <span style={{ ...styles.balanceLabel, color: '#10b981' }}>Save</span>
                    <span style={styles.balanceValue}>${latestSnapshot.save.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Live Account + Blue Amex */}
                <div style={styles.accountWithCard}>
                  <div style={styles.accountBalanceCard}>
                    <span style={{ ...styles.balanceLabel, color: '#3b82f6' }}>Live</span>
                    <span style={styles.balanceValue}>${latestSnapshot.live.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={styles.linkedCardIndicator}>→ Pays Blue Amex</div>
                  <div style={styles.linkedCard}>
                    <div style={styles.linkedCardHeader}>
                      <span style={styles.linkedCardName}>Blue Amex</span>
                      <span style={styles.linkedCardDue}>Due: 8th</span>
                    </div>
                    <div style={styles.linkedCardBalances}>
                      <div style={styles.linkedCardBalanceItem}>
                        <span style={styles.linkedCardLabel}>Total</span>
                        <span style={styles.linkedCardValue}>${latestSnapshot.blue_total.toFixed(2)}</span>
                      </div>
                      <div style={styles.linkedCardBalanceItem}>
                        <span style={styles.linkedCardLabel}>Statement</span>
                        <span style={{ ...styles.linkedCardValue, color: latestSnapshot.blue_statement === 0 ? '#10b981' : '#f59e0b' }}>
                          ${latestSnapshot.blue_statement.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {latestSnapshot.blue_statement === 0 && (
                      <div style={styles.linkedCardPaidBadge}>✓ Statement Paid</div>
                    )}
                  </div>
                </div>

                {/* Mat Account + Gold Amex */}
                <div style={styles.accountWithCard}>
                  <div style={styles.accountBalanceCard}>
                    <span style={{ ...styles.balanceLabel, color: '#f59e0b' }}>Mat</span>
                    <span style={styles.balanceValue}>${latestSnapshot.mat.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={styles.linkedCardIndicator}>→ Pays Gold Amex</div>
                  <div style={styles.linkedCard}>
                    <div style={styles.linkedCardHeader}>
                      <span style={styles.linkedCardName}>Gold Amex</span>
                      <span style={styles.linkedCardDue}>Due: 15th</span>
                    </div>
                    <div style={styles.linkedCardBalances}>
                      <div style={styles.linkedCardBalanceItem}>
                        <span style={styles.linkedCardLabel}>Total</span>
                        <span style={styles.linkedCardValue}>${latestSnapshot.gold_total.toFixed(2)}</span>
                      </div>
                      <div style={styles.linkedCardBalanceItem}>
                        <span style={styles.linkedCardLabel}>Statement</span>
                        <span style={{ ...styles.linkedCardValue, color: latestSnapshot.gold_statement === 0 ? '#10b981' : '#f59e0b' }}>
                          ${latestSnapshot.gold_statement.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {latestSnapshot.gold_statement === 0 && (
                      <div style={styles.linkedCardPaidBadge}>✓ Statement Paid</div>
                    )}
                  </div>
                </div>

                {/* Mara Account + Discover */}
                <div style={styles.accountWithCard}>
                  <div style={styles.accountBalanceCard}>
                    <span style={{ ...styles.balanceLabel, color: '#ec4899' }}>Mara</span>
                    <span style={styles.balanceValue}>${latestSnapshot.mara.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={styles.linkedCardIndicator}>→ Pays Discover</div>
                  <div style={styles.linkedCard}>
                    <div style={styles.linkedCardHeader}>
                      <span style={styles.linkedCardName}>Discover</span>
                      <span style={styles.linkedCardDue}>Due: 2nd</span>
                    </div>
                    <div style={styles.linkedCardBalances}>
                      <div style={styles.linkedCardBalanceItem}>
                        <span style={styles.linkedCardLabel}>Total</span>
                        <span style={styles.linkedCardValue}>${latestSnapshot.discover_total.toFixed(2)}</span>
                      </div>
                      <div style={styles.linkedCardBalanceItem}>
                        <span style={styles.linkedCardLabel}>Statement</span>
                        <span style={{ ...styles.linkedCardValue, color: latestSnapshot.discover_statement === 0 ? '#10b981' : '#f59e0b' }}>
                          ${latestSnapshot.discover_statement.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {latestSnapshot.discover_statement === 0 && (
                      <div style={styles.linkedCardPaidBadge}>✓ Statement Paid</div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Kickback Projection */}
          {latestSnapshot && (() => {
            const kickbackProjection = calculateProjectedKickback();
            if (!kickbackProjection) return null;
            return (
              <section style={styles.kickbackProjectionSection}>
                <h2 style={styles.sectionTitle}>End-of-Month Projection</h2>
                {kickbackProjection.potentialKickback > 0 ? (
                  <div style={styles.kickbackSection}>
                    <div style={styles.kickbackAlert}>
                      🎉 Projected Kickback: ${kickbackProjection.potentialKickback.toFixed(2)} (${kickbackProjection.kickbackEach.toFixed(2)} each!)
                    </div>
                    <button
                      onClick={() => setExpandedDetails(prev => ({ ...prev, dashboardKickback: !prev.dashboardKickback }))}
                      style={styles.detailsButtonSmall}
                    >
                      {expandedDetails.dashboardKickback ? 'Hide' : 'Show'} Calculation Details
                    </button>
                    {expandedDetails.dashboardKickback && (
                      <div style={styles.kickbackDetails}>
                        <h4 style={styles.kickbackDetailsTitle}>How this was calculated:</h4>
                        <div style={styles.kickbackDetailRow}>
                          <span>Current LIVE balance:</span>
                          <span>${kickbackProjection.details.startingBalance.toFixed(2)}</span>
                        </div>
                        <div style={styles.kickbackDetailRow}>
                          <span>+ Projected paychecks (LIVE portion):</span>
                          <span>+${kickbackProjection.details.projectedInflows.toFixed(2)}</span>
                        </div>
                        {kickbackProjection.details.rent > 0 && (
                          <div style={styles.kickbackDetailRow}>
                            <span>- Rent payment:</span>
                            <span>-${kickbackProjection.details.rent.toFixed(2)}</span>
                          </div>
                        )}
                        {kickbackProjection.details.blueAmex > 0 && (
                          <div style={styles.kickbackDetailRow}>
                            <span>- Blue Amex payment:</span>
                            <span>-${kickbackProjection.details.blueAmex.toFixed(2)}</span>
                          </div>
                        )}
                        <div style={styles.kickbackDetailRow}>
                          <span>- Projected remaining expenses ({kickbackProjection.details.daysRemaining} days):</span>
                          <span>-${kickbackProjection.details.projectedRemainingExpenses.toFixed(2)}</span>
                        </div>
                        <div style={styles.kickbackDetailRow}>
                          <span>- Safety buffer:</span>
                          <span>-${kickbackProjection.details.safetyBuffer.toFixed(2)}</span>
                        </div>
                        <div style={styles.kickbackDivider} />
                        <div style={styles.kickbackDetailRow}>
                          <span style={styles.kickbackTotalLabel}>Projected LIVE at month end:</span>
                          <span style={styles.kickbackTotalValue}>${kickbackProjection.projectedLive.toFixed(2)}</span>
                        </div>
                        <div style={styles.kickbackDetailRow}>
                          <span style={styles.kickbackTotalLabel}>Available for kickback:</span>
                          <span style={styles.kickbackTotalValue}>${kickbackProjection.potentialKickback.toFixed(2)}</span>
                        </div>
                        <div style={styles.kickbackDetailRow}>
                          <span style={styles.kickbackEachLabel}>Each person gets:</span>
                          <span style={styles.kickbackEachValue}>${kickbackProjection.kickbackEach.toFixed(2)}</span>
                        </div>
                        <p style={styles.kickbackNote}>
                          Month is {kickbackProjection.details.monthProgress}% complete
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={styles.noKickbackAlert}>
                    No kickback projected this month. Projected LIVE at month end: ${kickbackProjection.projectedLive.toFixed(2)}
                  </div>
                )}
              </section>
            );
          })()}

          {/* Anticipated Payments */}
          {latestSnapshot && (() => {
            const bills = getUpcomingBills();
            const cards = [
              {
                type: 'discover',
                name: 'Discover',
                account: 'Mara',
                statement: latestSnapshot.discover_statement,
                dueDate: bills.find(b => b.type === 'discover')?.date
              },
              {
                type: 'gold',
                name: 'Gold Amex',
                account: 'Mat',
                statement: latestSnapshot.gold_statement,
                dueDate: bills.find(b => b.type === 'gold')?.date
              },
              {
                type: 'blue',
                name: 'Blue Amex',
                account: 'LIVE',
                statement: latestSnapshot.blue_statement,
                dueDate: bills.find(b => b.type === 'blue')?.date
              },
            ];

            return (
              <section style={styles.anticipatedSection}>
                <h2 style={styles.sectionTitle}>Anticipated Payments</h2>
                <div style={styles.anticipatedGrid}>
                  {cards.map(card => {
                    if (card.statement === 0) {
                      const paidDate = findPaymentDate(card.type);
                      return (
                        <div key={card.type} style={styles.anticipatedItem}>
                          <div style={styles.anticipatedHeader}>
                            <span style={styles.anticipatedCardName}>{card.name}</span>
                            <span style={styles.anticipatedPaidBadge}>✓ Paid</span>
                          </div>
                          <div style={styles.anticipatedDetails}>
                            {paidDate ? (
                              <span style={styles.anticipatedDateGreen}>
                                Paid on {paidDate.toLocaleDateString()}
                              </span>
                            ) : (
                              <span style={styles.anticipatedDateGreen}>Statement balance: $0.00</span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    const accountType = card.account.toLowerCase();
                    const startBalance = latestSnapshot[accountType];
                    const paymentCalc = calculatePaymentDate(accountType, startBalance, card.statement, card.dueDate);

                    const canPayBeforeDue = paymentCalc.canPay && paymentCalc.dateAvailable <= card.dueDate;

                    return (
                      <div key={card.type} style={styles.anticipatedItem}>
                        <div style={styles.anticipatedHeader}>
                          <span style={styles.anticipatedCardName}>{card.name}</span>
                          <span style={styles.anticipatedAmount}>${card.statement.toFixed(2)}</span>
                        </div>
                        <div style={styles.anticipatedDetails}>
                          {paymentCalc.canPay ? (
                            <>
                              <span style={canPayBeforeDue ? styles.anticipatedDateGreen : styles.anticipatedDateRed}>
                                Funds available: {paymentCalc.dateAvailable.toLocaleDateString()}
                              </span>
                              <span style={styles.anticipatedDue}>
                                Due: {card.dueDate.toLocaleDateString()}
                              </span>
                            </>
                          ) : (
                            <>
                              <span style={styles.anticipatedDateRed}>
                                Insufficient funds by due date
                              </span>
                              <span style={styles.anticipatedDue}>
                                Due: {card.dueDate.toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => setExpandedDetails(prev => ({ ...prev, [`anticipated-${card.type}`]: !prev[`anticipated-${card.type}`] }))}
                          style={styles.detailsButtonSmall}
                        >
                          {expandedDetails[`anticipated-${card.type}`] ? 'Hide' : 'Show'} Details
                        </button>
                        {expandedDetails[`anticipated-${card.type}`] && (
                          <div style={styles.anticipatedDetailsBox}>
                            {paymentCalc.details}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

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
              <h3 style={styles.inputGroupTitle}>Credit Cards</h3>
              <p style={styles.inputHint}>Total Balance = All charges | Statement Balance = Amount due this cycle</p>
              {[
                { totalKey: 'blue_total', statementKey: 'blue_statement', label: 'Blue Amex (LIVE)', due: '8th' },
                { totalKey: 'gold_total', statementKey: 'gold_statement', label: 'Gold Amex (Mat)', due: '15th' },
                { totalKey: 'discover_total', statementKey: 'discover_statement', label: 'Discover (Mara)', due: '2nd' },
              ].map(card => (
                <div key={card.label} style={styles.cardInputGroup}>
                  <div style={styles.cardInputHeader}>
                    <span style={styles.cardInputLabel}>{card.label}</span>
                    <span style={styles.cardInputDue}>Due: {card.due}</span>
                  </div>
                  <div style={styles.cardInputRow}>
                    <div style={styles.inputRowHalf}>
                      <label style={styles.inputLabelSmall}>Total Balance</label>
                      <div style={styles.inputWrapper}>
                        <span style={styles.inputPrefix}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={balances[card.totalKey]}
                          onChange={(e) => handleInputChange(card.totalKey, e.target.value)}
                          style={styles.input}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div style={styles.inputRowHalf}>
                      <label style={styles.inputLabelSmall}>Statement Balance</label>
                      <div style={styles.inputWrapper}>
                        <span style={styles.inputPrefix}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={balances[card.statementKey]}
                          onChange={(e) => handleInputChange(card.statementKey, e.target.value)}
                          style={styles.input}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
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
                  {report.kickbackProjection && report.kickbackProjection.potentialKickback > 0 && (
                    <div style={styles.kickbackSection}>
                      <div style={styles.kickbackAlert}>
                        🎉 Projected End-of-Month Kickback: ${report.kickbackProjection.potentialKickback.toFixed(2)} (${report.kickbackProjection.kickbackEach.toFixed(2)} each!)
                      </div>
                      <button
                        onClick={() => setExpandedDetails(prev => ({ ...prev, kickback: !prev.kickback }))}
                        style={styles.detailsButtonSmall}
                      >
                        {expandedDetails.kickback ? 'Hide' : 'Show'} Calculation Details
                      </button>
                      {expandedDetails.kickback && (
                        <div style={styles.kickbackDetails}>
                          <h4 style={styles.kickbackDetailsTitle}>How this was calculated:</h4>
                          <div style={styles.kickbackDetailRow}>
                            <span>Current LIVE balance:</span>
                            <span>${report.kickbackProjection.details.startingBalance.toFixed(2)}</span>
                          </div>
                          <div style={styles.kickbackDetailRow}>
                            <span>+ Projected paychecks (LIVE portion):</span>
                            <span>+${report.kickbackProjection.details.projectedInflows.toFixed(2)}</span>
                          </div>
                          {report.kickbackProjection.details.rent > 0 && (
                            <div style={styles.kickbackDetailRow}>
                              <span>- Rent payment:</span>
                              <span>-${report.kickbackProjection.details.rent.toFixed(2)}</span>
                            </div>
                          )}
                          {report.kickbackProjection.details.blueAmex > 0 && (
                            <div style={styles.kickbackDetailRow}>
                              <span>- Blue Amex payment:</span>
                              <span>-${report.kickbackProjection.details.blueAmex.toFixed(2)}</span>
                            </div>
                          )}
                          <div style={styles.kickbackDetailRow}>
                            <span>- Projected remaining expenses ({report.kickbackProjection.details.daysRemaining} days):</span>
                            <span>-${report.kickbackProjection.details.projectedRemainingExpenses.toFixed(2)}</span>
                          </div>
                          <div style={styles.kickbackDetailRow}>
                            <span>- Safety buffer:</span>
                            <span>-${report.kickbackProjection.details.safetyBuffer.toFixed(2)}</span>
                          </div>
                          <div style={styles.kickbackDivider} />
                          <div style={styles.kickbackDetailRow}>
                            <span style={styles.kickbackTotalLabel}>Projected LIVE at month end:</span>
                            <span style={styles.kickbackTotalValue}>${report.kickbackProjection.projectedLive.toFixed(2)}</span>
                          </div>
                          <div style={styles.kickbackDetailRow}>
                            <span style={styles.kickbackTotalLabel}>Available for kickback:</span>
                            <span style={styles.kickbackTotalValue}>${report.kickbackProjection.potentialKickback.toFixed(2)}</span>
                          </div>
                          <div style={styles.kickbackDetailRow}>
                            <span style={styles.kickbackEachLabel}>Each person gets:</span>
                            <span style={styles.kickbackEachValue}>${report.kickbackProjection.kickbackEach.toFixed(2)}</span>
                          </div>
                          <p style={styles.kickbackNote}>
                            Month is {report.kickbackProjection.details.monthProgress}% complete
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {report.kickbackProjection && report.kickbackProjection.potentialKickback <= 0 && (
                    <div style={styles.noKickbackAlert}>
                      No kickback projected this month. Projected LIVE at month end: ${report.kickbackProjection.projectedLive.toFixed(2)}
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
  alertContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  alertMessage: {
    flex: 1,
  },
  alertDetails: {
    marginTop: '0.5rem',
    paddingTop: '0.5rem',
    borderTop: '1px solid #334155',
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontStyle: 'italic',
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
  positiveContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  positiveMessage: {
    flex: 1,
  },
  positiveDetails: {
    marginTop: '0.5rem',
    paddingTop: '0.5rem',
    borderTop: '1px solid #065f46',
    fontSize: '0.75rem',
    color: '#6ee7b7',
    fontStyle: 'italic',
  },
  balancesSection: {
    marginBottom: '1.5rem',
  },
  accountsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  accountWithCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  accountBalanceCard: {
    padding: '1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  linkedCardIndicator: {
    fontSize: '0.625rem',
    color: '#64748b',
    paddingLeft: '1rem',
    fontStyle: 'italic',
  },
  linkedCard: {
    marginLeft: '1rem',
    padding: '0.75rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.5rem',
    borderLeft: '3px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  linkedCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkedCardName: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#94a3b8',
  },
  linkedCardDue: {
    fontSize: '0.625rem',
    color: '#64748b',
  },
  linkedCardBalances: {
    display: 'flex',
    gap: '0.5rem',
  },
  linkedCardBalanceItem: {
    flex: 1,
    padding: '0.5rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.375rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  linkedCardLabel: {
    fontSize: '0.625rem',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  linkedCardValue: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#f1f5f9',
  },
  linkedCardPaidBadge: {
    fontSize: '0.625rem',
    color: '#10b981',
    backgroundColor: '#022c22',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    textAlign: 'center',
  },
  kickbackProjectionSection: {
    marginBottom: '1.5rem',
  },
  anticipatedSection: {
    marginBottom: '1.5rem',
  },
  anticipatedGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  anticipatedItem: {
    padding: '1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  anticipatedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  anticipatedCardName: {
    fontWeight: '600',
    fontSize: '0.875rem',
  },
  anticipatedAmount: {
    fontWeight: '600',
    color: '#f59e0b',
  },
  anticipatedPaidBadge: {
    fontSize: '0.75rem',
    color: '#10b981',
    backgroundColor: '#022c22',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
  },
  anticipatedDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  anticipatedDateGreen: {
    fontSize: '0.75rem',
    color: '#10b981',
    fontWeight: '500',
  },
  anticipatedDateRed: {
    fontSize: '0.75rem',
    color: '#ef4444',
    fontWeight: '500',
  },
  anticipatedDue: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  anticipatedDetailsBox: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontStyle: 'italic',
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
    padding: '1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  cardItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardName: {
    fontWeight: '600',
    fontSize: '0.875rem',
  },
  cardBalance: {
    fontWeight: '600',
    color: '#f59e0b',
  },
  cardDue: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  cardItemBalances: {
    display: 'flex',
    gap: '0.75rem',
  },
  cardBalanceItem: {
    flex: 1,
    padding: '0.5rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  cardBalanceLabel: {
    fontSize: '0.625rem',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  cardBalanceValue: {
    fontSize: '1rem',
    fontWeight: '600',
  },
  cardPaidBadge: {
    fontSize: '0.75rem',
    color: '#10b981',
    backgroundColor: '#022c22',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    textAlign: 'center',
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
  inputHint: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginBottom: '1rem',
    marginTop: '-0.5rem',
  },
  cardInputGroup: {
    marginBottom: '1.5rem',
    padding: '1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
  },
  cardInputHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  cardInputLabel: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#f1f5f9',
  },
  cardInputDue: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  cardInputRow: {
    display: 'flex',
    gap: '1rem',
  },
  inputRowHalf: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  inputLabelSmall: {
    fontSize: '0.75rem',
    color: '#94a3b8',
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
  detailsButton: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#94a3b8',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  detailsButtonSmall: {
    padding: '0.25rem 0.5rem',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.25rem',
    color: '#64748b',
    fontSize: '0.625rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  detailsBox: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
  },
  detailsTitle: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  detailsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: '#cbd5e1',
    marginBottom: '0.5rem',
  },
  detailsSubtext: {
    fontSize: '0.625rem',
    color: '#64748b',
    marginBottom: '0.75rem',
    fontStyle: 'italic',
  },
  detailsDivider: {
    height: '1px',
    backgroundColor: '#334155',
    margin: '0.75rem 0',
  },
  detailsTotalLabel: {
    fontWeight: '600',
    color: '#f1f5f9',
  },
  detailsTotalValue: {
    fontWeight: '700',
    color: '#3b82f6',
    fontSize: '0.875rem',
  },
  kickbackSection: {
    marginTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  kickbackAlert: {
    padding: '0.75rem 1rem',
    backgroundColor: '#022c22',
    borderRadius: '0.5rem',
    color: '#a7f3d0',
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  noKickbackAlert: {
    marginTop: '1rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    color: '#94a3b8',
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  kickbackDetails: {
    padding: '1rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #065f46',
  },
  kickbackDetailsTitle: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#6ee7b7',
    marginBottom: '0.75rem',
  },
  kickbackDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: '#a7f3d0',
    marginBottom: '0.5rem',
  },
  kickbackDivider: {
    height: '1px',
    backgroundColor: '#065f46',
    margin: '0.75rem 0',
  },
  kickbackTotalLabel: {
    fontWeight: '600',
    color: '#d1fae5',
  },
  kickbackTotalValue: {
    fontWeight: '700',
    color: '#10b981',
  },
  kickbackEachLabel: {
    fontWeight: '700',
    color: '#d1fae5',
    fontSize: '0.875rem',
  },
  kickbackEachValue: {
    fontWeight: '700',
    color: '#10b981',
    fontSize: '0.875rem',
  },
  kickbackNote: {
    fontSize: '0.625rem',
    color: '#6ee7b7',
    marginTop: '0.5rem',
    textAlign: 'center',
    fontStyle: 'italic',
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

// Add keyframes for spinner animation and global styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    background-color: #0f172a;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
`;
document.head.appendChild(styleSheet);
