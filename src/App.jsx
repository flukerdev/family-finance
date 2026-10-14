import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import PlaidLink from './components/PlaidLink';
import AccountMappingUI from './components/AccountMappingUI';
import BalanceChart from './components/BalanceChart';
import CreditCardChart from './components/CreditCardChart';
import NetPositionChart from './components/NetPositionChart';
import SafeToSpendChart from './components/SafeToSpendChart';
import BudgetHealthChart from './components/BudgetHealthChart';
import Onboarding from './components/Onboarding';
import CloseView from './components/CloseView';
import { API_URL } from './api';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Missing env vars used to throw inside createClient and leave a blank white page.
// Fail loudly instead so a misconfigured deploy says what is wrong.
const MISSING_ENV = [!supabaseUrl && 'VITE_SUPABASE_URL', !supabaseKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean);
if (MISSING_ENV.length) {
  document.body.innerHTML = `<div style="font-family:Inter,system-ui,sans-serif;padding:2rem;max-width:520px;margin:10vh auto;color:#FFFFE3;background:#4A4A4A;border-radius:12px">
    <h2 style="margin:0 0 .5rem">Flip is not configured</h2>
    <p>Missing environment variable${MISSING_ENV.length > 1 ? 's' : ''}: <code>${MISSING_ENV.join('</code>, <code>')}</code>.</p>
    <p style="opacity:.8">Add them in Vercel → Project → Settings → Environment Variables, then redeploy. Vite bakes these in at build time, so a redeploy is required after adding them.</p>
  </div>`;
  throw new Error(`Missing env: ${MISSING_ENV.join(', ')}`);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// API base URL. In production the Express app is deployed as a Vercel function on the
// same origin (see api/index.js + vercel.json), so the default is '' (same-origin /api).
// Local dev talks to `npm run server` on :3001. VITE_API_URL overrides both.

// Test mode detection — activates sandbox Plaid (free), skips OTP, shows reset button.
// ONLY works on localhost with ?testmode in the URL. Ignored on production (Vercel).
const isTestMode = typeof window !== 'undefined'
  && window.location.hostname === 'localhost'
  && new URLSearchParams(window.location.search).has('testmode');

// Authenticated fetch helper — automatically includes the Supabase JWT
// in the Authorization header so the Express server can verify the user.
// In test mode, also sends X-Test-Mode header so the server uses sandbox Plaid.
const authFetch = async (url, options = {}) => {
  const { data: { session: s } } = await supabase.auth.getSession();
  const token = s?.access_token;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(isTestMode ? { 'X-Test-Mode': 'true' } : {}),
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

// ─── Theme System (light/dark, powder blue accent) ───────────────────────────────────────────────────
// The app used to have hardcoded hex colors everywhere (#0f172a, #1e293b, etc).
// Now we define a theme object with semantic tokens so the entire UI can switch
// between light/dark modes and even let developers tweak the base palette.

const themes = {
  dark: {
    bg: '#0F1115',            // near-black
    cardBg: '#171A20',
    cardBgElevated: '#1F242C',
    border: '#2A3038',
    text: '#E8ECF1',
    textMuted: '#A3ADBA',
    textDimmed: '#6B7684',
    accent: '#8FB8DE',        // powder blue
    onAccent: '#0F1115',
    success: '#5FB58A',
    danger: '#E07A7A',
    warning: '#D9A75B',
    // Buckets
    give: '#B4A7E5', save: '#6CC29A', live: '#8FB8DE',
    mat: '#4D8BE8', mara: '#E8A0B4',
    dangerBg: 'rgba(224, 122, 122, 0.14)',
    successBg: 'rgba(95, 181, 138, 0.14)',
    accentBg: 'rgba(143, 184, 222, 0.14)',
    dangerLight: '#F0A3A3',
    successLight: '#9ADBB8',
  },
  light: {
    bg: '#F6F8FB',
    cardBg: '#FFFFFF',
    cardBgElevated: '#EEF2F7',
    border: '#DCE3EC',
    text: '#121820',
    textMuted: '#5B6673',
    textDimmed: '#98A3B1',
    accent: '#3F84CC',        // powder blue, deepened for contrast on white
    onAccent: '#FFFFFF',
    success: '#2E9E6B',
    danger: '#D2544F',
    warning: '#C58A1F',
    give: '#7C6BC9', save: '#2E9E6B', live: '#3F84CC',
    mat: '#2D64C2', mara: '#C4607F',
    dangerBg: 'rgba(210, 84, 79, 0.10)',
    successBg: 'rgba(46, 158, 107, 0.10)',
    accentBg: 'rgba(63, 132, 204, 0.10)',
    dangerLight: '#B4443F',
    successLight: '#237D55',
  }
};

const DEFAULT_FONTS = { body: 'Inter', heading: 'Inter', baseSize: 16, headingWeight: '700' };

// Creates the full styles object using the active theme's color tokens.
// This replaces ~1400 lines of hardcoded hex colors with semantic theme references.
const createStyles = (theme, fonts = DEFAULT_FONTS) => ({
  container: {
    minHeight: '100vh',
    backgroundColor: theme.bg,
    color: theme.text,
    fontFamily: `'${fonts.body}', -apple-system, BlinkMacSystemFont, sans-serif`,
    fontSize: `${fonts.baseSize}px`,
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
    border: `3px solid ${theme.cardBg}`,
    borderTopColor: theme.accent,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: theme.textMuted,
    fontSize: '0.875rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    borderBottom: `1px solid ${theme.cardBg}`,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: fonts.headingWeight,
    fontFamily: `'${fonts.heading}', -apple-system, BlinkMacSystemFont, sans-serif`,
    margin: 0,
    letterSpacing: '-0.025em',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: theme.textDimmed,
    margin: '0.25rem 0 0',
  },
  nav: {
    display: 'flex',
    gap: '0.5rem',
    padding: '1rem',
    justifyContent: 'center',
    borderBottom: `1px solid ${theme.cardBg}`,
  },
  navButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: theme.border,
    borderRadius: '0.5rem',
    color: theme.textMuted,
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  navButtonActive: {
    backgroundColor: theme.cardBg,
    borderColor: theme.accent,
    color: theme.text,
  },
  main: {
    padding: '1rem 1rem 5rem',
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
    fontWeight: fonts.headingWeight,
    fontFamily: `'${fonts.heading}', -apple-system, BlinkMacSystemFont, sans-serif`,
    lineHeight: 1,
  },
  scoreLabel: {
    display: 'block',
    fontSize: '0.75rem',
    color: theme.textMuted,
    marginTop: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  lastUpdated: {
    fontSize: '0.75rem',
    color: theme.textDimmed,
    marginTop: '1rem',
  },
  sectionTitle: {
    fontSize: '0.875rem',
    fontWeight: fonts.headingWeight,
    fontFamily: `'${fonts.heading}', -apple-system, BlinkMacSystemFont, sans-serif`,
    color: theme.textMuted,
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
  },
  collapseIcon: {
    fontSize: '0.75rem',
    color: theme.textDimmed,
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
    backgroundColor: theme.cardBg,
    borderRadius: '0.5rem',
    borderLeft: `3px solid ${theme.accent}`,
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
    color: theme.text,
  },
  suggestionGain: {
    fontSize: '0.75rem',
    fontWeight: '700',
    color: theme.accent,
    backgroundColor: theme.accentBg,
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
  },
  suggestionText: {
    fontSize: '0.875rem',
    color: theme.textMuted,
    marginBottom: '0.75rem',
    lineHeight: '1.4',
  },
  suggestionProgress: {
    marginBottom: '0.5rem',
  },
  suggestionCurrent: {
    fontSize: '0.75rem',
    color: theme.textMuted,
  },
  suggestionDetails: {
    marginTop: '0.5rem',
    paddingTop: '0.5rem',
    borderTop: `1px solid ${theme.border}`,
    fontSize: '0.75rem',
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  scorePreview: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem',
    backgroundColor: theme.bg,
    borderRadius: '0.375rem',
    marginBottom: '0.75rem',
    gap: '0.5rem',
    border: `1px solid ${theme.accent}`,
  },
  scorePreviewRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: theme.textMuted,
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
    color: theme.accent,
    fontWeight: '700',
  },
  alertsSection: {
    marginBottom: '1.5rem',
  },
  alert: {
    padding: '0.75rem 1rem',
    backgroundColor: theme.cardBg,
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
    borderTop: `1px solid ${theme.dangerBg}`,
    fontSize: '0.75rem',
    color: theme.dangerLight,
    fontStyle: 'italic',
  },
  calculationPre: {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '0.8125rem',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    margin: 0,
    padding: '0.75rem',
    backgroundColor: `${theme.bg}80`,
    borderRadius: '0.375rem',
    fontStyle: 'italic',
  },
  calculationBox: {
    marginTop: '0.75rem',
    padding: '0.75rem',
    backgroundColor: theme.bg,
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
    backgroundColor: theme.successBg,
    borderRadius: '0.5rem',
    borderLeft: `3px solid ${theme.success}`,
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    color: theme.successLight,
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
    borderTop: `1px solid ${theme.success}`,
    fontSize: '0.75rem',
    color: theme.successLight,
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
    backgroundColor: theme.cardBg,
    borderRadius: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  linkedCardIndicator: {
    fontSize: '0.625rem',
    color: theme.textDimmed,
    paddingLeft: '1rem',
    fontStyle: 'italic',
  },
  linkedCard: {
    marginLeft: '1rem',
    padding: '0.75rem',
    backgroundColor: theme.bg,
    borderRadius: '0.5rem',
    borderLeft: `3px solid ${theme.border}`,
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
    color: theme.textMuted,
  },
  linkedCardDue: {
    fontSize: '0.625rem',
    color: theme.textDimmed,
  },
  linkedCardBalances: {
    display: 'flex',
    gap: '0.5rem',
  },
  linkedCardBalanceItem: {
    flex: 1,
    padding: '0.5rem',
    backgroundColor: theme.cardBg,
    borderRadius: '0.375rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  linkedCardLabel: {
    fontSize: '0.625rem',
    color: theme.textDimmed,
    textTransform: 'uppercase',
  },
  linkedCardValue: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: theme.text,
  },
  linkedCardPaidBadge: {
    fontSize: '0.625rem',
    color: theme.success,
    backgroundColor: theme.successBg,
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    textAlign: 'center',
  },
  disposableIncomeSection: {
    marginTop: '0.75rem',
    padding: '0.5rem',
    backgroundColor: theme.bg,
    borderRadius: '0.375rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  disposableLabel: {
    fontSize: '0.625rem',
    color: theme.textMuted,
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
    backgroundColor: theme.bg,
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
  },
  disposableDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    color: theme.textMuted,
  },
  disposableSubDetail: {
    fontSize: '0.625rem',
    color: theme.textDimmed,
    marginLeft: '1rem',
    marginBottom: '0.5rem',
    fontStyle: 'italic',
  },
  disposableDivider: {
    height: '1px',
    backgroundColor: theme.border,
    margin: '0.75rem 0',
  },
  disposableTotalLabel: {
    fontWeight: '600',
    color: theme.text,
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
    backgroundColor: theme.cardBg,
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
    color: theme.textDimmed,
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
    backgroundColor: theme.bg,
    borderRadius: '0.375rem',
  },
  creditCardBalanceLabel: {
    fontSize: '0.625rem',
    color: theme.textDimmed,
    textTransform: 'uppercase',
  },
  creditCardBalanceValue: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: theme.text,
  },
  creditCardPaidBadge: {
    fontSize: '0.625rem',
    color: theme.success,
    backgroundColor: theme.successBg,
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    textAlign: 'center',
  },
  creditCardPaidBy: {
    fontSize: '0.625rem',
    color: theme.textDimmed,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  creditCardInsufficientFunds: {
    fontSize: '0.75rem',
    color: theme.danger,
    backgroundColor: theme.dangerBg,
    padding: '0.5rem',
    borderRadius: '0.375rem',
    textAlign: 'center',
    fontWeight: '600',
    border: `1px solid ${theme.danger}`,
  },
  creditCardPaymentInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.5rem',
    backgroundColor: theme.bg,
    borderRadius: '0.375rem',
  },
  creditCardFullyPaid: {
    backgroundColor: theme.successBg,
    border: `2px solid ${theme.success}`,
    boxShadow: `0 0 15px ${theme.successBg}`,
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
    color: theme.success,
    letterSpacing: '0.1em',
  },
  celebrationSubtext: {
    fontSize: '0.75rem',
    color: theme.textDimmed,
  },
  paymentAbilitySection: {
    marginTop: '0.75rem',
    padding: '0.75rem',
    backgroundColor: theme.bg,
    borderRadius: '0.375rem',
  },
  abilityTitle: {
    fontSize: '0.625rem',
    color: theme.textMuted,
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
    color: theme.textMuted,
    minWidth: '70px',
  },
  abilityBarContainer: {
    flex: 1,
    height: '12px',
    backgroundColor: theme.cardBg,
    borderRadius: '6px',
    overflow: 'hidden',
    border: `1px solid ${theme.border}`,
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
  budgetHealthSectionLarge: {
    marginBottom: '2rem',
    padding: '1.5rem',
    backgroundColor: theme.cardBg,
    borderRadius: '0.75rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
  },
  budgetHealthTitle: {
    fontSize: '1.125rem',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  budgetHealthScoreRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: '0.25rem',
    marginBottom: '0.5rem',
  },
  budgetHealthScoreCircle: {
    fontSize: '2.5rem',
    fontWeight: '700',
    lineHeight: '1',
  },
  budgetHealthAmount: {
    fontSize: '2rem',
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: '1',
  },
  budgetHealthLabel: {
    fontSize: '0.875rem',
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
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
    backgroundColor: theme.cardBg,
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
    color: theme.warning,
  },
  anticipatedPaidBadge: {
    fontSize: '0.75rem',
    color: theme.success,
    backgroundColor: theme.successBg,
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
  },
  anticipatedEarlyBadge: {
    fontSize: '0.625rem',
    color: theme.successLight,
    backgroundColor: theme.successBg,
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
    color: theme.success,
    fontWeight: '500',
  },
  anticipatedDateRed: {
    fontSize: '0.75rem',
    color: theme.danger,
    fontWeight: '500',
  },
  anticipatedDue: {
    fontSize: '0.75rem',
    color: theme.textDimmed,
  },
  anticipatedDetailsBox: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    backgroundColor: theme.bg,
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  balancesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
  },
  balanceCard: {
    padding: '1rem',
    backgroundColor: theme.cardBg,
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
    backgroundColor: theme.cardBg,
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
    color: theme.warning,
  },
  cardDue: {
    fontSize: '0.75rem',
    color: theme.textDimmed,
  },
  cardItemBalances: {
    display: 'flex',
    gap: '0.75rem',
  },
  cardBalanceItem: {
    flex: 1,
    padding: '0.5rem',
    backgroundColor: theme.bg,
    borderRadius: '0.375rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  cardBalanceLabel: {
    fontSize: '0.625rem',
    color: theme.textDimmed,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  cardBalanceValue: {
    fontSize: '1rem',
    fontWeight: '600',
  },
  cardPaidBadge: {
    fontSize: '0.75rem',
    color: theme.success,
    backgroundColor: theme.successBg,
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
    borderBottom: `1px solid ${theme.cardBg}`,
  },
  timelineDate: {
    width: '80px',
    flexShrink: 0,
  },
  timelineDays: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: theme.accent,
  },
  timelineDateText: {
    display: 'block',
    fontSize: '0.75rem',
    color: theme.textDimmed,
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
    color: theme.textDimmed,
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
  },
  inputGroup: {
    marginBottom: '1.5rem',
  },
  inputGroupTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: theme.text,
    marginBottom: '1rem',
  },
  inputHint: {
    fontSize: '0.75rem',
    color: theme.textDimmed,
    marginBottom: '1rem',
    marginTop: '-0.5rem',
  },
  cardInputGroup: {
    marginBottom: '1.5rem',
    padding: '1rem',
    backgroundColor: theme.cardBg,
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
    color: theme.text,
  },
  cardInputDue: {
    fontSize: '0.75rem',
    color: theme.textDimmed,
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
    color: theme.textMuted,
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
    color: theme.textMuted,
  },
  inputWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: theme.cardBg,
    borderRadius: '0.5rem',
    padding: '0 0.75rem',
  },
  inputPrefix: {
    color: theme.textDimmed,
    marginRight: '0.25rem',
  },
  input: {
    flex: 1,
    padding: '0.75rem 0',
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.text,
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
    backgroundColor: theme.accent,
    border: 'none',
    borderRadius: '0.75rem',
    color: theme.onAccent,
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
    backgroundColor: theme.cardBg,
    borderRadius: '0.75rem',
  },
  reportPeriod: {
    fontSize: '0.75rem',
    color: theme.textDimmed,
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
    backgroundColor: theme.bg,
    borderRadius: '0.375rem',
  },
  reportChangeLabel: {
    fontSize: '0.875rem',
    color: theme.textMuted,
  },
  reportChangeValue: {
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  detailsButton: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    backgroundColor: theme.cardBg,
    border: `1px solid ${theme.border}`,
    borderRadius: '0.5rem',
    color: theme.textMuted,
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'block',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  detailsButtonSmall: {
    padding: '0.25rem 0.5rem',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '0.25rem',
    color: theme.textDimmed,
    fontSize: '0.625rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  detailsBox: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: theme.bg,
    borderRadius: '0.5rem',
    border: `1px solid ${theme.border}`,
  },
  detailsTitle: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: theme.textMuted,
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  detailsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: theme.textMuted,
    marginBottom: '0.5rem',
  },
  detailsSubtext: {
    fontSize: '0.625rem',
    color: theme.textDimmed,
    marginBottom: '0.75rem',
    fontStyle: 'italic',
  },
  detailsDivider: {
    height: '1px',
    backgroundColor: theme.border,
    margin: '0.75rem 0',
  },
  detailsTotalLabel: {
    fontWeight: '600',
    color: theme.text,
  },
  detailsTotalValue: {
    fontWeight: '700',
    color: theme.accent,
    fontSize: '0.875rem',
  },
  budgetHealthDetails: {
    padding: '1rem',
    backgroundColor: theme.bg,
    borderRadius: '0.5rem',
    border: `1px solid ${theme.success}`,
  },
  budgetHealthDetailsTitle: {
    fontSize: '0.75rem',
    fontWeight: '600',
    marginBottom: '0.75rem',
  },
  budgetHealthDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    marginBottom: '0.5rem',
  },
  noData: {
    color: theme.textDimmed,
    fontSize: '0.875rem',
    padding: '1rem',
    textAlign: 'center',
    backgroundColor: theme.cardBg,
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
    backgroundColor: theme.cardBg,
    borderRadius: '0.5rem',
  },
  historyDate: {
    fontSize: '0.875rem',
    color: theme.textMuted,
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
    backgroundColor: theme.cardBg,
    padding: '1.5rem',
    borderRadius: '0.5rem',
  },
  settingsSectionTitle: {
    fontSize: '1rem',
    fontWeight: fonts.headingWeight,
    fontFamily: `'${fonts.heading}', -apple-system, BlinkMacSystemFont, sans-serif`,
    marginBottom: '1rem',
    color: theme.text,
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
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  settingsInput: {
    padding: '0.75rem',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '0.375rem',
    color: theme.text,
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
    backgroundColor: theme.accent,
    border: 'none',
    borderRadius: '0.5rem',
    color: theme.onAccent,
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  resetButton: {
    padding: '0.75rem 2rem',
    backgroundColor: theme.danger,
    border: 'none',
    borderRadius: '0.5rem',
    color: theme.onAccent,
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
    backgroundColor: theme.give,
    border: 'none',
    borderRadius: '0.75rem',
    color: theme.onAccent,
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: `0 4px 6px ${theme.accentBg}`,
  },
  connectedAccountItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    backgroundColor: theme.cardBg,
    borderRadius: '0.5rem',
    marginBottom: '0.5rem',
    color: theme.text,
  },
  // ─── Theme Editor styles ────────────────────────────────────────────────────
  settingsTabBar: {
    display: 'flex',
    borderBottom: `1px solid ${theme.border}`,
    marginBottom: '1rem',
  },
  settingsTab: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: theme.textMuted,
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
  },
  settingsTabActive: {
    color: theme.text,
    borderBottomColor: theme.accent,
  },
  colorGroupTitle: {
    fontSize: '0.75rem',
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '1.25rem',
    marginBottom: '0.5rem',
    paddingBottom: '0.375rem',
    borderBottom: `1px solid ${theme.border}`,
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.375rem 0',
  },
  colorSwatch: {
    width: '2rem',
    height: '2rem',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    padding: 0,
    flexShrink: 0,
  },
  colorLabel: {
    fontSize: '0.8125rem',
    color: theme.text,
    minWidth: '120px',
    flexShrink: 0,
  },
  colorHexInput: {
    flex: 1,
    padding: '0.375rem 0.5rem',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '0.375rem',
    color: theme.text,
    fontSize: '0.75rem',
    fontFamily: 'monospace',
  },
  resetIconButton: {
    background: 'none',
    border: 'none',
    color: theme.textDimmed,
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.25rem',
    lineHeight: 1,
    flexShrink: 0,
  },
  analyticsMain: {
    padding: '1rem',
    maxWidth: '800px',
    margin: '0 auto',
  },
  chartCard: {
    backgroundColor: theme.cardBg,
    borderRadius: '0.5rem',
    borderLeft: `3px solid ${theme.accent}`,
    padding: '1rem',
    marginBottom: '1rem',
  },
  chartCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.25rem',
    fontSize: '0.9375rem',
  },
  chartWrapper: {
    minHeight: '200px',
  },
  loadingScreen: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.bg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  coinContainer: {
    perspective: '400px',
    width: '80px',
    height: '80px',
    marginBottom: '1.5rem',
  },
  coin: {
    width: '80px',
    height: '80px',
    position: 'relative',
    transformStyle: 'preserve-3d',
    animation: 'coinFlip 1.2s ease-in-out infinite',
  },
  coinFront: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    backgroundColor: theme.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
    fontWeight: '700',
    color: theme.onAccent,
    backfaceVisibility: 'hidden',
    boxShadow: `0 4px 20px ${theme.accentBg}`,
  },
  coinBack: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    backgroundColor: theme.success,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
    fontWeight: '700',
    color: theme.onAccent,
    backfaceVisibility: 'hidden',
    transform: 'rotateY(180deg)',
    boxShadow: `0 4px 20px ${theme.successBg}`,
  },
  loadingBrand: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: theme.text,
    letterSpacing: '-0.025em',
  },
  hamburgerButton: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    width: '40px',
    alignItems: 'center',
  },
  hamburgerLine: {
    display: 'block',
    width: '20px',
    height: '2px',
    backgroundColor: theme.textMuted,
    borderRadius: '1px',
  },
  menuOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 100,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  menuPanel: {
    width: '85%',
    maxWidth: '380px',
    height: '100%',
    backgroundColor: theme.bg,
    borderLeft: `1px solid ${theme.cardBg}`,
    overflowY: 'auto',
    animation: 'slideInRight 0.25s ease-out',
  },
  menuHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    borderBottom: `1px solid ${theme.cardBg}`,
  },
  menuCloseButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.textMuted,
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '0.5rem',
  },
  menuBackButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.accent,
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '0.5rem',
  },
  menuItem: {
    display: 'block',
    width: '100%',
    padding: '1rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${theme.cardBg}`,
    color: theme.text,
    fontSize: '1rem',
    textAlign: 'left',
    cursor: 'pointer',
  },
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    gap: '1.5rem',
    padding: '0.5rem 0 1.25rem',
    backgroundColor: theme.bg,
    borderTop: `1px solid ${theme.cardBg}`,
    zIndex: 50,
  },
  bottomNavButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.25rem 1rem',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.6875rem',
    fontWeight: '600',
    transition: 'color 0.2s',
  },
  accountsMain: {
    padding: '1rem 1rem 5rem',
    maxWidth: '600px',
    margin: '0 auto',
  },
  accountListCard: {
    backgroundColor: theme.cardBg,
    borderRadius: '0.75rem',
    overflow: 'hidden',
  },
  accountListItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '1rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${theme.border}`,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.15s',
  },
  slideOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 100,
  },
  slidePanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '100%',
    maxWidth: '500px',
    height: '100%',
    backgroundColor: theme.bg,
    borderLeft: `1px solid ${theme.cardBg}`,
    overflowY: 'auto',
    animation: 'slideInRight 0.25s ease-out',
  },
  slidePanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    borderBottom: `1px solid ${theme.cardBg}`,
  },
  transactionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: `1px solid ${theme.cardBg}`,
  },
  transactionDateHeader: {
    padding: '0.5rem 1rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: theme.textDimmed,
    backgroundColor: theme.bg,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  },
  transactionAmount: {
    fontWeight: '600',
    fontSize: '0.9375rem',
    fontVariantNumeric: 'tabular-nums',
  },
  accountTag: {
    display: 'inline-block',
    fontSize: '0.625rem',
    fontWeight: '600',
    padding: '0.125rem 0.5rem',
    borderRadius: '999px',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    marginTop: '0.25rem',
  },
  filterBar: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    alignItems: 'center',
    borderBottom: `1px solid ${theme.cardBg}`,
  },
  filterSelect: {
    backgroundColor: theme.cardBg,
    color: theme.text,
    border: `1px solid ${theme.border || theme.cardBg}`,
    borderRadius: '0.5rem',
    padding: '0.375rem 0.75rem',
    fontSize: '0.8125rem',
    flex: 1,
  },
});

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
  statementCloseDates: {
    blue: 14,      // Blue closes 14th → due 8th next month
    gold: 21,      // Gold closes 21st → due 15th next month
    discover: 25,  // Discover closes ~25th → due 2nd next month
  },
  monthlyBills: {
    rent: 2135,
    insurance: 28,
    gym: 100,
    dateNights: 200,
    power: 120,
    groceries: 500, // 125 * 4 weeks
    gas: 270, // 67.5 * 4 weeks
    subscriptions: 0,
  },
  person1Name: 'Mat',
  person2Name: 'Mara',
  isJointBudget: true,
  payday1Anchor: null,
  payday1Frequency: 'biweekly',
  payday2Anchor: null,
  payday2Frequency: 'biweekly',
};

export default function App() {
  // ─── Auth state ───────────────────────────────────────────────────────────
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  // OTP verification state — used for email OTP (SMS OTP will be added when Twilio is configured)
  // otpPending: whether we're waiting for the user to enter an OTP code
  // otpPurpose: what triggered the OTP challenge — controls what happens after verification
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpPending, setOtpPending] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState(null); // 'signup' | 'plaid' | null
  const [otpCooldown, setOtpCooldown] = useState(0); // countdown seconds for resend button
  const [signupConsent, setSignupConsent] = useState(false); // privacy/TOS checkbox during signup
  const [policyPopup, setPolicyPopup] = useState(null); // null | 'privacy' | 'terms'
  const [disconnectingItem, setDisconnectingItem] = useState(null); // item_id being confirmed for disconnect
  const [deleteConfirm, setDeleteConfirm] = useState(false); // shows "are you sure?" dialog
  const [deleteOtpSent, setDeleteOtpSent] = useState(false); // OTP sent for account deletion
  const [deleting, setDeleting] = useState(false); // deletion in progress

  // Check for existing session on load, listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');

    if (authMode === 'signup') {
      if (!signupConsent) {
        setAuthError('You must accept the Privacy Policy and Terms of Service to create an account.');
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) {
        setAuthError(error.message);
      } else if (isTestMode) {
        // Test mode: skip OTP verification — sign in directly with password.
        // The test account must have its email pre-confirmed in Supabase dashboard.
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (signInErr) {
          setAuthError('Test mode auto-login failed: ' + signInErr.message);
        }
      } else {
        // After successful signup, send an email OTP to verify their email address.
        // This serves as the 2FA step required by Plaid (Q4).
        const { error: otpErr } = await supabase.auth.signInWithOtp({ email: authEmail });
        if (otpErr) {
          setAuthError('Account created but failed to send verification code: ' + otpErr.message);
        } else {
          setOtpPending(true);
          setOtpPurpose('signup');
          setOtpCooldown(60);
          setAuthMessage('');
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) {
        setAuthError(error.message);
      }
    }
  };

  // Send an email OTP code — used before sensitive actions (Plaid Link, account deletion)
  const sendEmailOtp = async (purpose) => {
    setOtpError('');
    const email = session?.user?.email;
    if (!email) {
      setOtpError('No email address found on your account.');
      return false;
    }
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setOtpError('Failed to send verification code: ' + error.message);
      return false;
    }
    setOtpPending(true);
    setOtpPurpose(purpose);
    setOtpCode('');
    setOtpCooldown(60);
    return true;
  };

  // Verify the OTP code the user entered
  const verifyEmailOtp = async (e) => {
    e.preventDefault();
    setOtpError('');
    const email = otpPurpose === 'signup' ? authEmail : session?.user?.email;
    if (!email) {
      setOtpError('No email address found.');
      return;
    }
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: 'email',
    });
    if (error) {
      setOtpError('Invalid or expired code. Please try again.');
      return;
    }
    // Success — verifyOtp returns a session, update our state
    if (data?.session) {
      setSession(data.session);
    }
    setOtpPending(false);
    setOtpCode('');

    if (otpPurpose === 'signup') {
      // Record privacy/TOS consent that was checked during signup
      // We do this after OTP verification because we now have a valid session
      grantSignupConsent();
    } else if (otpPurpose === 'plaid') {
      // Signal that Plaid OTP verification passed — handled in the Plaid gate
      setPlaidOtpVerified(true);
    } else if (otpPurpose === 'delete') {
      // OTP verified for account deletion — proceed with deletion
      handleDeleteAccount();
    }
    setOtpPurpose(null);
  };

  // Countdown timer for OTP resend cooldown
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => setOtpCooldown(otpCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setOtpPending(false);
    setOtpPurpose(null);
    setMenuOpen(false);
  };

  // Delete the user's account — revokes Plaid tokens, deletes all data, removes auth user.
  // This is irreversible. The frontend gates this behind a confirmation dialog + email OTP.
  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const response = await authFetch(`${API_URL}/api/account`, { method: 'DELETE' });
      const result = await response.json();
      if (response.ok && result.success) {
        // Account deleted — sign out and reset state
        await supabase.auth.signOut();
        setSession(null);
        setDeleteConfirm(false);
        setDeleteOtpSent(false);
        setDeleting(false);
      } else {
        setOtpError(result.error || 'Failed to delete account.');
        setDeleting(false);
      }
    } catch (error) {
      setOtpError('Error deleting account. Please try again.');
      setDeleting(false);
    }
  };

  // Reset test data — wipes all 7 tables for this user without deleting the auth account.
  // Only available in test mode (?testmode on localhost). After reset, onboarding appears again.
  const handleTestReset = async () => {
    if (!isTestMode) return;
    const confirmed = window.confirm('Reset all test data? This will clear everything and show onboarding again.');
    if (!confirmed) return;

    try {
      const response = await authFetch(`${API_URL}/api/test-reset`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        // Reset local state so the app shows onboarding again
        setOnboardingComplete(false);
        setConnectedAccounts([]);
        setSnapshots([]);
        setConfig(DEFAULT_CONFIG);
        setPlaidMappedTypes(new Set());
        // Reload to cleanly reset everything
        window.location.reload();
      }
    } catch (error) {
      console.error('Test reset failed:', error);
    }
  };

  // Disconnect a single institution — revokes its Plaid token and removes it from the DB
  const handleDisconnectItem = async (itemId) => {
    try {
      const response = await authFetch(`${API_URL}/api/items/${itemId}`, { method: 'DELETE' });
      const result = await response.json();
      if (response.ok && result.success) {
        setMessage('Institution disconnected.');
        setDisconnectingItem(null);
        fetchConnectedAccounts();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to disconnect: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      setMessage('Error disconnecting institution.');
    }
  };

  const [currentView, setCurrentView] = useState('home');
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
  const [expandedDetails, setExpandedDetails] = useState({});
  const [collapsedSections, setCollapsedSections] = useState({
    suggestions: true,     // Ways to Improve - collapsed by default
    alerts: false,          // Attention Needed - open by default
    positives: false,       // Looking Good - open by default
    timeline: true,         // Upcoming - collapsed by default
    anticipated: true       // Anticipated Payments - collapsed by default
  });
  const [hoveredSuggestion, setHoveredSuggestion] = useState(null);
  const [suggestionSlide, setSuggestionSlide] = useState(0);
  const [positiveSlide, setPositiveSlide] = useState(0);
  const [alertSlide, setAlertSlide] = useState(0);
  const [scoreSlide, setScoreSlide] = useState(0);
  const [activeScoreSegment, setActiveScoreSegment] = useState(null);
  const [alertsView, setAlertsView] = useState('alerts'); // 'alerts' | 'positives' — mobile toggle
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 500 : true);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarTooltip, setCalendarTooltip] = useState(null);
  const [activePopup, setActivePopup] = useState(null); // null or { type, data }
  const [tempConfig, setTempConfig] = useState(config);
  const [syncing, setSyncing] = useState(false);
  const mappingRef = useRef(null);
  const [plaidMappedTypes, setPlaidMappedTypes] = useState(new Set());
  const [creditCards, setCreditCards] = useState([]); // from credit_cards table
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [onboardingComplete, setOnboardingComplete] = useState(null); // null=loading, true/false
  const [plaidConsent, setPlaidConsent] = useState(null); // null = loading, true = granted, false = not granted
  const [plaidOtpVerified, setPlaidOtpVerified] = useState(false); // fresh OTP verified for this Plaid Link session
  const [debugMode, setDebugMode] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsFilter, setTransactionsFilter] = useState({ account_type: '', limit: 50, offset: 0 });
  const [transactionsTotal, setTransactionsTotal] = useState(0);

  // ─── Theme state ────────────────────────────────────────────────────────────
  // themeMode: 'dark' or 'light', persisted in localStorage. Palette lives in `themes` above.
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('flipThemeMode') || 'dark');
  const theme = themes[themeMode];
  const fonts = DEFAULT_FONTS;
  const styles = createStyles(theme, fonts);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState('menu'); // 'menu' | 'settings' | 'updateCards'
  const [selectedAccount, setSelectedAccount] = useState(null); // null or { key, type, label, color }

  // Calculate personal splits based on config
  // Helper: convert a date string to relative time (e.g., "2 hours ago")
  const getRelativeTime = (dateStr) => {
    if (!dateStr) return 'Not yet synced';
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

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
      setOnboardingComplete(false);
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
        statementCloseDates: {
          blue: parseInt(dbConfig.statement_close_blue) || 14,
          gold: parseInt(dbConfig.statement_close_gold) || 21,
          discover: parseInt(dbConfig.statement_close_discover) || 25,
        },
        monthlyBills: {
          rent: parseFloat(dbConfig.monthly_rent),
          insurance: parseFloat(dbConfig.monthly_insurance),
          gym: parseFloat(dbConfig.monthly_gym),
          dateNights: parseFloat(dbConfig.monthly_date_nights),
          power: parseFloat(dbConfig.monthly_power),
          groceries: parseFloat(dbConfig.monthly_groceries),
          gas: parseFloat(dbConfig.monthly_gas),
          subscriptions: parseFloat(dbConfig.monthly_subscriptions) || 0,
        }
      };
      loadedConfig.person1Name = dbConfig.person_1_name || 'Person 1';
      loadedConfig.person2Name = dbConfig.person_2_name || 'Person 2';
      loadedConfig.isJointBudget = !!dbConfig.is_joint_budget;
      loadedConfig.payday1Anchor = dbConfig.payday_1_anchor || null;
      loadedConfig.payday1Frequency = dbConfig.payday_1_frequency || 'biweekly';
      loadedConfig.payday2Anchor = dbConfig.payday_2_anchor || null;
      loadedConfig.payday2Frequency = dbConfig.payday_2_frequency || 'biweekly';
      setConfig(loadedConfig);
      setOnboardingComplete(!!dbConfig.onboarding_complete);
    } else {
      setConfig(DEFAULT_CONFIG);
      setOnboardingComplete(false);
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
      statement_close_blue: newConfig.statementCloseDates.blue,
      statement_close_gold: newConfig.statementCloseDates.gold,
      statement_close_discover: newConfig.statementCloseDates.discover,
      monthly_rent: newConfig.monthlyBills.rent,
      monthly_insurance: newConfig.monthlyBills.insurance,
      monthly_gym: newConfig.monthlyBills.gym,
      monthly_date_nights: newConfig.monthlyBills.dateNights,
      monthly_power: newConfig.monthlyBills.power,
      monthly_groceries: newConfig.monthlyBills.groceries,
      monthly_gas: newConfig.monthlyBills.gas,
      updated_at: new Date().toISOString(),
      user_id: session.user.id,
    };

    const { error } = await supabase
      .from('app_config')
      .upsert(configData, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving config:', error);
      setMessage('Error saving settings!');
    } else {
      setConfig(newConfig);
      setMessage('Settings saved!');
    }
  };

  // Mark onboarding as complete and save all financial config discovered during onboarding
  const markOnboardingComplete = async (configUpdates) => {
    const upsertData = {
      user_id: session.user.id,
      onboarding_complete: true,
      person_1_name: configUpdates.person_1_name,
      person_2_name: configUpdates.person_2_name,
      is_joint_budget: configUpdates.is_joint_budget,
    };
    // Only include financial fields if they were provided (non-null)
    if (configUpdates.mat_pay_amount != null) upsertData.mat_pay_amount = configUpdates.mat_pay_amount;
    if (configUpdates.mara_pay_amount != null) upsertData.mara_pay_amount = configUpdates.mara_pay_amount;
    if (configUpdates.payday_1_anchor != null) upsertData.payday_1_anchor = configUpdates.payday_1_anchor;
    if (configUpdates.payday_1_frequency != null) upsertData.payday_1_frequency = configUpdates.payday_1_frequency;
    if (configUpdates.payday_2_anchor != null) upsertData.payday_2_anchor = configUpdates.payday_2_anchor;
    if (configUpdates.payday_2_frequency != null) upsertData.payday_2_frequency = configUpdates.payday_2_frequency;
    if (configUpdates.split_give != null) upsertData.split_give = configUpdates.split_give;
    if (configUpdates.split_save != null) upsertData.split_save = configUpdates.split_save;
    if (configUpdates.split_mat_live != null) upsertData.split_mat_live = configUpdates.split_mat_live;
    if (configUpdates.split_mara_live != null) upsertData.split_mara_live = configUpdates.split_mara_live;
    if (configUpdates.monthly_rent != null) upsertData.monthly_rent = configUpdates.monthly_rent;
    if (configUpdates.monthly_gym != null) upsertData.monthly_gym = configUpdates.monthly_gym;
    if (configUpdates.monthly_power != null) upsertData.monthly_power = configUpdates.monthly_power;
    if (configUpdates.monthly_insurance != null) upsertData.monthly_insurance = configUpdates.monthly_insurance;
    if (configUpdates.monthly_groceries != null) upsertData.monthly_groceries = configUpdates.monthly_groceries;
    if (configUpdates.monthly_gas != null) upsertData.monthly_gas = configUpdates.monthly_gas;
    if (configUpdates.monthly_date_nights != null) upsertData.monthly_date_nights = configUpdates.monthly_date_nights;
    if (configUpdates.monthly_subscriptions != null) upsertData.monthly_subscriptions = configUpdates.monthly_subscriptions;
    const { error } = await supabase
      .from('app_config')
      .upsert(upsertData, { onConflict: 'user_id' });
    if (error) console.error('Error marking onboarding complete:', error);
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

  // Fetch which app_account_types have Plaid mappings (to disable manual card entry for those)
  const fetchPlaidMappings = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/mappings`);
      const data = await response.json();
      if (data.mappings) {
        // Build set of mapped types for both old (app_account_type) and new (card_id) formats
        const types = new Set();
        data.mappings.forEach(m => {
          if (m.app_account_type) types.add(m.app_account_type);
          if (m.card_id) types.add(m.card_id);
        });
        setPlaidMappedTypes(types);
      }
    } catch (error) {
      console.error('Error fetching mappings:', error);
    }
  };

  // Fetch credit cards from the credit_cards table
  const fetchCreditCards = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/credit-cards`);
      const data = await response.json();
      if (data.credit_cards) {
        setCreditCards(data.credit_cards);
      }
    } catch (error) {
      console.error('Error fetching credit cards:', error);
    }
  };

  // Check if the user has already granted Plaid data access consent.
  // Routes through Express so consent checks happen server-side (Plaid Q10).
  const checkPlaidConsent = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/consent?type=plaid_data_access`);
      const result = await response.json();
      if (response.ok) {
        setPlaidConsent(result.granted);
      } else {
        setPlaidConsent(false);
      }
    } catch (error) {
      console.error('Error checking consent:', error);
      setPlaidConsent(false);
    }
  };

  // Record that the user has granted consent for Plaid data access.
  // Routes through Express so consent timestamps are recorded server-side.
  const grantPlaidConsent = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_type: 'plaid_data_access', policy_version: '1.0' }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setPlaidConsent(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error recording consent:', error);
      return false;
    }
  };

  // Record privacy/TOS consent during signup — called after successful account creation
  const grantSignupConsent = async () => {
    try {
      await authFetch(`${API_URL}/api/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_type: 'privacy_policy', policy_version: '1.0' }),
      });
      await authFetch(`${API_URL}/api/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_type: 'terms_of_service', policy_version: '1.0' }),
      });
    } catch (error) {
      console.error('Error recording signup consent:', error);
    }
  };

  // Sync balances from Plaid
  // silent=true skips user-facing messages (used for auto-sync on load)
  // force=true bypasses server-side throttle (used after first mapping save)
  const syncBalances = async (silent = false, force = false) => {
    setSyncing(true);
    if (!silent) setMessage('');
    try {
      const url = force
        ? `${API_URL}/api/sync_balances?force=true`
        : `${API_URL}/api/sync_balances`;
      const response = await authFetch(url, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        if (!silent) setMessage('✅ Balances synced successfully!');
        await fetchSnapshots(true); // silent — don't flash loading spinner during sync
      } else {
        if (!silent) setMessage('❌ ' + (data.message || 'Failed to sync balances'));
      }
    } catch (error) {
      console.error('Error syncing balances:', error);
      if (!silent) setMessage('❌ Error syncing balances. Make sure the server is running.');
    } finally {
      setSyncing(false);
      if (!silent) setTimeout(() => setMessage(''), 5000);
    }
  };

  // Sync transactions from Plaid (cursor-based incremental sync)
  // force=true bypasses server-side 4-hour throttle
  const syncTransactions = async (silent = false, force = false) => {
    try {
      const url = force
        ? `${API_URL}/api/sync_transactions?force=true`
        : `${API_URL}/api/sync_transactions`;
      const response = await authFetch(url, { method: 'POST' });
      const data = await response.json();
      if (data.success && !data.skipped && !silent) {
        setMessage('✅ Transactions synced!');
      }
      return data;
    } catch (error) {
      console.error('Error syncing transactions:', error);
    }
  };

  // Called after AccountMappingUI saves mappings — triggers auto-sync
  const handleMappingSaved = async () => {
    setSyncing(true);
    setMessage('Syncing your accounts...');
    try {
      // Force bypass throttle since this is right after mapping
      await syncBalances(true, true);
      await syncTransactions(true, true);
      await fetchConnectedAccounts(); // Refresh last_synced timestamps
      await fetchPlaidMappings(); // Refresh which cards are Plaid-managed
      await fetchCreditCards(); // Refresh credit card config
      setMessage('✅ Accounts synced successfully!');
    } catch (error) {
      console.error('Error during post-mapping sync:', error);
      setMessage('❌ Error syncing. Try refreshing the page.');
    } finally {
      setSyncing(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // Handle successful Plaid Link
  const handlePlaidSuccess = (metadata) => {
    setMessage('✅ Account connected successfully!');
    fetchConnectedAccounts();
    setTimeout(() => setMessage(''), 3000);
  };

  // Account bucket color/label map for transaction rows
  // Includes both old names (mat/mara) and new names (person1/person2) for backward compat
  const bucketColors = { live: theme.live, person1: theme.mat, person2: theme.mara };
  const ACCOUNT_BUCKET_MAP = {
    give: { color: theme.give, label: 'GIVE' },
    save: { color: theme.save, label: 'SAVE' },
    live: { color: theme.live, label: 'LIVE' },
    mat: { color: theme.mat, label: (config.person1Name || 'Mat').toUpperCase() },
    mara: { color: theme.mara, label: (config.person2Name || 'Mara').toUpperCase() },
    person1: { color: theme.mat, label: (config.person1Name || 'Person 1').toUpperCase() },
    person2: { color: theme.mara, label: (config.person2Name || 'Person 2').toUpperCase() },
    primary: { color: theme.text, label: 'PRIMARY' },
    unmapped: { color: theme.textDimmed, label: '???' },
    // Legacy card entries
    blue_total: { color: theme.live, label: 'BLUE' },
    gold_total: { color: theme.mat, label: 'GOLD' },
    discover_total: { color: theme.mara, label: 'DISC' },
  };
  // Add dynamic card entries from creditCards state
  for (const card of getEffectiveCreditCards()) {
    const color = bucketColors[card.paid_from_bucket] || theme.live;
    ACCOUNT_BUCKET_MAP[card.card_id] = { color, label: card.label?.substring(0, 4)?.toUpperCase() || card.card_id.toUpperCase() };
  }

  // Fetch transactions with optional filter override (avoids stale closure)
  const fetchTransactions = async (filterOverride = null) => {
    setTransactionsLoading(true);
    try {
      const f = filterOverride || transactionsFilter;
      const params = new URLSearchParams();
      if (f.account_type) params.append('account_type', f.account_type);
      if (f.limit) params.append('limit', String(f.limit));
      if (f.offset) params.append('offset', String(f.offset));

      const response = await authFetch(`${API_URL}/api/transactions?${params.toString()}`);
      const data = await response.json();

      if (f.offset > 0) {
        // Load more — append to existing list
        setTransactions(prev => [...prev, ...data.transactions]);
      } else {
        // Fresh fetch or filter change — replace list
        setTransactions(data.transactions);
      }
      setTransactionsTotal(data.total);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setTransactionsLoading(false);
    }
  };

  // Lazy-load transactions when user first visits the tab
  useEffect(() => {
    if (currentView === 'transactions' && transactions.length === 0 && !transactionsLoading) {
      fetchTransactions({ account_type: '', limit: 50, offset: 0 });
    }
  }, [currentView]);

  // Fetch latest snapshot and config on load, auto-sync with Plaid
  useEffect(() => {
    const init = async () => {
      try {
        await fetchConfig();
        await fetchConnectedAccounts();
        await checkPlaidConsent();
        await fetchPlaidMappings();
        await fetchCreditCards();
        await syncBalances(true);
      } catch (e) {
        console.error('Init error:', e);
      } finally {
        // Always fetch snapshots to clear the loading spinner — even if backend is unreachable
        await fetchSnapshots();
      }
    };
    init();
  }, []);

  // Persist theme mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('flipThemeMode', themeMode);
  }, [themeMode]);


  // Track viewport width for responsive side-by-side layout
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 500);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Sync tempConfig with config when opening settings in hamburger
  useEffect(() => {
    if (menuView === 'settings') {
      setTempConfig(config);
    }
  }, [menuView, config]);

  // Helper: read a bucket value from a snapshot, preferring JSONB then falling back to old columns
  const getSnapshotBucket = (s, bucket) => {
    if (s?.buckets && bucket in s.buckets) return s.buckets[bucket];
    // Fallback: person1→mat, person2→mara
    const legacyKey = bucket === 'person1' ? 'mat' : bucket === 'person2' ? 'mara' : bucket;
    return s?.[legacyKey] ?? 0;
  };

  // Helper: read a card value from a snapshot, preferring JSONB then falling back to old columns
  const getSnapshotCard = (s, cardId) => {
    if (s?.cards && cardId in s.cards) return s.cards[cardId];
    // Fallback: try old columns like blue_total/blue_statement
    return {
      total: s?.[`${cardId}_total`] ?? 0,
      statement: s?.[`${cardId}_statement`] ?? 0,
    };
  };

  const fetchSnapshots = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('balance_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(365);

      if (error) {
        console.error('Error fetching snapshots:', error);
        setMessage('Error loading data. Check your Supabase connection.');
      } else if (data && data.length > 0) {
        setLatestSnapshot(data[0]);
        setSnapshots(data);
        const latest = data[0];
        const b = latest.buckets || {};
        const newBalances = {
          give: (b.give ?? latest.give ?? 0).toString(),
          save: (b.save ?? latest.save ?? 0).toString(),
          live: (b.live ?? latest.live ?? 0).toString(),
          mat: (b.person1 ?? latest.mat ?? 0).toString(),
          mara: (b.person2 ?? latest.mara ?? 0).toString(),
        };
        (creditCards.length > 0 ? creditCards : [
          { card_id: 'blue' }, { card_id: 'gold' }, { card_id: 'discover' }
        ]).forEach(card => {
          const cardData = getSnapshotCard(latest, card.card_id);
          newBalances[`${card.card_id}_total`] = (cardData.total ?? 0).toString();
          newBalances[`${card.card_id}_statement`] = (cardData.statement ?? 0).toString();
        });
        setBalances(newBalances);
      }
    } catch (e) {
      console.error('Error fetching snapshots:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const saveSnapshot = async () => {
    setSaving(true);
    setMessage('');

    // Build JSONB buckets and cards objects alongside legacy flat columns
    const bucketsObj = {
      give: parseFloat(balances.give) || 0,
      save: parseFloat(balances.save) || 0,
      live: parseFloat(balances.live) || 0,
      person1: parseFloat(balances.mat) || 0,
      person2: parseFloat(balances.mara) || 0,
    };
    const cardsObj = {};
    (creditCards.length > 0 ? creditCards : [
      { card_id: 'blue' }, { card_id: 'gold' }, { card_id: 'discover' }
    ]).forEach(card => {
      const totalKey = `${card.card_id}_total`;
      const stmtKey = `${card.card_id}_statement`;
      if (balances[totalKey] !== undefined) {
        cardsObj[card.card_id] = {
          total: parseFloat(balances[totalKey]) || 0,
          statement: parseFloat(balances[stmtKey]) || 0,
        };
      }
    });

    const snapshot = {
      // Legacy flat columns (backward compat)
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
      // New JSONB columns
      buckets: bucketsObj,
      cards: cardsObj,
      user_id: session.user.id,
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

  // Get upcoming paydays — driven by payday anchor/frequency from config (set during onboarding).
  // Falls back to hardcoded 2026 dates for existing users who onboarded before this feature.
  const getUpcomingPaydays = () => {
    const today = new Date();
    const paydays = [];

    const generateFromAnchor = (anchorStr, frequency, amount, person) => {
      const stepDays = frequency === 'weekly' ? 7
        : frequency === 'biweekly' ? 14
        : frequency === 'monthly' ? 30
        : 14;
      const anchor = new Date(anchorStr);
      let next = new Date(anchor);
      while (next < today) next.setDate(next.getDate() + stepDays);
      const results = [];
      for (let i = 0; i < 4; i++) {
        results.push({ date: new Date(next), type: person, amount });
        next.setDate(next.getDate() + stepDays);
      }
      return results;
    };

    // Person 1 — use configured anchor or fall back to Mat's hardcoded 2026 date
    const anchor1 = config.payday1Anchor || '2026-01-30';
    paydays.push(...generateFromAnchor(anchor1, config.payday1Frequency || 'biweekly', config.matPayAmount, 'mat'));

    // Person 2 — only if joint budget
    if (config.isJointBudget) {
      const anchor2 = config.payday2Anchor || '2026-01-23';
      paydays.push(...generateFromAnchor(anchor2, config.payday2Frequency || 'biweekly', config.maraPayAmount, 'mara'));
    }

    return paydays.sort((a, b) => a.date - b.date).slice(0, config.isJointBudget ? 6 : 4);
  };

  // Build the effective credit cards list: use creditCards from DB if available,
  // otherwise fall back to hardcoded defaults for backward compatibility
  function getEffectiveCreditCards() {
    if (creditCards.length > 0) return creditCards;
    // Fallback: reconstruct from config (pre-migration data)
    const bucketToPersonLabel = { live: 'LIVE', person1: config.person1Name, person2: config.person2Name };
    return [
      { card_id: 'blue', label: 'Blue Amex', due_day: config.dueDates?.blue || 8, statement_close_day: config.statementCloseDates?.blue || 14, paid_from_bucket: 'live' },
      { card_id: 'gold', label: `${config.person1Name}'s Gold Amex`, due_day: config.dueDates?.gold || 15, statement_close_day: config.statementCloseDates?.gold || 21, paid_from_bucket: 'person1' },
      { card_id: 'discover', label: `${config.person2Name}'s Discover`, due_day: config.dueDates?.discover || 2, statement_close_day: config.statementCloseDates?.discover || 25, paid_from_bucket: 'person2' },
    ];
  }

  // Get upcoming bills/due dates — dynamically from creditCards array
  const getUpcomingBills = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bills = [];
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const effectiveCards = getEffectiveCreditCards();

    // Check this month and next month
    for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
      const month = (currentMonth + monthOffset) % 12;
      const year = currentMonth + monthOffset > 11 ? currentYear + 1 : currentYear;

      // Add bill entries for each credit card
      for (const card of effectiveCards) {
        const dueDate = new Date(year, month, card.due_day);
        if (dueDate >= today) {
          // Map paid_from_bucket to old account names for backward compat
          const account = card.paid_from_bucket === 'person1' ? 'mat'
            : card.paid_from_bucket === 'person2' ? 'mara'
            : card.paid_from_bucket || 'live';
          bills.push({
            date: dueDate,
            type: card.card_id,
            name: card.label,
            account,
            dueDay: card.due_day,
            cardId: card.card_id,
            paidFromBucket: card.paid_from_bucket,
          });
        }
      }

      // Rent - last day of month
      const lastDay = new Date(year, month + 1, 0);
      if (lastDay >= today) {
        bills.push({ date: lastDay, type: 'rent', name: 'Rent', account: 'live', amount: config.monthlyBills.rent });
      }
    }

    return bills.sort((a, b) => a.date - b.date).slice(0, Math.max(6, effectiveCards.length * 2 + 2));
  };

  // Get sorted credit cards by next due date — built dynamically from creditCards state
  const getSortedCreditCards = () => {
    if (!latestSnapshot) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bills = getUpcomingBills();
    const effectiveCards = getEffectiveCreditCards();

    const cards = effectiveCards.map(card => {
      const cardData = getSnapshotCard(latestSnapshot, card.card_id);
      const account = card.paid_from_bucket === 'person1' ? 'mat'
        : card.paid_from_bucket === 'person2' ? 'mara'
        : card.paid_from_bucket || 'live';
      return {
        type: card.card_id,
        cardId: card.card_id,
        name: card.label,
        account,
        paidFromBucket: card.paid_from_bucket,
        total: cardData.total || 0,
        statement: cardData.statement || 0,
        dueDay: card.due_day,
        statementCloseDay: card.statement_close_day,
        nextDue: bills.find(b => b.type === card.card_id)?.date,
      };
    });

    return cards.sort((a, b) => {
      if (!a.nextDue) return 1;
      if (!b.nextDue) return -1;
      return a.nextDue - b.nextDue;
    });
  };

  // Find when a statement was paid off (first occurrence of 0 balance)
  const findPaymentDate = (cardId) => {
    if (!snapshots || snapshots.length === 0) return null;

    // Sort snapshots by date ascending (oldest first)
    const sortedSnapshots = [...snapshots].sort((a, b) =>
      new Date(a.created_at) - new Date(b.created_at)
    );

    // Find first snapshot where statement is 0 — check JSONB first, then old columns
    const paidSnapshot = sortedSnapshots.find(s => {
      const cardData = getSnapshotCard(s, cardId);
      return cardData.statement === 0;
    });

    if (paidSnapshot) {
      return new Date(paidSnapshot.created_at);
    }

    return null;
  };

  // Get the due date for the current billing cycle (the one that was just paid, not the next upcoming one)
  // This is needed to correctly calculate "days early" for paid statements
  const getCurrentCycleDueDate = (cardId, paymentDate) => {
    if (!paymentDate) return null;

    // Look up due_day from creditCards array, with fallback to config
    const effectiveCards = getEffectiveCreditCards();
    const card = effectiveCards.find(c => c.card_id === cardId);
    const dueDay = card?.due_day || config.dueDates?.[cardId];
    if (!dueDay) return null;

    // Start from the payment date and find the due date for that billing cycle
    const paymentMonth = paymentDate.getMonth();
    const paymentYear = paymentDate.getFullYear();

    // The due date for this cycle is in the same month as payment, or the previous month
    // if payment was made after the due date in that month
    let cycleDueDate = new Date(paymentYear, paymentMonth, dueDay);

    // If payment was made AFTER the due date this month, the cycle due date is this month's
    // If payment was made BEFORE or ON the due date, the cycle due date is this month's
    // (payment for Feb 2nd due date made on Feb 1st = Feb 2nd is the cycle due date)
    if (paymentDate > cycleDueDate) {
      // Payment was after the due date - move to next month's due date
      cycleDueDate = new Date(paymentYear, paymentMonth + 1, dueDay);
    }

    return cycleDueDate;
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
      } else if (accountType === 'mat' || accountType === 'person1') {
        if (payday.type === 'mat') projectedBalance += personalSplits.matPersonalFromMat;
        if (payday.type === 'mara') projectedBalance += personalSplits.matPersonalFromMara;
      } else if (accountType === 'mara' || accountType === 'person2') {
        if (payday.type === 'mat') projectedBalance += personalSplits.maraPersonalFromMat;
        if (payday.type === 'mara') projectedBalance += personalSplits.maraPersonalFromMara;
      }

      if (projectedBalance >= statementAmount) {
        return {
          canPay: true,
          dateAvailable: payday.date,
          projectedBalance,
          details: `Balance will reach $${projectedBalance.toFixed(2)} after ${payday.type === 'mat' ? config.person1Name : config.person2Name}'s paycheck on ${payday.date.toLocaleDateString()}`
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

  // Get the ACTUAL next payment due date, accounting for billing cycles
  // If statement is paid ($0), the next payment is due NEXT billing cycle, not this one
  const getNextPaymentDueDate = (cardId, statementBalance) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Look up due_day from creditCards array, with fallback to config
    const effectiveCards = getEffectiveCreditCards();
    const card = effectiveCards.find(c => c.card_id === cardId);
    const dueDay = card?.due_day || config.dueDates?.[cardId];

    // Find next calendar occurrence of due date
    let nextDue = new Date(today.getFullYear(), today.getMonth(), dueDay);
    if (nextDue <= today) {
      nextDue = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
    }

    // If statement is PAID ($0), actual next payment is one full cycle later
    // Because there's nothing due this cycle - the total balance becomes next cycle's statement
    if (statementBalance === 0) {
      nextDue = new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, dueDay);
    }

    return nextDue;
  };

  // Calculate safe-to-spend amount for a person (mat/mara or person1/person2)
  // Dynamically finds which credit cards are paid from this person's bucket
  const calculateDisposableIncome = (person) => {
    if (!latestSnapshot) return null;

    // Normalize person to bucket name
    const bucket = person === 'mat' ? 'person1' : person === 'mara' ? 'person2' : person;
    const accountBalance = getSnapshotBucket(latestSnapshot, bucket);
    const cushion = config.cushion;

    // Find all credit cards paid from this person's bucket
    const effectiveCards = getEffectiveCreditCards();
    const personCards = effectiveCards.filter(c => c.paid_from_bucket === bucket);

    // Sum all card payments this person owes
    let totalCardStatement = 0;
    let totalCardTotal = 0;
    let primaryCardId = null;
    let primaryDueDate = null;

    for (const card of personCards) {
      const cardData = getSnapshotCard(latestSnapshot, card.card_id);
      totalCardStatement += cardData.statement || 0;
      totalCardTotal += cardData.total || 0;

      // Track the earliest due date among this person's cards
      const nextDue = getNextPaymentDueDate(card.card_id, cardData.statement);
      if (!primaryDueDate || nextDue < primaryDueDate) {
        primaryDueDate = nextDue;
        primaryCardId = card.card_id;
      }
    }

    // If no cards assigned to this person, use a far-future due date
    if (!primaryDueDate) {
      primaryDueDate = new Date();
      primaryDueDate.setMonth(primaryDueDate.getMonth() + 1);
    }

    const nextDueDate = primaryDueDate;

    // Calculate paychecks before next due date
    const paydays = getUpcomingPaydays();
    const personalSplits = getPersonalSplits();
    let futureDeposits = 0;

    for (const payday of paydays) {
      if (payday.date <= nextDueDate) {
        if (bucket === 'person1') {
          if (payday.type === 'mat') futureDeposits += personalSplits.matPersonalFromMat;
          if (payday.type === 'mara') futureDeposits += personalSplits.matPersonalFromMara;
        } else if (bucket === 'person2') {
          if (payday.type === 'mat') futureDeposits += personalSplits.maraPersonalFromMat;
          if (payday.type === 'mara') futureDeposits += personalSplits.maraPersonalFromMara;
        }
      }
    }

    // Next payment amount: use statement sum if > 0, otherwise use total balance sum
    const nextPaymentAmount = totalCardStatement > 0 ? totalCardStatement : totalCardTotal;

    // Safe to Spend calculation
    const disposableIncome = accountBalance - cushion + futureDeposits - nextPaymentAmount;

    // Pre-compute exact deposit amounts for each payday (used by SafeToSpendChart)
    const paydaysBeforeDue = paydays.filter(p => p.date <= nextDueDate);
    const depositAmounts = paydaysBeforeDue.map(p => {
      let amount = 0;
      if (bucket === 'person1') {
        amount = p.type === 'mat' ? personalSplits.matPersonalFromMat : personalSplits.matPersonalFromMara;
      } else if (bucket === 'person2') {
        amount = p.type === 'mat' ? personalSplits.maraPersonalFromMat : personalSplits.maraPersonalFromMara;
      }
      return { date: p.date, type: p.type, amount };
    });

    return {
      disposableIncome,
      accountBalance,
      cushion,
      futureDeposits,
      nextPaymentAmount,
      cardStatement: totalCardStatement,
      cardTotal: totalCardTotal,
      nextDueDate,
      cardType: primaryCardId,
      paydaysBeforeDue,
      depositAmounts,
    };
  };

  // Generate detailed calculation breakdown for safe-to-spend
  // Order: Balance → Deposits → Projected balance → Payment → Remaining → Funds available
  const generateDisposableCalculation = (dispData, person) => {
    if (!dispData) return 'No data available';

    const personalSplits = getPersonalSplits();
    const projectedBeforePayment = dispData.accountBalance + dispData.futureDeposits;
    const remainingAfterPayment = projectedBeforePayment - dispData.nextPaymentAmount;

    let calc = `Current balance: $${dispData.accountBalance.toFixed(2)}\n`;
    calc += `+ Future deposits (until ${dispData.nextDueDate.toLocaleDateString()}): +$${dispData.futureDeposits.toFixed(2)}\n`;
    dispData.paydaysBeforeDue.forEach(pd => {
      const amount = person === 'mat'
        ? (pd.type === 'mat' ? personalSplits.matPersonalFromMat : personalSplits.matPersonalFromMara)
        : (pd.type === 'mat' ? personalSplits.maraPersonalFromMat : personalSplits.maraPersonalFromMara);
      calc += `  • ${pd.date.toLocaleDateString()} (${pd.type === 'mat' ? config.person1Name : config.person2Name}): +$${amount.toFixed(2)}\n`;
    });
    calc += `✓ Projected balance: $${projectedBeforePayment.toFixed(2)}\n`;
    if (dispData.cardStatement > 0) {
      calc += `- Payment (statement): -$${dispData.nextPaymentAmount.toFixed(2)}\n`;
      calc += `  Statement balance due on ${dispData.nextDueDate.toLocaleDateString()}\n`;
    } else {
      calc += `- Payment (total balance): -$${dispData.nextPaymentAmount.toFixed(2)}\n`;
      calc += `  ✓ Statement paid. $${dispData.cardTotal.toFixed(2)} due ${dispData.nextDueDate.toLocaleDateString()}\n`;
    }
    calc += `✓ Remaining balance: $${remainingAfterPayment.toFixed(2)}\n`;
    calc += `- Required cushion: -$${dispData.cushion.toFixed(2)}\n`;
    calc += `\n= Safe to Spend: $${dispData.disposableIncome.toFixed(2)}`;
    return calc;
  };

  // Generate detailed calculation for bill payments
  // Order: Balance → Deposits → Projected balance → Payment → Remaining → Funds available
  const generateBillPaymentCalculation = (accountType, startBalance, paymentAmount, dueDate, paymentCalc) => {
    if (!paymentCalc) return 'No calculation available';

    const paydays = getUpcomingPaydays();
    const relevantPaydays = paydays.filter(p => p.date <= dueDate);
    const personalSplits = getPersonalSplits();

    let calc = `Current ${accountType.toUpperCase()} balance: $${startBalance.toFixed(2)}\n`;

    let totalInflow = 0;
    if (relevantPaydays.length > 0) {
      totalInflow = relevantPaydays.reduce((sum, p) => {
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
        calc += `  • ${pd.date.toLocaleDateString()} (${pd.type === 'mat' ? config.person1Name : config.person2Name}): +$${amount.toFixed(2)}\n`;
      });
    }

    const projectedBalance = startBalance + totalInflow;
    calc += `✓ Projected balance: $${projectedBalance.toFixed(2)}\n`;
    calc += `- Payment amount: -$${paymentAmount.toFixed(2)}\n`;

    const remainingBalance = projectedBalance - paymentAmount;
    calc += `✓ Remaining balance: $${remainingBalance.toFixed(2)}\n`;

    if (paymentCalc.canPay) {
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
      calc += `✗ Shortfall: $${paymentCalc.shortfall.toFixed(2)}\n`;
      calc += `✗ Will not have enough by ${dueDate.toLocaleDateString()}`;
    }

    return calc;
  };

  // Calculate projected budget health for end of month
  // Shows how far over or under budget we're projected to be
  const calculateBudgetHealth = () => {
    if (!latestSnapshot) return null;

    // Check LIVE balance exists (use JSONB with fallback)
    const liveBalance = getSnapshotBucket(latestSnapshot, 'live');
    if (typeof liveBalance !== 'number') return null;

    const today = new Date();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const paydays = getUpcomingPaydays();
    const bills = getUpcomingBills();

    // Start with current LIVE balance
    let projectedLive = liveBalance;

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

    // Subtract ALL credit cards paid from LIVE bucket (was hardcoded to blue_total only)
    const effectiveCards = getEffectiveCreditCards();
    const liveCards = effectiveCards.filter(c => c.paid_from_bucket === 'live');
    let totalLiveCardBalance = 0;
    for (const card of liveCards) {
      const cardData = getSnapshotCard(latestSnapshot, card.card_id);
      totalLiveCardBalance += cardData.total || 0;
    }
    projectedLive -= totalLiveCardBalance;

    // Subtract projected remaining monthly expenses
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const monthProgress = dayOfMonth / daysInMonth;

    // Calculate how much of monthly budget should be spent so far
    const monthlyVariableExpenses = config.monthlyBills.groceries + config.monthlyBills.gas + config.monthlyBills.dateNights + config.monthlyBills.power + config.monthlyBills.gym + config.monthlyBills.insurance + (config.monthlyBills.subscriptions || 0);
    const projectedRemainingExpenses = monthlyVariableExpenses * (1 - monthProgress);

    projectedLive -= projectedRemainingExpenses;

    // Surplus is anything above the safety buffer (can be negative = over budget)
    const surplus = projectedLive - config.cushion;
    const isOverBudget = surplus < 0;

    // Budget Health Score: 0-100
    const budgetHealthScore = Math.round(Math.min(100, Math.max(0, ((surplus + 300) / 500) * 100)));

    return {
      projectedLive,
      surplus,
      isOverBudget,
      budgetHealthScore,
      details: {
        startingBalance: liveBalance,
        projectedInflows: paydays.filter(p => p.date <= endOfMonth).reduce((sum, p) =>
          sum + (p.type === 'mat' ? config.splits.matLive : config.splits.maraLive), 0),
        rent: rentBill ? config.monthlyBills.rent : 0,
        liveCardTotal: totalLiveCardBalance,
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
        budgetHealthScore: 0,
        budgetHealthMax: 10,
        promptPaymentsScore: 0,
        promptPaymentsMax: 10,
        details: {
          bills: 'No data available',
          personal: 'No data available',
          budgetHealth: 'No data available',
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
      budgetHealthScore: 0,
      budgetHealthMax: 10,
      promptPaymentsScore: 0,
      promptPaymentsMax: 10,
      details: {}
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bills = getUpcomingBills();
    const effectiveCards = getEffectiveCreditCards();
    const personalSplits = getPersonalSplits();
    const upcomingPaydays = getUpcomingPaydays();

    const billChecks = [];

    // Helper: get deposit amounts for a paid_from_bucket before a due date
    const getDepositsForBucket = (paidFromBucket, dueDate) => {
      const paydaysBefore = upcomingPaydays.filter(p => p.date < dueDate);
      return paydaysBefore.map(p => {
        let amount = 0;
        if (paidFromBucket === 'live') {
          amount = p.type === 'mat' ? (config.splits.matLive || 984) : (config.splits.maraLive || 656);
        } else if (paidFromBucket === 'person1') {
          amount = p.type === 'mat' ? personalSplits.matPersonalFromMat : personalSplits.matPersonalFromMara;
        } else if (paidFromBucket === 'person2') {
          amount = p.type === 'mat' ? personalSplits.maraPersonalFromMat : personalSplits.maraPersonalFromMara;
        }
        return { date: p.date, type: p.type, amount };
      });
    };

    // Helper: get display name for a paid_from_bucket
    const getBucketDisplayName = (paidFromBucket) => {
      if (paidFromBucket === 'person1') return config.person1Name;
      if (paidFromBucket === 'person2') return config.person2Name;
      return 'LIVE';
    };

    // Helper: map paid_from_bucket to old account type for calculatePaymentDate
    const bucketToAccountType = (paidFromBucket) => {
      if (paidFromBucket === 'person1') return 'mat';
      if (paidFromBucket === 'person2') return 'mara';
      return 'live';
    };

    // Check each credit card dynamically
    for (const card of effectiveCards) {
      const nextBill = bills.find(b => b.type === card.card_id);
      if (!nextBill) continue;

      const cardData = getSnapshotCard(latestSnapshot, card.card_id);
      const accountType = bucketToAccountType(card.paid_from_bucket);
      const accountBalance = getSnapshotBucket(latestSnapshot, card.paid_from_bucket || 'live');
      const accountDisplayName = getBucketDisplayName(card.paid_from_bucket);

      const paymentCheck = calculatePaymentDate(accountType, accountBalance, cardData.statement, nextBill.date);
      billChecks.push({
        name: card.label,
        account: accountDisplayName,
        dueDate: nextBill.date,
        statement: cardData.statement,
        ...paymentCheck
      });

      if (cardData.statement === 0) {
        if (cardData.total === 0) {
          positives.push({
            message: `${card.label}: Paid in full!`,
            icon: 'check', person: accountType, account: card.card_id,
          });
        } else {
          positives.push({
            message: `${card.label}: Statement balance is paid off!`,
            icon: 'check', person: accountType, account: card.card_id,
            details: `Total balance: $${cardData.total.toFixed(2)}`,
          });
        }
      } else if (paymentCheck.canPay) {
        positives.push({
          message: `${card.label}: On pace to be covered!`,
          icon: 'trending', person: accountType, account: card.card_id,
          details: paymentCheck.details,
          calculation: generateBillPaymentCalculation(accountType, accountBalance, cardData.statement, nextBill.date, paymentCheck),
          disposableData: {
            accountBalance,
            nextPaymentAmount: cardData.statement,
            nextDueDate: nextBill.date,
            cushion: config.cushion,
            paydaysBeforeDue: upcomingPaydays.filter(p => p.date < nextBill.date),
            depositAmounts: getDepositsForBucket(card.paid_from_bucket, nextBill.date),
          },
        });
      } else {
        alerts.push({
          severity: 'critical',
          message: `${card.label}: Statement balance is not paid. Due ${nextBill.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. $${Math.round(paymentCheck.shortfall)} short of covering the statement balance.`,
          details: paymentCheck.details,
          calculation: generateBillPaymentCalculation(accountType, accountBalance, cardData.statement, nextBill.date, paymentCheck),
        });
      }
    }

    // Check Rent (LIVE)
    const liveBalance = getSnapshotBucket(latestSnapshot, 'live');
    const nextRent = bills.find(b => b.type === 'rent');
    if (nextRent) {
      const rentCheck = calculatePaymentDate('live', liveBalance, config.monthlyBills.rent, nextRent.date);
      billChecks.push({
        name: 'Rent',
        account: 'LIVE',
        dueDate: nextRent.date,
        statement: config.monthlyBills.rent,
        ...rentCheck
      });

      if (rentCheck.canPay) {
        positives.push({
          message: `Rent: On pace to be paid by ${nextRent.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}!`,
          icon: 'trending', person: 'live', account: 'rent',
          details: rentCheck.details,
          calculation: generateBillPaymentCalculation('live', liveBalance, config.monthlyBills.rent, nextRent.date, rentCheck),
          disposableData: {
            accountBalance: liveBalance,
            nextPaymentAmount: config.monthlyBills.rent,
            nextDueDate: nextRent.date,
            cushion: config.cushion,
            paydaysBeforeDue: upcomingPaydays.filter(p => p.date < nextRent.date),
            depositAmounts: getDepositsForBucket('live', nextRent.date),
          },
        });
      } else {
        alerts.push({
          severity: 'critical',
          message: `Rent: $${Math.round(config.monthlyBills.rent).toLocaleString()} due ${nextRent.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. $${Math.round(rentCheck.shortfall)} short of covering rent.`,
          details: rentCheck.details,
          calculation: generateBillPaymentCalculation('live', liveBalance, config.monthlyBills.rent, nextRent.date, rentCheck),
        });
      }
    }

    // SCORING: 70 points for bills
    const billsCovered = billChecks.filter(b => b.canPay).length;
    const totalBills = billChecks.length;
    scoreBreakdown.billsScore = totalBills > 0 ? (billsCovered / totalBills) * 70 : 70;
    scoreBreakdown.details.bills = `${billsCovered} of ${totalBills} upcoming bills can be paid on time`;

    // SCORING: 10 points for personal account health (based on safe-to-spend)
    let personalPoints = 0;
    const matDisposable = calculateDisposableIncome('mat');
    const maraDisposable = config.isJointBudget ? calculateDisposableIncome('mara') : null;

    // Mat's safe-to-spend scoring (max 5 points)
    if (matDisposable && matDisposable.disposableIncome > 0) {
      if (matDisposable.disposableIncome >= 200) personalPoints += 5;
      else if (matDisposable.disposableIncome >= 100) personalPoints += 4;
      else if (matDisposable.disposableIncome >= 50) personalPoints += 2.5;
      else personalPoints += 1.5;
    } else if (matDisposable && matDisposable.disposableIncome < 0) {
      personalPoints += 0;
      alerts.push({
        severity: 'critical',
        message: `${config.person1Name}: Safe to Spend: $${Math.round(matDisposable.disposableIncome)}. $${Math.round(Math.abs(matDisposable.disposableIncome))} short of 200+ target.`,
        details: `Current balance: $${matDisposable.accountBalance.toFixed(2)}, Next payment: $${matDisposable.nextPaymentAmount.toFixed(2)}`,
        calculation: generateDisposableCalculation(matDisposable, 'mat'),
        person: 'mat',
        disposableData: matDisposable,
      });
    }

    // Mara's safe-to-spend scoring (max 5 points) — joint budget only
    if (config.isJointBudget) {
      if (maraDisposable && maraDisposable.disposableIncome > 0) {
        if (maraDisposable.disposableIncome >= 200) personalPoints += 5;
        else if (maraDisposable.disposableIncome >= 100) personalPoints += 4;
        else if (maraDisposable.disposableIncome >= 50) personalPoints += 2.5;
        else personalPoints += 1.5;
      } else if (maraDisposable && maraDisposable.disposableIncome < 0) {
        personalPoints += 0;
        alerts.push({
          severity: 'critical',
          message: `${config.person2Name}: Safe to Spend: $${Math.round(maraDisposable.disposableIncome)}. $${Math.round(Math.abs(maraDisposable.disposableIncome))} short of 200+ target.`,
          details: `Current balance: $${maraDisposable.accountBalance.toFixed(2)}, Next payment: $${maraDisposable.nextPaymentAmount.toFixed(2)}`,
          calculation: generateDisposableCalculation(maraDisposable, 'mara'),
          person: 'mara',
          disposableData: maraDisposable,
        });
      }
    }

    scoreBreakdown.personalScore = personalPoints;
    scoreBreakdown.details.personal = config.isJointBudget
      ? `${config.person1Name}: $${matDisposable ? Math.round(matDisposable.disposableIncome) : 'N/A'}, ${config.person2Name}: $${maraDisposable ? Math.round(maraDisposable.disposableIncome) : 'N/A'}`
      : `${config.person1Name}: $${matDisposable ? Math.round(matDisposable.disposableIncome) : 'N/A'}`;

    // SCORING: 10 points for Budget Health
    const budgetProjection = calculateBudgetHealth();
    if (budgetProjection) {
      // Scale the 0-100 budget health score into 0-10 points
      scoreBreakdown.budgetHealthScore = Math.round(budgetProjection.budgetHealthScore / 10);

      const surplusAbs = Math.abs(Math.round(budgetProjection.surplus));
      if (budgetProjection.isOverBudget) {
        scoreBreakdown.details.budgetHealth = `Projected $${surplusAbs} over budget (Score: ${budgetProjection.budgetHealthScore}/100)`;
      } else {
        scoreBreakdown.details.budgetHealth = `Projected $${surplusAbs} under budget (Score: ${budgetProjection.budgetHealthScore}/100)`;
      }

      // Alert when budget health is low (score < 40 out of 100)
      if (budgetProjection.budgetHealthScore < 40) {
        alerts.push({
          severity: 'warning',
          message: `Budget Health: ${budgetProjection.budgetHealthScore}/100. Projected ${budgetProjection.isOverBudget ? `$${surplusAbs} over budget` : `$${surplusAbs} under budget`}.`,
          calculation: `Current LIVE balance: $${budgetProjection.details.startingBalance.toFixed(2)}\n+ Projected paychecks: +$${budgetProjection.details.projectedInflows.toFixed(2)}\n${budgetProjection.details.rent > 0 ? `- Rent payment: -$${budgetProjection.details.rent.toFixed(2)}\n` : ''}- Credit card payments: -$${budgetProjection.details.liveCardTotal.toFixed(2)}\n- Remaining expenses (${budgetProjection.details.daysRemaining}d): -$${budgetProjection.details.projectedRemainingExpenses.toFixed(2)}\n- Safety buffer: -$${budgetProjection.details.safetyBuffer.toFixed(2)}\n\n${budgetProjection.isOverBudget ? '✗' : '✓'} Projected surplus: ${budgetProjection.isOverBudget ? '-' : '+'}$${surplusAbs.toFixed(2)}`,
        });
      }
    } else {
      scoreBreakdown.budgetHealthScore = 0;
      scoreBreakdown.details.budgetHealth = 'Unable to calculate budget projection';
    }

    // SCORING: 10 points for Credit Card Payoff Ability
    // Check if we can pay off total balance by due date while keeping cushion
    const cardPayoffInfo = [];

    for (const card of effectiveCards) {
      const bill = bills.find(b => b.type === card.card_id);
      if (!bill) continue;
      const bucketBalance = getSnapshotBucket(latestSnapshot, card.paid_from_bucket);
      const cardData = getSnapshotCard(latestSnapshot, card.card_id);
      const canPayOff = (bucketBalance - cardData.total) >= config.cushion;
      const ownerLabel = card.paid_from_bucket === 'live' ? 'LIVE' : getBucketDisplayName(card.paid_from_bucket);
      cardPayoffInfo.push({ card: card.label, canPayOff, balance: bucketBalance, cardTotal: cardData.total, owner: ownerLabel });
    }

    const totalCards = effectiveCards.length;
    const payableCount = cardPayoffInfo.filter(info => info.canPayOff).length;

    let promptScore = 0;
    if (totalCards > 0 && payableCount === totalCards) {
      promptScore = 10;
    } else if (payableCount >= totalCards * 0.66) {
      promptScore = 6;
    } else if (payableCount >= 1) {
      promptScore = 3;
    } else {
      promptScore = 0;
    }

    scoreBreakdown.promptPaymentsScore = promptScore;
    scoreBreakdown.details.promptPayments = payableCount > 0
      ? `${payableCount} of ${totalCards} cards can be paid off in full while keeping $${config.cushion} cushion`
      : `No cards can be paid off in full while keeping $${config.cushion} cushion`;

    const totalScore = Math.round(
      scoreBreakdown.billsScore +
      scoreBreakdown.personalScore +
      scoreBreakdown.budgetHealthScore +
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

    const effectiveCards = getEffectiveCreditCards();

    // Suggestion for Credit Card Payoffs (max 10 points)
    const promptGap = healthData.scoreBreakdown.promptPaymentsMax - healthData.scoreBreakdown.promptPaymentsScore;
    if (promptGap > 0) {
      let statusItems = [];
      let needsAction = [];

      for (const card of effectiveCards) {
        const bill = bills.find(b => b.type === card.card_id);
        if (!bill) continue;
        const bucketBalance = getSnapshotBucket(latestSnapshot, card.paid_from_bucket);
        const cardData = getSnapshotCard(latestSnapshot, card.card_id);
        const afterPayment = bucketBalance - cardData.total;

        if (cardData.total === 0) {
          statusItems.push(`${card.label}: paid in full`);
        } else if (afterPayment >= config.cushion) {
          statusItems.push(`${card.label} ($${Math.round(cardData.total)}): can pay in full`);
        } else {
          const shortfall = config.cushion - afterPayment;
          needsAction.push(`${card.label}: $${Math.round(shortfall)} short of paying $${Math.round(cardData.total)} total`);
        }
      }

      // Build suggestion message - prioritize showing who needs help
      const mainSuggestion = needsAction.length > 0
        ? needsAction.join('\n')
        : statusItems.join('\n');

      // Details shows everyone's status
      const allStatus = [...needsAction, ...statusItems].join('\n');

      suggestions.push({
        category: 'Total Balance Bonus',
        currentPoints: healthData.scoreBreakdown.promptPaymentsScore.toFixed(1),
        maxPoints: healthData.scoreBreakdown.promptPaymentsMax,
        potentialGain: promptGap.toFixed(1),
        suggestion: mainSuggestion,
        details: allStatus
      });
    }

    // Suggestion for Bills on time (max 60 points)
    const billsGap = healthData.scoreBreakdown.billsMax - healthData.scoreBreakdown.billsScore;
    if (billsGap > 0) {
      let actionSuggestion = 'Ensure all upcoming bills can be paid on time';

      // Check if we can pay the upcoming bills
      for (const card of effectiveCards) {
        const bill = bills.find(b => b.type === card.card_id);
        if (!bill) continue;
        const bucketBalance = getSnapshotBucket(latestSnapshot, card.paid_from_bucket);
        const cardData = getSnapshotCard(latestSnapshot, card.card_id);
        const paymentCheck = calculatePaymentDate(card.paid_from_bucket, bucketBalance, cardData.statement, bill.date);
        if (!paymentCheck.canPay) {
          actionSuggestion = `${card.label}: $${Math.round(paymentCheck.shortfall)} short. Due ${bill.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`;
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

    // Suggestion for Personal Account Health (max 10 points)
    const personalGap = healthData.scoreBreakdown.personalMax - healthData.scoreBreakdown.personalScore;
    if (personalGap > 0) {
      const matDisp = calculateDisposableIncome('mat');
      const maraDisp = config.isJointBudget ? calculateDisposableIncome('mara') : null;
      const target = 200;

      let statusParts = [];

      // Check person 1's status
      if (matDisp) {
        if (matDisp.disposableIncome >= target) {
          const above = Math.round(matDisp.disposableIncome - target);
          statusParts.push(`${config.person1Name}: Safe to Spend: $${Math.round(matDisp.disposableIncome)}. $${above} above 200+ target`);
        } else {
          const needed = Math.round(target - matDisp.disposableIncome);
          statusParts.push(`${config.person1Name}: Safe to Spend: $${Math.round(matDisp.disposableIncome)}. $${needed} short of 200+ target`);
        }
      }

      // Check person 2's status — joint budget only
      if (config.isJointBudget && maraDisp) {
        if (maraDisp.disposableIncome >= target) {
          const above = Math.round(maraDisp.disposableIncome - target);
          statusParts.push(`${config.person2Name}: Safe to Spend: $${Math.round(maraDisp.disposableIncome)}. $${above} above 200+ target`);
        } else {
          const needed = Math.round(target - maraDisp.disposableIncome);
          statusParts.push(`${config.person2Name}: Safe to Spend: $${Math.round(maraDisp.disposableIncome)}. $${needed} short of 200+ target`);
        }
      }

      suggestions.push({
        category: 'Safe to Spend',
        currentPoints: healthData.scoreBreakdown.personalScore.toFixed(1),
        maxPoints: healthData.scoreBreakdown.personalMax,
        potentialGain: personalGap.toFixed(1),
        suggestion: statusParts.join('\n'),
        details: healthData.scoreBreakdown.details.personal
      });
    }

    // Suggestion for Budget Health (max 10 points)
    const budgetGap = healthData.scoreBreakdown.budgetHealthMax - healthData.scoreBreakdown.budgetHealthScore;
    if (budgetGap > 0) {
      const budgetProjection = calculateBudgetHealth();
      let actionSuggestion = 'Unable to calculate budget projection';
      let mathBreakdown = 'Unable to calculate budget projection';

      if (budgetProjection) {
        const surplusAbs = Math.abs(Math.round(budgetProjection.surplus));

        if (budgetProjection.isOverBudget) {
          actionSuggestion = `Projected $${surplusAbs} over budget. Try to reduce expenses to get back on track.`;
        } else if (budgetProjection.surplus < 200) {
          const needed = Math.round(200 - budgetProjection.surplus);
          actionSuggestion = `Projected $${surplusAbs} under budget. Reduce expenses by $${needed} more to reach $200 target.`;
        } else {
          actionSuggestion = `Projected $${surplusAbs} under budget.`;
        }

        mathBreakdown = `Starting balance: $${(latestSnapshot?.live || 0).toFixed(2)}\n`;
        mathBreakdown += `- Remaining expenses: $${budgetProjection.details?.projectedRemainingExpenses?.toFixed(2) || '0.00'}\n`;
        mathBreakdown += `- Blue Amex balance: $${(latestSnapshot?.blue_total || 0).toFixed(2)}\n`;
        mathBreakdown += `- Rent: $${config.monthlyBills.rent.toFixed(2)}\n`;
        mathBreakdown += `= Projected surplus: $${Math.round(budgetProjection.surplus)}`;
      }

      suggestions.push({
        category: 'Budget Health',
        currentPoints: healthData.scoreBreakdown.budgetHealthScore.toFixed(1),
        maxPoints: healthData.scoreBreakdown.budgetHealthMax,
        potentialGain: budgetGap.toFixed(1),
        suggestion: actionSuggestion,
        details: mathBreakdown
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
    if (s >= 80) return theme.success;
    if (s >= 60) return theme.warning;
    if (s >= 40) return '#D4845A'; // orange midpoint
    return theme.danger;
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

  // Prepare chart data from snapshots (oldest → newest for left-to-right charts)
  const chartData = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return null;

    // Snapshots come newest-first from Supabase, reverse to chronological order
    const chronological = [...snapshots].reverse();

    // Filter out pre-February 2025 data and deduplicate same-day entries (keep last per day)
    const febStart = new Date(2025, 1, 1);
    const filtered = chronological.filter(s => new Date(s.created_at) >= febStart);
    const seenDates = new Map();
    filtered.forEach(s => {
      const dateKey = new Date(s.created_at).toLocaleDateString('en-US');
      seenDates.set(dateKey, s); // last entry per day wins
    });
    const deduped = [...seenDates.values()];

    const formatDate = (dateStr) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Account colors
    const colors = {
      give: theme.give, save: theme.save, live: theme.live,
      mat: theme.mat, mara: theme.mara,
    };

    // Individual checking account series — read from JSONB buckets with fallback
    const accountSeries = {};
    ['give', 'save', 'live', 'mat', 'mara'].forEach(key => {
      const bucket = key === 'mat' ? 'person1' : key === 'mara' ? 'person2' : key;
      accountSeries[key] = deduped.map(s => ({
        date: formatDate(s.created_at),
        value: getSnapshotBucket(s, bucket),
      }));
    });

    // Credit card series — built dynamically from creditCards state
    const effectiveCards = getEffectiveCreditCards();
    const creditCardSeries = {};
    for (const card of effectiveCards) {
      const paidFromBucket = card.paid_from_bucket || 'live';
      creditCardSeries[card.card_id] = deduped.map(s => {
        const cardData = getSnapshotCard(s, card.card_id);
        return {
          date: formatDate(s.created_at),
          dayOfMonth: new Date(s.created_at).getDate(),
          cardTotal: cardData.total || 0,
          cardStatement: cardData.statement || 0,
          accountBalance: getSnapshotBucket(s, paidFromBucket),
        };
      });
    }

    // Net position series — sum all buckets minus all card totals
    const netPosition = deduped.map(s => {
      let totalChecking = 0;
      for (const bucket of ['give', 'save', 'live', 'person1', 'person2']) {
        totalChecking += getSnapshotBucket(s, bucket);
      }
      let totalCards = 0;
      for (const card of effectiveCards) {
        const cardData = getSnapshotCard(s, card.card_id);
        totalCards += cardData.total || 0;
      }
      return {
        date: formatDate(s.created_at),
        netPosition: totalChecking - totalCards,
        totalChecking,
        totalCards,
      };
    });

    return { accountSeries, creditCards: creditCardSeries, netPosition, colors };
  }, [snapshots, creditCards]);

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
        give: getSnapshotBucket(weekEnd, 'give') - getSnapshotBucket(weekStart, 'give'),
        save: getSnapshotBucket(weekEnd, 'save') - getSnapshotBucket(weekStart, 'save'),
        live: getSnapshotBucket(weekEnd, 'live') - getSnapshotBucket(weekStart, 'live'),
        mat: getSnapshotBucket(weekEnd, 'person1') - getSnapshotBucket(weekStart, 'person1'),
        mara: getSnapshotBucket(weekEnd, 'person2') - getSnapshotBucket(weekStart, 'person2'),
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

    const budgetProjection = calculateBudgetHealth();

    return {
      period: 'This Month',
      changes: {
        give: getSnapshotBucket(monthEnd, 'give') - getSnapshotBucket(monthStart, 'give'),
        save: getSnapshotBucket(monthEnd, 'save') - getSnapshotBucket(monthStart, 'save'),
        live: getSnapshotBucket(monthEnd, 'live') - getSnapshotBucket(monthStart, 'live'),
        mat: getSnapshotBucket(monthEnd, 'person1') - getSnapshotBucket(monthStart, 'person1'),
        mara: getSnapshotBucket(monthEnd, 'person2') - getSnapshotBucket(monthStart, 'person2'),
      },
      budgetProjection,
      startDate: new Date(monthStart.created_at),
      endDate: new Date(monthEnd.created_at),
    };
  };

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.coinContainer}>
          <div style={styles.coin}>
            <div style={styles.coinFront}>F</div>
            <div style={styles.coinBack}>$</div>
          </div>
        </div>
        <p style={styles.loadingBrand}>Flip</p>
      </div>
    );
  }

  // ─── Public routes (no login required) ─────────────────────────────────
  // If someone visits /privacy, show the privacy policy page publicly.
  // This is required by Plaid — they need a URL they can visit to read the policy.
  if (window.location.pathname === '/privacy') {
    return (
      <div style={{ ...styles.container, minHeight: '100vh', padding: '2rem 1rem' }}>
        <div style={{
          backgroundColor: theme.cardBg, borderRadius: '1rem', padding: '2rem',
          maxWidth: '700px', margin: '0 auto',
        }}>
          <h1 style={{ color: theme.text, fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.25rem' }}>Flip — Privacy Policy</h1>
          <p style={{ color: theme.textMuted, fontSize: '0.8125rem', marginBottom: '1.5rem' }}>Effective Date: February 17, 2025</p>

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

          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <a href="/" style={{ color: theme.accent || theme.live, textDecoration: 'none', fontSize: '0.875rem' }}>← Back to Flip</a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Auth gate ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: theme.textMuted, fontSize: '1rem' }}>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{
          backgroundColor: theme.cardBg, borderRadius: '1rem', padding: '2rem',
          width: '100%', maxWidth: '400px', margin: '0 1rem',
        }}>
          <h1 style={{ color: theme.text, fontSize: '2rem', fontWeight: '800', textAlign: 'center', marginBottom: '0.25rem' }}>Flip</h1>
          <p style={{ color: theme.textMuted, fontSize: '0.875rem', textAlign: 'center', marginBottom: '2rem' }}>
            {authMode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>

          {authError && (
            <div style={{
              backgroundColor: theme.dangerBg, color: theme.dangerLight,
              padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.8125rem',
              marginBottom: '1rem', textAlign: 'center',
            }}>
              {authError}
            </div>
          )}

          {authMessage && (
            <div style={{
              backgroundColor: theme.successBg, color: theme.successLight,
              padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.8125rem',
              marginBottom: '1rem', textAlign: 'center',
            }}>
              {authMessage}
            </div>
          )}

          <form onSubmit={handleAuth}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>Email</label>
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              required
              style={{
                width: '100%', padding: '0.75rem', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
                borderRadius: '0.5rem', color: theme.text, fontSize: '0.875rem', marginBottom: '1rem',
                boxSizing: 'border-box',
              }}
            />

            <label style={{ display: 'block', color: theme.textMuted, fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>Password</label>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%', padding: '0.75rem', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
                borderRadius: '0.5rem', color: theme.text, fontSize: '0.875rem', marginBottom: '1.5rem',
                boxSizing: 'border-box',
              }}
            />

            {/* Privacy/TOS consent checkbox — only shown during signup */}
            {authMode === 'signup' && (
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                color: theme.textMuted, fontSize: '0.75rem', lineHeight: '1.5',
                marginBottom: '1rem', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={signupConsent}
                  onChange={(e) => setSignupConsent(e.target.checked)}
                  style={{ marginTop: '0.15rem', accentColor: theme.accent }}
                />
                <span>
                  I agree to the{' '}
                  <span
                    onClick={(e) => { e.preventDefault(); setPolicyPopup('privacy'); }}
                    style={{ color: theme.accent, textDecoration: 'underline', cursor: 'pointer' }}
                  >Privacy Policy</span>
                  {' '}and{' '}
                  <span
                    onClick={(e) => { e.preventDefault(); setPolicyPopup('terms'); }}
                    style={{ color: theme.accent, textDecoration: 'underline', cursor: 'pointer' }}
                  >Terms of Service</span>
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={authMode === 'signup' && !signupConsent}
              style={{
                width: '100%', padding: '0.75rem',
                backgroundColor: (authMode === 'signup' && !signupConsent) ? theme.border : theme.accent,
                border: 'none', borderRadius: '0.5rem', color: theme.onAccent,
                fontSize: '1rem', fontWeight: '600',
                cursor: (authMode === 'signup' && !signupConsent) ? 'not-allowed' : 'pointer',
              }}
            >
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p style={{ color: theme.textDimmed, fontSize: '0.8125rem', textAlign: 'center', marginTop: '1.5rem' }}>
            {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); setAuthMessage(''); setSignupConsent(false); }}
              style={{ color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.8125rem' }}
            >
              {authMode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>

        {/* Policy popup overlay — shows Privacy Policy or Terms of Service text */}
        {policyPopup && (
          <div
            onClick={() => setPolicyPopup(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', zIndex: 1000,
              padding: '1rem',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: theme.cardBg, borderRadius: '1rem', padding: '1.5rem',
                width: '100%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ color: theme.text, fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>
                  {policyPopup === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
                </h2>
                <button
                  onClick={() => setPolicyPopup(null)}
                  style={{
                    background: 'none', border: 'none', color: theme.textDimmed,
                    fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  x
                </button>
              </div>

              {policyPopup === 'privacy' ? (
                <div style={{ color: theme.textMuted, fontSize: '0.8125rem', lineHeight: '1.7' }}>
                  <p><strong style={{ color: theme.text }}>Effective Date:</strong> February 17, 2025</p>
                  <p>Flip is committed to protecting the privacy of our users. This Privacy Policy explains how we collect, use, store, and share your personal and financial information when you use the Flip application.</p>
                  <p>By creating an account or using Flip, you acknowledge that you have read, understood, and agree to the practices described in this policy.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>1. Information We Collect</h3>
                  <p><strong style={{ color: theme.text }}>Information You Provide:</strong> Account registration information (name, email, phone number), authentication credentials (securely hashed), budget preferences and financial categories.</p>
                  <p><strong style={{ color: theme.text }}>Financial Information via Plaid:</strong> When you connect a financial institution, we may receive account names, types, balances, and transaction history. We access this data solely through the Plaid API. <strong>We do not store your banking login credentials.</strong></p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>2. How We Use Your Information</h3>
                  <p>We use your data to provide and operate the Flip budgeting application, display your financial accounts and transactions, help you manage your spending, authenticate your identity, and improve the application.</p>
                  <p><strong style={{ color: theme.text }}>We do not sell your personal or financial information to third parties. We do not use your financial data for advertising.</strong></p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>3. Data Sharing</h3>
                  <p>We share your information only with: <strong style={{ color: theme.text }}>Plaid</strong> (to connect financial institutions), <strong style={{ color: theme.text }}>Supabase</strong> (database hosting and authentication), <strong style={{ color: theme.text }}>SMS provider</strong> (to deliver verification codes), and <strong style={{ color: theme.text }}>hosting provider(s)</strong> (web and API hosting).</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>4. Data Security</h3>
                  <p>We implement industry-standard security measures including: encryption in transit (TLS 1.2+), encryption at rest (AES-256), SMS/email one-time password verification, row-level security database policies, and server-side API authentication.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>5. Your Rights</h3>
                  <p>You can: <strong style={{ color: theme.text }}>view</strong> all your data in the app, <strong style={{ color: theme.text }}>update</strong> your account information, <strong style={{ color: theme.text }}>delete</strong> your account and all associated data, <strong style={{ color: theme.text }}>disconnect</strong> linked financial institutions at any time.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>6. Children's Privacy</h3>
                  <p>Flip is not intended for use by individuals under the age of 18.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>7. Changes to This Policy</h3>
                  <p>We may update this policy from time to time. We will notify you of material changes by posting the updated policy within the application.</p>
                </div>
              ) : (
                <div style={{ color: theme.textMuted, fontSize: '0.8125rem', lineHeight: '1.7' }}>
                  <p><strong style={{ color: theme.text }}>Effective Date:</strong> February 17, 2025</p>
                  <p>These Terms of Service ("Terms") govern your use of the Flip application ("Service"). By creating an account or using Flip, you agree to be bound by these Terms.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>1. Account Responsibilities</h3>
                  <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must provide accurate information during registration and keep your contact information up to date.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>2. Acceptable Use</h3>
                  <p>You agree to use Flip only for its intended purpose of personal budgeting and financial tracking. You may not use the Service for any unlawful purpose, attempt to gain unauthorized access to any part of the Service, or interfere with the proper functioning of the Service.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>3. Financial Data</h3>
                  <p>Flip connects to your financial institutions through Plaid to display account information and transactions. Flip is a budgeting tool only — we do not provide financial advice, move money between accounts, or initiate transactions on your behalf. You are solely responsible for your financial decisions.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>4. Data Accuracy</h3>
                  <p>While we strive to display accurate financial information, data received from financial institutions through Plaid may be delayed or incomplete. Flip does not guarantee the accuracy, completeness, or timeliness of any financial data displayed.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>5. Account Termination</h3>
                  <p>You may delete your account at any time through the application settings. Upon deletion, we will revoke all Plaid access tokens and permanently delete all your data within 30 days, as described in our Privacy Policy and Data Retention Policy.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>6. Limitation of Liability</h3>
                  <p>Flip is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the Service, including but not limited to financial losses resulting from reliance on information displayed in the application.</p>

                  <h3 style={{ color: theme.text, fontSize: '0.9375rem', marginTop: '1.25rem' }}>7. Changes to Terms</h3>
                  <p>We may modify these Terms at any time. We will notify you of material changes within the application. Your continued use of Flip after changes are posted constitutes acceptance of the revised Terms.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Email OTP Verification Screen ──────────────────────────────────────
  // Shown after signup (to verify email) or before sensitive actions (Plaid Link).
  // The user receives a 6-digit code via email and enters it here.
  if (otpPending) {
    return (
      <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{
          backgroundColor: theme.cardBg, borderRadius: '1rem', padding: '2rem',
          width: '100%', maxWidth: '400px', margin: '0 1rem', textAlign: 'center',
        }}>
          <h2 style={{ color: theme.text, fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem' }}>
            Verify Your Email
          </h2>
          <p style={{ color: theme.textMuted, fontSize: '0.8125rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
            {otpPurpose === 'signup'
              ? `We sent a 6-digit verification code to ${authEmail}. Enter it below to complete your account setup.`
              : `We sent a 6-digit verification code to ${session?.user?.email}. Enter it below to continue.`
            }
          </p>

          {otpError && (
            <div style={{
              backgroundColor: theme.dangerBg, color: theme.dangerLight,
              padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.8125rem',
              marginBottom: '1rem',
            }}>
              {otpError}
            </div>
          )}

          <form onSubmit={verifyEmailOtp}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              style={{
                width: '100%', padding: '0.75rem', backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`, borderRadius: '0.5rem',
                color: theme.text, fontSize: '1.25rem', letterSpacing: '0.25em',
                textAlign: 'center', marginBottom: '1rem', boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={otpCode.length !== 6}
              style={{
                width: '100%', padding: '0.75rem',
                backgroundColor: otpCode.length === 6 ? theme.accent : theme.border,
                border: 'none', borderRadius: '0.5rem', color: theme.onAccent,
                fontSize: '1rem', fontWeight: '600',
                cursor: otpCode.length === 6 ? 'pointer' : 'not-allowed',
              }}
            >
              Verify
            </button>
          </form>

          <button
            onClick={async () => {
              const email = otpPurpose === 'signup' ? authEmail : session?.user?.email;
              if (email && otpCooldown === 0) {
                await supabase.auth.signInWithOtp({ email });
                setOtpCooldown(60);
              }
            }}
            disabled={otpCooldown > 0}
            style={{
              marginTop: '1rem', background: 'none', border: 'none',
              color: otpCooldown > 0 ? theme.textDimmed : theme.accent,
              fontSize: '0.8125rem', cursor: otpCooldown > 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : 'Resend code'}
          </button>

          <button
            onClick={() => {
              setOtpPending(false);
              setOtpPurpose(null);
              setOtpCode('');
              setOtpError('');
            }}
            style={{
              marginTop: '0.75rem', display: 'block', margin: '0.75rem auto 0', background: 'none', border: 'none',
              color: theme.textDimmed, fontSize: '0.8125rem', cursor: 'pointer',
            }}
          >
            {otpPurpose === 'signup' ? 'Back to login' : 'Cancel'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Test mode banner ─────────────────────────────────────────────────────
  // Fixed bar at the top of the screen so you always know when sandbox is active.
  const testModeBanner = isTestMode ? (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      backgroundColor: theme.warning, color: '#000',
      textAlign: 'center', padding: '4px 0',
      fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em',
    }}>
      TEST MODE — Sandbox Data Only
    </div>
  ) : null;

  // Show onboarding for first-time users (not yet completed onboarding)
  if (onboardingComplete === false) {
    return (
      <>
      {testModeBanner}
      <Onboarding
        theme={theme}
        styles={styles}
        authFetch={authFetch}
        supabase={supabase}
        session={session}
        onComplete={(updates) => {
          markOnboardingComplete(updates);
          setOnboardingComplete(true);
          setConfig(prev => ({
            ...prev,
            person1Name: updates.person_1_name,
            person2Name: updates.person_2_name,
            isJointBudget: !!updates.is_joint_budget,
            matPayAmount: updates.mat_pay_amount ?? prev.matPayAmount,
            maraPayAmount: updates.mara_pay_amount ?? prev.maraPayAmount,
            payday1Anchor: updates.payday_1_anchor ?? prev.payday1Anchor,
            payday1Frequency: updates.payday_1_frequency ?? prev.payday1Frequency,
            payday2Anchor: updates.payday_2_anchor ?? prev.payday2Anchor,
            payday2Frequency: updates.payday_2_frequency ?? prev.payday2Frequency,
            splits: {
              ...prev.splits,
              give: updates.split_give ?? prev.splits?.give,
              save: updates.split_save ?? prev.splits?.save,
              matLive: updates.split_mat_live ?? prev.splits?.matLive,
              maraLive: updates.split_mara_live ?? prev.splits?.maraLive,
            },
            monthlyBills: {
              ...prev.monthlyBills,
              rent: updates.monthly_rent ?? prev.monthlyBills?.rent,
              gym: updates.monthly_gym ?? prev.monthlyBills?.gym,
              power: updates.monthly_power ?? prev.monthlyBills?.power,
              insurance: updates.monthly_insurance ?? prev.monthlyBills?.insurance,
              groceries: updates.monthly_groceries ?? prev.monthlyBills?.groceries,
              gas: updates.monthly_gas ?? prev.monthlyBills?.gas,
              dateNights: updates.monthly_date_nights ?? prev.monthlyBills?.dateNights,
              subscriptions: updates.monthly_subscriptions ?? prev.monthlyBills?.subscriptions,
            },
          }));
        }}
        syncBalances={syncBalances}
        syncTransactions={syncTransactions}
        fetchConnectedAccounts={fetchConnectedAccounts}
        fetchPlaidMappings={fetchPlaidMappings}
        fetchSnapshots={fetchSnapshots}
        fetchCreditCards={fetchCreditCards}
        isTestMode={isTestMode}
        onTestReset={isTestMode ? handleTestReset : undefined}
      />
      </>
    );
  }

  return (
    <div style={styles.container}>
      {testModeBanner}
      <header style={styles.header}>
        <div style={{ width: 40 }} />
        <div style={{ textAlign: 'center' }}>
          <h1 style={styles.title}>Flip</h1>
          <p style={styles.subtitle}>{config.isJointBudget ? `${config.person1Name} & ${config.person2Name}` : config.person1Name}</p>
        </div>
        <button
          onClick={() => { setMenuOpen(true); setMenuView('menu'); }}
          style={styles.hamburgerButton}
          aria-label="Menu"
        >
          <span style={styles.hamburgerLine} />
          <span style={styles.hamburgerLine} />
          <span style={styles.hamburgerLine} />
        </button>
      </header>

      {/* Hamburger Menu Overlay */}
      {menuOpen && (
        <div style={styles.menuOverlay} onClick={() => setMenuOpen(false)}>
          <div style={styles.menuPanel} onClick={(e) => e.stopPropagation()}>
            {menuView === 'menu' && (
              <>
                <div style={styles.menuHeader}>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>Menu</h2>
                  <button onClick={() => setMenuOpen(false)} style={styles.menuCloseButton}>X</button>
                </div>
                <button
                  onClick={() => setMenuView('settings')}
                  style={styles.menuItem}
                >
                  Settings
                </button>
                <button
                  onClick={() => setMenuView('updateCards')}
                  style={styles.menuItem}
                >
                  Update Card Balances
                </button>
                <div style={{ height: '1px', backgroundColor: theme.border, margin: '0.5rem 0' }} />
                <div style={{ padding: '0 1rem', marginBottom: '0.5rem' }}>
                  <p style={{ color: theme.textDimmed, fontSize: '0.75rem', margin: '0 0 0.25rem 0' }}>
                    Signed in as
                  </p>
                  <p style={{ color: theme.textMuted, fontSize: '0.8125rem', margin: 0 }}>
                    {session?.user?.email}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  style={{ ...styles.menuItem, color: theme.danger }}
                >
                  Sign Out
                </button>
              </>
            )}

            {menuView === 'settings' && (
              <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                <div style={styles.menuHeader}>
                  <button onClick={() => setMenuView('menu')} style={styles.menuBackButton}>Back</button>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>Settings</h2>
                  <button onClick={() => setMenuOpen(false)} style={styles.menuCloseButton}>X</button>
                </div>
                <section style={{ padding: '0 1rem 1rem' }}>
                  <>
                      <div style={styles.settingsContainer}>
                        {/* Appearance */}
                        <div style={styles.settingsSection}>
                          <h3 style={styles.settingsSectionTitle}>Appearance</h3>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.875rem', color: theme.text }}>Theme</span>
                            <div style={{ display: 'flex', gap: '0.25rem', background: theme.cardBgElevated, borderRadius: '2rem', padding: 2 }}>
                              {['light', 'dark'].map(m => (
                                <button key={m} onClick={() => setThemeMode(m)} style={{
                                  padding: '0.4rem 1rem', border: 'none', borderRadius: '2rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
                                  background: themeMode === m ? theme.accent : 'transparent', color: themeMode === m ? theme.onAccent : theme.textMuted,
                                }}>{m === 'light' ? 'Light' : 'Dark'}</button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Income Section */}
                        <div style={styles.settingsSection}>
                          <h3 style={styles.settingsSectionTitle}>Income</h3>
                          <div style={styles.settingsGrid}>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Mat Pay Amount</label>
                              <input type="number" step="0.01" value={tempConfig.matPayAmount} onChange={(e) => setTempConfig({ ...tempConfig, matPayAmount: parseFloat(e.target.value) || 0 })} style={styles.settingsInput} />
                            </div>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Mara Pay Amount</label>
                              <input type="number" step="0.01" value={tempConfig.maraPayAmount} onChange={(e) => setTempConfig({ ...tempConfig, maraPayAmount: parseFloat(e.target.value) || 0 })} style={styles.settingsInput} />
                            </div>
                          </div>
                        </div>
                        {/* Splits */}
                        <div style={styles.settingsSection}>
                          <h3 style={styles.settingsSectionTitle}>Budget Splits</h3>
                          <div style={styles.settingsGrid}>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Give %</label>
                              <input type="number" step="0.01" value={tempConfig.splits.give} onChange={(e) => setTempConfig({ ...tempConfig, splits: { ...tempConfig.splits, give: parseFloat(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Save %</label>
                              <input type="number" step="0.01" value={tempConfig.splits.save} onChange={(e) => setTempConfig({ ...tempConfig, splits: { ...tempConfig.splits, save: parseFloat(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Mat LIVE Amount</label>
                              <input type="number" step="0.01" value={tempConfig.splits.matLive} onChange={(e) => setTempConfig({ ...tempConfig, splits: { ...tempConfig.splits, matLive: parseFloat(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Mara LIVE Amount</label>
                              <input type="number" step="0.01" value={tempConfig.splits.maraLive} onChange={(e) => setTempConfig({ ...tempConfig, splits: { ...tempConfig.splits, maraLive: parseFloat(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                          </div>
                        </div>
                        {/* Due Dates */}
                        <div style={styles.settingsSection}>
                          <h3 style={styles.settingsSectionTitle}>Due Dates</h3>
                          <div style={styles.settingsGrid}>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Blue Amex Due Day</label>
                              <input type="number" value={tempConfig.dueDates.blue} onChange={(e) => setTempConfig({ ...tempConfig, dueDates: { ...tempConfig.dueDates, blue: parseInt(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Gold Amex Due Day</label>
                              <input type="number" value={tempConfig.dueDates.gold} onChange={(e) => setTempConfig({ ...tempConfig, dueDates: { ...tempConfig.dueDates, gold: parseInt(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Discover Due Day</label>
                              <input type="number" value={tempConfig.dueDates.discover} onChange={(e) => setTempConfig({ ...tempConfig, dueDates: { ...tempConfig.dueDates, discover: parseInt(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                          </div>
                        </div>
                        {/* Statement Close Dates */}
                        <div style={styles.settingsSection}>
                          <h3 style={styles.settingsSectionTitle}>Statement Close Dates</h3>
                          <div style={styles.settingsGrid}>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Blue Amex Close Day</label>
                              <input type="number" value={tempConfig.statementCloseDates.blue} onChange={(e) => setTempConfig({ ...tempConfig, statementCloseDates: { ...tempConfig.statementCloseDates, blue: parseInt(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Gold Amex Close Day</label>
                              <input type="number" value={tempConfig.statementCloseDates.gold} onChange={(e) => setTempConfig({ ...tempConfig, statementCloseDates: { ...tempConfig.statementCloseDates, gold: parseInt(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                            <div style={styles.settingsInputGroup}>
                              <label style={styles.settingsLabel}>Discover Close Day</label>
                              <input type="number" value={tempConfig.statementCloseDates.discover} onChange={(e) => setTempConfig({ ...tempConfig, statementCloseDates: { ...tempConfig.statementCloseDates, discover: parseInt(e.target.value) || 0 } })} style={styles.settingsInput} />
                            </div>
                          </div>
                        </div>
                        {/* Monthly Bills */}
                        <div style={styles.settingsSection}>
                          <h3 style={styles.settingsSectionTitle}>Monthly Bills</h3>
                          <div style={styles.settingsGrid}>
                            {Object.entries(tempConfig.monthlyBills).map(([key, val]) => (
                              <div key={key} style={styles.settingsInputGroup}>
                                <label style={styles.settingsLabel}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</label>
                                <input type="number" step="0.01" value={val} onChange={(e) => setTempConfig({ ...tempConfig, monthlyBills: { ...tempConfig.monthlyBills, [key]: parseFloat(e.target.value) || 0 } })} style={styles.settingsInput} />
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Cushion */}
                        <div style={styles.settingsSection}>
                          <h3 style={styles.settingsSectionTitle}>Safety Buffer</h3>
                          <div style={styles.settingsInputGroup}>
                            <label style={styles.settingsLabel}>Cushion Amount</label>
                            <input type="number" step="0.01" value={tempConfig.cushion} onChange={(e) => setTempConfig({ ...tempConfig, cushion: parseFloat(e.target.value) || 0 })} style={styles.settingsInput} />
                          </div>
                        </div>
                        <div style={styles.settingsActions}>
                          <button onClick={() => { saveConfig(tempConfig); setTimeout(() => setMessage(''), 3000); }} style={styles.settingsSaveButton}>Save Settings</button>
                          <button onClick={() => { setTempConfig(DEFAULT_CONFIG); saveConfig(DEFAULT_CONFIG); setTimeout(() => setMessage(''), 3000); }} style={styles.resetButton}>Reset to Defaults</button>
                        </div>
                        {message && <div style={{ ...styles.message, marginTop: '1rem', textAlign: 'center' }}>{message}</div>}
                      </div>

                      {/* Plaid Connection — gated behind data access consent */}
                      <div style={{ ...styles.settingsSection, marginTop: '1.5rem' }}>
                        <h3 style={styles.settingsSectionTitle}>Connected Accounts</h3>

                        {/* Consent gate: user must agree to data access before connecting accounts */}
                        {plaidConsent === false && (
                          <div style={{
                            backgroundColor: theme.accentBg, border: `1px solid ${theme.border}`,
                            borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1rem',
                          }}>
                            <p style={{ color: theme.text, fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                              Data Access Consent Required
                            </p>
                            <p style={{ color: theme.textMuted, fontSize: '0.8125rem', lineHeight: '1.6', marginBottom: '0.75rem' }}>
                              To connect your accounts, Flip needs your permission to access your financial data through Plaid. Here's what we'll access and how we use it:
                            </p>
                            <ul style={{ color: theme.textMuted, fontSize: '0.8125rem', lineHeight: '1.6', marginBottom: '0.75rem', paddingLeft: '1.25rem' }}>
                              <li><strong style={{ color: theme.text }}>Account balances</strong> — to track your Give, Save, Live, Mat, and Mara accounts</li>
                              <li><strong style={{ color: theme.text }}>Credit card balances</strong> — to monitor your Blue, Gold, and Discover cards</li>
                              <li><strong style={{ color: theme.text }}>Transaction history</strong> — for budget tracking and categorization</li>
                            </ul>
                            <p style={{ color: theme.textMuted, fontSize: '0.8125rem', lineHeight: '1.6', marginBottom: '1rem' }}>
                              Your data is encrypted, never shared with third parties, and you can disconnect your accounts at any time. See our Privacy Policy for full details.
                            </p>
                            <button
                              onClick={grantPlaidConsent}
                              style={{
                                width: '100%', padding: '0.75rem', backgroundColor: theme.accent,
                                border: 'none', borderRadius: '0.5rem', color: theme.onAccent,
                                fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer',
                              }}
                            >
                              I Agree — Connect My Accounts
                            </button>
                          </div>
                        )}

                        {plaidConsent === true && (
                          <PlaidLink authFetch={authFetch} onSuccess={(metadata) => {
                            setMessage('✅ Account connected! Map your accounts below.');
                            fetchConnectedAccounts();
                            // Scroll to mapping section after a brief delay for re-render
                            setTimeout(() => {
                              if (mappingRef.current) {
                                mappingRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }, 500);
                            setTimeout(() => setMessage(''), 5000);
                          }} />
                        )}
                        {connectedAccounts.length > 0 && (
                          <div style={{ marginTop: '1rem' }}>
                            {connectedAccounts.map(item => (
                              <div key={item.item_id} style={{ ...styles.connectedAccountItem, flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <span style={{ color: theme.text, fontSize: '0.875rem' }}>{item.institution_name}</span>
                                    <span style={{ fontSize: '0.75rem', color: theme.textDimmed, marginLeft: '0.5rem' }}>
                                      {syncing && !item.last_synced ? 'Syncing...' : `Synced ${getRelativeTime(item.last_synced)}`}
                                    </span>
                                  </div>
                                  {disconnectingItem !== item.item_id && (
                                    <button
                                      onClick={() => setDisconnectingItem(item.item_id)}
                                      style={{
                                        background: 'none', border: 'none', color: theme.danger,
                                        fontSize: '0.75rem', cursor: 'pointer', padding: '0.25rem 0.5rem',
                                      }}
                                    >
                                      Disconnect
                                    </button>
                                  )}
                                </div>
                                {disconnectingItem === item.item_id && (
                                  <div style={{
                                    backgroundColor: theme.dangerBg, borderRadius: '0.5rem',
                                    padding: '0.75rem', display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between', gap: '0.5rem',
                                  }}>
                                    <span style={{ color: theme.textMuted, fontSize: '0.75rem' }}>
                                      Disconnect {item.institution_name}?
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                      <button
                                        onClick={() => setDisconnectingItem(null)}
                                        style={{
                                          padding: '0.25rem 0.75rem', backgroundColor: theme.cardBgElevated,
                                          border: `1px solid ${theme.border}`, borderRadius: '0.25rem',
                                          color: theme.text, fontSize: '0.75rem', cursor: 'pointer',
                                        }}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleDisconnectItem(item.item_id)}
                                        style={{
                                          padding: '0.25rem 0.75rem', backgroundColor: theme.danger,
                                          border: 'none', borderRadius: '0.25rem',
                                          color: theme.onAccent, fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer',
                                        }}
                                      >
                                        Confirm
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <div ref={mappingRef}>
                          <AccountMappingUI
                            authFetch={authFetch}
                            onMappingSaved={handleMappingSaved}
                            isSyncing={syncing}
                            key={connectedAccounts.length}
                            person1Name={config.person1Name}
                            person2Name={config.person2Name}
                          />
                        </div>
                      </div>

                      {/* Test Mode Tools — only visible when ?testmode is in the URL on localhost */}
                      {isTestMode && (
                        <div style={{
                          ...styles.settingsSection, marginTop: '1.5rem',
                          borderTop: `1px solid ${theme.warning}30`,
                        }}>
                          <h3 style={{ ...styles.settingsSectionTitle, color: theme.warning }}>Test Mode Tools</h3>
                          <p style={{ color: theme.textMuted, fontSize: '0.8125rem', marginBottom: '0.75rem', lineHeight: '1.5' }}>
                            Reset all data (balances, transactions, mappings, config) without deleting your account. You'll see onboarding again.
                          </p>
                          <button
                            onClick={handleTestReset}
                            style={{
                              width: '100%', padding: '0.75rem',
                              backgroundColor: theme.warning, border: 'none', borderRadius: '0.5rem',
                              color: '#000', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer',
                            }}
                          >
                            Reset Test Data
                          </button>
                        </div>
                      )}

                      {/* Account Deletion — destructive action, gated behind OTP */}
                      <div style={{ ...styles.settingsSection, marginTop: '1.5rem', borderTop: `1px solid ${theme.danger}30` }}>
                        <h3 style={{ ...styles.settingsSectionTitle, color: theme.danger }}>Danger Zone</h3>
                        {!deleteConfirm ? (
                          <button
                            onClick={() => setDeleteConfirm(true)}
                            style={{
                              width: '100%', padding: '0.75rem',
                              backgroundColor: 'transparent', border: `1px solid ${theme.danger}`,
                              borderRadius: '0.5rem', color: theme.danger,
                              fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer',
                            }}
                          >
                            Delete My Account
                          </button>
                        ) : !deleteOtpSent ? (
                          <div style={{
                            backgroundColor: theme.dangerBg, border: `1px solid ${theme.danger}40`,
                            borderRadius: '0.75rem', padding: '1.25rem',
                          }}>
                            <p style={{ color: theme.danger, fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                              Are you sure? This cannot be undone.
                            </p>
                            <p style={{ color: theme.textMuted, fontSize: '0.8125rem', lineHeight: '1.6', marginBottom: '1rem' }}>
                              This will permanently delete your account and all associated data, including connected accounts, balance history, budget settings, and consent records. All Plaid access tokens will be revoked.
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => setDeleteConfirm(false)}
                                style={{
                                  flex: 1, padding: '0.75rem', backgroundColor: theme.cardBgElevated,
                                  border: `1px solid ${theme.border}`, borderRadius: '0.5rem',
                                  color: theme.text, fontSize: '0.875rem', cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={async () => {
                                  const sent = await sendEmailOtp('delete');
                                  if (sent) setDeleteOtpSent(true);
                                }}
                                style={{
                                  flex: 1, padding: '0.75rem', backgroundColor: theme.danger,
                                  border: 'none', borderRadius: '0.5rem', color: theme.onAccent,
                                  fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer',
                                }}
                              >
                                Yes, Delete Everything
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            backgroundColor: theme.dangerBg, border: `1px solid ${theme.danger}40`,
                            borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center',
                          }}>
                            <p style={{ color: theme.text, fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                              {deleting ? 'Deleting your account...' : 'Verification code sent to your email'}
                            </p>
                            {!deleting && (
                              <p style={{ color: theme.textMuted, fontSize: '0.8125rem', marginBottom: '1rem' }}>
                                Enter the code to confirm account deletion.
                              </p>
                            )}
                            {deleting && (
                              <p style={{ color: theme.textMuted, fontSize: '0.8125rem' }}>Please wait...</p>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                </section>
              </div>
            )}

            {menuView === 'updateCards' && (
              <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                <div style={styles.menuHeader}>
                  <button onClick={() => setMenuView('menu')} style={styles.menuBackButton}>Back</button>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>Update Cards</h2>
                  <button onClick={() => setMenuOpen(false)} style={styles.menuCloseButton}>X</button>
                </div>
                <section style={{ padding: '1rem' }}>
                  <p style={{ ...styles.updateHint, marginBottom: '1rem' }}>Enter your credit card balances and statement amounts.</p>
                  {getEffectiveCreditCards().map(cardConfig => {
                    const card = {
                      totalKey: `${cardConfig.card_id}_total`,
                      statementKey: `${cardConfig.card_id}_statement`,
                      label: cardConfig.label,
                      due: `${cardConfig.due_day}${cardConfig.due_day === 1 ? 'st' : cardConfig.due_day === 2 ? 'nd' : cardConfig.due_day === 3 ? 'rd' : 'th'}`,
                    };
                    const isPlaidManaged = plaidMappedTypes.has(card.totalKey) || plaidMappedTypes.has(cardConfig.card_id);
                    return (
                      <div key={card.label} style={{ ...styles.cardInputGroup, opacity: isPlaidManaged ? 0.6 : 1 }}>
                        <div style={styles.cardInputHeader}>
                          <span style={styles.cardInputLabel}>{card.label}</span>
                          {isPlaidManaged ? (
                            <span style={{ fontSize: '0.7rem', color: theme.success, fontWeight: '600' }}>Synced via Plaid</span>
                          ) : (
                            <span style={styles.cardInputDue}>Due: {card.due}</span>
                          )}
                        </div>
                        {isPlaidManaged ? (
                          <p style={{ color: theme.textMuted, fontSize: '0.8125rem', margin: '0.5rem 0' }}>
                            This card is connected via Plaid and syncs automatically.
                          </p>
                        ) : (
                          <div style={styles.cardInputRow}>
                            <div style={styles.inputRowHalf}>
                              <label style={styles.inputLabelSmall}>Total Balance</label>
                              <div style={styles.inputWrapper}>
                                <span style={styles.inputPrefix}>$</span>
                                <input type="number" step="0.01" value={balances[card.totalKey]} onChange={(e) => handleInputChange(card.totalKey, e.target.value)} style={styles.input} placeholder="0.00" />
                              </div>
                            </div>
                            <div style={styles.inputRowHalf}>
                              <label style={styles.inputLabelSmall}>Statement Balance</label>
                              <div style={styles.inputWrapper}>
                                <span style={styles.inputPrefix}>$</span>
                                <input type="number" step="0.01" value={balances[card.statementKey]} onChange={(e) => handleInputChange(card.statementKey, e.target.value)} style={styles.input} placeholder="0.00" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {message && (
                    <div style={{ ...styles.message, backgroundColor: message.includes('Error') ? '#fef2f2' : '#f0fdf4', color: message.includes('Error') ? '#dc2626' : '#16a34a' }}>
                      {message}
                    </div>
                  )}
                  <button onClick={saveSnapshot} disabled={saving} style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Saving...' : 'Save Card Balances'}
                  </button>
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      {currentView === 'home' && (
        <main style={styles.main}>

          {/* Health Score */}
          <section style={styles.scoreSection}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={styles.scoreCircle}>
                <svg viewBox="0 0 100 100" style={styles.scoreSvg}>
                  <circle cx="50" cy="50" r="45" fill="none" stroke={theme.cardBg} strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="45" fill="none"
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
              {latestSnapshot && (
                <p style={styles.lastUpdated}>
                  Last updated: {new Date(latestSnapshot.created_at).toLocaleString()}
                </p>
              )}
            </div>
          </section>

          {/* Score Improvement Suggestions */}
          {scoreSuggestions.length > 0 && score < 100 && (
            <section style={styles.suggestionsSection}>
              <div
                style={styles.collapsibleHeader}
                onClick={() => setCollapsedSections(prev => ({ ...prev, suggestions: !prev.suggestions }))}
              >
                <h2 style={styles.sectionTitle}>Ways to Improve Your Score</h2>
                <span style={styles.collapseIcon}>{collapsedSections.suggestions ? '▼' : '▲'}</span>
              </div>
              {!collapsedSections.suggestions && (
                <div>
                  {/* Horizontal carousel */}
                  <div
                    style={{ overflow: 'hidden', position: 'relative' }}
                    onTouchStart={(e) => {
                      e.currentTarget._touchStartX = e.touches[0].clientX;
                    }}
                    onTouchEnd={(e) => {
                      const diff = e.currentTarget._touchStartX - e.changedTouches[0].clientX;
                      if (diff > 50 && suggestionSlide < scoreSuggestions.length - 1) {
                        setSuggestionSlide(s => s + 1);
                        setHoveredSuggestion(suggestionSlide + 1);
                      } else if (diff < -50 && suggestionSlide > 0) {
                        setSuggestionSlide(s => s - 1);
                        setHoveredSuggestion(suggestionSlide - 1);
                      }
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      transition: 'transform 0.3s ease',
                      transform: `translateX(-${suggestionSlide * 100}%)`,
                    }}>
                      {scoreSuggestions.map((suggestion, i) => (
                        <div
                          key={i}
                          style={{
                            ...styles.suggestionCard,
                            minWidth: '100%',
                            boxSizing: 'border-box',
                          }}
                          onMouseEnter={() => setHoveredSuggestion(i)}
                          onMouseLeave={() => setHoveredSuggestion(null)}
                        >
                          <div style={styles.suggestionHeader}>
                            <span style={styles.suggestionCategory}>{suggestion.category}</span>
                            <span style={styles.suggestionGain}>+{suggestion.potentialGain} pts</span>
                          </div>
                          <p style={styles.suggestionText}>
                            {suggestion.suggestion.split('\n').map((line, idx) => (
                              <span key={idx}>
                                {idx > 0 && <br />}
                                {/* Bold dollar amounts */}
                                {line.split(/(\$\d[\d,]*)/).map((part, pidx) =>
                                  /^\$\d/.test(part)
                                    ? <strong key={pidx}>{part}</strong>
                                    : part
                                )}
                              </span>
                            ))}
                          </p>
                          <div style={styles.suggestionProgress}>
                            <span style={styles.suggestionCurrent}>{suggestion.currentPoints} / {suggestion.maxPoints}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Dot indicators */}
                  {scoreSuggestions.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {scoreSuggestions.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => { setSuggestionSlide(i); setHoveredSuggestion(i); }}
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            border: 'none',
                            backgroundColor: i === suggestionSlide ? theme.accent : theme.border,
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'background-color 0.2s',
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Alerts + Looking Good — Side-by-side on desktop, toggle on mobile */}
          {(alerts.length > 0 || positives.length > 0) && (
            <section style={{
              backgroundColor: theme.cardBg,
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '1rem',
            }}>
              {/* Mobile toggle bar */}
              {isMobile && alerts.length > 0 && positives.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <button
                    onClick={() => setAlertsView('positives')}
                    style={{
                      flex: 1, padding: '0.5rem', borderRadius: '0.5rem', border: 'none',
                      backgroundColor: alertsView === 'positives' ? theme.successBg : 'transparent',
                      color: alertsView === 'positives' ? theme.success : theme.textDimmed,
                      fontWeight: alertsView === 'positives' ? '600' : '400',
                      cursor: 'pointer', fontSize: '0.8125rem',
                    }}
                  >
                    Looking Good ({positives.length})
                  </button>
                  <button
                    onClick={() => setAlertsView('alerts')}
                    style={{
                      flex: 1, padding: '0.5rem', borderRadius: '0.5rem', border: 'none',
                      backgroundColor: alertsView === 'alerts' ? theme.dangerBg : 'transparent',
                      color: alertsView === 'alerts' ? theme.danger : theme.textDimmed,
                      fontWeight: alertsView === 'alerts' ? '600' : '400',
                      cursor: 'pointer', fontSize: '0.8125rem',
                    }}
                  >
                    Attention ({alerts.length})
                  </button>
                </div>
              )}

              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                alignItems: 'stretch',
              }}>
                {/* Looking Good column */}
                {positives.length > 0 && (!isMobile || alertsView === 'positives' || alerts.length === 0) && (
                  <div style={{ flex: 1, minWidth: isMobile ? '100%' : '240px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ color: theme.success, fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem' }}>Looking Good</h3>
                    {(() => {
                      const hasCalc = (item) => typeof item === 'object' && item.calculation && typeof item.calculation === 'string' && item.calculation.trim().length > 0;
                      return (
                        <div
                          style={{ overflow: 'hidden', position: 'relative' }}
                          onTouchStart={(e) => { e.currentTarget._touchStartX = e.touches[0].clientX; }}
                          onTouchEnd={(e) => {
                            const diff = e.currentTarget._touchStartX - e.changedTouches[0].clientX;
                            if (diff > 50 && positiveSlide < positives.length - 1) setPositiveSlide(s => s + 1);
                            else if (diff < -50 && positiveSlide > 0) setPositiveSlide(s => s - 1);
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            transition: 'transform 0.3s ease',
                            transform: `translateX(-${positiveSlide * 100}%)`,
                          }}>
                            {positives.map((item, i) => {
                              const msg = typeof item === 'string' ? item : item.message;
                              const icon = item.icon || (msg.includes('paid') || msg.includes('Paid') ? 'check' : 'trending');
                              return (
                                <button
                                  key={i}
                                  onClick={() => { if (hasCalc(item)) setActivePopup({ type: 'positiveDetail', positive: item }); }}
                                  style={{
                                    minWidth: '100%', boxSizing: 'border-box',
                                    backgroundColor: theme.successBg, borderRadius: '0.75rem',
                                    padding: '1rem', cursor: hasCalc(item) ? 'pointer' : 'default',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    textAlign: 'center', gap: '0.5rem', border: 'none', width: '100%',
                                  }}
                                >
                                  <span style={{ fontSize: '2rem', lineHeight: 1, color: theme.success }}>
                                    {icon === 'check' ? '✓' : '↗'}
                                  </span>
                                  <span style={{ color: theme.successLight, fontSize: '0.8125rem' }}>{msg}</span>
                                  {hasCalc(item) && (
                                    <span style={{ color: theme.textDimmed, fontSize: '0.75rem' }}>Tap for details ›</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    {positives.length > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                        {positives.map((_, i) => (
                          <button key={i} onClick={() => setPositiveSlide(i)} style={{
                            width: '8px', height: '8px', borderRadius: '50%', border: 'none',
                            backgroundColor: i === positiveSlide ? theme.accent : theme.border,
                            cursor: 'pointer', padding: 0,
                          }} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Attention Needed column */}
                {alerts.length > 0 && (!isMobile || alertsView === 'alerts' || positives.length === 0) && (
                  <div style={{ flex: 1, minWidth: isMobile ? '100%' : '240px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ color: theme.danger, fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem' }}>Attention Needed</h3>
                    <div
                      style={{ overflow: 'hidden', position: 'relative' }}
                      onTouchStart={(e) => { e.currentTarget._touchStartX = e.touches[0].clientX; }}
                      onTouchEnd={(e) => {
                        const diff = e.currentTarget._touchStartX - e.changedTouches[0].clientX;
                        if (diff > 50 && alertSlide < alerts.length - 1) setAlertSlide(s => s + 1);
                        else if (diff < -50 && alertSlide > 0) setAlertSlide(s => s - 1);
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        transition: 'transform 0.3s ease',
                        transform: `translateX(-${alertSlide * 100}%)`,
                      }}>
                        {alerts.map((alert, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              if (alert.person && alert.disposableData) {
                                setActivePopup({ type: 'safeToSpend', person: alert.person, data: alert.disposableData, calculation: alert.calculation });
                              } else {
                                setActivePopup({ type: 'alertDetail', alert });
                              }
                            }}
                            style={{
                              minWidth: '100%', boxSizing: 'border-box',
                              backgroundColor: theme.dangerBg, borderRadius: '0.75rem',
                              padding: '1rem', cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              textAlign: 'center', gap: '0.5rem', border: 'none', width: '100%',
                            }}
                          >
                            <span style={{ fontSize: '2rem', lineHeight: 1, color: theme.danger }}>⚠</span>
                            <span style={{ color: theme.dangerLight, fontSize: '0.8125rem' }}>{alert.message}</span>
                            <span style={{ color: theme.textDimmed, fontSize: '0.75rem' }}>Tap for details ›</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {alerts.length > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                        {alerts.map((_, i) => (
                          <button key={i} onClick={() => setAlertSlide(i)} style={{
                            width: '8px', height: '8px', borderRadius: '50%', border: 'none',
                            backgroundColor: i === alertSlide ? theme.accent : theme.border,
                            cursor: 'pointer', padding: 0,
                          }} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}


          {/* Budget Health — card matching Looking Good / Attention Needed style */}
          {latestSnapshot && (() => {
            const budgetProjection = calculateBudgetHealth();
            if (!budgetProjection) return null;
            const surplusAbs = Math.abs(budgetProjection.surplus);
            const isOver = budgetProjection.isOverBudget;
            const statusColor = isOver ? theme.danger : theme.success;
            const statusBg = isOver ? theme.dangerBg : theme.successBg;
            return (
              <button
                onClick={() => setActivePopup({ type: 'budgetHealth', data: budgetProjection })}
                style={{
                  backgroundColor: statusBg, borderRadius: '0.75rem',
                  padding: '1rem', cursor: 'pointer', width: '100%',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  textAlign: 'center', gap: '0.5rem', border: 'none',
                  marginBottom: '1rem',
                }}
              >
                <span style={{ fontSize: '2rem', lineHeight: 1, color: statusColor }}>
                  {isOver ? '⚠' : '✓'}
                </span>
                <span style={{ color: isOver ? theme.dangerLight : theme.successLight, fontSize: '0.8125rem', fontWeight: '600' }}>
                  Budget Health: {isOver ? '-' : '+'}${surplusAbs.toFixed(2)}
                </span>
                <span style={{ color: theme.textDimmed, fontSize: '0.75rem' }}>Tap for details ›</span>
              </button>
            );
          })()}

          {/* Total Balance Bonus Projections — tappable cards */}
          {latestSnapshot && (() => {
            const bills = getUpcomingBills();
            const personalSplits = getPersonalSplits();
            const effectiveCards = getEffectiveCreditCards();
            const upcomingPaydays = getUpcomingPaydays();
            const bucketColorMap = { live: theme.live, person1: theme.mat, person2: theme.mara };

            const cardProjections = [];

            for (const card of effectiveCards) {
              const nextBill = bills.find(b => b.type === card.card_id);
              if (!nextBill) continue;

              const paidFromBucket = card.paid_from_bucket || 'live';
              const balance = getSnapshotBucket(latestSnapshot, paidFromBucket);
              const cardData = getSnapshotCard(latestSnapshot, card.card_id);
              const total = cardData.total || 0;
              const score = total === 0 ? 100 : Math.min(100, Math.round((balance / total) * 100));
              const paydays = upcomingPaydays.filter(p => p.date <= nextBill.date);
              const depositAmounts = paydays.map(p => {
                let amount = 0;
                if (paidFromBucket === 'live') {
                  amount = p.type === 'mat' ? (config.splits.matLive || 984) : (config.splits.maraLive || 656);
                } else if (paidFromBucket === 'person1') {
                  amount = p.type === 'mat' ? personalSplits.matPersonalFromMat : personalSplits.matPersonalFromMara;
                } else if (paidFromBucket === 'person2') {
                  amount = p.type === 'mat' ? personalSplits.maraPersonalFromMat : personalSplits.maraPersonalFromMara;
                }
                return { date: p.date, type: p.type, amount };
              });

              const accountType = paidFromBucket === 'person1' ? 'mat' : paidFromBucket === 'person2' ? 'mara' : 'live';
              cardProjections.push({
                card: card.label, score,
                color: bucketColorMap[paidFromBucket] || theme.live,
                total, balance,
                accountType, person: accountType, dueDate: nextBill.date,
                depositAmounts, paydays,
              });
            }

            if (cardProjections.length === 0) return null;

            return (
              <section style={{ marginBottom: '1rem' }}>
                <h2 style={{ ...styles.sectionTitle, marginBottom: '0.75rem' }}>Total Balance Bonus</h2>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  {cardProjections.map((cp) => (
                    <button key={cp.card}
                      onClick={() => setActivePopup({ type: 'tbbDetail', card: cp })}
                      style={{
                        flex: 1, backgroundColor: theme.cardBg, borderRadius: '0.75rem',
                        padding: '1rem', textAlign: 'center', border: 'none', cursor: 'pointer',
                      }}
                    >
                      {/* Mini score circle */}
                      <svg viewBox="0 0 60 60" style={{ width: 60, height: 60, margin: '0 auto 0.5rem' }}>
                        <circle cx="30" cy="30" r="26" fill="none" stroke={theme.border} strokeWidth="4" />
                        <circle
                          cx="30" cy="30" r="26" fill="none"
                          stroke={cp.score >= 100 ? theme.success : cp.score >= 50 ? theme.warning : theme.danger}
                          strokeWidth="4"
                          strokeDasharray={`${cp.score * 1.634} 163.4`}
                          strokeLinecap="round"
                          transform="rotate(-90 30 30)"
                        />
                        <text x="30" y="34" textAnchor="middle" fill={theme.text} fontSize="14" fontWeight="700">
                          {cp.score}
                        </text>
                      </svg>
                      <div style={{ color: theme.text, fontSize: '0.75rem', fontWeight: '600' }}>{cp.card}</div>
                      <div style={{ color: theme.textMuted, fontSize: '0.625rem', marginTop: '0.25rem' }}>
                        ${Math.round(cp.total)} total
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })()}

          {/* Timeline moved to Calendar tab */}
        </main>
      )}


      {currentView === 'accounts' && (
        <main style={styles.accountsMain}>
          {/* Net Position Overview */}
          <section style={styles.chartCard}>
            <div style={styles.chartCardHeader}>
              <span style={{ color: theme.accent, fontWeight: '600' }}>Net Worth</span>
              {chartData && chartData.netPosition.length > 0 && (
                <span style={{ color: theme.text, fontWeight: '600' }}>
                  ${chartData.netPosition[chartData.netPosition.length - 1].netPosition.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <p style={{ color: theme.textDimmed, fontSize: '0.75rem', marginBottom: '0.75rem' }}>
              Total checking minus total credit card balances
            </p>
            <div style={styles.chartWrapper}>
              <NetPositionChart data={chartData?.netPosition || []} theme={theme} />
            </div>
          </section>

          {/* Checking Accounts */}
          <h2 style={styles.sectionTitle}>Checking Accounts</h2>
          <div style={styles.accountListCard}>
            {latestSnapshot && ['give', 'save', 'live', 'mat', 'mara'].map(key => {
              const labels = { give: 'Give', save: 'Save', live: 'Live', mat: config.person1Name, mara: config.person2Name };
              const colors = { give: theme.give, save: theme.save, live: theme.live, mat: theme.mat, mara: theme.mara };
              const bucket = key === 'mat' ? 'person1' : key === 'mara' ? 'person2' : key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedAccount({ key, type: 'checking', label: labels[key], color: colors[key] })}
                  style={styles.accountListItem}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: colors[key] }} />
                    <span style={{ fontWeight: '600', color: theme.text }}>{labels[key]}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: theme.text, fontWeight: '600' }}>
                      ${(getSnapshotBucket(latestSnapshot, bucket) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ color: theme.textDimmed, fontSize: '1rem' }}>&#8250;</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Credit Cards */}
          <h2 style={{ ...styles.sectionTitle, marginTop: '1.5rem' }}>Credit Cards</h2>
          <div style={styles.accountListCard}>
            {latestSnapshot && getEffectiveCreditCards().map(cardConfig => {
              const acctBucketColors = { live: theme.live, person1: theme.mat, person2: theme.mara };
              const card = {
                key: cardConfig.card_id,
                label: cardConfig.label,
                color: acctBucketColors[cardConfig.paid_from_bucket] || theme.live,
              };
              return (
              <button
                key={card.key}
                onClick={() => setSelectedAccount({ key: card.key, type: 'credit', label: card.label, color: card.color })}
                style={styles.accountListItem}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: card.color }} />
                  <span style={{ fontWeight: '600', color: theme.text }}>{card.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: theme.danger, fontWeight: '600' }}>
                    ${(getSnapshotCard(latestSnapshot, card.key)?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <span style={{ color: theme.textDimmed, fontSize: '1rem' }}>&#8250;</span>
                </div>
              </button>
              );
            })}
          </div>
        </main>
      )}

      {/* Calendar Tab */}
      {currentView === 'calendar' && (
        <main style={styles.main}>
          {(() => {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            // Get all events for this calendar month
            const getMonthEvents = () => {
              const events = [];
              const year = calendarYear;
              const month = calendarMonth;

              // Bills for this month — dynamically from credit cards
              const calendarBucketColors = { live: theme.live, person1: theme.mat, person2: theme.mara };
              for (const card of getEffectiveCreditCards()) {
                const cardDate = new Date(year, month, card.due_day);
                const cardData = latestSnapshot ? getSnapshotCard(latestSnapshot, card.card_id) : { statement: 0 };
                const cardPaid = (cardData.statement || 0) === 0;
                const cardColor = calendarBucketColors[card.paid_from_bucket] || theme.live;
                events.push({ date: cardDate, name: card.label, amount: cardData.statement || 0, type: 'bill', paid: cardPaid, color: cardColor });
              }

              // Rent last day
              const lastDay = new Date(year, month + 1, 0).getDate();
              events.push({ date: new Date(year, month, lastDay), name: "Rent", amount: config.monthlyBills?.rent || 2135, type: 'bill', paid: false, color: theme.danger });

              // Paydays
              let maraNext = new Date(2026, 0, 23);
              while (maraNext.getFullYear() < year || (maraNext.getFullYear() === year && maraNext.getMonth() < month)) {
                maraNext.setDate(maraNext.getDate() + 14);
              }
              while (maraNext.getMonth() === month && maraNext.getFullYear() === year) {
                events.push({ date: new Date(maraNext), name: "Mara Payday", amount: config.maraPayAmount || 1302.06, type: 'payday', color: theme.success });
                maraNext.setDate(maraNext.getDate() + 14);
              }

              let matNext = new Date(2026, 0, 30);
              while (matNext.getFullYear() < year || (matNext.getFullYear() === year && matNext.getMonth() < month)) {
                matNext.setDate(matNext.getDate() + 14);
              }
              while (matNext.getMonth() === month && matNext.getFullYear() === year) {
                events.push({ date: new Date(matNext), name: "Mat Payday", amount: config.matPayAmount || 2018.55, type: 'payday', color: theme.success });
                matNext.setDate(matNext.getDate() + 14);
              }

              return events;
            };

            const monthEvents = getMonthEvents();
            const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay();
            const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
            const today = new Date();

            // Build 6x7 grid
            const cells = [];
            for (let i = 0; i < 42; i++) {
              const dayNum = i - firstDayOfMonth + 1;
              const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
              const cellDate = inMonth ? new Date(calendarYear, calendarMonth, dayNum) : null;
              const dayEvents = inMonth ? monthEvents.filter(e => e.date.getDate() === dayNum) : [];
              const isToday = inMonth && cellDate.toDateString() === today.toDateString();
              cells.push({ dayNum: inMonth ? dayNum : null, inMonth, dayEvents, isToday, cellDate });
            }

            return (
              <>
                {/* Month navigation */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <button
                    onClick={() => {
                      if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); }
                      else setCalendarMonth(m => m - 1);
                    }}
                    style={{ background: 'none', border: 'none', color: theme.text, fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                  >‹</button>
                  <h2 style={{ color: theme.text, fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                    {monthNames[calendarMonth]} {calendarYear}
                  </h2>
                  <button
                    onClick={() => {
                      if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); }
                      else setCalendarMonth(m => m + 1);
                    }}
                    style={{ background: 'none', border: 'none', color: theme.text, fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                  >›</button>
                </div>

                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                  {dayNames.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '0.6875rem', color: theme.textDimmed, fontWeight: '600', padding: '0.25rem 0' }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                  {cells.map((cell, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        if (cell.dayEvents.length > 0) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setCalendarTooltip(prev =>
                            prev && prev.day === cell.dayNum ? null
                            : { day: cell.dayNum, events: cell.dayEvents, x: rect.left, y: rect.bottom }
                          );
                        } else {
                          setCalendarTooltip(null);
                        }
                      }}
                      style={{
                        backgroundColor: cell.isToday ? theme.accentBg : 'transparent',
                        border: cell.isToday ? `1px solid ${theme.accent}` : '1px solid transparent',
                        borderRadius: '0.375rem',
                        padding: '0.375rem 0.25rem',
                        minHeight: 48,
                        cursor: cell.dayEvents.length > 0 ? 'pointer' : 'default',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                      }}
                    >
                      <span style={{
                        fontSize: '0.75rem',
                        color: !cell.inMonth ? 'transparent' : cell.isToday ? theme.accent : theme.text,
                        fontWeight: cell.isToday ? '700' : '400',
                      }}>
                        {cell.dayNum || ''}
                      </span>
                      {/* Event dots */}
                      <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {cell.dayEvents.map((evt, ei) => (
                          <div key={ei} style={{
                            width: 6, height: 6, borderRadius: '50%',
                            backgroundColor: evt.paid ? theme.textDimmed : evt.type === 'payday' ? theme.success : theme.danger,
                            opacity: evt.paid ? 0.5 : 1,
                          }} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Tooltip */}
                {calendarTooltip && (
                  <div
                    style={{
                      position: 'fixed', left: Math.min(calendarTooltip.x, window.innerWidth - 220),
                      top: calendarTooltip.y + 8,
                      backgroundColor: theme.cardBgElevated, border: `1px solid ${theme.border}`,
                      borderRadius: '0.5rem', padding: '0.75rem', zIndex: 1000,
                      minWidth: 180, maxWidth: 240,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: theme.text, marginBottom: '0.5rem' }}>
                      {monthNames[calendarMonth]} {calendarTooltip.day}
                    </div>
                    {calendarTooltip.events.map((evt, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: evt.paid ? theme.textDimmed : evt.type === 'payday' ? theme.success : theme.danger }} />
                          <span style={{ fontSize: '0.75rem', color: theme.text }}>{evt.name}</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: evt.type === 'payday' ? theme.success : theme.danger, fontWeight: '600' }}>
                          {evt.type === 'payday' ? '+' : '-'}${Math.round(evt.amount).toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {calendarTooltip.events.some(e => e.paid) && (
                      <div style={{ fontSize: '0.625rem', color: theme.textDimmed, marginTop: '0.25rem', fontStyle: 'italic' }}>
                        Gray dot = already paid
                      </div>
                    )}
                    <button
                      onClick={() => setCalendarTooltip(null)}
                      style={{ display: 'block', width: '100%', marginTop: '0.5rem', padding: '0.25rem', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '0.25rem', color: theme.textMuted, fontSize: '0.6875rem', cursor: 'pointer' }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Legend */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap', fontSize: '0.6875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: theme.success }} />
                    <span style={{ color: theme.textMuted }}>Payday</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: theme.danger }} />
                    <span style={{ color: theme.textMuted }}>Bill due</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: theme.textDimmed, opacity: 0.5 }} />
                    <span style={{ color: theme.textMuted }}>Paid</span>
                  </div>
                </div>
              </>
            );
          })()}
        </main>
      )}

      {/* Transactions Tab */}
      {currentView === 'close' && (
        <CloseView
          theme={theme}
          authFetch={authFetch}
          apiUrl={API_URL}
          creditCards={getEffectiveCreditCards()}
          config={config}
          onRefresh={async () => {
            await Promise.all([syncTransactions(true, true), syncBalances(true, true)]);
            await Promise.all([fetchSnapshots(true), fetchCreditCards()]);
          }}
        />
      )}

      {currentView === 'transactions' && (
        <main style={styles.main}>
          {/* Header with last synced */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: theme.text, margin: 0 }}>Transactions</h2>
            <span style={{ fontSize: '0.75rem', color: theme.textDimmed }}>
              {(() => {
                const latest = connectedAccounts.reduce((max, item) =>
                  item.last_synced && (!max || new Date(item.last_synced) > new Date(max)) ? item.last_synced : max
                , null);
                return `Synced ${getRelativeTime(latest)}`;
              })()}
            </span>
          </div>

          {/* Filter Bar */}
          <div style={styles.filterBar}>
            <select
              value={transactionsFilter.account_type}
              onChange={(e) => {
                const newFilter = { account_type: e.target.value, limit: 50, offset: 0 };
                setTransactionsFilter(newFilter);
                fetchTransactions(newFilter);
              }}
              style={styles.filterSelect}
            >
              <option value="">All Accounts</option>
              <option value="give">Give</option>
              <option value="save">Save</option>
              <option value="live">Live</option>
              <option value="mat">Mat</option>
              <option value="mara">Mara</option>
              <option value="blue_total">Blue Amex</option>
              <option value="gold_total">Gold Amex</option>
              <option value="discover_total">Discover</option>
            </select>
          </div>

          {/* Transaction List */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '5rem' }}>
            {transactionsLoading && transactions.length === 0 ? (
              <p style={{ textAlign: 'center', color: theme.textMuted, padding: '2rem' }}>Loading transactions...</p>
            ) : transactions.length === 0 ? (
              <p style={{ textAlign: 'center', color: theme.textMuted, padding: '2rem' }}>No transactions yet. Tap Sync to fetch from Plaid.</p>
            ) : (
              <>
                {Object.entries(
                  transactions.reduce((groups, txn) => {
                    const d = txn.date;
                    if (!groups[d]) groups[d] = [];
                    groups[d].push(txn);
                    return groups;
                  }, {})
                ).map(([date, txns]) => (
                  <div key={date}>
                    <div style={styles.transactionDateHeader}>
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    {txns.map((txn) => {
                      const bucket = ACCOUNT_BUCKET_MAP[txn.app_account_type] || ACCOUNT_BUCKET_MAP.unmapped;
                      const isIncome = txn.amount < 0;
                      return (
                        <div key={txn.plaid_transaction_id || txn.id} style={styles.transactionRow}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: theme.text, fontSize: '0.875rem', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {txn.merchant_name || txn.name}
                            </div>
                            <span style={{ ...styles.accountTag, color: bucket.color, border: `1px solid ${bucket.color}` }}>
                              {bucket.label}
                            </span>
                          </div>
                          <span style={{ ...styles.transactionAmount, color: isIncome ? theme.success : theme.danger, marginLeft: '0.75rem', whiteSpace: 'nowrap' }}>
                            {isIncome ? '+' : '-'}${Math.abs(txn.amount).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Load More */}
                {transactions.length < transactionsTotal && (
                  <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <button
                      onClick={() => {
                        const newFilter = { ...transactionsFilter, offset: transactions.length };
                        setTransactionsFilter(newFilter);
                        fetchTransactions(newFilter);
                      }}
                      disabled={transactionsLoading}
                      style={{
                        padding: '0.5rem 1.5rem',
                        backgroundColor: theme.cardBg,
                        color: theme.accent,
                        border: `1px solid ${theme.accent}`,
                        borderRadius: '0.5rem',
                        fontSize: '0.8125rem',
                        fontWeight: '600',
                        cursor: transactionsLoading ? 'default' : 'pointer',
                      }}
                    >
                      {transactionsLoading ? 'Loading...' : `Load More (${transactions.length} of ${transactionsTotal})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {/* Account Detail Slide-in */}
      {selectedAccount && (
        <div style={styles.slideOverlay} onClick={() => setSelectedAccount(null)}>
          <div style={styles.slidePanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.slidePanelHeader}>
              <button onClick={() => setSelectedAccount(null)} style={styles.menuBackButton}>Back</button>
              <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: selectedAccount.color, margin: 0 }}>
                {selectedAccount.label}
              </h2>
              <div style={{ width: 40 }} />
            </div>

            {/* Current balance */}
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <span style={{ fontSize: '2rem', fontWeight: '700', color: theme.text }}>
                {latestSnapshot && (
                  selectedAccount.type === 'checking'
                    ? '$' + (getSnapshotBucket(latestSnapshot, selectedAccount.key === 'mat' ? 'person1' : selectedAccount.key === 'mara' ? 'person2' : selectedAccount.key) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
                    : '$' + (getSnapshotCard(latestSnapshot, selectedAccount.key)?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
                )}
              </span>
              <p style={{ color: theme.textDimmed, fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                {selectedAccount.type === 'checking' ? 'Current Balance' : 'Total Balance'}
              </p>
            </div>

            {/* Chart */}
            <div style={{ padding: '0 1rem 1rem' }}>
              {selectedAccount.type === 'checking' && (
                <BalanceChart
                  data={chartData?.accountSeries[selectedAccount.key] || []}
                  color={selectedAccount.color}
                  label={selectedAccount.label}
                  theme={theme}
                />
              )}
              {selectedAccount.type === 'credit' && (() => {
                // Build card config dynamically from creditCards state
                const chartBucketColors = { live: theme.live, person1: theme.mat, person2: theme.mara };
                const chartBucketNames = { live: 'LIVE', person1: config.person1Name?.toUpperCase() || 'PERSON 1', person2: config.person2Name?.toUpperCase() || 'PERSON 2' };
                const cardConfig = getEffectiveCreditCards().find(c => c.card_id === selectedAccount.key);
                const paidFrom = cardConfig?.paid_from_bucket || 'live';
                const cfg = {
                  cardColor: chartBucketColors[paidFrom] || theme.live,
                  accountColor: chartBucketColors[paidFrom] || theme.live,
                  accountName: chartBucketNames[paidFrom] || 'LIVE',
                  dueDay: cardConfig?.due_day || config.dueDates?.[selectedAccount.key] || 1,
                  stmtDay: cardConfig?.statement_close_day || config.statementCloseDates?.[selectedAccount.key] || 1,
                };
                return (
                  <CreditCardChart
                    data={chartData?.creditCards[selectedAccount.key] || []}
                    cardColor={cfg.cardColor}
                    accountColor={cfg.accountColor}
                    dueDay={cfg.dueDay}
                    statementCloseDay={cfg.stmtDay}
                    cardName={selectedAccount.label}
                    accountName={cfg.accountName}
                    theme={theme}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Popup system — slide-in detail panels for alerts and other cards */}
      {activePopup && (
        <div style={styles.slideOverlay} onClick={() => setActivePopup(null)}>
          <div style={styles.slidePanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.slidePanelHeader}>
              <button onClick={() => setActivePopup(null)} style={styles.menuBackButton}>Back</button>
              <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: theme.text, margin: 0 }}>
                {activePopup.type === 'safeToSpend'
                  ? `${activePopup.person === 'mat' ? config.person1Name : config.person2Name}: Safe to Spend`
                  : activePopup.type === 'positiveDetail' ? 'Looking Good'
                  : activePopup.type === 'budgetHealth' ? 'Budget Health'
                  : activePopup.type === 'tbbDetail' ? `${activePopup.card?.card || 'Card'} Payoff`
                  : 'Alert Details'}
              </h2>
              <div style={{ width: 40 }} />
            </div>

            {activePopup.type === 'safeToSpend' && activePopup.data && (
              <div style={{ padding: '1rem' }}>
                {/* Current safe-to-spend amount */}
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <span style={{
                    fontSize: '2rem',
                    fontWeight: '700',
                    color: activePopup.data.disposableIncome >= 0 ? theme.success : theme.danger,
                  }}>
                    ${Math.round(activePopup.data.disposableIncome)}
                  </span>
                  <p style={{ color: theme.textMuted, fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                    Safe to Spend
                  </p>
                </div>

                {/* SafeToSpend projection chart */}
                <SafeToSpendChart
                  disposableData={activePopup.data}
                  person={activePopup.person}
                  config={config}
                  theme={theme}
                  person1Name={config.person1Name}
                  person2Name={config.person2Name}
                />

                {/* Collapsible calculation details */}
                <div style={{ marginTop: '1rem' }}>
                  <button
                    onClick={() => setExpandedDetails(prev => ({ ...prev, popupCalc: !prev.popupCalc }))}
                    style={styles.detailsButton}
                  >
                    {expandedDetails.popupCalc ? 'Hide' : 'Show'} Calculation Details
                  </button>
                  {expandedDetails.popupCalc && activePopup.calculation && (
                    <div style={{ ...styles.calculationBox, marginTop: '0.75rem' }}>
                      {activePopup.calculation.split('\n').map((line, idx) => {
                        if (!line.trim()) return null;
                        const isIndented = line.startsWith('  ');
                        const isSuccess = line.includes('✓');
                        const isError = line.includes('✗');
                        return (
                          <div key={idx} style={{
                            ...styles.calculationRow,
                            paddingLeft: isIndented ? '1.5rem' : '0',
                            color: isSuccess ? theme.successLight : isError ? theme.dangerLight : isIndented ? theme.textMuted : theme.text,
                            fontStyle: isIndented ? 'italic' : 'normal',
                          }}>
                            <span>{line.trim()}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePopup.type === 'positiveDetail' && activePopup.positive && (
              <div style={{ padding: '1rem' }}>
                <p style={{ color: theme.successLight, fontSize: '0.9375rem', lineHeight: '1.5', marginBottom: '1rem' }}>
                  {activePopup.positive.message}
                </p>
                {activePopup.positive.details && (
                  <p style={{ color: theme.textMuted, fontSize: '0.8125rem', marginBottom: '1rem' }}>
                    {activePopup.positive.details}
                  </p>
                )}
                {/* SafeToSpend projection chart if data available */}
                {activePopup.positive.disposableData && (
                  <SafeToSpendChart
                    disposableData={activePopup.positive.disposableData}
                    person={activePopup.positive.person}
                    config={config}
                    theme={theme}
                    person1Name={config.person1Name}
                    person2Name={config.person2Name}
                  />
                )}
                {/* Collapsible calculation */}
                {activePopup.positive.calculation && (
                  <div style={{ marginTop: '1rem' }}>
                    <button
                      onClick={() => setExpandedDetails(prev => ({ ...prev, popupPositiveCalc: !prev.popupPositiveCalc }))}
                      style={styles.detailsButton}
                    >
                      {expandedDetails.popupPositiveCalc ? 'Hide' : 'Show'} Calculation Details
                    </button>
                    {expandedDetails.popupPositiveCalc && (
                      <div style={{ ...styles.calculationBox, marginTop: '0.75rem' }}>
                        {activePopup.positive.calculation.split('\n').map((line, idx) => {
                          if (!line.trim()) return null;
                          const isIndented = line.startsWith('  ');
                          const isSuccess = line.includes('✓');
                          const isError = line.includes('✗');
                          return (
                            <div key={idx} style={{
                              ...styles.calculationRow,
                              paddingLeft: isIndented ? '1.5rem' : '0',
                              color: isSuccess ? theme.successLight : isError ? theme.dangerLight : isIndented ? theme.textMuted : theme.text,
                              fontStyle: isIndented ? 'italic' : 'normal',
                            }}>
                              <span>{line.trim()}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activePopup.type === 'budgetHealth' && activePopup.data && (
              <div style={{ padding: '1rem' }}>
                {/* Budget Health Score */}
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <div style={{
                    ...styles.budgetHealthScoreCircle,
                    borderColor: activePopup.data.isOverBudget ? theme.danger : theme.success,
                    color: activePopup.data.isOverBudget ? theme.danger : theme.success,
                    margin: '0 auto',
                  }}>
                    {activePopup.data.budgetHealthScore}<span style={{ fontSize: '1rem', fontWeight: '400', color: theme.textMuted }}>/100</span>
                  </div>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    color: activePopup.data.isOverBudget ? theme.danger : theme.success,
                    marginTop: '0.5rem',
                  }}>
                    {activePopup.data.isOverBudget ? '-' : '+'}${Math.abs(activePopup.data.surplus).toFixed(2)}
                  </div>
                  <p style={{ color: theme.textMuted, fontSize: '0.8125rem' }}>
                    {activePopup.data.isOverBudget ? 'Projected over budget' : 'Projected under budget'}
                  </p>
                </div>

                {/* BudgetHealthChart */}
                <BudgetHealthChart
                  budgetProjection={activePopup.data}
                  config={config}
                  latestSnapshot={latestSnapshot}
                  theme={theme}
                  person1Name={config.person1Name}
                  person2Name={config.person2Name}
                />

                {/* Collapsible calculation details */}
                <div style={{ marginTop: '1rem' }}>
                  <button
                    onClick={() => setExpandedDetails(prev => ({ ...prev, popupBudgetCalc: !prev.popupBudgetCalc }))}
                    style={styles.detailsButton}
                  >
                    {expandedDetails.popupBudgetCalc ? 'Hide' : 'Show'} Calculation Details
                  </button>
                  {expandedDetails.popupBudgetCalc && (
                    <div style={{ ...styles.calculationBox, marginTop: '0.75rem' }}>
                      <div style={styles.calculationRow}>
                        <span>Current balance</span>
                        <span style={{ fontWeight: '600' }}>${activePopup.data.details.startingBalance.toFixed(2)}</span>
                      </div>
                      <div style={styles.calculationRow}>
                        <span>+ Projected paychecks</span>
                        <span style={{ fontWeight: '600' }}>+${activePopup.data.details.projectedInflows.toFixed(2)}</span>
                      </div>
                      {activePopup.data.details.rent > 0 && (
                        <div style={styles.calculationRow}>
                          <span>- Rent payment</span>
                          <span style={{ fontWeight: '600' }}>-${activePopup.data.details.rent.toFixed(2)}</span>
                        </div>
                      )}
                      {activePopup.data.details.liveCardTotal > 0 && (
                        <div style={styles.calculationRow}>
                          <span>- Credit card payments</span>
                          <span style={{ fontWeight: '600' }}>-${activePopup.data.details.liveCardTotal.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={styles.calculationRow}>
                        <span>- Remaining expenses ({activePopup.data.details.daysRemaining}d)</span>
                        <span style={{ fontWeight: '600' }}>-${activePopup.data.details.projectedRemainingExpenses.toFixed(2)}</span>
                      </div>
                      <div style={styles.calculationRow}>
                        <span>- Safety buffer</span>
                        <span style={{ fontWeight: '600' }}>-${activePopup.data.details.safetyBuffer.toFixed(2)}</span>
                      </div>
                      <div style={{ height: '1px', backgroundColor: theme.border, margin: '0.75rem 0' }} />
                      <div style={styles.calculationRow}>
                        <span>Projected EOM balance</span>
                        <span style={{ fontWeight: '600' }}>${activePopup.data.projectedLive.toFixed(2)}</span>
                      </div>
                      <div style={styles.calculationRow}>
                        <span style={{ fontWeight: '600' }}>{activePopup.data.isOverBudget ? 'Over budget' : 'Under budget'}</span>
                        <span style={{ fontWeight: '700', color: activePopup.data.isOverBudget ? theme.danger : theme.success }}>
                          {activePopup.data.isOverBudget ? '-' : '+'}${Math.abs(activePopup.data.surplus).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePopup.type === 'alertDetail' && activePopup.alert && (
              <div style={{ padding: '1rem' }}>
                <p style={{ color: theme.dangerLight, fontSize: '0.9375rem', lineHeight: '1.5', marginBottom: '1rem' }}>
                  {activePopup.alert.message}
                </p>
                {activePopup.alert.calculation && (
                  <div style={styles.calculationBox}>
                    {activePopup.alert.calculation.split('\n').map((line, idx) => {
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
                        <div key={idx} style={{
                          ...styles.calculationRow,
                          paddingLeft: isIndented ? '1.5rem' : '0',
                          color: isSuccess ? theme.successLight : isError ? theme.dangerLight : isWarning ? theme.warning : isIndented ? theme.textMuted : theme.text,
                          fontStyle: isIndented ? 'italic' : 'normal',
                        }}>
                          <span>{label}</span>
                          <span style={{ fontWeight: value && !isIndented ? '600' : '400' }}>{value}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activePopup.type === 'tbbDetail' && activePopup.card && (() => {
              const cp = activePopup.card;
              const totalDeposits = cp.depositAmounts.reduce((sum, d) => sum + d.amount, 0);
              const projectedBalance = cp.balance + totalDeposits;
              const remainingAfterPayoff = projectedBalance - cp.total;
              const canPayOff = remainingAfterPayoff >= config.cushion;

              // Build disposableData for SafeToSpendChart
              const tbbDisposableData = {
                accountBalance: cp.balance,
                nextPaymentAmount: cp.total,
                nextDueDate: cp.dueDate,
                cushion: config.cushion,
                paydaysBeforeDue: cp.paydays,
                depositAmounts: cp.depositAmounts,
              };

              return (
                <div style={{ padding: '1rem' }}>
                  {/* Score + status */}
                  <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <svg viewBox="0 0 60 60" style={{ width: 80, height: 80, margin: '0 auto' }}>
                      <circle cx="30" cy="30" r="26" fill="none" stroke={theme.border} strokeWidth="4" />
                      <circle
                        cx="30" cy="30" r="26" fill="none"
                        stroke={cp.score >= 100 ? theme.success : cp.score >= 50 ? theme.warning : theme.danger}
                        strokeWidth="4"
                        strokeDasharray={`${cp.score * 1.634} 163.4`}
                        strokeLinecap="round"
                        transform="rotate(-90 30 30)"
                      />
                      <text x="30" y="34" textAnchor="middle" fill={theme.text} fontSize="16" fontWeight="700">
                        {cp.score}
                      </text>
                    </svg>
                    <p style={{ color: canPayOff ? theme.success : theme.danger, fontWeight: '700', fontSize: '1rem', marginTop: '0.5rem' }}>
                      {canPayOff ? 'Can pay off in full' : 'Cannot pay off in full'}
                    </p>
                    <p style={{ color: theme.textMuted, fontSize: '0.8125rem' }}>
                      ${Math.round(cp.total)} total on {cp.card}
                    </p>
                  </div>

                  {/* Score explanation */}
                  <div style={{
                    backgroundColor: theme.cardBg, borderRadius: '0.5rem',
                    padding: '0.75rem', marginBottom: '1rem',
                    border: `1px solid ${theme.border}`,
                  }}>
                    <div style={{ color: theme.textMuted, fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                      How is this score calculated?
                    </div>
                    {cp.total === 0 ? (
                      <div style={{ color: theme.success, fontSize: '0.8125rem' }}>
                        No balance on this card — automatic 100!
                      </div>
                    ) : (
                      <>
                        <div style={{ color: theme.text, fontSize: '0.8125rem', lineHeight: '1.6' }}>
                          Score = {cp.accountType.toUpperCase()} Balance ÷ {cp.card} Total × 100
                        </div>
                        <div style={{ color: theme.text, fontSize: '0.875rem', fontWeight: '600', marginTop: '0.25rem' }}>
                          ${cp.balance.toFixed(2)} ÷ ${cp.total.toFixed(2)} × 100 = <span style={{ color: cp.score >= 100 ? theme.success : cp.score >= 50 ? theme.warning : theme.danger }}>{cp.score}</span>
                        </div>
                        <div style={{ color: theme.textDimmed, fontSize: '0.75rem', marginTop: '0.375rem' }}>
                          {cp.score >= 100
                            ? 'Your account balance fully covers the card total.'
                            : `Your account balance covers ${cp.score}% of the card total. The remaining ${100 - cp.score}% will need to come from upcoming deposits.`
                          }
                        </div>
                      </>
                    )}
                  </div>

                  {/* Projection chart */}
                  <SafeToSpendChart
                    disposableData={tbbDisposableData}
                    person={cp.person}
                    config={config}
                    theme={theme}
                    person1Name={config.person1Name}
                    person2Name={config.person2Name}
                  />

                  {/* Calculation details */}
                  <div style={{ marginTop: '1rem' }}>
                    <button
                      onClick={() => setExpandedDetails(prev => ({ ...prev, popupTbbCalc: !prev.popupTbbCalc }))}
                      style={styles.detailsButton}
                    >
                      {expandedDetails.popupTbbCalc ? 'Hide' : 'Show'} Calculation Details
                    </button>
                    {expandedDetails.popupTbbCalc && (
                      <div style={{ ...styles.calculationBox, marginTop: '0.75rem' }}>
                        <div style={styles.calculationRow}>
                          <span>Current {cp.accountType.toUpperCase()} balance</span>
                          <span style={{ fontWeight: '600' }}>${cp.balance.toFixed(2)}</span>
                        </div>
                        {cp.depositAmounts.length > 0 && (
                          <div style={styles.calculationRow}>
                            <span>+ Deposits before due date</span>
                            <span style={{ fontWeight: '600' }}>+${totalDeposits.toFixed(2)}</span>
                          </div>
                        )}
                        {cp.depositAmounts.map((d, i) => (
                          <div key={i} style={{ ...styles.calculationRow, paddingLeft: '1.5rem', color: theme.textMuted, fontStyle: 'italic' }}>
                            <span>{d.date.toLocaleDateString()} ({d.type === 'mat' ? config.person1Name : config.person2Name})</span>
                            <span>+${d.amount.toFixed(2)}</span>
                          </div>
                        ))}
                        <div style={styles.calculationRow}>
                          <span>Projected balance</span>
                          <span style={{ fontWeight: '600' }}>${projectedBalance.toFixed(2)}</span>
                        </div>
                        <div style={styles.calculationRow}>
                          <span>- {cp.card} total balance</span>
                          <span style={{ fontWeight: '600' }}>-${cp.total.toFixed(2)}</span>
                        </div>
                        <div style={{ height: '1px', backgroundColor: theme.border, margin: '0.75rem 0' }} />
                        <div style={styles.calculationRow}>
                          <span>Remaining after payoff</span>
                          <span style={{ fontWeight: '600' }}>${remainingAfterPayoff.toFixed(2)}</span>
                        </div>
                        <div style={styles.calculationRow}>
                          <span>- Required cushion</span>
                          <span style={{ fontWeight: '600' }}>-${config.cushion.toFixed(2)}</span>
                        </div>
                        <div style={{ height: '1px', backgroundColor: theme.border, margin: '0.75rem 0' }} />
                        <div style={styles.calculationRow}>
                          <span style={{ fontWeight: '600' }}>{canPayOff ? 'Surplus' : 'Shortfall'}</span>
                          <span style={{ fontWeight: '700', color: canPayOff ? theme.success : theme.danger }}>
                            {canPayOff ? '+' : '-'}${Math.abs(remainingAfterPayoff - config.cushion).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav style={styles.bottomNav}>
        <button
          onClick={() => setCurrentView('home')}
          style={{
            ...styles.bottomNavButton,
            color: currentView === 'home' ? theme.accent : theme.textDimmed,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <span>Home</span>
        </button>
        <button
          onClick={() => setCurrentView('accounts')}
          style={{
            ...styles.bottomNavButton,
            color: currentView === 'accounts' ? theme.accent : theme.textDimmed,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"></rect>
            <line x1="2" y1="10" x2="22" y2="10"></line>
          </svg>
          <span>Accounts</span>
        </button>
        <button
          onClick={() => setCurrentView('close')}
          style={{
            ...styles.bottomNavButton,
            color: currentView === 'close' ? theme.accent : theme.textDimmed,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
            <rect x="2" y="3" width="20" height="18" rx="3"></rect>
          </svg>
          <span>Close</span>
        </button>
        <button
          onClick={() => setCurrentView('transactions')}
          style={{
            ...styles.bottomNavButton,
            color: currentView === 'transactions' ? theme.accent : theme.textDimmed,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
          <span>Activity</span>
        </button>
        <button
          onClick={() => { setCurrentView('calendar'); setCalendarTooltip(null); }}
          style={{
            ...styles.bottomNavButton,
            color: currentView === 'calendar' ? theme.accent : theme.textDimmed,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span>Calendar</span>
        </button>
      </nav>
    </div>
  );
}

// Add keyframes for spinner animation and global styles
// Body background uses Ink Wash dark default; the React component overrides via inline styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    background-color: #0F1115;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  @keyframes coinFlip {
    0% { transform: rotateY(0deg); }
    50% { transform: rotateY(180deg); }
    100% { transform: rotateY(360deg); }
  }
  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
`;
document.head.appendChild(styleSheet);
