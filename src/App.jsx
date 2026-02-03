import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import PlaidLink from './components/PlaidLink';
import AccountMappingUI from './components/AccountMappingUI';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Default configuration
const DEFAULT_CONFIG = {
  matPayAmount: 2018.55,
  maraPayAmount: 1302.06,
  cushion: 150, // Safety buffer for accounts
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

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [config, setConfig] = useState(DEFAULT_CONFIG);
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
  const [collapsedSections, setCollapsedSections] = useState({
    suggestions: true,     // Ways to Improve - collapsed by default
    alerts: false,          // Attention Needed - open by default
    positives: false,       // Looking Good - open by default
    timeline: true,         // Upcoming - collapsed by default
    anticipated: true       // Anticipated Payments - collapsed by default
  });
  const [hoveredSuggestion, setHoveredSuggestion] = useState(null);
  const [tempConfig, setTempConfig] = useState(config);
  const [syncing, setSyncing] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState([]);

  // Calculate personal splits based on config
  const getPersonalSplits = () => {
    const matRemainder = config.matPayAmount - (config.matPayAmount * config.splits.give) - (config.matPayAmount * config.splits.save) - config.splits.matLive;
    const maraRemainder = config.maraPayAmount - (config.maraPayAmount * config.splits.give) - (config.maraPayAmount * config.splits.save) - config.splits.maraLive;
    return {
      matPersonalFromMat: matRemainder / 2,
      maraPersonalFromMat: matRemainder / 2,
      matPersonalFromMara: maraRemainder / 2,
      maraPersonalFromMara: maraRemainder / 2,
    };
  };

  // Fetch config from Supabase
  const fetchConfig = async () => {
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching config:', error);
      setConfig(DEFAULT_CONFIG);
    } else if (data && data.length > 0) {
      const dbConfig = data[0];
      const loadedConfig = {
        matPayAmount: parseFloat(dbConfig.mat_pay_amount),
        maraPayAmount: parseFloat(dbConfig.mara_pay_amount),
        cushion: parseFloat(dbConfig.cushion) || 150,
        splits: {
          give: parseFloat(dbConfig.split_give),
          save: parseFloat(dbConfig.split_save),
          matLive: parseFloat(dbConfig.split_mat_live),
          maraLive: parseFloat(dbConfig.split_mara_live),
        },
        dueDates: {
          blue: parseInt(dbConfig.due_date_blue),
          gold: parseInt(dbConfig.due_date_gold),
          discover: parseInt(dbConfig.due_date_discover),
          rent: dbConfig.due_date_rent,
        },
        monthlyBills: {
          rent: parseFloat(dbConfig.monthly_rent),
          insurance: parseFloat(dbConfig.monthly_insurance),
          gym: parseFloat(dbConfig.monthly_gym),
          dateNights: parseFloat(dbConfig.monthly_date_nights),
          power: parseFloat(dbConfig.monthly_power),
          groceries: parseFloat(dbConfig.monthly_groceries),
          gas: parseFloat(dbConfig.monthly_gas),
        }
      };
      setConfig(loadedConfig);
    } else {
      setConfig(DEFAULT_CONFIG);
    }
  };

  // Save config to Supabase
  const saveConfig = async (newConfig) => {
    const configData = {
      mat_pay_amount: newConfig.matPayAmount,
      mara_pay_amount: newConfig.maraPayAmount,
      cushion: newConfig.cushion,
      split_give: newConfig.splits.give,
      split_save: newConfig.splits.save,
      split_mat_live: newConfig.splits.matLive,
      split_mara_live: newConfig.splits.maraLive,
      due_date_blue: newConfig.dueDates.blue,
      due_date_gold: newConfig.dueDates.gold,
      due_date_discover: newConfig.dueDates.discover,
      due_date_rent: newConfig.dueDates.rent,
      monthly_rent: newConfig.monthlyBills.rent,
      monthly_insurance: newConfig.monthlyBills.insurance,
      monthly_gym: newConfig.monthlyBills.gym,
      monthly_date_nights: newConfig.monthlyBills.dateNights,
      monthly_power: newConfig.monthlyBills.power,
      monthly_groceries: newConfig.monthlyBills.groceries,
      monthly_gas: newConfig.monthlyBills.gas,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('app_config')
      .insert(configData);

    if (error) {
      console.error('Error saving config:', error);
      setMessage('Error saving settings!');
    } else {
      setConfig(newConfig);
      setMessage('Settings saved!');
    }
  };

  // Fetch connected Plaid accounts
  const fetchConnectedAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('plaid_items')
        .select('*');

      if (error) {
        console.error('Error fetching connected accounts:', error);
      } else {
        setConnectedAccounts(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Sync balances from Plaid
  const syncBalances = async () => {
    setSyncing(true);
    setMessage('');
    try {
      const response = await fetch('http://localhost:3001/api/sync_balances', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setMessage('✅ Balances synced successfully!');
        await fetchSnapshots(); // Refresh the dashboard
      } else {
        setMessage('❌ ' + (data.message || 'Failed to sync balances'));
      }
    } catch (error) {
      console.error('Error syncing balances:', error);
      setMessage('❌ Error syncing balances. Make sure the server is running.');
    } finally {
      setSyncing(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // Handle successful Plaid Link
  const handlePlaidSuccess = (metadata) => {
    setMessage('✅ Bank account connected successfully!');
    fetchConnectedAccounts();
    setTimeout(() => setMessage(''), 3000);
  };

  // Fetch latest snapshot and config on load
  useEffect(() => {
    fetchSnapshots();
    fetchConfig();
    fetchConnectedAccounts();
  }, []);

  // Sync tempConfig with config when switching to settings
  useEffect(() => {
    if (currentView === 'settings') {
      setTempConfig(config);
    }
  }, [currentView, config]);

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
      setMessage(`Error saving: ${error.message || error.error_description || 'Please check browser console for details'}`);
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
        paydays.push({ date: new Date(maraNext), type: 'mara', amount: config.maraPayAmount });
        maraNext.setDate(maraNext.getDate() + 14);
      } else {
        paydays.push({ date: new Date(matNext), type: 'mat', amount: config.matPayAmount });
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
        bills.push({ date: lastDay, type: 'rent', name: 'Rent', account: 'live', amount: config.monthlyBills.rent });
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
    const personalSplits = getPersonalSplits();

    for (const payday of paydays) {
      if (payday.date > dueDate) break;

      if (accountType === 'live') {
        if (payday.type === 'mat') projectedBalance += config.splits.matLive;
        if (payday.type === 'mara') projectedBalance += config.splits.maraLive;
      } else if (accountType === 'mat') {
        if (payday.type === 'mat') projectedBalance += personalSplits.matPersonalFromMat;
        if (payday.type === 'mara') projectedBalance += personalSplits.matPersonalFromMara;
      } else if (accountType === 'mara') {
        if (payday.type === 'mat') projectedBalance += personalSplits.maraPersonalFromMat;
        if (payday.type === 'mara') projectedBalance += personalSplits.maraPersonalFromMara;
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

  // Calculate disposable income for Mat or Mara
  const calculateDisposableIncome = (person) => {
    if (!latestSnapshot) return null;

    const accountBalance = latestSnapshot[person.toLowerCase()];
    const cushion = config.cushion;

    // Determine which card this person pays
    let cardType, cardStatement, cardTotal, nextDueDate;
    const bills = getUpcomingBills();

    if (person === 'mat') {
      cardType = 'gold';
      cardStatement = latestSnapshot.gold_statement || 0;
      cardTotal = latestSnapshot.gold_total || 0;
      nextDueDate = bills.find(b => b.type === 'gold')?.date;
    } else if (person === 'mara') {
      cardType = 'discover';
      cardStatement = latestSnapshot.discover_statement || 0;
      cardTotal = latestSnapshot.discover_total || 0;
      nextDueDate = bills.find(b => b.type === 'discover')?.date;
    } else {
      return null;
    }

    if (!nextDueDate) return null;

    // Calculate paychecks before next due date
    const paydays = getUpcomingPaydays();
    const personalSplits = getPersonalSplits();
    let futureDeposits = 0;

    for (const payday of paydays) {
      if (payday.date <= nextDueDate) {
        if (person === 'mat') {
          if (payday.type === 'mat') futureDeposits += personalSplits.matPersonalFromMat;
          if (payday.type === 'mara') futureDeposits += personalSplits.matPersonalFromMara;
        } else if (person === 'mara') {
          if (payday.type === 'mat') futureDeposits += personalSplits.maraPersonalFromMat;
          if (payday.type === 'mara') futureDeposits += personalSplits.maraPersonalFromMara;
        }
      }
    }

    // Next payment amount is always the statement balance
    // If statement is $0, we owe $0 right now (new charges appear on next statement)
    const nextPaymentAmount = cardStatement;

    // Disposable income calculation
    const disposableIncome = accountBalance - cushion + futureDeposits - nextPaymentAmount;

    return {
      disposableIncome,
      accountBalance,
      cushion,
      futureDeposits,
      nextPaymentAmount,
      cardStatement,
      cardTotal,
      nextDueDate,
      cardType,
      paydaysBeforeDue: paydays.filter(p => p.date <= nextDueDate)
    };
  };

  // Generate detailed calculation breakdown for disposable income
  const generateDisposableCalculation = (dispData, person) => {
    if (!dispData) return 'No data available';

    const personalSplits = getPersonalSplits();
    let calc = `Current balance: $${dispData.accountBalance.toFixed(2)}\n`;
    calc += `- Required cushion: -$${dispData.cushion.toFixed(2)}\n`;
    calc += `+ Future deposits (until ${dispData.nextDueDate.toLocaleDateString()}): +$${dispData.futureDeposits.toFixed(2)}\n`;
    dispData.paydaysBeforeDue.forEach(pd => {
      const amount = person === 'Mat'
        ? (pd.type === 'mat' ? personalSplits.matPersonalFromMat : personalSplits.matPersonalFromMara)
        : (pd.type === 'mat' ? personalSplits.maraPersonalFromMat : personalSplits.maraPersonalFromMara);
      calc += `  • ${pd.date.toLocaleDateString()} (${pd.type === 'mat' ? 'Mat' : 'Mara'}): +$${amount.toFixed(2)}\n`;
    });
    calc += `- Next payment (statement): -$${dispData.nextPaymentAmount.toFixed(2)}\n`;
    if (dispData.cardStatement > 0) {
      calc += `  Statement balance due on ${dispData.nextDueDate.toLocaleDateString()}\n`;
    } else {
      calc += `  Statement is $0 — no payment due this cycle (Total building: $${dispData.cardTotal.toFixed(2)})\n`;
    }
    calc += `\n= Disposable Income: $${dispData.disposableIncome.toFixed(2)}`;
    return calc;
  };

  // Generate detailed calculation for bill payments
  const generateBillPaymentCalculation = (accountType, startBalance, paymentAmount, dueDate, paymentCalc) => {
    if (!paymentCalc) return 'No calculation available';

    const paydays = getUpcomingPaydays();
    const relevantPaydays = paydays.filter(p => p.date <= dueDate);
    const personalSplits = getPersonalSplits();

    let calc = `Current ${accountType.toUpperCase()} balance: $${startBalance.toFixed(2)}\n`;

    if (relevantPaydays.length > 0) {
      const totalInflow = relevantPaydays.reduce((sum, p) => {
        if (accountType === 'live') {
          return sum + (p.type === 'mat' ? config.splits.matLive : config.splits.maraLive);
        } else if (accountType === 'mat') {
          return sum + (p.type === 'mat' ? personalSplits.matPersonalFromMat : personalSplits.matPersonalFromMara);
        } else if (accountType === 'mara') {
          return sum + (p.type === 'mat' ? personalSplits.maraPersonalFromMat : personalSplits.maraPersonalFromMara);
        }
        return sum;
      }, 0);

      calc += `+ Deposits before ${dueDate.toLocaleDateString()}: +$${totalInflow.toFixed(2)}\n`;

      relevantPaydays.forEach(pd => {
        let amount = 0;
        if (accountType === 'live') {
          amount = pd.type === 'mat' ? config.splits.matLive : config.splits.maraLive;
        } else if (accountType === 'mat') {
          amount = pd.type === 'mat' ? personalSplits.matPersonalFromMat : personalSplits.matPersonalFromMara;
        } else if (accountType === 'mara') {
          amount = pd.type === 'mat' ? personalSplits.maraPersonalFromMat : personalSplits.maraPersonalFromMara;
        }
        calc += `  • ${pd.date.toLocaleDateString()} (${pd.type === 'mat' ? 'Mat' : 'Mara'}): +$${amount.toFixed(2)}\n`;
      });
    }

    calc += `- Payment amount: -$${paymentAmount.toFixed(2)}\n`;

    if (paymentCalc.canPay) {
      calc += `\n✓ Projected balance: $${paymentCalc.projectedBalance.toFixed(2)}\n`;
      calc += `✓ Funds available: ${paymentCalc.dateAvailable.toLocaleDateString()}\n`;
      const daysEarly = Math.ceil((dueDate - paymentCalc.dateAvailable) / (1000 * 60 * 60 * 24));
      if (daysEarly > 0) {
        calc += `✓ Can pay ${daysEarly} day${daysEarly !== 1 ? 's' : ''} early`;
      } else if (daysEarly === 0) {
        calc += `✓ Can pay on due date`;
      } else {
        calc += `⚠ Funds available ${Math.abs(daysEarly)} day${Math.abs(daysEarly) !== 1 ? 's' : ''} after due date`;
      }
    } else {
      calc += `\n✗ Projected balance: $${paymentCalc.projectedBalance.toFixed(2)}\n`;
      calc += `✗ Shortfall: $${paymentCalc.shortfall.toFixed(2)}\n`;
      calc += `✗ Will not have enough by ${dueDate.toLocaleDateString()}`;
    }

    return calc;
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
        if (payday.type === 'mat') projectedLive += config.splits.matLive;
        if (payday.type === 'mara') projectedLive += config.splits.maraLive;
      }
    }

    // Subtract rent if due this month
    const rentBill = bills.find(b => b.type === 'rent' && b.date <= endOfMonth);
    if (rentBill) {
      projectedLive -= config.monthlyBills.rent;
    }

    // Subtract Blue Amex TOTAL balance (must be paid off before kickback)
    const blueTotalBalance = latestSnapshot.blue_total || 0;
    projectedLive -= blueTotalBalance;

    // Subtract projected remaining monthly expenses
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const monthProgress = dayOfMonth / daysInMonth;

    // Calculate how much of monthly budget should be spent so far
    const monthlyVariableExpenses = config.monthlyBills.groceries + config.monthlyBills.gas + config.monthlyBills.dateNights + config.monthlyBills.power + config.monthlyBills.gym + config.monthlyBills.insurance;
    const projectedRemainingExpenses = monthlyVariableExpenses * (1 - monthProgress);

    projectedLive -= projectedRemainingExpenses;

    // Kickback is anything above the safety buffer
    const potentialKickback = Math.max(0, projectedLive - config.cushion);
    const kickbackEach = potentialKickback / 2;

    return {
      projectedLive,
      potentialKickback,
      kickbackEach,
      details: {
        startingBalance: latestSnapshot.live,
        projectedInflows: paydays.filter(p => p.date <= endOfMonth).reduce((sum, p) =>
          sum + (p.type === 'mat' ? config.splits.matLive : config.splits.maraLive), 0),
        rent: rentBill ? config.monthlyBills.rent : 0,
        blueAmex: blueTotalBalance,
        projectedRemainingExpenses,
        safetyBuffer: config.cushion,
        daysRemaining,
        monthProgress: (monthProgress * 100).toFixed(1),
      }
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
        billsMax: 70,
        personalScore: 0,
        personalMax: 10,
        kickbackScore: 0,
        kickbackMax: 10,
        promptPaymentsScore: 0,
        promptPaymentsMax: 10,
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
      billsMax: 70,
      personalScore: 0,
      personalMax: 10,
      kickbackScore: 0,
      kickbackMax: 10,
      promptPaymentsScore: 0,
      promptPaymentsMax: 10,
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
          calculation: generateBillPaymentCalculation('mara', latestSnapshot.mara, latestSnapshot.discover_statement, nextDiscover.date, discoverCheck),
          daysEarly
        });
      } else {
        alerts.push({
          severity: 'critical',
          message: `Mara won't have enough for Discover by ${nextDiscover.date.toLocaleDateString()}. Short $${discoverCheck.shortfall.toFixed(2)}.`,
          details: discoverCheck.details,
          calculation: generateBillPaymentCalculation('mara', latestSnapshot.mara, latestSnapshot.discover_statement, nextDiscover.date, discoverCheck)
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
          calculation: generateBillPaymentCalculation('mat', latestSnapshot.mat, latestSnapshot.gold_statement, nextGold.date, goldCheck),
          daysEarly
        });
      } else {
        alerts.push({
          severity: 'critical',
          message: `Mat won't have enough for Gold Amex by ${nextGold.date.toLocaleDateString()}. Short $${goldCheck.shortfall.toFixed(2)}.`,
          details: goldCheck.details,
          calculation: generateBillPaymentCalculation('mat', latestSnapshot.mat, latestSnapshot.gold_statement, nextGold.date, goldCheck)
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
          calculation: generateBillPaymentCalculation('live', latestSnapshot.live, latestSnapshot.blue_statement, nextBlue.date, blueCheck),
          daysEarly
        });
      } else {
        alerts.push({
          severity: 'critical',
          message: `LIVE won't have enough for Blue Amex by ${nextBlue.date.toLocaleDateString()}. Short $${blueCheck.shortfall.toFixed(2)}.`,
          details: blueCheck.details,
          calculation: generateBillPaymentCalculation('live', latestSnapshot.live, latestSnapshot.blue_statement, nextBlue.date, blueCheck)
        });
      }
    }

    // Check Rent (LIVE)
    const nextRent = bills.find(b => b.type === 'rent');
    if (nextRent) {
      const rentCheck = calculatePaymentDate('live', latestSnapshot.live, config.monthlyBills.rent, nextRent.date);
      billChecks.push({
        name: 'Rent',
        account: 'LIVE',
        dueDate: nextRent.date,
        statement: config.monthlyBills.rent,
        ...rentCheck
      });

      if (rentCheck.canPay) {
        const daysEarly = Math.ceil((nextRent.date - rentCheck.dateAvailable) / (1000 * 60 * 60 * 24));
        positives.push({
          message: `LIVE is on pace to cover Rent ($${config.monthlyBills.rent.toFixed(2)})`,
          details: rentCheck.details,
          calculation: generateBillPaymentCalculation('live', latestSnapshot.live, config.monthlyBills.rent, nextRent.date, rentCheck),
          daysEarly
        });
      } else {
        alerts.push({
          severity: 'critical',
          message: `LIVE won't have enough for Rent by ${nextRent.date.toLocaleDateString()}. Short $${rentCheck.shortfall.toFixed(2)}.`,
          details: rentCheck.details,
          calculation: generateBillPaymentCalculation('live', latestSnapshot.live, config.monthlyBills.rent, nextRent.date, rentCheck)
        });
      }
    }

    // SCORING: 70 points for bills
    const billsCovered = billChecks.filter(b => b.canPay).length;
    const totalBills = billChecks.length;
    scoreBreakdown.billsScore = totalBills > 0 ? (billsCovered / totalBills) * 70 : 70;
    scoreBreakdown.details.bills = `${billsCovered} of ${totalBills} upcoming bills can be paid on time`;

    // SCORING: 10 points for personal account health (based on disposable income)
    let personalPoints = 0;
    const matDisposable = calculateDisposableIncome('mat');
    const maraDisposable = calculateDisposableIncome('mara');

    // Mat's disposable income scoring (max 5 points)
    if (matDisposable && matDisposable.disposableIncome > 0) {
      if (matDisposable.disposableIncome >= 200) personalPoints += 5;
      else if (matDisposable.disposableIncome >= 100) personalPoints += 4;
      else if (matDisposable.disposableIncome >= 50) personalPoints += 2.5;
      else personalPoints += 1.5;
    } else if (matDisposable && matDisposable.disposableIncome < 0) {
      personalPoints += 0;
      alerts.push({
        severity: 'critical',
        message: `Mat has negative disposable income ($${matDisposable.disposableIncome.toFixed(2)})`,
        details: `Current balance: $${matDisposable.accountBalance.toFixed(2)}, Next payment: $${matDisposable.nextPaymentAmount.toFixed(2)}, Cushion: $${matDisposable.cushion}`,
        calculation: generateDisposableCalculation(matDisposable, 'Mat')
      });
    }

    // Mara's disposable income scoring (max 5 points)
    if (maraDisposable && maraDisposable.disposableIncome > 0) {
      if (maraDisposable.disposableIncome >= 200) personalPoints += 5;
      else if (maraDisposable.disposableIncome >= 100) personalPoints += 4;
      else if (maraDisposable.disposableIncome >= 50) personalPoints += 2.5;
      else personalPoints += 1.5;
    } else if (maraDisposable && maraDisposable.disposableIncome < 0) {
      personalPoints += 0;
      alerts.push({
        severity: 'critical',
        message: `Mara has negative disposable income ($${maraDisposable.disposableIncome.toFixed(2)})`,
        details: `Current balance: $${maraDisposable.accountBalance.toFixed(2)}, Next payment: $${maraDisposable.nextPaymentAmount.toFixed(2)}, Cushion: $${maraDisposable.cushion}`,
        calculation: generateDisposableCalculation(maraDisposable, 'Mara')
      });
    }

    scoreBreakdown.personalScore = personalPoints;
    scoreBreakdown.details.personal = `Mat disposable: $${matDisposable ? matDisposable.disposableIncome.toFixed(2) : 'N/A'}, Mara disposable: $${maraDisposable ? maraDisposable.disposableIncome.toFixed(2) : 'N/A'}`;

    // SCORING: 10 points for Kickback Indicator
    const kickbackProjection = calculateProjectedKickback();
    if (kickbackProjection) {
      const kickbackAmount = kickbackProjection.potentialKickback;
      if (kickbackAmount >= 200) scoreBreakdown.kickbackScore = 10;
      else if (kickbackAmount >= 100) scoreBreakdown.kickbackScore = 7;
      else if (kickbackAmount > 0) scoreBreakdown.kickbackScore = 3;
      else scoreBreakdown.kickbackScore = 0;

      scoreBreakdown.details.kickback = `Projected kickback: $${kickbackAmount.toFixed(2)} (Target: $200+)`;
    } else {
      scoreBreakdown.kickbackScore = 0;
      scoreBreakdown.details.kickback = 'Unable to calculate kickback projection';
    }

    // SCORING: 10 points for Credit Card Payoff Ability
    // Check if we can pay off total balance by due date while keeping cushion
    const cardPayoffInfo = [];

    // Check Discover
    if (nextDiscover) {
      const maraBalance = latestSnapshot.mara || 0;
      const discoverTotal = latestSnapshot.discover_total || 0;
      const canPayOff = (maraBalance - discoverTotal) >= config.cushion;
      cardPayoffInfo.push({ card: 'Discover (Mara)', canPayOff, balance: maraBalance, cardTotal: discoverTotal, owner: 'Mara' });
    }

    // Check Gold
    if (nextGold) {
      const matBalance = latestSnapshot.mat || 0;
      const goldTotal = latestSnapshot.gold_total || 0;
      const canPayOff = (matBalance - goldTotal) >= config.cushion;
      cardPayoffInfo.push({ card: 'Gold (Mat)', canPayOff, balance: matBalance, cardTotal: goldTotal, owner: 'Mat' });
    }

    // Check Blue - uses LIVE account
    if (nextBlue) {
      const liveBalance = latestSnapshot.live || 0;
      const blueTotal = latestSnapshot.blue_total || 0;
      const canPayOff = (liveBalance - blueTotal) >= config.cushion;
      cardPayoffInfo.push({ card: 'Blue (LIVE)', canPayOff, balance: liveBalance, cardTotal: blueTotal, owner: 'LIVE' });
    }

    const payableCount = cardPayoffInfo.filter(info => info.canPayOff).length;

    let promptScore = 0;
    if (payableCount === 3) {
      promptScore = 10;
    } else if (payableCount === 2) {
      promptScore = 6;
    } else if (payableCount === 1) {
      promptScore = 3;
    } else {
      promptScore = 0;
    }

    scoreBreakdown.promptPaymentsScore = promptScore;
    scoreBreakdown.details.promptPayments = payableCount > 0
      ? `${payableCount} of 3 cards can be paid off in full while keeping $${config.cushion} cushion`
      : `No cards can be paid off in full while keeping $${config.cushion} cushion`;

    const totalScore = Math.round(
      scoreBreakdown.billsScore +
      scoreBreakdown.personalScore +
      scoreBreakdown.kickbackScore +
      scoreBreakdown.promptPaymentsScore
    );

    return { score: totalScore, alerts, positives, scoreBreakdown };
  };

  // Generate top 3 actionable suggestions to improve health score
  const generateScoreSuggestions = () => {
    if (!latestSnapshot) return [];

    const healthData = calculateHealth();
    const suggestions = [];
    const bills = getUpcomingBills();

    // Get next credit card bills and check payoff ability
    const nextDiscover = bills.find(b => b.type === 'discover');
    const nextGold = bills.find(b => b.type === 'gold');
    const nextBlue = bills.find(b => b.type === 'blue');

    // Suggestion for Credit Card Payoffs (max 10 points)
    const promptGap = healthData.scoreBreakdown.promptPaymentsMax - healthData.scoreBreakdown.promptPaymentsScore;
    if (promptGap > 0) {
      let actionItems = [];

      // Check Discover (Mara)
      if (nextDiscover) {
        const maraBalance = latestSnapshot.mara || 0;
        const discoverTotal = latestSnapshot.discover_total || 0;
        const afterPayment = maraBalance - discoverTotal;
        const dueDate = nextDiscover.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (afterPayment >= config.cushion) {
          actionItems.push(`Mara: Pay off Discover ($${discoverTotal.toFixed(2)}) by ${dueDate} - you'll have $${afterPayment.toFixed(2)} left`);
        } else if (discoverTotal > 0) {
          const shortfall = config.cushion - afterPayment;
          actionItems.push(`Mara: Need $${shortfall.toFixed(2)} more to pay off Discover ($${discoverTotal.toFixed(2)}) and keep cushion`);
        }
      }

      // Check Gold (Mat)
      if (nextGold) {
        const matBalance = latestSnapshot.mat || 0;
        const goldTotal = latestSnapshot.gold_total || 0;
        const afterPayment = matBalance - goldTotal;
        const dueDate = nextGold.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (afterPayment >= config.cushion) {
          actionItems.push(`Mat: Pay off Gold ($${goldTotal.toFixed(2)}) by ${dueDate} - you'll have $${afterPayment.toFixed(2)} left`);
        } else if (goldTotal > 0) {
          const shortfall = config.cushion - afterPayment;
          actionItems.push(`Mat: Need $${shortfall.toFixed(2)} more to pay off Gold ($${goldTotal.toFixed(2)}) and keep cushion`);
        }
      }

      // Check Blue (LIVE)
      if (nextBlue) {
        const liveBalance = latestSnapshot.live || 0;
        const blueTotal = latestSnapshot.blue_total || 0;
        const afterPayment = liveBalance - blueTotal;
        const dueDate = nextBlue.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (afterPayment >= config.cushion) {
          actionItems.push(`LIVE: Pay off Blue Amex ($${blueTotal.toFixed(2)}) by ${dueDate} - you'll have $${afterPayment.toFixed(2)} left`);
        } else if (blueTotal > 0) {
          const shortfall = config.cushion - afterPayment;
          actionItems.push(`LIVE: Need $${shortfall.toFixed(2)} more to pay off Blue Amex ($${blueTotal.toFixed(2)}) and keep cushion`);
        }
      }

      if (actionItems.length > 0) {
        suggestions.push({
          category: 'Credit Card Payoffs',
          currentPoints: healthData.scoreBreakdown.promptPaymentsScore.toFixed(1),
          maxPoints: healthData.scoreBreakdown.promptPaymentsMax,
          potentialGain: promptGap.toFixed(1),
          suggestion: actionItems[0], // Show the first action item as the main suggestion
          details: actionItems.join(' • ')
        });
      }
    }

    // Suggestion for Bills on time (max 60 points)
    const billsGap = healthData.scoreBreakdown.billsMax - healthData.scoreBreakdown.billsScore;
    if (billsGap > 0) {
      let actionSuggestion = 'Ensure all upcoming bills can be paid on time';

      // Check if we can pay the upcoming bills
      if (nextDiscover) {
        const discoverCheck = calculatePaymentDate('mara', latestSnapshot.mara, latestSnapshot.discover_statement, nextDiscover.date);
        if (!discoverCheck.canPay) {
          actionSuggestion = `Mara needs $${discoverCheck.shortfall.toFixed(2)} more to pay Discover by ${nextDiscover.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
      }

      if (nextGold) {
        const goldCheck = calculatePaymentDate('mat', latestSnapshot.mat, latestSnapshot.gold_statement, nextGold.date);
        if (!goldCheck.canPay) {
          actionSuggestion = `Mat needs $${goldCheck.shortfall.toFixed(2)} more to pay Gold by ${nextGold.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
      }

      if (nextBlue) {
        const blueCheck = calculatePaymentDate('live', latestSnapshot.live, latestSnapshot.blue_statement, nextBlue.date);
        if (!blueCheck.canPay) {
          actionSuggestion = `Need $${blueCheck.shortfall.toFixed(2)} more in LIVE to pay Blue Amex by ${nextBlue.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
      }

      suggestions.push({
        category: 'Bills on Time',
        currentPoints: healthData.scoreBreakdown.billsScore.toFixed(1),
        maxPoints: healthData.scoreBreakdown.billsMax,
        potentialGain: billsGap.toFixed(1),
        suggestion: actionSuggestion,
        details: healthData.scoreBreakdown.details.bills
      });
    }

    // Suggestion for Personal Account Health (max 15 points)
    const personalGap = healthData.scoreBreakdown.personalMax - healthData.scoreBreakdown.personalScore;
    if (personalGap > 0) {
      suggestions.push({
        category: 'Disposable Income',
        currentPoints: healthData.scoreBreakdown.personalScore.toFixed(1),
        maxPoints: healthData.scoreBreakdown.personalMax,
        potentialGain: personalGap.toFixed(1),
        suggestion: 'Increase disposable income to $200+ for both Mat and Mara',
        details: healthData.scoreBreakdown.details.personal
      });
    }

    // Suggestion for Kickback Indicator (max 15 points)
    const kickbackGap = healthData.scoreBreakdown.kickbackMax - healthData.scoreBreakdown.kickbackScore;
    if (kickbackGap > 0) {
      const kickbackProjection = calculateProjectedKickback();
      let actionSuggestion = 'Reduce expenses to increase end-of-month kickback';

      if (kickbackProjection && kickbackProjection.potentialKickback < 200) {
        const needed = 200 - kickbackProjection.potentialKickback;
        actionSuggestion = `Reduce expenses by $${needed.toFixed(2)} to reach $200 kickback target`;
      }

      suggestions.push({
        category: 'Kickback Indicator',
        currentPoints: healthData.scoreBreakdown.kickbackScore.toFixed(1),
        maxPoints: healthData.scoreBreakdown.kickbackMax,
        potentialGain: kickbackGap.toFixed(1),
        suggestion: actionSuggestion,
        details: healthData.scoreBreakdown.details.kickback
      });
    }

    // Sort by potential gain (highest first) and return top 3
    return suggestions.sort((a, b) => parseFloat(b.potentialGain) - parseFloat(a.potentialGain)).slice(0, 3);
  };

  const { score, alerts, positives, scoreBreakdown } = useMemo(() => {
    return calculateHealth();
  }, [latestSnapshot, snapshots]);

  const scoreSuggestions = useMemo(() => {
    return generateScoreSuggestions();
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
        {['dashboard', 'update', 'reports', 'settings'].map(view => (
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
          {/* Plaid Sync Button */}
          {connectedAccounts.length > 0 && (
            <div style={styles.syncButtonContainer}>
              <button
                onClick={syncBalances}
                disabled={syncing}
                style={{
                  ...styles.syncButton,
                  opacity: syncing ? 0.7 : 1
                }}
              >
                {syncing ? '⏳ Syncing...' : '🔄 Sync Bank Accounts'}
              </button>
            </div>
          )}

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
                  stroke={hoveredSuggestion !== null && scoreSuggestions[hoveredSuggestion] ? getScoreColor(Number(score) + Number(scoreSuggestions[hoveredSuggestion].potentialGain)) : getScoreColor(score)}
                  strokeWidth="8"
                  strokeDasharray={hoveredSuggestion !== null && scoreSuggestions[hoveredSuggestion] ? `${(Number(score) + Number(scoreSuggestions[hoveredSuggestion].potentialGain)) * 2.83} 283` : `${score * 2.83} 283`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                  style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }}
                />
              </svg>
              <div style={styles.scoreText}>
                <span style={{
                  ...styles.scoreNumber,
                  color: hoveredSuggestion !== null && scoreSuggestions[hoveredSuggestion] ? getScoreColor(Number(score) + Number(scoreSuggestions[hoveredSuggestion].potentialGain)) : getScoreColor(score),
                  transition: 'color 0.5s ease'
                }}>
                  {hoveredSuggestion !== null && scoreSuggestions[hoveredSuggestion] ? Number(score) + Number(scoreSuggestions[hoveredSuggestion].potentialGain) : score}
                </span>
                <span style={{ ...styles.scoreLabel, transition: 'all 0.5s ease' }}>
                  {hoveredSuggestion !== null && scoreSuggestions[hoveredSuggestion] ? getScoreLabel(Number(score) + Number(scoreSuggestions[hoveredSuggestion].potentialGain)) : getScoreLabel(score)}
                </span>
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
                  <span>Total Balance Payoff Ability:</span>
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

          {/* Score Improvement Suggestions */}
          {scoreSuggestions.length > 0 && score < 100 && (
            <section style={styles.suggestionsSection}>
              <div
                style={styles.collapsibleHeader}
                onClick={() => setCollapsedSections(prev => ({ ...prev, suggestions: !prev.suggestions }))}
              >
                <h2 style={styles.sectionTitle}>💡 Ways to Improve Your Score</h2>
                <span style={styles.collapseIcon}>{collapsedSections.suggestions ? '▼' : '▲'}</span>
              </div>
              {!collapsedSections.suggestions && (
                <div style={styles.suggestionsGrid}>
                  {scoreSuggestions.map((suggestion, i) => {
                    const isHovered = hoveredSuggestion === i;
                    return (
                    <div
                      key={i}
                      style={{
                        ...styles.suggestionCard,
                        transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                        boxShadow: isHovered ? '0 4px 6px -1px rgba(59, 130, 246, 0.3), 0 2px 4px -1px rgba(59, 130, 246, 0.2)' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={() => setHoveredSuggestion(i)}
                      onMouseLeave={() => setHoveredSuggestion(null)}
                    >
                      <div style={styles.suggestionHeader}>
                        <span style={styles.suggestionCategory}>{suggestion.category}</span>
                        <span style={styles.suggestionGain}>+{suggestion.potentialGain} pts</span>
                      </div>
                      <p style={styles.suggestionText}>{suggestion.suggestion}</p>
                    <div style={styles.suggestionProgress}>
                      <span style={styles.suggestionCurrent}>{suggestion.currentPoints} / {suggestion.maxPoints}</span>
                    </div>
                    <button
                      onClick={() => setExpandedDetails(prev => ({ ...prev, [`suggestion-${i}`]: !prev[`suggestion-${i}`] }))}
                      style={styles.detailsButtonSmall}
                    >
                      {expandedDetails[`suggestion-${i}`] ? 'Hide' : 'Show'} Current Status
                    </button>
                    {expandedDetails[`suggestion-${i}`] && (
                      <div style={styles.suggestionDetails}>{suggestion.details}</div>
                    )}
                  </div>
                  );
                })}
                </div>
              )}
            </section>
          )}

          {/* Alerts */}
          {alerts.length > 0 && (
            <section style={styles.alertsSection}>
              <div
                style={styles.collapsibleHeader}
                onClick={() => setCollapsedSections(prev => ({ ...prev, alerts: !prev.alerts }))}
              >
                <h2 style={{ ...styles.sectionTitle, color: '#ef4444' }}>⚠️ Attention Needed</h2>
                <span style={styles.collapseIcon}>{collapsedSections.alerts ? '▼' : '▲'}</span>
              </div>
              {!collapsedSections.alerts && alerts.map((alert, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.alert,
                    backgroundColor: '#1e1414',
                    borderLeftColor: '#ef4444',
                    borderLeftWidth: '4px'
                  }}
                >
                  <div style={styles.alertContent}>
                    <span style={{ ...styles.alertMessage, color: '#fca5a5' }}>{alert.message}</span>
                    {(alert.details || alert.calculation) && (
                      <button
                        onClick={() => setExpandedDetails(prev => ({ ...prev, [`alert-${i}`]: !prev[`alert-${i}`] }))}
                        style={styles.detailsButtonSmall}
                      >
                        {expandedDetails[`alert-${i}`] ? 'Hide' : 'Show'} Calculation
                      </button>
                    )}
                  </div>
                  {expandedDetails[`alert-${i}`] && alert.calculation && (
                    <div style={styles.calculationBox}>
                      {alert.calculation.split('\n').map((line, idx) => {
                        if (!line.trim()) return null;
                        const isIndented = line.startsWith('  ');
                        const isSuccess = line.includes('✓');
                        const isError = line.includes('✗');
                        const isWarning = line.includes('⚠');
                        let label = line.trim();
                        let value = '';
                        const priceMatch = line.match(/^(.+?)(\+?\$[\d,]+\.\d{2}|-\$[\d,]+\.\d{2})$/);
                        if (priceMatch) {
                          label = priceMatch[1].trim();
                          value = priceMatch[2];
                        } else if (line.includes(':') && !isSuccess && !isError && !isWarning) {
                          const colonIdx = line.lastIndexOf(':');
                          label = line.substring(0, colonIdx + 1).trim();
                          value = line.substring(colonIdx + 1).trim();
                        }
                        return (
                          <div key={idx} style={{ ...styles.calculationRow, paddingLeft: isIndented ? '1.5rem' : '0', color: isSuccess ? '#6ee7b7' : isError ? '#fca5a5' : isWarning ? '#fcd34d' : isIndented ? '#94a3b8' : '#e2e8f0', fontStyle: isIndented ? 'italic' : 'normal' }}>
                            <span>{label}</span>
                            <span style={{ fontWeight: value && !isIndented ? '600' : '400' }}>{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Positives */}
          {positives.length > 0 && (
            <section style={styles.positivesSection}>
              <div
                style={styles.collapsibleHeader}
                onClick={() => setCollapsedSections(prev => ({ ...prev, positives: !prev.positives }))}
              >
                <h2 style={{ ...styles.sectionTitle, color: '#10b981' }}>✓ Looking Good</h2>
                <span style={styles.collapseIcon}>{collapsedSections.positives ? '▼' : '▲'}</span>
              </div>
              {!collapsedSections.positives && positives.map((item, i) => {
                const msg = typeof item === 'string' ? item : item.message;
                const details = typeof item === 'object' ? item.details : null;
                const calculation = typeof item === 'object' ? item.calculation : null;
                return (
                  <div key={i} style={styles.positive}>
                    <div style={styles.positiveContent}>
                      <span style={styles.positiveMessage}>{msg}</span>
                      {(details || calculation) && (
                        <button
                          onClick={() => setExpandedDetails(prev => ({ ...prev, [`positive-${i}`]: !prev[`positive-${i}`] }))}
                          style={styles.detailsButtonSmall}
                        >
                          {expandedDetails[`positive-${i}`] ? 'Hide' : 'Show'} Calculation
                        </button>
                      )}
                    </div>
                    {expandedDetails[`positive-${i}`] && calculation && (
                      <div style={styles.calculationBox}>
                        {calculation.split('\n').map((line, idx) => {
                          if (!line.trim()) return null;
                          const isIndented = line.startsWith('  ');
                          const isSuccess = line.includes('✓');
                          const isError = line.includes('✗');
                          const isWarning = line.includes('⚠');
                          let label = line.trim();
                          let value = '';
                          const priceMatch = line.match(/^(.+?)(\+?\$[\d,]+\.\d{2}|-\$[\d,]+\.\d{2})$/);
                          if (priceMatch) {
                            label = priceMatch[1].trim();
                            value = priceMatch[2];
                          } else if (line.includes(':') && !isSuccess && !isError && !isWarning) {
                            const colonIdx = line.lastIndexOf(':');
                            label = line.substring(0, colonIdx + 1).trim();
                            value = line.substring(colonIdx + 1).trim();
                          }
                          return (
                            <div key={idx} style={{ ...styles.calculationRow, paddingLeft: isIndented ? '1.5rem' : '0', color: isSuccess ? '#6ee7b7' : isError ? '#fca5a5' : isWarning ? '#fcd34d' : isIndented ? '#94a3b8' : '#e2e8f0', fontStyle: isIndented ? 'italic' : 'normal' }}>
                              <span>{label}</span>
                              <span style={{ fontWeight: value && !isIndented ? '600' : '400' }}>{value}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {/* Checking Accounts */}
          {latestSnapshot && (
            <section style={styles.balancesSection}>
              <h2 style={styles.sectionTitle}>Checking Accounts</h2>
              <div style={styles.accountsGrid}>
                {/* Give and Save side-by-side */}
                <div style={styles.sideBySideAccounts}>
                  <div style={styles.accountBalanceCard}>
                    <span style={{ ...styles.balanceLabel, color: '#8b5cf6' }}>Give</span>
                    <span style={styles.balanceValue}>${latestSnapshot.give.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={styles.accountBalanceCard}>
                    <span style={{ ...styles.balanceLabel, color: '#10b981' }}>Save</span>
                    <span style={styles.balanceValue}>${latestSnapshot.save.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Live Account */}
                <div style={styles.accountBalanceCard}>
                  <span style={{ ...styles.balanceLabel, color: '#3b82f6' }}>LIVE</span>
                  <span style={styles.balanceValue}>${latestSnapshot.live.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Mat Account */}
                <div style={styles.accountBalanceCard}>
                  <span style={{ ...styles.balanceLabel, color: '#f59e0b' }}>Mat</span>
                  <span style={styles.balanceValue}>${latestSnapshot.mat.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  {(() => {
                    const matDisp = calculateDisposableIncome('mat');
                    if (!matDisp) return null;
                    return (
                      <>
                        <div style={styles.disposableIncomeSection}>
                          <span style={styles.disposableLabel}>Disposable Income:</span>
                          <span style={{
                            ...styles.disposableValue,
                            color: matDisp.disposableIncome >= 0 ? '#10b981' : '#ef4444'
                          }}>
                            ${matDisp.disposableIncome.toFixed(2)}
                          </span>
                        </div>
                        <button
                          onClick={() => setExpandedDetails(prev => ({ ...prev, matDisposable: !prev.matDisposable }))}
                          style={styles.detailsButtonSmall}
                        >
                          {expandedDetails.matDisposable ? 'Hide' : 'Show'} Calculation
                        </button>
                        {expandedDetails.matDisposable && (
                          <div style={styles.disposableDetailsBox}>
                            <div style={styles.disposableDetailRow}>
                              <span>Current balance:</span>
                              <span>${matDisp.accountBalance.toFixed(2)}</span>
                            </div>
                            <div style={styles.disposableDetailRow}>
                              <span>- Required cushion:</span>
                              <span>-${matDisp.cushion.toFixed(2)}</span>
                            </div>
                            <div style={styles.disposableDetailRow}>
                              <span>+ Future deposits (until {matDisp.nextDueDate.toLocaleDateString()}):</span>
                              <span>+${matDisp.futureDeposits.toFixed(2)}</span>
                            </div>
                            {matDisp.paydaysBeforeDue.map((pd, idx) => {
                              const personalSplits = getPersonalSplits();
                              return (
                                <div key={idx} style={styles.disposableSubDetail}>
                                  {pd.date.toLocaleDateString()} ({pd.type === 'mat' ? 'Mat' : 'Mara'}): +${
                                    pd.type === 'mat' ? personalSplits.matPersonalFromMat.toFixed(2) : personalSplits.matPersonalFromMara.toFixed(2)
                                  }
                                </div>
                              );
                            })}
                            <div style={styles.disposableDetailRow}>
                              <span>- Next payment ({matDisp.cardStatement > 0 ? 'statement' : 'next bill'}):</span>
                              <span>-${matDisp.nextPaymentAmount.toFixed(2)}</span>
                            </div>
                            {matDisp.cardStatement > 0 && (
                              <div style={styles.disposableSubDetail}>
                                Statement balance due on {matDisp.nextDueDate.toLocaleDateString()}
                              </div>
                            )}
                            {matDisp.cardStatement === 0 && (
                              <div style={styles.disposableSubDetail}>
                                Statement paid. Next payment = Total (${matDisp.cardTotal.toFixed(2)}) - Statement (${matDisp.cardStatement.toFixed(2)}) = ${matDisp.nextPaymentAmount.toFixed(2)}
                              </div>
                            )}
                            <div style={styles.disposableDivider} />
                            <div style={styles.disposableDetailRow}>
                              <span style={styles.disposableTotalLabel}>Available to spend today:</span>
                              <span style={{
                                ...styles.disposableTotalValue,
                                color: matDisp.disposableIncome >= 0 ? '#10b981' : '#ef4444'
                              }}>
                                ${matDisp.disposableIncome.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Mara Account */}
                <div style={styles.accountBalanceCard}>
                  <span style={{ ...styles.balanceLabel, color: '#ec4899' }}>Mara</span>
                  <span style={styles.balanceValue}>${latestSnapshot.mara.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  {(() => {
                    const maraDisp = calculateDisposableIncome('mara');
                    if (!maraDisp) return null;
                    return (
                      <>
                        <div style={styles.disposableIncomeSection}>
                          <span style={styles.disposableLabel}>Disposable Income:</span>
                          <span style={{
                            ...styles.disposableValue,
                            color: maraDisp.disposableIncome >= 0 ? '#10b981' : '#ef4444'
                          }}>
                            ${maraDisp.disposableIncome.toFixed(2)}
                          </span>
                        </div>
                        <button
                          onClick={() => setExpandedDetails(prev => ({ ...prev, maraDisposable: !prev.maraDisposable }))}
                          style={styles.detailsButtonSmall}
                        >
                          {expandedDetails.maraDisposable ? 'Hide' : 'Show'} Calculation
                        </button>
                        {expandedDetails.maraDisposable && (
                          <div style={styles.disposableDetailsBox}>
                            <div style={styles.disposableDetailRow}>
                              <span>Current balance:</span>
                              <span>${maraDisp.accountBalance.toFixed(2)}</span>
                            </div>
                            <div style={styles.disposableDetailRow}>
                              <span>- Required cushion:</span>
                              <span>-${maraDisp.cushion.toFixed(2)}</span>
                            </div>
                            <div style={styles.disposableDetailRow}>
                              <span>+ Future deposits (until {maraDisp.nextDueDate.toLocaleDateString()}):</span>
                              <span>+${maraDisp.futureDeposits.toFixed(2)}</span>
                            </div>
                            {maraDisp.paydaysBeforeDue.map((pd, idx) => {
                              const personalSplits = getPersonalSplits();
                              return (
                                <div key={idx} style={styles.disposableSubDetail}>
                                  {pd.date.toLocaleDateString()} ({pd.type === 'mat' ? 'Mat' : 'Mara'}): +${
                                    pd.type === 'mat' ? personalSplits.maraPersonalFromMat.toFixed(2) : personalSplits.maraPersonalFromMara.toFixed(2)
                                  }
                                </div>
                              );
                            })}
                            <div style={styles.disposableDetailRow}>
                              <span>- Next payment ({maraDisp.cardStatement > 0 ? 'statement' : 'next bill'}):</span>
                              <span>-${maraDisp.nextPaymentAmount.toFixed(2)}</span>
                            </div>
                            {maraDisp.cardStatement > 0 && (
                              <div style={styles.disposableSubDetail}>
                                Statement balance due on {maraDisp.nextDueDate.toLocaleDateString()}
                              </div>
                            )}
                            {maraDisp.cardStatement === 0 && (
                              <div style={styles.disposableSubDetail}>
                                Statement paid. Next payment = Total (${maraDisp.cardTotal.toFixed(2)}) - Statement (${maraDisp.cardStatement.toFixed(2)}) = ${maraDisp.nextPaymentAmount.toFixed(2)}
                              </div>
                            )}
                            <div style={styles.disposableDivider} />
                            <div style={styles.disposableDetailRow}>
                              <span style={styles.disposableTotalLabel}>Available to spend today:</span>
                              <span style={{
                                ...styles.disposableTotalValue,
                                color: maraDisp.disposableIncome >= 0 ? '#10b981' : '#ef4444'
                              }}>
                                ${maraDisp.disposableIncome.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </section>
          )}

        {/* Credit Cards */}
        {latestSnapshot && (() => {
          const bills = getUpcomingBills();
          const cards = [
            {
              type: 'discover',
              name: 'Discover',
              account: 'Mara',
              color: '#ec4899',
              statement: latestSnapshot.discover_statement,
              total: latestSnapshot.discover_total,
              dueDate: bills.find(b => b.type === 'discover')?.date,
              dueDay: '2nd'
            },
            {
              type: 'gold',
              name: 'Gold Amex',
              account: 'Mat',
              color: '#f59e0b',
              statement: latestSnapshot.gold_statement,
              total: latestSnapshot.gold_total,
              dueDate: bills.find(b => b.type === 'gold')?.date,
              dueDay: '15th'
            },
            {
              type: 'blue',
              name: 'Blue Amex',
              account: 'LIVE',
              color: '#3b82f6',
              statement: latestSnapshot.blue_statement,
              total: latestSnapshot.blue_total,
              dueDate: bills.find(b => b.type === 'blue')?.date,
              dueDay: '8th'
            },
          ];

          return (
            <section style={styles.balancesSection}>
              <h2 style={styles.sectionTitle}>Credit Cards</h2>
              <div style={styles.accountsGrid}>
                {cards.map(card => {
                  const accountType = card.account.toLowerCase();
                  const startBalance = latestSnapshot[accountType];
                  const statementPaymentCalc = card.statement > 0 ? calculatePaymentDate(accountType, startBalance, card.statement, card.dueDate) : null;
                  const totalPaymentCalc = card.total > 0 ? calculatePaymentDate(accountType, startBalance, card.total, card.dueDate) : null;
                  const paidDate = card.statement === 0 ? findPaymentDate(card.type) : null;
                  const daysEarly = paidDate && card.dueDate ? Math.ceil((card.dueDate - paidDate) / (1000 * 60 * 60 * 24)) : null;

                  // Calculate payment ability percentages
                  const statementAbility = card.statement > 0
                    ? Math.min(100, Math.max(0, (startBalance / card.statement) * 100))
                    : 100;
                  const totalAbility = card.total > 0
                    ? Math.min(100, Math.max(0, ((startBalance - config.cushion) / card.total) * 100))  // Account for cushion
                    : 100;

                  // Check if everything is paid off
                  const fullyPaidOff = card.statement === 0 && card.total === 0;
                  const statementPaidOnly = card.statement === 0 && card.total > 0;

                  return (
                    <div key={card.type} style={{
                      ...styles.creditCardDisplay,
                      ...(fullyPaidOff ? styles.creditCardFullyPaid : {})
                    }}>
                      <div style={styles.creditCardHeader}>
                        <span style={{ ...styles.balanceLabel, color: card.color }}>{card.name}</span>
                        <span style={styles.creditCardDue}>Due: {card.dueDay}</span>
                      </div>

                      {/* Payment Status */}
                      {fullyPaidOff ? (
                        <div style={styles.creditCardCelebration}>
                          <div style={styles.celebrationIcon}>🎉</div>
                          <div style={styles.celebrationText}>PAID OFF!</div>
                          <div style={styles.celebrationSubtext}>Card is at $0.00</div>
                        </div>
                      ) : statementPaidOnly ? (
                        <>
                          <div style={styles.creditCardPaidBadge}>✓ Statement Paid</div>
                          {paidDate && (
                            <div style={styles.creditCardPaymentInfo}>
                              <span style={styles.anticipatedDateGreen}>
                                Paid on {paidDate.toLocaleDateString()}
                              </span>
                              {daysEarly !== null && daysEarly > 0 && (
                                <span style={styles.anticipatedEarlyBadge}>
                                  {daysEarly} day{daysEarly !== 1 ? 's' : ''} early
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {statementPaymentCalc && !statementPaymentCalc.canPay && (
                            <div style={styles.creditCardInsufficientFunds}>
                              ⚠ Insufficient funds by due date
                            </div>
                          )}
                        </>
                      )}

                      {/* Balances */}
                      {!fullyPaidOff && (
                        <div style={styles.creditCardBalances}>
                          <div style={styles.creditCardBalanceRow}>
                            <span style={styles.creditCardBalanceLabel}>Total Balance</span>
                            <span style={styles.creditCardBalanceValue}>${card.total.toFixed(2)}</span>
                          </div>
                          <div style={styles.creditCardBalanceRow}>
                            <span style={styles.creditCardBalanceLabel}>Statement</span>
                            <span style={{
                              ...styles.creditCardBalanceValue,
                              color: card.statement === 0 ? '#10b981' : '#f59e0b'
                            }}>
                              ${card.statement.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Payment Ability Insights */}
                      {!fullyPaidOff && (
                        <div style={styles.paymentAbilitySection}>
                          <div style={styles.abilityTitle}>Payment Ability by Due Date:</div>

                          {/* Statement Payment Ability */}
                          <div style={styles.abilityRow}>
                            <span style={styles.abilityLabel}>Statement:</span>
                            <div style={styles.abilityBarContainer}>
                              <div style={{
                                ...styles.abilityBar,
                                width: `${statementAbility}%`,
                                backgroundColor: statementAbility >= 100 ? '#10b981' : statementAbility >= 75 ? '#f59e0b' : '#ef4444'
                              }} />
                            </div>
                            <span style={{
                              ...styles.abilityPercentage,
                              color: statementAbility >= 100 ? '#10b981' : statementAbility >= 75 ? '#f59e0b' : '#ef4444'
                            }}>
                              {statementAbility.toFixed(0)}%
                            </span>
                          </div>

                          {/* Total Payment Ability */}
                          <div style={styles.abilityRow}>
                            <span style={styles.abilityLabel}>Total:</span>
                            <div style={styles.abilityBarContainer}>
                              <div style={{
                                ...styles.abilityBar,
                                width: `${totalAbility}%`,
                                backgroundColor: totalAbility >= 100 ? '#10b981' : totalAbility >= 75 ? '#f59e0b' : '#ef4444'
                              }} />
                            </div>
                            <span style={{
                              ...styles.abilityPercentage,
                              color: totalAbility >= 100 ? '#10b981' : totalAbility >= 75 ? '#f59e0b' : '#ef4444'
                            }}>
                              {totalAbility.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Show Details Button (only if statement > 0) */}
                      {card.statement > 0 && statementPaymentCalc && (
                        <>
                          <button
                            onClick={() => setExpandedDetails(prev => ({ ...prev, [`card-${card.type}`]: !prev[`card-${card.type}`] }))}
                            style={styles.detailsButtonSmall}
                          >
                            {expandedDetails[`card-${card.type}`] ? 'Hide' : 'Show'} Details
                          </button>
                          {expandedDetails[`card-${card.type}`] && (
                            <div style={styles.anticipatedDetailsBox}>
                              {statementPaymentCalc.details}
                            </div>
                          )}
                        </>
                      )}

                      <div style={styles.creditCardPaidBy}>Paid by {card.account}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

          {/* Kickback Projection */}
          {latestSnapshot && (() => {
            const kickbackProjection = calculateProjectedKickback();
            if (!kickbackProjection) return null;
            return (
              <section style={styles.kickbackProjectionSectionLarge}>
                <h2 style={styles.kickbackMainTitle}>💰 Projected Kickback</h2>
                {kickbackProjection.potentialKickback > 0 ? (
                  <div style={styles.kickbackSection}>
                    <div style={styles.kickbackMainAmount}>
                      ${kickbackProjection.kickbackEach.toFixed(2)}
                    </div>
                    <div style={styles.kickbackPerPersonLabel}>per person</div>
                    <div style={styles.kickbackTotalDisplay}>
                      Total: ${kickbackProjection.potentialKickback.toFixed(2)}
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

          {/* Timeline */}
          <section style={styles.timelineSection}>
            <div
              style={styles.collapsibleHeader}
              onClick={() => setCollapsedSections(prev => ({ ...prev, timeline: !prev.timeline }))}
            >
              <h2 style={styles.sectionTitle}>Upcoming</h2>
              <span style={styles.collapseIcon}>{collapsedSections.timeline ? '▼' : '▲'}</span>
            </div>
            {!collapsedSections.timeline && (
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
            )}
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

      {currentView === 'settings' && (
        <main style={styles.main}>
          <section style={styles.updateSection}>
            <h2 style={styles.sectionTitle}>Settings</h2>
            <p style={styles.updateHint}>Edit your financial configuration</p>

            {message && (
              <div style={styles.message}>
                {message}
              </div>
            )}

            <div style={styles.settingsContainer}>
              {/* Income Section */}
              <div style={styles.settingsSection}>
                <h3 style={styles.settingsSectionTitle}>💰 Income</h3>
                <div style={styles.settingsGrid}>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Mat Pay Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.matPayAmount}
                      onChange={(e) => setTempConfig({ ...tempConfig, matPayAmount: parseFloat(e.target.value) || 0 })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Mara Pay Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.maraPayAmount}
                      onChange={(e) => setTempConfig({ ...tempConfig, maraPayAmount: parseFloat(e.target.value) || 0 })}
                      style={styles.settingsInput}
                    />
                  </div>
                </div>
              </div>

              {/* Budget Splits Section */}
              <div style={styles.settingsSection}>
                <h3 style={styles.settingsSectionTitle}>📊 Budget Splits</h3>
                <div style={styles.settingsGrid}>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Give % (decimal)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.splits.give}
                      onChange={(e) => setTempConfig({ ...tempConfig, splits: { ...tempConfig.splits, give: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Save % (decimal)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.splits.save}
                      onChange={(e) => setTempConfig({ ...tempConfig, splits: { ...tempConfig.splits, save: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Mat LIVE Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.splits.matLive}
                      onChange={(e) => setTempConfig({ ...tempConfig, splits: { ...tempConfig.splits, matLive: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Mara LIVE Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.splits.maraLive}
                      onChange={(e) => setTempConfig({ ...tempConfig, splits: { ...tempConfig.splits, maraLive: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                </div>
              </div>

              {/* Safety Buffer Section */}
              <div style={styles.settingsSection}>
                <h3 style={styles.settingsSectionTitle}>🛡️ Safety Buffer</h3>
                <div style={styles.settingsGrid}>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Cushion Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.cushion}
                      onChange={(e) => setTempConfig({ ...tempConfig, cushion: parseFloat(e.target.value) || 0 })}
                      style={styles.settingsInput}
                    />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                      Minimum balance to keep in accounts after paying bills
                    </span>
                  </div>
                </div>
              </div>

              {/* Credit Card Due Dates Section */}
              <div style={styles.settingsSection}>
                <h3 style={styles.settingsSectionTitle}>💳 Credit Card Due Dates</h3>
                <div style={styles.settingsGrid}>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Blue Amex (day of month)</label>
                    <input
                      type="number"
                      value={tempConfig.dueDates.blue}
                      onChange={(e) => setTempConfig({ ...tempConfig, dueDates: { ...tempConfig.dueDates, blue: parseInt(e.target.value) || 1 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Gold Amex (day of month)</label>
                    <input
                      type="number"
                      value={tempConfig.dueDates.gold}
                      onChange={(e) => setTempConfig({ ...tempConfig, dueDates: { ...tempConfig.dueDates, gold: parseInt(e.target.value) || 1 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Discover (day of month)</label>
                    <input
                      type="number"
                      value={tempConfig.dueDates.discover}
                      onChange={(e) => setTempConfig({ ...tempConfig, dueDates: { ...tempConfig.dueDates, discover: parseInt(e.target.value) || 1 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Rent Due Date</label>
                    <input
                      type="text"
                      value={tempConfig.dueDates.rent}
                      onChange={(e) => setTempConfig({ ...tempConfig, dueDates: { ...tempConfig.dueDates, rent: e.target.value } })}
                      style={styles.settingsInput}
                      placeholder="last"
                    />
                  </div>
                </div>
              </div>

              {/* Monthly Bills Section */}
              <div style={styles.settingsSection}>
                <h3 style={styles.settingsSectionTitle}>🏠 Monthly Bills</h3>
                <div style={styles.settingsGrid}>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Rent</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.monthlyBills.rent}
                      onChange={(e) => setTempConfig({ ...tempConfig, monthlyBills: { ...tempConfig.monthlyBills, rent: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Insurance</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.monthlyBills.insurance}
                      onChange={(e) => setTempConfig({ ...tempConfig, monthlyBills: { ...tempConfig.monthlyBills, insurance: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Gym</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.monthlyBills.gym}
                      onChange={(e) => setTempConfig({ ...tempConfig, monthlyBills: { ...tempConfig.monthlyBills, gym: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Date Nights</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.monthlyBills.dateNights}
                      onChange={(e) => setTempConfig({ ...tempConfig, monthlyBills: { ...tempConfig.monthlyBills, dateNights: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Power</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.monthlyBills.power}
                      onChange={(e) => setTempConfig({ ...tempConfig, monthlyBills: { ...tempConfig.monthlyBills, power: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Groceries</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.monthlyBills.groceries}
                      onChange={(e) => setTempConfig({ ...tempConfig, monthlyBills: { ...tempConfig.monthlyBills, groceries: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsInputGroup}>
                    <label style={styles.settingsLabel}>Gas</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempConfig.monthlyBills.gas}
                      onChange={(e) => setTempConfig({ ...tempConfig, monthlyBills: { ...tempConfig.monthlyBills, gas: parseFloat(e.target.value) || 0 } })}
                      style={styles.settingsInput}
                    />
                  </div>
                </div>
              </div>

              {/* Plaid Bank Connection Section */}
              <div style={styles.settingsSection}>
                <h3 style={styles.settingsSectionTitle}>🏦 Bank Account Integration</h3>
                <p style={styles.updateHint}>Connect your bank accounts to automatically sync balances</p>

                <div style={{ marginTop: '1rem' }}>
                  <PlaidLink onSuccess={handlePlaidSuccess} />

                  {connectedAccounts.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <h4 style={{ ...styles.settingsLabel, marginBottom: '0.5rem' }}>Connected Institutions:</h4>
                      {connectedAccounts.map((account) => (
                        <div key={account.id} style={styles.connectedAccountItem}>
                          <span>🏦 {account.institution_name || 'Bank Account'}</span>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Connected {new Date(account.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Account Mapping UI */}
                  {connectedAccounts.length > 0 && (
                    <AccountMappingUI
                      onMappingSaved={() => {
                        setMessage('✅ Account mappings saved! Click "Sync Bank Accounts" on the Dashboard to update balances.');
                        setTimeout(() => setMessage(''), 5000);
                      }}
                    />
                  )}

                  <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#1e293b', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
                    <strong>💡 How it works:</strong>
                    <ul style={{ marginTop: '0.5rem', marginLeft: '1.25rem', color: '#94a3b8' }}>
                      <li>Click "Connect Bank Account" to link your banks via Plaid</li>
                      <li>Use the Account Mapping section above to assign each account to a budget bucket</li>
                      <li>Use the "Sync Bank Accounts" button on the Dashboard to update balances</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={styles.settingsActions}>
                <button
                  onClick={() => {
                    saveConfig(tempConfig);
                    setTimeout(() => setMessage(''), 3000);
                  }}
                  style={styles.settingsSaveButton}
                >
                  Save Settings
                </button>
                <button
                  onClick={() => {
                    setTempConfig(DEFAULT_CONFIG);
                    saveConfig(DEFAULT_CONFIG);
                    setTimeout(() => setMessage(''), 3000);
                  }}
                  style={styles.resetButton}
                >
                  Reset to Defaults
                </button>
              </div>
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
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#334155',
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
  collapsibleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    marginBottom: '1rem',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: '#1e293b',
    },
  },
  collapseIcon: {
    fontSize: '0.75rem',
    color: '#64748b',
    transition: 'transform 0.2s',
  },
  suggestionsSection: {
    marginBottom: '1.5rem',
  },
  suggestionsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  suggestionCard: {
    padding: '1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    borderLeft: '3px solid #3b82f6',
  },
  suggestionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  suggestionCategory: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#f1f5f9',
  },
  suggestionGain: {
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#3b82f6',
    backgroundColor: '#1e3a8a',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
  },
  suggestionText: {
    fontSize: '0.875rem',
    color: '#cbd5e1',
    marginBottom: '0.75rem',
    lineHeight: '1.4',
  },
  suggestionProgress: {
    marginBottom: '0.5rem',
  },
  suggestionCurrent: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  suggestionDetails: {
    marginTop: '0.5rem',
    paddingTop: '0.5rem',
    borderTop: '1px solid #334155',
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  scorePreview: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
    marginBottom: '0.75rem',
    gap: '0.5rem',
    border: '1px solid #3b82f6',
  },
  scorePreviewRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  scorePreviewCurrent: {
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  scorePreviewNew: {
    fontSize: '0.875rem',
    fontWeight: '700',
  },
  scorePreviewArrow: {
    fontSize: '1.25rem',
    color: '#3b82f6',
    fontWeight: '700',
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
    borderTop: '1px solid #450a0a',
    fontSize: '0.75rem',
    color: '#fca5a5',
    fontStyle: 'italic',
  },
  calculationPre: {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '0.8125rem',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    margin: 0,
    padding: '0.75rem',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: '0.375rem',
    fontStyle: 'italic',
  },
  calculationBox: {
    marginTop: '0.75rem',
    padding: '0.75rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
    fontSize: '0.8125rem',
  },
  calculationRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.375rem',
    lineHeight: '1.5',
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
  disposableIncomeSection: {
    marginTop: '0.75rem',
    padding: '0.5rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  disposableLabel: {
    fontSize: '0.625rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  disposableValue: {
    fontSize: '0.875rem',
    fontWeight: '700',
  },
  disposableDetailsBox: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
  },
  disposableDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    color: '#cbd5e1',
  },
  disposableSubDetail: {
    fontSize: '0.625rem',
    color: '#64748b',
    marginLeft: '1rem',
    marginBottom: '0.5rem',
    fontStyle: 'italic',
  },
  disposableDivider: {
    height: '1px',
    backgroundColor: '#334155',
    margin: '0.75rem 0',
  },
  disposableTotalLabel: {
    fontWeight: '600',
    color: '#f1f5f9',
  },
  disposableTotalValue: {
    fontWeight: '700',
    fontSize: '0.875rem',
  },
  sideBySideAccounts: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  },
  creditCardDisplay: {
    padding: '1rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  creditCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditCardDue: {
    fontSize: '0.625rem',
    color: '#64748b',
  },
  creditCardBalances: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  creditCardBalanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
  },
  creditCardBalanceLabel: {
    fontSize: '0.625rem',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  creditCardBalanceValue: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#f1f5f9',
  },
  creditCardPaidBadge: {
    fontSize: '0.625rem',
    color: '#10b981',
    backgroundColor: '#022c22',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    textAlign: 'center',
  },
  creditCardPaidBy: {
    fontSize: '0.625rem',
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  creditCardInsufficientFunds: {
    fontSize: '0.75rem',
    color: '#ef4444',
    backgroundColor: '#1e1414',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    textAlign: 'center',
    fontWeight: '600',
    border: '1px solid #ef4444',
  },
  creditCardPaymentInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.5rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
  },
  creditCardFullyPaid: {
    backgroundColor: '#022c22',
    border: '2px solid #10b981',
    boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)',
  },
  creditCardCelebration: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1.5rem 1rem',
    gap: '0.5rem',
  },
  celebrationIcon: {
    fontSize: '3rem',
    animation: 'bounce 1s infinite',
  },
  celebrationText: {
    fontSize: '1.25rem',
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: '0.1em',
  },
  celebrationSubtext: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  paymentAbilitySection: {
    marginTop: '0.75rem',
    padding: '0.75rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.375rem',
  },
  abilityTitle: {
    fontSize: '0.625rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  },
  abilityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  abilityLabel: {
    fontSize: '0.75rem',
    color: '#cbd5e1',
    minWidth: '70px',
  },
  abilityBarContainer: {
    flex: 1,
    height: '12px',
    backgroundColor: '#1e293b',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #334155',
  },
  abilityBar: {
    height: '100%',
    transition: 'width 0.3s ease',
    borderRadius: '6px',
  },
  abilityPercentage: {
    fontSize: '0.75rem',
    fontWeight: '700',
    minWidth: '45px',
    textAlign: 'right',
  },
  kickbackProjectionSection: {
    marginBottom: '1.5rem',
  },
  kickbackProjectionSectionLarge: {
    marginBottom: '2rem',
    padding: '1.5rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.75rem',
    border: '2px solid #3b82f6',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
  },
  kickbackMainTitle: {
    fontSize: '1.125rem',
    fontWeight: '700',
    color: '#10b981',
    textAlign: 'center',
    marginBottom: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  kickbackMainAmount: {
    fontSize: '3rem',
    fontWeight: '700',
    color: '#10b981',
    textAlign: 'center',
    lineHeight: '1',
  },
  kickbackPerPersonLabel: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  kickbackTotalDisplay: {
    fontSize: '1rem',
    color: '#64748b',
    textAlign: 'center',
    marginTop: '0.75rem',
    fontStyle: 'italic',
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
  anticipatedEarlyBadge: {
    fontSize: '0.625rem',
    color: '#6ee7b7',
    backgroundColor: '#064e3b',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
    marginTop: '0.25rem',
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
  settingsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    marginTop: '1rem',
  },
  settingsSection: {
    backgroundColor: '#1e293b',
    padding: '1.5rem',
    borderRadius: '0.5rem',
  },
  settingsSectionTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#f1f5f9',
  },
  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
  },
  settingsInputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  settingsLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  settingsInput: {
    padding: '0.75rem',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    color: '#f1f5f9',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
  },
  settingsActions: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
    marginTop: '1rem',
  },
  settingsSaveButton: {
    padding: '0.75rem 2rem',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  resetButton: {
    padding: '0.75rem 2rem',
    backgroundColor: '#ef4444',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  syncButtonContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1.5rem',
  },
  syncButton: {
    padding: '0.75rem 2rem',
    backgroundColor: '#8b5cf6',
    border: 'none',
    borderRadius: '0.75rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 6px rgba(139, 92, 246, 0.3)',
  },
  connectedAccountItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.5rem',
    marginBottom: '0.5rem',
    color: '#e2e8f0',
  },
};

// Add keyframes for spinner animation and global styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

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
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
`;
document.head.appendChild(styleSheet);
