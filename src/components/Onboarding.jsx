import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import PlaidLink from './PlaidLink';
import AccountMappingUI from './AccountMappingUI';

// ─── Animated SVG Icons ──────────────────────────────────────────────────────

const FlipCoinIcon = ({ color, isActive }) => (
  <motion.svg
    width="120" height="120" viewBox="0 0 120 120" fill="none"
    initial={{ rotateY: 0 }}
    animate={isActive ? { rotateY: [0, 360] } : {}}
    transition={{ duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5 }}
    style={{ perspective: '600px' }}
  >
    <circle cx="60" cy="60" r="56" fill={color} opacity="0.15" />
    <circle cx="60" cy="60" r="44" fill={color} opacity="0.25" />
    <text x="60" y="72" textAnchor="middle" fontSize="42" fontWeight="700" fill={color}>F</text>
  </motion.svg>
);

// Give heart: throbs with a warm color shift (purple → rose → purple)
const GiveIcon = ({ color, isActive }) => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    <circle cx="60" cy="60" r="56" fill={color} opacity="0.15" />
    <motion.path
      d="M60 90C60 90 30 72 30 52C30 44 36 38 44 38C50 38 56 42 60 48C64 42 70 38 76 38C84 38 90 44 90 52C90 72 60 90 60 90Z"
      fill={color}
      initial={{ scale: 1, opacity: 0.9 }}
      animate={isActive ? {
        scale: [1, 1.1, 1],
        opacity: [0.9, 1, 0.9],
        fill: [color, '#D4728C', color],
      } : {}}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ transformOrigin: '60px 62px' }}
    />
    {/* Warm glow pulse behind heart */}
    <motion.circle
      cx="60" cy="60" r="32"
      fill="#D4728C"
      initial={{ opacity: 0 }}
      animate={isActive ? { opacity: [0, 0.1, 0], scale: [0.9, 1.2, 0.9] } : {}}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ transformOrigin: '60px 60px' }}
    />
  </svg>
);

// Save: exponential growth line on a mini graph, glows green left-to-right
const SaveIcon = ({ color, isActive }) => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    <circle cx="60" cy="60" r="56" fill={color} opacity="0.15" />
    {/* Graph axes */}
    <line x1="30" y1="90" x2="30" y2="35" stroke={color} strokeWidth="2" opacity="0.3" />
    <line x1="30" y1="90" x2="95" y2="90" stroke={color} strokeWidth="2" opacity="0.3" />
    {/* Exponential curve path */}
    <motion.path
      d="M30 85C40 84 50 80 58 72C66 62 74 48 82 32L90 28"
      fill="none"
      stroke="#4CAF50"
      strokeWidth="3.5"
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0.6 }}
      animate={isActive ? {
        pathLength: [0, 1],
        opacity: [0.6, 1],
      } : { pathLength: 0, opacity: 0.6 }}
      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: 'easeOut' }}
    />
    {/* Glow dot at the tip of the line */}
    <motion.circle
      cx="90" cy="28" r="5"
      fill="#4CAF50"
      initial={{ opacity: 0, scale: 0 }}
      animate={isActive ? {
        opacity: [0, 0, 1, 1, 0],
        scale: [0, 0, 1.2, 1, 0],
      } : {}}
      transition={{ duration: 3, repeat: Infinity, repeatDelay: 0, ease: 'easeOut' }}
      style={{ transformOrigin: '90px 28px' }}
    />
    {/* Area fill under the curve */}
    <motion.path
      d="M30 85C40 84 50 80 58 72C66 62 74 48 82 32L90 28V90H30Z"
      fill="#4CAF50"
      initial={{ opacity: 0 }}
      animate={isActive ? { opacity: [0, 0.08, 0.12, 0.08] } : {}}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    />
  </svg>
);

// Live house: wobbles side-to-side with a warm color pulse
const LiveIcon = ({ color, isActive }) => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    <circle cx="60" cy="60" r="56" fill={color} opacity="0.15" />
    <motion.g
      initial={{ rotate: 0 }}
      animate={isActive ? { rotate: [-4, 4, -4, 3, -2, 0] } : {}}
      transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1, ease: 'easeInOut' }}
      style={{ transformOrigin: '60px 88px' }}
    >
      <motion.path
        d="M60 32L90 58V88H70V72H50V88H30V58L60 32Z"
        fill={color}
        initial={{ opacity: 0.9 }}
        animate={isActive ? {
          opacity: [0.9, 1, 0.9],
          fill: [color, '#8FBBD4', color],
        } : {}}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.g>
  </svg>
);

// ─── Celebration Icon ──────────────────────────────────────────────────────
const CelebrationIcon = ({ color }) => (
  <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
    <motion.circle
      cx="50" cy="50" r="40"
      fill={color}
      initial={{ scale: 0 }}
      animate={{ scale: [0, 1.2, 1] }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      style={{ transformOrigin: '50px 50px' }}
    />
    <motion.path
      d="M35 50L45 60L65 40"
      stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
      fill="none"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
    />
    {[0, 60, 120, 180, 240, 300].map((angle, i) => (
      <motion.circle
        key={i}
        cx={50 + Math.cos((angle * Math.PI) / 180) * 25}
        cy={50 + Math.sin((angle * Math.PI) / 180) * 25}
        r="3"
        fill={color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: [0, 1.5, 0],
          opacity: [0, 1, 0],
          x: [0, Math.cos((angle * Math.PI) / 180) * 20],
          y: [0, Math.sin((angle * Math.PI) / 180) * 20],
        }}
        transition={{ duration: 0.8, delay: 0.3 + i * 0.08, ease: 'easeOut' }}
      />
    ))}
  </svg>
);

// ─── Welcome Slide Data ─────────────────────────────────────────────────────

const getWelcomeSlides = (theme) => [
  {
    icon: (isActive) => <FlipCoinIcon color={theme.accent} isActive={isActive} />,
    title: 'Welcome to Flip',
    accentColor: theme.accent,
    body: 'Flip the way you think about your finances.',
    detail: "Most people pay bills first and save whatever's left. Flip reverses that — you give first, save second, and live on the rest. It's a system that builds generosity and wealth before lifestyle creeps in.",
  },
  {
    icon: (isActive) => <GiveIcon color={theme.give} isActive={isActive} />,
    title: 'Give First',
    accentColor: theme.give,
    body: 'A portion of every paycheck goes to giving — before anything else.',
    detail: 'Tithing, missions support, generosity to friends. You decide the percentage. Most start at 10–20%. When giving comes first, it stops being an afterthought.',
  },
  {
    icon: (isActive) => <SaveIcon color={theme.save} isActive={isActive} />,
    title: 'Save Second',
    accentColor: theme.save,
    body: 'Before you pay a single bill, you pay yourself.',
    detail: 'Emergency fund, retirement, investments. The money moves automatically so you never have to think about it. Build wealth before lifestyle creeps in.',
  },
  {
    icon: (isActive) => <LiveIcon color={theme.live} isActive={isActive} />,
    title: 'Live Last',
    accentColor: theme.live,
    body: 'Everything left covers your life — rent, groceries, gas, personal spending.',
    detail: 'Credit cards track spending per category. At the end of the month, any surplus gets split into personal accounts as a reward for staying under budget.',
  },
];

// ─── Privacy Policy Content ─────────────────────────────────────────────────

const PrivacyPolicyContent = ({ theme }) => (
  <div style={{ color: theme.textMuted, fontSize: '0.875rem', lineHeight: '1.6' }}>
    <p>Flip ("we," "us," or "our") is committed to protecting the privacy of our users ("you" or "your"). This Privacy Policy explains how we collect, use, store, and share your personal and financial information when you use the Flip application and related services.</p>
    <p style={{ marginTop: '0.5rem' }}>By creating an account or using Flip, you acknowledge that you have read, understood, and agree to the practices described in this policy.</p>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>1. Information We Collect</h2>
    <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1rem' }}>1.1 Information You Provide</h3>
    <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
      <li>Account registration information (name, email address, phone number)</li>
      <li>Authentication credentials (securely hashed passwords)</li>
      <li>Budget preferences and financial categories you configure within the app</li>
    </ul>
    <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1rem' }}>1.2 Financial Information via Plaid</h3>
    <p style={{ marginTop: '0.5rem' }}>When you connect a financial institution through Plaid, we may receive the following with your explicit consent:</p>
    <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
      <li>Account names, types, and balances</li>
      <li>Transaction history (merchant names, amounts, dates, categories)</li>
      <li>Institution names and routing information</li>
    </ul>
    <p style={{ marginTop: '0.5rem' }}>We access this data solely through the Plaid API. <strong style={{ color: theme.text }}>We do not store your banking login credentials.</strong></p>
    <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1rem' }}>1.3 Automatically Collected Information</h3>
    <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
      <li>Device type and browser information</li>
      <li>IP address and general geographic location</li>
      <li>Usage analytics (pages visited, features used, session duration)</li>
    </ul>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>2. How We Use Your Information</h2>
    <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
      <li>To provide and operate the Flip budgeting application</li>
      <li>To display your financial accounts, balances, and transactions</li>
      <li>To help you manage and categorize your spending</li>
      <li>To authenticate your identity and secure your account</li>
      <li>To communicate with you about your account and support requests</li>
      <li>To improve and develop new features</li>
    </ul>
    <p style={{ marginTop: '0.5rem' }}><strong style={{ color: theme.text }}>We do not sell your personal or financial information to third parties. We do not use your financial data for advertising purposes.</strong></p>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>3. How We Share Your Information</h2>
    <p style={{ marginTop: '0.5rem' }}>We share your information only in the following limited circumstances:</p>
    <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
      <li><strong style={{ color: theme.text }}>Plaid</strong> — Plaid access tokens to securely connect to your financial institutions</li>
      <li><strong style={{ color: theme.text }}>Supabase</strong> — All application data for database hosting and authentication</li>
      <li><strong style={{ color: theme.text }}>SMS provider</strong> — Phone number for SMS verification codes</li>
      <li><strong style={{ color: theme.text }}>Hosting providers</strong> — Application logs for web and API hosting</li>
    </ul>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>4. Data Security</h2>
    <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
      <li>Encryption of data in transit using TLS 1.2 or higher</li>
      <li>Encryption of all data at rest using AES-256</li>
      <li>One-time password verification at signup and before sensitive actions</li>
      <li>Row Level Security (RLS) database policies ensuring users can only access their own data</li>
      <li>Server-side API authentication verifying user identity on every request</li>
      <li>Regular dependency vulnerability scanning</li>
    </ul>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>5. Data Retention</h2>
    <p style={{ marginTop: '0.5rem' }}>We retain your data only as long as necessary to provide our services or as required by law. When your data is no longer needed, it is securely deleted.</p>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>6. Your Rights and Choices</h2>
    <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
      <li><strong style={{ color: theme.text }}>Access:</strong> View all data stored in your account at any time</li>
      <li><strong style={{ color: theme.text }}>Correction:</strong> Update your account information in settings</li>
      <li><strong style={{ color: theme.text }}>Deletion:</strong> Delete your account and all data (processed within 30 days)</li>
      <li><strong style={{ color: theme.text }}>Disconnect:</strong> Disconnect linked institutions at any time — Plaid tokens are immediately revoked</li>
      <li><strong style={{ color: theme.text }}>Portability:</strong> Request an export of your data in a machine-readable format</li>
    </ul>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>7. Consent</h2>
    <p style={{ marginTop: '0.5rem' }}>We obtain your explicit consent before collecting, processing, or storing your financial data. You may withdraw consent at any time by disconnecting your financial institutions or deleting your account.</p>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>8. Children's Privacy</h2>
    <p style={{ marginTop: '0.5rem' }}>Flip is not intended for use by individuals under 18. We do not knowingly collect personal information from children.</p>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>9. Changes to This Policy</h2>
    <p style={{ marginTop: '0.5rem' }}>We may update this policy to reflect changes in our practices or legal requirements. We will notify you of material changes by posting the updated policy within the application.</p>

    <h2 style={{ color: theme.text, fontSize: '1.125rem', marginTop: '1.5rem' }}>10. Contact Us</h2>
    <p style={{ marginTop: '0.5rem' }}>If you have questions about this Privacy Policy or wish to exercise your data rights, contact us at: <strong style={{ color: theme.text }}>matfluker34@gmail.com</strong></p>
  </div>
);

// ─── Stepper Config ─────────────────────────────────────────────────────────
// Steps: 0-3 welcome slides, 4 privacy, 5 names, 6 connect, 7 celebration,
//        8 mapping explainer, 9 map, 10 sync, 11 done

// Steps: 0-3 welcome, 4 privacy, 5 names, 6 connect, 7 celebration,
//        8 mapping explainer, 9 map, 10 sync,
//        11 live analysis spinner, 12 clarification cards, 13 live number review,
//        14 budget splits, 15 done
const STEPPER_LABELS = ['Welcome', 'Privacy', 'Names', 'Connect', 'Map', 'Sync', 'Spending', 'Splits', 'Done'];

const stepToDotIndex = (step) => {
  if (step <= 3) return 0;
  if (step === 4) return 1;
  if (step === 5) return 2;
  if (step <= 7) return 3;
  if (step <= 9) return 4;
  if (step === 10) return 5;
  if (step <= 13) return 6; // 11 = analyze, 12 = cards, 13 = live number
  if (step === 14) return 7; // splits
  return 8;                  // done
};

const TOTAL_STEPS = 16;

// ─── Session Storage Helpers ────────────────────────────────────────────────
const STORAGE_KEY = 'onboarding_step';
const saveStep = (step) => { try { sessionStorage.setItem(STORAGE_KEY, String(step)); } catch {} };
const loadStep = () => {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v !== null) { const n = parseInt(v, 10); if (!isNaN(n) && n >= 0 && n < TOTAL_STEPS) return n; }
  } catch {}
  return 0;
};
const clearStep = () => { try { sessionStorage.removeItem(STORAGE_KEY); } catch {} };

// ─── Component ──────────────────────────────────────────────────────────────

const Onboarding = ({
  theme,
  styles: appStyles,
  authFetch,
  supabase,
  session,
  onComplete,
  syncBalances,
  syncTransactions,
  fetchConnectedAccounts,
  fetchPlaidMappings,
  fetchSnapshots,
  fetchCreditCards,
  isTestMode,
  onTestReset,
}) => {
  const [step, setStepRaw] = useState(() => loadStep());
  const [direction, setDirection] = useState(1);
  const [person1Name, setPerson1Name] = useState('');
  const [person2Name, setPerson2Name] = useState('');
  const [isJointBudget, setIsJointBudget] = useState(false);
  const [accountsConnected, setAccountsConnected] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Live Calculation state (replaces old analysisStatus / editedBills)
  const [liveAnalysis, setLiveAnalysis] = useState(null); // { income, autoDetected, needsReview }
  const [liveAnalysisStatus, setLiveAnalysisStatus] = useState('idle'); // idle | analyzing | done | error
  const [liveAnalysisError, setLiveAnalysisError] = useState('');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [confirmedReviewItems, setConfirmedReviewItems] = useState([]);
  const [liveExpenses, setLiveExpenses] = useState({
    rent: 0, groceries: 0, gas: 0, power: 0,
    gym: 0, insurance: 0, dateNights: 0, subscriptions: 0,
  });
  const [liveExpenseEditing, setLiveExpenseEditing] = useState(null); // key being edited in Step 13
  const [editedIncome, setEditedIncome] = useState([]);
  const [splitGive, setSplitGive] = useState(0.20);
  const [splitSave, setSplitSave] = useState(0.20);
  const [person1Live, setPerson1Live] = useState('');
  const [person2Live, setPerson2Live] = useState('');
  const [editingId, setEditingId] = useState(null);

  const welcomeSlides = getWelcomeSlides(theme);
  const currentDot = stepToDotIndex(step);

  const setStep = (newStep) => {
    setDirection(newStep > step ? 1 : -1);
    setStepRaw(newStep);
    saveStep(newStep);
  };

  // ─── Navigation Helpers ─────────────────────────────────────────────────────

  const canGoNext = () => {
    if (step <= 3) return true;
    if (step === 4) return true;
    if (step === 5) return person1Name.trim().length > 0;
    if (step === 6) return accountsConnected;
    if (step === 7) return true;
    if (step === 8) return true;
    if (step === 9) return false; // Map — handled by save button
    if (step === 10) return syncStatus === 'done';
    if (step === 11) return false; // Live analysis — auto-advances
    if (step === 12) return false; // Clarification cards — handled by Yes/No buttons
    if (step === 13) return false; // Live number — handled by "Lock it in" button
    if (step === 14) {
      const g = parseFloat(splitGive) || 0;
      const sv = parseFloat(splitSave) || 0;
      return g + sv < 1 && parseFloat(person1Live) > 0;
    }
    if (step === 15) return true;
    return false;
  };

  const goNext = () => { if (step < TOTAL_STEPS - 1) setStep(step + 1); };

  const goBack = () => { if (step > 0) setStep(step - 1); };

  // ─── Plaid Callbacks ───────────────────────────────────────────────────────

  const handleConnect = async (metadata) => {
    console.log('[Onboarding] Plaid connected:', metadata);
    setAccountsConnected(true);
    setConnectedCount(prev => prev + (metadata?.accounts?.length || 1));
    try {
      await fetchConnectedAccounts();
    } catch (err) {
      console.error('[Onboarding] Error fetching connected accounts:', err);
    }
  };

  // ─── Mapping + Sync ────────────────────────────────────────────────────────

  const handleMapping = async () => {
    setStep(10);
    await runSync();
  };

  const runSync = async () => {
    setSyncStatus('syncing');
    setSyncMessage('Fetching balances...');
    try {
      await syncBalances(true, true);
      setSyncMessage('Syncing transactions...');
      await syncTransactions(true, true);
      setSyncMessage('Almost there...');
      await fetchConnectedAccounts();
      await fetchPlaidMappings();
      await fetchCreditCards();
      // fetchSnapshots() omitted — syncBalances already calls it silently
      setSyncStatus('done');
      setSyncMessage('All done!');
    } catch (err) {
      console.error('Onboarding sync error:', err);
      setSyncStatus('error');
      setSyncMessage('Something went wrong. Please try again.');
    }
  };

  // ─── Live Calculation ─────────────────────────────────────────────────────

  // Build liveExpenses from autoDetected items returned by /api/analyze-spending
  const buildExpensesFromDetected = (items) => {
    const expenses = { rent: 0, groceries: 0, gas: 0, power: 0, gym: 0, insurance: 0, dateNights: 0, subscriptions: 0 };
    for (const item of (items || [])) {
      const cat = item.category;
      if (cat && expenses.hasOwnProperty(cat)) {
        expenses[cat] += item.monthlyAmount;
      }
      // null category → subscriptions bucket
      else if (!cat) {
        expenses.subscriptions += item.monthlyAmount;
      }
    }
    // Round to 2 decimal places
    for (const k of Object.keys(expenses)) {
      expenses[k] = Math.round(expenses[k] * 100) / 100;
    }
    return expenses;
  };

  // Merge user-confirmed items from the review queue into liveExpenses.
  // needsReview items have no confirmed category, so they go into subscriptions.
  const mergeConfirmedIntoExpenses = (confirmed) => {
    setLiveExpenses(prev => {
      const updated = { ...prev };
      for (const item of confirmed) {
        updated.subscriptions = Math.round((updated.subscriptions + item.monthlyAmount) * 100) / 100;
      }
      return updated;
    });
  };

  const runLiveAnalysis = async () => {
    setLiveAnalysisStatus('analyzing');
    setLiveAnalysisError('');
    try {
      const API_URL = (await import('../api')).API_URL;
      const response = await authFetch(`${API_URL}/api/analyze-spending`, { method: 'POST' });
      if (!response.ok) throw new Error('Analysis failed');
      const data = await response.json();
      setLiveAnalysis(data);
      // Pre-populate income for Budget Splits (Step 14)
      if (data.income?.length > 0) {
        setEditedIncome(data.income.map((inc, i) => ({ ...inc, id: `income_${i}` })));
      }
      // Build liveExpenses from auto-detected items
      const expenses = buildExpensesFromDetected(data.autoDetected);
      setLiveExpenses(expenses);
      setReviewIndex(0);
      setConfirmedReviewItems([]);
      setLiveAnalysisStatus('done');
      // Skip clarification cards if nothing needs review
      if (!data.needsReview || data.needsReview.length === 0) {
        setStep(13);
      } else {
        setStep(12);
      }
    } catch (err) {
      console.error('Live analysis error:', err);
      setLiveAnalysisStatus('error');
      setLiveAnalysisError('Something went wrong analyzing your transactions. You can skip this and enter your expenses manually.');
    }
  };

  // ─── Complete ───────────────────────────────────────────────────────────────

  const handleComplete = () => {
    clearStep();
    const income1 = editedIncome[0] || {};
    const income2 = editedIncome[1] || {};
    onComplete({
      person_1_name: person1Name.trim() || 'Friend',
      person_2_name: isJointBudget ? (person2Name.trim() || 'Partner') : '',
      is_joint_budget: isJointBudget,
      mat_pay_amount: parseFloat(income1.amount) || null,
      mara_pay_amount: isJointBudget ? (parseFloat(income2.amount) || null) : null,
      payday_1_anchor: income1.anchorDate || null,
      payday_1_frequency: income1.frequency || 'biweekly',
      payday_2_anchor: isJointBudget ? (income2.anchorDate || null) : null,
      payday_2_frequency: isJointBudget ? (income2.frequency || 'biweekly') : null,
      split_give: parseFloat(splitGive),
      split_save: parseFloat(splitSave),
      split_mat_live: parseFloat(person1Live) || null,
      split_mara_live: isJointBudget ? (parseFloat(person2Live) || null) : null,
      monthly_rent: liveExpenses.rent || null,
      monthly_gym: liveExpenses.gym || null,
      monthly_power: liveExpenses.power || null,
      monthly_insurance: liveExpenses.insurance || null,
      monthly_groceries: liveExpenses.groceries || null,
      monthly_gas: liveExpenses.gas || null,
      monthly_date_nights: liveExpenses.dateNights || null,
      monthly_subscriptions: liveExpenses.subscriptions || null,
    });
  };

  // ─── Touch Swipe ──────────────────────────────────────────────────────────

  const touchRef = useRef(null);
  const handleTouchStart = (e) => { touchRef.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchRef.current === null) return;
    const diff = touchRef.current - e.changedTouches[0].clientX;
    if (step <= 3) {
      if (diff > 50 && step < 3) setStep(step + 1);
      else if (diff < -50 && step > 0) setStep(step - 1);
    }
    touchRef.current = null;
  };

  // If we mount at step 10 (e.g., after a page refresh mid-sync), auto-restart sync
  useEffect(() => {
    if (step === 10 && syncStatus === 'idle') {
      runSync();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const s = {
    container: {
      minHeight: '100vh',
      backgroundColor: theme.bg,
      color: theme.text,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: appStyles?.container?.fontFamily || 'inherit',
      overflow: 'hidden',
    },
    content: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1.5rem',
      maxWidth: '480px',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
    },
    stepper: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      padding: '1.5rem 1rem 0',
    },
    dot: (active, completed) => ({
      width: active ? '12px' : '8px',
      height: active ? '12px' : '8px',
      borderRadius: '50%',
      backgroundColor: active ? theme.accent : completed ? theme.accent : theme.border,
      opacity: active ? 1 : completed ? 0.6 : 0.3,
      transition: 'all 0.3s ease',
    }),
    stepperLine: (completed) => ({
      width: '20px',
      height: '2px',
      backgroundColor: completed ? theme.accent : theme.border,
      opacity: completed ? 0.6 : 0.2,
      transition: 'all 0.3s ease',
    }),
    slideIcon: { marginBottom: '1.5rem' },
    slideTitle: (color) => ({
      fontSize: '1.75rem',
      fontWeight: '700',
      color: color || theme.text,
      marginBottom: '0.75rem',
      textAlign: 'center',
    }),
    slideBody: {
      fontSize: '1.1rem',
      color: theme.text,
      textAlign: 'center',
      lineHeight: '1.6',
      marginBottom: '0.75rem',
    },
    slideDetail: {
      fontSize: '0.95rem',
      color: theme.textMuted,
      textAlign: 'center',
      lineHeight: '1.6',
      maxWidth: '380px',
    },
    subDots: {
      display: 'flex',
      justifyContent: 'center',
      gap: '0.5rem',
      marginTop: '2rem',
    },
    subDot: (active) => ({
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      border: 'none',
      backgroundColor: active ? theme.accent : theme.border,
      cursor: 'pointer',
      padding: 0,
      transition: 'background-color 0.2s',
    }),
    nav: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem 1.5rem 2rem',
      maxWidth: '480px',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
    },
    navButton: (primary) => ({
      padding: '0.75rem 1.5rem',
      backgroundColor: primary ? theme.accent : 'transparent',
      color: primary ? '#fff' : theme.textMuted,
      border: primary ? 'none' : `1px solid ${theme.border}`,
      borderRadius: '0.5rem',
      fontSize: '1rem',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      opacity: 1,
      minWidth: '100px',
    }),
    navButtonDisabled: { opacity: 0.4, cursor: 'not-allowed' },
    heading: {
      fontSize: '1.75rem',
      fontWeight: '700',
      color: theme.text,
      marginBottom: '0.5rem',
      textAlign: 'center',
    },
    subtext: {
      fontSize: '0.95rem',
      color: theme.textMuted,
      textAlign: 'center',
      lineHeight: '1.6',
      marginBottom: '2rem',
      maxWidth: '380px',
    },
    card: {
      backgroundColor: theme.cardBg,
      borderRadius: '0.75rem',
      padding: '1.5rem',
      width: '100%',
      boxSizing: 'border-box',
    },
    input: {
      width: '100%',
      padding: '0.75rem 1rem',
      backgroundColor: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: '0.5rem',
      color: theme.text,
      fontSize: '1rem',
      boxSizing: 'border-box',
      outline: 'none',
    },
    label: {
      fontSize: '0.875rem',
      color: theme.textMuted,
      marginBottom: '0.5rem',
      display: 'block',
    },
    toggle: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      marginBottom: '1.5rem',
      cursor: 'pointer',
    },
    toggleTrack: (on) => ({
      width: '44px',
      height: '24px',
      borderRadius: '12px',
      backgroundColor: on ? theme.accent : theme.border,
      position: 'relative',
      transition: 'background-color 0.2s',
      flexShrink: 0,
    }),
    toggleThumb: (on) => ({
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      backgroundColor: '#fff',
      position: 'absolute',
      top: '2px',
      left: on ? '22px' : '2px',
      transition: 'left 0.2s',
    }),
    bulletList: {
      listStyle: 'none',
      padding: 0,
      margin: 0,
      textAlign: 'left',
      width: '100%',
    },
    bulletItem: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
      marginBottom: '1rem',
      fontSize: '0.95rem',
      color: theme.textMuted,
      lineHeight: '1.5',
    },
    bulletIcon: {
      color: theme.success,
      fontSize: '1.1rem',
      marginTop: '0.1rem',
      flexShrink: 0,
    },
    privacyLink: {
      color: theme.accent,
      textDecoration: 'underline',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '0.875rem',
      padding: 0,
      marginTop: '1rem',
    },
    connectSuccess: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      color: theme.success,
      fontSize: '1rem',
      fontWeight: '600',
      marginTop: '1rem',
    },
    spinner: {
      width: '48px',
      height: '48px',
      border: `4px solid ${theme.border}`,
      borderTop: `4px solid ${theme.accent}`,
      borderRadius: '50%',
      animation: 'onboarding-spin 1s linear infinite',
      marginBottom: '1.5rem',
    },
    checkmark: {
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      backgroundColor: theme.success,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '1.5rem',
    },
    errorBox: {
      backgroundColor: theme.dangerBg,
      color: theme.danger,
      padding: '1rem',
      borderRadius: '0.5rem',
      textAlign: 'center',
      marginTop: '1rem',
      width: '100%',
    },
    retryButton: {
      padding: '0.5rem 1rem',
      backgroundColor: theme.danger,
      color: '#fff',
      border: 'none',
      borderRadius: '0.5rem',
      fontSize: '0.875rem',
      fontWeight: '600',
      cursor: 'pointer',
      marginTop: '0.75rem',
    },
    bigButton: {
      padding: '1rem 2rem',
      backgroundColor: theme.accent,
      color: '#fff',
      border: 'none',
      borderRadius: '0.75rem',
      fontSize: '1.1rem',
      fontWeight: '700',
      cursor: 'pointer',
      transition: 'all 0.2s',
      marginTop: '1.5rem',
    },
    plaidWrapper: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1rem',
      width: '100%',
    },
    mappingWrapper: { width: '100%' },
    // Privacy modal
    modalOverlay: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
    },
    modalContent: {
      backgroundColor: theme.cardBg,
      borderRadius: '1rem',
      padding: '2rem',
      maxWidth: '600px',
      width: '100%',
      maxHeight: '80vh',
      overflowY: 'auto',
      position: 'relative',
    },
    modalClose: {
      position: 'sticky',
      top: 0,
      float: 'right',
      background: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: '50%',
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: theme.text,
      fontSize: '1.2rem',
      fontWeight: '700',
      zIndex: 1,
    },
  };

  // ─── Animation variants ───────────────────────────────────────────────────
  const slideVariants = {
    enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  const staggerChild = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
      opacity: 1, y: 0,
      transition: { delay: i * 0.1, duration: 0.4, ease: 'easeOut' },
    }),
  };

  // ─── Stepper ──────────────────────────────────────────────────────────────

  const renderStepper = () => (
    <div style={s.stepper}>
      {STEPPER_LABELS.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {i > 0 && <div style={s.stepperLine(i <= currentDot)} />}
          <div style={s.dot(i === currentDot, i < currentDot)} title={label} />
        </div>
      ))}
    </div>
  );

  // ─── Privacy Modal ──────────────────────────────────────────────────────────

  const renderPrivacyModal = () => (
    <AnimatePresence>
      {showPrivacyModal && (
        <motion.div
          style={s.modalOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPrivacyModal(false); }}
        >
          <motion.div
            style={s.modalContent}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <button style={s.modalClose} onClick={() => setShowPrivacyModal(false)}>&times;</button>
            <h1 style={{ color: theme.text, fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.25rem' }}>
              Flip — Privacy Policy
            </h1>
            <p style={{ color: theme.textMuted, fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
              Effective Date: February 17, 2025
            </p>
            <PrivacyPolicyContent theme={theme} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ─── Welcome Slides (Steps 0-3) ────────────────────────────────────────────

  const renderWelcomeSlide = () => {
    const slide = welcomeSlides[step];
    return (
      <div style={s.content} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <motion.div
          style={s.slideIcon}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {slide.icon(true)}
        </motion.div>
        <motion.h1
          style={s.slideTitle(slide.accentColor)}
          custom={0} variants={staggerChild} initial="hidden" animate="visible"
        >{slide.title}</motion.h1>
        <motion.p
          style={s.slideBody}
          custom={1} variants={staggerChild} initial="hidden" animate="visible"
        >{slide.body}</motion.p>
        <motion.p
          style={s.slideDetail}
          custom={2} variants={staggerChild} initial="hidden" animate="visible"
        >{slide.detail}</motion.p>
        <div style={s.subDots}>
          {welcomeSlides.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} style={s.subDot(i === step)} aria-label={`Slide ${i + 1}`} />
          ))}
        </div>
      </div>
    );
  };

  // ─── Step 4: Privacy ───────────────────────────────────────────────────────

  const renderPrivacy = () => (
    <div style={s.content}>
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ marginBottom: '1.5rem' }}>
        <circle cx="32" cy="32" r="30" fill={theme.success} opacity="0.15" />
        <path d="M32 14L48 22V32C48 42 40 50 32 54C24 50 16 42 16 32V22L32 14Z" fill={theme.success} opacity="0.8" />
        <path d="M26 33L30 37L38 27" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <motion.h1 style={s.heading} custom={0} variants={staggerChild} initial="hidden" animate="visible">
        Your Data is Safe
      </motion.h1>
      <motion.p style={s.subtext} custom={1} variants={staggerChild} initial="hidden" animate="visible">
        We take your financial privacy seriously. Here's how we protect you:
      </motion.p>
      <motion.div style={s.card} custom={2} variants={staggerChild} initial="hidden" animate="visible">
        <ul style={s.bulletList}>
          <li style={s.bulletItem}>
            <span style={s.bulletIcon}>&#10003;</span>
            <span>Bank-level encryption protects all your data in transit and at rest</span>
          </li>
          <li style={s.bulletItem}>
            <span style={s.bulletIcon}>&#10003;</span>
            <span>Your bank credentials are never stored by Flip — Plaid handles the secure connection</span>
          </li>
          <li style={s.bulletItem}>
            <span style={s.bulletIcon}>&#10003;</span>
            <span>Your data is used only to power your personal budget — never sold or shared</span>
          </li>
          <li style={s.bulletItem}>
            <span style={s.bulletIcon}>&#10003;</span>
            <span>You can disconnect accounts and delete your data at any time</span>
          </li>
        </ul>
      </motion.div>
      <button style={s.privacyLink} onClick={() => setShowPrivacyModal(true)}>
        Read our full Privacy Policy
      </button>
    </div>
  );

  // ─── Step 5: Names ─────────────────────────────────────────────────────────

  const renderNames = () => (
    <div style={s.content}>
      <motion.h1 style={s.heading} custom={0} variants={staggerChild} initial="hidden" animate="visible">
        Let's get to know you
      </motion.h1>
      <motion.p style={s.subtext} custom={1} variants={staggerChild} initial="hidden" animate="visible">
        {isJointBudget
          ? "We'd love to know both of your names so we can personalize your experience."
          : "What's your first name?"}
      </motion.p>
      <motion.div style={s.card} custom={2} variants={staggerChild} initial="hidden" animate="visible">
        <div
          style={s.toggle}
          onClick={() => setIsJointBudget(!isJointBudget)}
          role="switch"
          aria-checked={isJointBudget}
        >
          <div style={s.toggleTrack(isJointBudget)}>
            <div style={s.toggleThumb(isJointBudget)} />
          </div>
          <span style={{ color: theme.text, fontSize: '0.95rem' }}>Joint budget (two people)</span>
        </div>

        <div style={{ marginBottom: isJointBudget ? '1rem' : 0 }}>
          <label style={s.label}>{isJointBudget ? 'Your name' : 'Your name'}</label>
          <input
            type="text"
            value={person1Name}
            onChange={(e) => setPerson1Name(e.target.value)}
            placeholder="Enter your name"
            style={s.input}
            autoFocus
          />
        </div>

        {isJointBudget && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <label style={s.label}>Your partner's name</label>
            <input
              type="text"
              value={person2Name}
              onChange={(e) => setPerson2Name(e.target.value)}
              placeholder="Enter their name"
              style={s.input}
            />
          </motion.div>
        )}
      </motion.div>
    </div>
  );

  // ─── Step 6: Connect Accounts ──────────────────────────────────────────────

  const renderConnect = () => (
    <div style={s.content}>
      <motion.h1
        style={s.heading}
        custom={0} variants={staggerChild} initial="hidden" animate="visible"
      >
        Let's connect your bank accounts
      </motion.h1>
      <motion.p
        style={s.subtext}
        custom={1} variants={staggerChild} initial="hidden" animate="visible"
      >
        Flip uses Plaid to securely read your balances and transactions. Your login credentials are never stored.
      </motion.p>
      <motion.div
        style={s.card}
        custom={2} variants={staggerChild} initial="hidden" animate="visible"
      >
        <div style={s.plaidWrapper}>
          <PlaidLink authFetch={authFetch} onSuccess={handleConnect} />
          {accountsConnected && (
            <motion.div
              style={s.connectSuccess}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <span>&#10003;</span>
              <span>{connectedCount > 1 ? `${connectedCount} accounts connected` : 'Account connected!'}</span>
            </motion.div>
          )}
          {accountsConnected && (
            <p style={{ color: theme.textDimmed, fontSize: '0.85rem', textAlign: 'center', marginTop: '0.5rem' }}>
              Need to connect another institution? Click the button again.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );

  // ─── Step 7: Celebration ───────────────────────────────────────────────────

  const renderCelebration = () => (
    <div style={s.content}>
      <CelebrationIcon color={theme.success} />
      <motion.h1
        style={s.heading}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        Nice! Your accounts are linked.
      </motion.h1>
      <motion.p
        style={s.subtext}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        {connectedCount > 1
          ? `${connectedCount} accounts are now securely connected to Flip.`
          : 'Your account is now securely connected to Flip.'}
      </motion.p>
      <motion.p
        style={{ ...s.subtext, marginBottom: 0, fontSize: '0.85rem', color: theme.textDimmed }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.5 }}
      >
        Next up: let's tell Flip which account is which.
      </motion.p>
    </div>
  );

  // ─── Step 8: Mapping Explainer ────────────────────────────────────────────

  const renderMappingExplainer = () => (
    <div style={s.content}>
      <motion.svg
        width="80" height="80" viewBox="0 0 80 80" fill="none"
        style={{ marginBottom: '1.5rem' }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <circle cx="40" cy="40" r="38" fill={theme.accent} opacity="0.15" />
        <rect x="12" y="30" width="20" height="20" rx="4" fill={theme.accent} opacity="0.7" />
        <rect x="48" y="30" width="20" height="20" rx="4" fill={theme.accent} opacity="0.9" />
        <motion.path
          d="M34 40H46M46 40L42 36M46 40L42 44"
          stroke={theme.accent}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
        />
      </motion.svg>

      <motion.h1
        style={s.heading}
        custom={0} variants={staggerChild} initial="hidden" animate="visible"
      >
        Map your accounts
      </motion.h1>
      <motion.p
        style={s.subtext}
        custom={1} variants={staggerChild} initial="hidden" animate="visible"
      >
        Connect your accounts to your budget. Flip takes your bank accounts — however
        many you have — and shows you your money through the Give-Save-Live lens.
      </motion.p>
      <motion.div
        style={s.card}
        custom={2} variants={staggerChild} initial="hidden" animate="visible"
      >
        <p style={{ color: theme.textMuted, fontSize: '0.9rem', lineHeight: '1.6', margin: 0 }}>
          On the next screen, you'll map each account:
          {' '}<strong style={{ color: theme.text }}>Checking/savings</strong> accounts get assigned to a budget bucket
          (<strong style={{ color: theme.text }}>Give</strong>, <strong style={{ color: theme.text }}>Save</strong>, <strong style={{ color: theme.text }}>Live</strong>,
          {' '}<strong style={{ color: theme.text }}>{person1Name || 'You'}</strong>
          {isJointBudget && <>, <strong style={{ color: theme.text }}>{person2Name || 'Partner'}</strong></>}).
          {' '}<strong style={{ color: theme.text }}>Credit cards</strong> just need a name, due date, and which account pays them.
        </p>
      </motion.div>
    </div>
  );

  // ─── Step 9: Map Accounts ─────────────────────────────────────────────────

  const renderMap = () => (
    <div style={s.content}>
      <motion.h1
        style={s.heading}
        custom={0} variants={staggerChild} initial="hidden" animate="visible"
      >
        Assign your accounts
      </motion.h1>
      <motion.p
        style={{ ...s.subtext, marginBottom: '1rem' }}
        custom={1} variants={staggerChild} initial="hidden" animate="visible"
      >
        Match each bank account to a Flip budget bucket.
      </motion.p>
      <motion.div
        style={s.card}
        custom={2} variants={staggerChild} initial="hidden" animate="visible"
      >
        <AccountMappingUI
          authFetch={authFetch}
          onMappingSaved={handleMapping}
          isSyncing={syncStatus === 'syncing'}
          person1Name={person1Name}
          person2Name={person2Name}
        />
      </motion.div>
    </div>
  );

  // ─── Step 10: Sync ─────────────────────────────────────────────────────────

  const renderSync = () => (
    <div style={s.content}>
      {(syncStatus === 'idle' || syncStatus === 'syncing') && (
        <>
          <div style={s.spinner} />
          <h1 style={s.heading}>Syncing Your Data</h1>
          <p style={s.subtext}>{syncMessage || 'Getting everything ready...'}</p>
        </>
      )}
      {syncStatus === 'done' && (
        <>
          <motion.div
            style={s.checkmark}
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <motion.path
                d="M6 12L10 16L18 8"
                stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              />
            </svg>
          </motion.div>
          <h1 style={s.heading}>Sync Complete</h1>
          <p style={s.subtext}>{syncMessage}</p>
        </>
      )}
      {syncStatus === 'error' && (
        <>
          <h1 style={s.heading}>Sync Error</h1>
          <div style={s.errorBox}>
            <p>{syncMessage}</p>
            <button style={s.retryButton} onClick={runSync}>Retry</button>
          </div>
        </>
      )}
    </div>
  );

  // ─── Step 11: Live Analysis Spinner ──────────────────────────────────────────

  useEffect(() => {
    if (step === 11 && liveAnalysisStatus === 'idle') {
      runLiveAnalysis();
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderLiveAnalyze = () => (
    <div style={s.content}>
      {(liveAnalysisStatus === 'idle' || liveAnalysisStatus === 'analyzing') && (
        <>
          <div style={s.spinner} />
          <h1 style={s.heading}>Understanding your spending</h1>
          <p style={s.subtext}>Scanning 12 months of transactions to find your recurring expenses...</p>
        </>
      )}
      {liveAnalysisStatus === 'error' && (
        <>
          <h1 style={s.heading}>Analysis Skipped</h1>
          <div style={s.errorBox}>
            <p style={{ marginBottom: '0.75rem' }}>{liveAnalysisError}</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button style={s.retryButton} onClick={runLiveAnalysis}>Retry</button>
              <button
                style={{ ...s.retryButton, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMuted }}
                onClick={() => {
                  setLiveExpenses({ rent: 0, groceries: 0, gas: 0, power: 0, gym: 0, insurance: 0, dateNights: 0, subscriptions: 0 });
                  setStep(13);
                }}
              >
                Skip — enter manually
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ─── Step 12: Clarification Cards ─────────────────────────────────────────

  const renderLiveReview = () => {
    const queue = liveAnalysis?.needsReview || [];
    const totalItems = queue.length;
    const currentItem = queue[reviewIndex];

    if (!currentItem) {
      // Shouldn't normally render — analysis skips here if queue is empty
      return (
        <div style={s.content}>
          <h1 style={s.heading}>All done!</h1>
          <p style={s.subtext}>Tap Continue to see your monthly total.</p>
          <button style={s.bigButton} onClick={() => setStep(13)}>See my expenses</button>
        </div>
      );
    }

    const handleYes = () => {
      const updated = [...confirmedReviewItems, currentItem];
      if (reviewIndex + 1 >= totalItems) {
        setConfirmedReviewItems(updated);
        mergeConfirmedIntoExpenses(updated);
        setStep(13);
      } else {
        setConfirmedReviewItems(updated);
        setReviewIndex(i => i + 1);
      }
    };

    const handleNo = () => {
      if (reviewIndex + 1 >= totalItems) {
        mergeConfirmedIntoExpenses(confirmedReviewItems);
        setStep(13);
      } else {
        setReviewIndex(i => i + 1);
      }
    };

    return (
      <div style={s.content}>
        <p style={{ color: theme.textDimmed, fontSize: '0.8rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          {reviewIndex + 1} of {totalItems}
        </p>

        <motion.div
          key={reviewIndex}
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -60, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{ width: '100%' }}
        >
          <div style={{ ...s.card, textAlign: 'center', paddingTop: '2rem', paddingBottom: '2rem' }}>
            <p style={{ color: theme.textMuted, fontSize: '0.75rem', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Is this a regular monthly expense?
            </p>
            <h2 style={{ color: theme.text, fontSize: '1.4rem', fontWeight: '700', marginBottom: '0.5rem' }}>
              {currentItem.name}
            </h2>
            <p style={{ color: theme.accent, fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.25rem' }}>
              ${currentItem.monthlyAmount.toFixed(2)} / month
            </p>
            <p style={{ color: theme.textDimmed, fontSize: '0.8rem', marginBottom: currentItem.categoryHint ? '0.25rem' : '0' }}>
              Appeared {currentItem.occurrences}x over the last year
            </p>
            {currentItem.categoryHint && (
              <p style={{ color: theme.textDimmed, fontSize: '0.8rem', fontStyle: 'italic' }}>
                {currentItem.categoryHint}
              </p>
            )}
          </div>
        </motion.div>

        <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '1.5rem' }}>
          <button
            onClick={handleNo}
            style={{
              flex: 1, padding: '0.875rem', backgroundColor: 'transparent',
              border: `1px solid ${theme.border}`, borderRadius: '0.5rem',
              color: theme.textMuted, fontSize: '1rem', fontWeight: '600', cursor: 'pointer',
            }}
          >
            No, skip it
          </button>
          <button
            onClick={handleYes}
            style={{
              flex: 1, padding: '0.875rem', backgroundColor: theme.success,
              border: 'none', borderRadius: '0.5rem',
              color: '#fff', fontSize: '1rem', fontWeight: '600', cursor: 'pointer',
            }}
          >
            Yes, include
          </button>
        </div>
      </div>
    );
  };

  // ─── Step 13: Live Number Review ───────────────────────────────────────────

  const renderLiveNumber = () => {
    const expenseLabels = {
      rent: 'Rent / Mortgage',
      groceries: 'Groceries',
      gas: 'Gas',
      power: 'Power / Utilities',
      insurance: 'Insurance',
      gym: 'Gym / Fitness',
      dateNights: 'Dining / Dates',
      subscriptions: 'Subscriptions',
    };

    const total = Object.values(liveExpenses).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    const monthsAnalyzed = liveAnalysis
      ? Math.max(...(liveAnalysis.autoDetected || []).map(i => i.occurrences || 0), 1)
      : null;

    const inputStyle = {
      background: theme.bg, border: `1px solid ${theme.accent}`, borderRadius: '0.375rem',
      color: theme.text, padding: '0.3rem 0.5rem', fontSize: '0.9rem', width: '90px',
      textAlign: 'right',
    };

    return (
      <div style={{ ...s.content, justifyContent: 'flex-start', paddingTop: '1.5rem' }}>
        <motion.div
          custom={0} variants={staggerChild} initial="hidden" animate="visible"
          style={{ textAlign: 'center', width: '100%', marginBottom: '1.5rem' }}
        >
          <h1 style={{ ...s.heading, marginBottom: '0.25rem' }}>Your monthly expenses</h1>
          {monthsAnalyzed && (
            <p style={{ color: theme.textDimmed, fontSize: '0.8rem', marginBottom: '1rem' }}>
              Based on up to {monthsAnalyzed} months of your transactions
            </p>
          )}
          <p style={{ fontSize: '2.5rem', fontWeight: '800', color: theme.text, margin: '0.5rem 0 0.25rem' }}>
            ${Math.round(total).toLocaleString()}
          </p>
          <p style={{ color: theme.textMuted, fontSize: '0.9rem' }}>/ month</p>
        </motion.div>

        <motion.div
          custom={1} variants={staggerChild} initial="hidden" animate="visible"
          style={{ ...s.card, width: '100%', boxSizing: 'border-box' }}
        >
          {Object.entries(expenseLabels).map(([key, label]) => {
            const val = liveExpenses[key];
            if (val === 0 && key === 'subscriptions') return null; // hide subscriptions row if zero
            return (
              <div
                key={key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.5rem 0', borderBottom: `1px solid ${theme.border}20`,
                }}
              >
                <span style={{ color: theme.textMuted, fontSize: '0.9rem' }}>{label}</span>
                {liveExpenseEditing === key ? (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    autoFocus
                    style={inputStyle}
                    value={liveExpenses[key]}
                    onChange={e => setLiveExpenses(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                    onBlur={() => setLiveExpenseEditing(null)}
                    onKeyDown={e => { if (e.key === 'Enter') setLiveExpenseEditing(null); }}
                  />
                ) : (
                  <button
                    onClick={() => setLiveExpenseEditing(key)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right', padding: 0 }}
                  >
                    <span style={{ color: theme.text, fontSize: '0.9rem', fontWeight: '600' }}>
                      ${Math.round(parseFloat(val) || 0).toLocaleString()}
                    </span>
                    <span style={{ color: theme.textDimmed, fontSize: '0.75rem', marginLeft: '0.35rem' }}>edit</span>
                  </button>
                )}
              </div>
            );
          })}
        </motion.div>

        <motion.button
          custom={2} variants={staggerChild} initial="hidden" animate="visible"
          style={s.bigButton}
          onClick={() => setStep(14)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Lock it in
        </motion.button>
      </div>
    );
  };

  // ─── Step 13: Budget Splits ────────────────────────────────────────────────

  const renderSplits = () => {
    const g = parseFloat(splitGive) * 100 || 20;
    const sv = parseFloat(splitSave) * 100 || 20;
    const income1Amt = parseFloat(editedIncome[0]?.amount) || 0;
    const personalAmt = income1Amt > 0 ? Math.max(0, income1Amt - income1Amt * (g / 100) - income1Amt * (sv / 100) - parseFloat(person1Live || 0)) / 2 : null;

    const fieldStyle = {
      display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem',
    };
    const labelStyle = { color: theme.textMuted, fontSize: '0.8rem', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase' };
    const inputStyle = {
      background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: '0.5rem',
      color: theme.text, padding: '0.6rem 0.75rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box',
    };

    return (
      <div style={{ ...s.content, justifyContent: 'flex-start', paddingTop: '1.5rem' }}>
        <h1 style={{ ...s.heading, fontSize: '1.4rem', marginBottom: '0.25rem' }}>How do you split each paycheck?</h1>
        <p style={{ ...s.subtext, fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Set your Give First, Save Second percentages and how much goes to shared expenses each paycheck.
        </p>

        <div style={{ width: '100%', display: 'flex', gap: '1rem' }}>
          <div style={{ ...fieldStyle, flex: 1 }}>
            <label style={labelStyle}>Give %</label>
            <input
              style={inputStyle}
              type="number"
              min="0" max="99" step="1"
              value={Math.round(parseFloat(splitGive) * 100) || 20}
              onChange={e => setSplitGive(parseFloat(e.target.value) / 100 || 0)}
            />
          </div>
          <div style={{ ...fieldStyle, flex: 1 }}>
            <label style={labelStyle}>Save %</label>
            <input
              style={inputStyle}
              type="number"
              min="0" max="99" step="1"
              value={Math.round(parseFloat(splitSave) * 100) || 20}
              onChange={e => setSplitSave(parseFloat(e.target.value) / 100 || 0)}
            />
          </div>
        </div>

        {g + sv >= 100 && (
          <p style={{ color: theme.danger, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            Give + Save must be less than 100%
          </p>
        )}

        <div style={fieldStyle}>
          <label style={labelStyle}>{person1Name || 'Your'} LIVE contribution per paycheck ($)</label>
          <input
            style={inputStyle}
            type="number"
            min="0"
            value={person1Live}
            onChange={e => setPerson1Live(e.target.value)}
            placeholder="e.g. 984"
          />
        </div>

        {isJointBudget && (
          <div style={fieldStyle}>
            <label style={labelStyle}>{person2Name || "Partner's"} LIVE contribution per paycheck ($)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              value={person2Live}
              onChange={e => setPerson2Live(e.target.value)}
              placeholder="e.g. 656"
            />
          </div>
        )}

        {income1Amt > 0 && parseFloat(person1Live) > 0 && g + sv < 100 && (
          <div style={{ ...s.card, width: '100%', boxSizing: 'border-box', marginTop: '0.5rem' }}>
            <p style={{ color: theme.textMuted, fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Preview — from your ${income1Amt.toFixed(2)} paycheck
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Give', value: (income1Amt * g / 100).toFixed(0), color: theme.give },
                { label: 'Save', value: (income1Amt * sv / 100).toFixed(0), color: theme.save },
                { label: 'LIVE', value: parseFloat(person1Live).toFixed(0), color: theme.live },
                { label: 'Personal', value: personalAmt !== null ? personalAmt.toFixed(0) : '—', color: theme.mat },
              ].map(pill => (
                <span key={pill.label} style={{
                  background: `${pill.color}22`, color: pill.color,
                  borderRadius: '1rem', padding: '0.25rem 0.6rem',
                  fontSize: '0.8rem', fontWeight: '600',
                }}>
                  {pill.label}: ${pill.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Step 14: Done ─────────────────────────────────────────────────────────

  const renderDone = () => (
    <div style={s.content}>
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div style={{ ...s.checkmark, width: '64px', height: '64px' }}>
          <motion.svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <motion.path
              d="M6 12L10 16L18 8"
              stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            />
          </motion.svg>
        </div>
      </motion.div>

      <motion.h1
        style={s.heading}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        You're all set{person1Name ? `, ${person1Name}` : ''}!
      </motion.h1>
      <motion.p
        style={s.subtext}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        {connectedCount > 0
          ? `${connectedCount} account${connectedCount > 1 ? 's' : ''} connected, balances synced, and transactions imported. Flip is ready to help you manage your money.`
          : 'Your accounts are connected and synced. Flip is ready to help you manage your money.'}
      </motion.p>
      <motion.button
        style={s.bigButton}
        onClick={handleComplete}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
      >
        Let's see your finances
      </motion.button>
    </div>
  );

  // ─── Step Router ──────────────────────────────────────────────────────────

  const renderStep = () => {
    if (step <= 3) return renderWelcomeSlide();
    switch (step) {
      case 4:  return renderPrivacy();
      case 5:  return renderNames();
      case 6:  return renderConnect();
      case 7:  return renderCelebration();
      case 8:  return renderMappingExplainer();
      case 9:  return renderMap();
      case 10: return renderSync();
      case 11: return renderLiveAnalyze();
      case 12: return renderLiveReview();
      case 13: return renderLiveNumber();
      case 14: return renderSplits();
      case 15: return renderDone();
      default: return null;
    }
  };

  // ─── Navigation Bar ───────────────────────────────────────────────────────

  const renderNav = () => {
    // Hide back on steps that auto-advance or have their own primary action button
    const showBack = step > 0 && step !== 7 && step !== 10 && step !== 11 && step !== 12 && step !== 15;
    // Hide next on steps with their own buttons (map saves, cards use Yes/No, live number uses "Lock it in", done uses "Let's go")
    const showNext = step !== 9 && step !== 12 && step !== 13 && step !== 15;
    const nextEnabled = canGoNext();
    const nextLabel = step <= 3 ? 'Next' : 'Continue';

    return (
      <div style={s.nav}>
        <div style={{ minWidth: '100px' }}>
          {showBack && (
            <button onClick={goBack} style={s.navButton(false)}>Back</button>
          )}
        </div>
        <div />
        <div style={{ minWidth: '100px', textAlign: 'right' }}>
          {showNext && (
            <button
              onClick={goNext}
              disabled={!nextEnabled}
              style={{ ...s.navButton(true), ...(nextEnabled ? {} : s.navButtonDisabled) }}
            >{nextLabel}</button>
          )}
        </div>
      </div>
    );
  };

  // ─── Main Render ──────────────────────────────────────────────────────────

  return (
    <div style={s.container}>
      <style>{`
        @keyframes onboarding-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {renderStepper()}

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>

      {renderNav()}
      {renderPrivacyModal()}

      {isTestMode && onTestReset && (
        <div style={{ textAlign: 'center', paddingBottom: '1rem' }}>
          <button
            onClick={() => { clearStep(); onTestReset(); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#f59e0b',
              fontSize: '0.75rem',
              cursor: 'pointer',
              opacity: 0.7,
              textDecoration: 'underline',
            }}
          >
            ↩ Reset test data &amp; start over
          </button>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
