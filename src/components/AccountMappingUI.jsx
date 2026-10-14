import { useState, useEffect } from 'react';

import { API_URL } from '../api';

// Budget buckets that a checking/savings account can be directly mapped to
const CHECKING_BUCKETS = [
  { value: '', label: '-- Choose mapping --' },
  { value: 'give', label: 'Give' },
  { value: 'save', label: 'Save' },
  { value: 'live', label: 'Live (Household)' },
  { value: 'person1', label: 'Person 1 Personal' },
  { value: 'person2', label: 'Person 2 Personal' },
];

// Which budget bucket pays each credit card
const PAID_FROM_OPTIONS = [
  { value: 'live', label: 'Household (Live)' },
  { value: 'person1', label: 'Person 1 Personal' },
  { value: 'person2', label: 'Person 2 Personal' },
];

const AccountMappingUI = ({ onMappingSaved, authFetch, isSyncing, person1Name, person2Name }) => {
  const [accounts, setAccounts] = useState([]);
  // mappings: { [plaid_account_id]: { mode, bucket, cardId, cardLabel, paidFromBucket, dueDay } }
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const p1 = person1Name || 'Person 1';
  const p2 = person2Name || 'Person 2';

  // Replace generic labels with actual person names
  const checkingBuckets = CHECKING_BUCKETS.map(b => ({
    ...b,
    label: b.value === 'person1' ? `${p1}'s Personal` : b.value === 'person2' ? `${p2}'s Personal` : b.label,
  }));
  const paidFromOptions = PAID_FROM_OPTIONS.map(o => ({
    ...o,
    label: o.value === 'person1' ? `${p1}'s Personal` : o.value === 'person2' ? `${p2}'s Personal` : o.label,
  }));

  useEffect(() => {
    fetchAccountsWithMappings();
  }, []);

  const fetchAccountsWithMappings = async () => {
    setLoading(true);
    try {
      const response = await authFetch(`${API_URL}/api/accounts/with-mappings`);
      const data = await response.json();
      setAccounts(data.accounts || []);

      // Initialize mappings from current data (supports both old and new format)
      const currentMappings = {};
      (data.accounts || []).forEach(acc => {
        if (acc.mapping_mode) {
          // New format
          currentMappings[acc.account_id] = {
            mode: acc.mapping_mode,
            bucket: acc.bucket || null,
            cardId: acc.card_id || null,
            cardLabel: acc.card_label || acc.name || '',
            paidFromBucket: acc.paid_from_bucket || 'live',
            dueDay: 1,
          };
        } else if (acc.mapped_to) {
          // Old format — convert to new structure
          const oldType = acc.mapped_to;
          const isCC = oldType.includes('blue') || oldType.includes('gold') || oldType.includes('discover');
          if (isCC) {
            const cardId = oldType.replace('_total', '');
            const paidFrom = cardId === 'blue' ? 'live' : cardId === 'gold' ? 'person1' : 'person2';
            currentMappings[acc.account_id] = {
              mode: 'credit_card',
              bucket: null,
              cardId,
              cardLabel: acc.name || cardId,
              paidFromBucket: paidFrom,
              dueDay: cardId === 'blue' ? 8 : cardId === 'gold' ? 15 : 2,
            };
          } else {
            const bucket = oldType === 'mat' ? 'person1' : oldType === 'mara' ? 'person2' : oldType;
            currentMappings[acc.account_id] = {
              mode: 'direct',
              bucket,
              cardId: null,
              cardLabel: '',
              paidFromBucket: null,
              dueDay: null,
            };
          }
        }
      });
      setMappings(currentMappings);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setMessage('Error loading accounts. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  };

  // Handle mode selection for a checking/savings account
  const handleCheckingBucketChange = (accountId, bucketValue) => {
    setMappings(prev => {
      const updated = { ...prev };
      if (bucketValue === '') {
        delete updated[accountId];
      } else if (bucketValue === 'primary') {
        updated[accountId] = { mode: 'primary', bucket: null, cardId: null, cardLabel: '', paidFromBucket: null, dueDay: null };
      } else {
        updated[accountId] = { mode: 'direct', bucket: bucketValue, cardId: null, cardLabel: '', paidFromBucket: null, dueDay: null };
      }
      return updated;
    });
  };

  // Handle credit card config changes
  const handleCardFieldChange = (accountId, field, value) => {
    setMappings(prev => {
      const updated = { ...prev };
      const current = updated[accountId] || { mode: 'credit_card', bucket: null, cardId: '', cardLabel: '', paidFromBucket: 'live', dueDay: 1 };
      updated[accountId] = { ...current, [field]: value };
      return updated;
    });
  };

  // Initialize a credit card mapping with defaults
  const initCardMapping = (accountId, account) => {
    setMappings(prev => ({
      ...prev,
      [accountId]: {
        mode: 'credit_card',
        bucket: null,
        cardId: account.name?.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20) || `card_${accountId.substring(0, 8)}`,
        cardLabel: account.name || 'Credit Card',
        paidFromBucket: 'live',
        dueDay: 1,
      },
    }));
  };

  // Clear a mapping
  const clearMapping = (accountId) => {
    setMappings(prev => {
      const updated = { ...prev };
      delete updated[accountId];
      return updated;
    });
  };

  const saveMappings = async () => {
    setSaving(true);
    setMessage('');

    try {
      // Convert mappings object to array format for the new server endpoint
      const mappingsArray = Object.entries(mappings).map(([plaidAccountId, m]) => {
        const account = accounts.find(a => a.account_id === plaidAccountId);
        const base = {
          plaid_account_id: plaidAccountId,
          plaid_account_name: account?.name || 'Unknown',
          mapping_mode: m.mode,
        };

        if (m.mode === 'direct') {
          // Also send old-format app_account_type for backward compat
          const legacyType = m.bucket === 'person1' ? 'mat' : m.bucket === 'person2' ? 'mara' : m.bucket;
          return { ...base, bucket: m.bucket, app_account_type: legacyType };
        } else if (m.mode === 'primary') {
          return { ...base, app_account_type: 'live' }; // fallback
        } else if (m.mode === 'credit_card') {
          // Also send old-format app_account_type for backward compat
          const legacyCardType = ['blue', 'gold', 'discover'].includes(m.cardId) ? `${m.cardId}_total` : m.cardId;
          return {
            ...base,
            card_id: m.cardId,
            card_label: m.cardLabel,
            paid_from_bucket: m.paidFromBucket,
            due_day: m.dueDay,
            app_account_type: legacyCardType,
            is_credit_card: true,
          };
        }
        return base;
      });

      const response = await authFetch(`${API_URL}/api/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: mappingsArray }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`Saved ${data.count} mappings! Syncing your accounts...`);
        onMappingSaved && onMappingSaved();
      } else {
        setMessage('Error saving mappings: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving mappings:', error);
      setMessage('Error saving mappings. Check server connection.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // Group accounts by institution
  const groupedAccounts = accounts.reduce((groups, account) => {
    const institution = account.institution || 'Unknown';
    if (!groups[institution]) groups[institution] = [];
    groups[institution].push(account);
    return groups;
  }, {});

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading connected accounts...</div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <p>No accounts connected yet.</p>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Connect your accounts using the button above, then return here to configure mappings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>Map Your Accounts</h4>
        <p style={styles.subtitle}>
          Connect each bank account to your budget. Flip takes your accounts — however many you have — and shows your money through the Give-Save-Live lens.
        </p>
      </div>

      {message && (
        <div style={{
          ...styles.message,
          backgroundColor: message.includes('Saved') ? '#064e3b' : '#7f1d1d'
        }}>
          {message}
        </div>
      )}

      <div style={styles.accountsList}>
        {Object.entries(groupedAccounts).map(([institution, institutionAccounts]) => (
          <div key={institution} style={styles.institutionGroup}>
            <div style={styles.institutionHeader}>
              <span style={styles.institutionName}>{institution}</span>
            </div>

            {institutionAccounts.map(account => {
              const m = mappings[account.account_id];
              const isCredit = account.type === 'credit';

              return (
                <div key={account.account_id} style={styles.accountRow}>
                  <div style={styles.accountInfo}>
                    <div style={styles.accountName}>
                      {account.name}
                      {account.mask && (
                        <span style={styles.accountMask}> ••{account.mask}</span>
                      )}
                    </div>
                    <div style={styles.accountDetails}>
                      <span style={{
                        ...styles.accountType,
                        backgroundColor: isCredit ? '#7f1d1d' : '#064e3b'
                      }}>
                        {isCredit ? 'Credit Card' : account.subtype || 'Checking'}
                      </span>
                      <span style={styles.accountBalance}>
                        ${Math.abs(account.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Mapping controls — different UI for checking vs credit */}
                  <div style={styles.mappingControls}>
                    {isCredit ? (
                      // Credit card: auto-detected, configure paid_from and label
                      !m ? (
                        <button
                          onClick={() => initCardMapping(account.account_id, account)}
                          style={styles.addCardButton}
                        >
                          + Map Card
                        </button>
                      ) : (
                        <div style={styles.cardConfig}>
                          <div style={styles.cardConfigRow}>
                            <label style={styles.cardConfigLabel}>Card Name</label>
                            <input
                              type="text"
                              value={m.cardLabel || ''}
                              onChange={(e) => handleCardFieldChange(account.account_id, 'cardLabel', e.target.value)}
                              style={styles.cardInput}
                              placeholder="e.g. Chase Sapphire"
                            />
                          </div>
                          <div style={styles.cardConfigRow}>
                            <label style={styles.cardConfigLabel}>Paid from</label>
                            <select
                              value={m.paidFromBucket || 'live'}
                              onChange={(e) => handleCardFieldChange(account.account_id, 'paidFromBucket', e.target.value)}
                              style={styles.cardSelect}
                            >
                              {paidFromOptions.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          <div style={styles.cardConfigRow}>
                            <label style={styles.cardConfigLabel}>Due day</label>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={m.dueDay || 1}
                              onChange={(e) => handleCardFieldChange(account.account_id, 'dueDay', parseInt(e.target.value) || 1)}
                              style={{ ...styles.cardInput, width: '60px' }}
                            />
                          </div>
                          <button
                            onClick={() => clearMapping(account.account_id)}
                            style={styles.removeButton}
                          >
                            Remove
                          </button>
                        </div>
                      )
                    ) : (
                      // Checking/savings: select which bucket
                      <select
                        value={m?.mode === 'direct' ? m.bucket : m?.mode === 'primary' ? 'primary' : ''}
                        onChange={(e) => handleCheckingBucketChange(account.account_id, e.target.value)}
                        style={{
                          ...styles.select,
                          borderColor: m ? '#10b981' : '#334155'
                        }}
                      >
                        {checkingBuckets.map(bucket => (
                          <option key={bucket.value} value={bucket.value}>
                            {bucket.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={styles.summary}>
        <span style={styles.summaryText}>
          {Object.keys(mappings).length} of {accounts.length} accounts mapped
        </span>
        <button
          onClick={saveMappings}
          disabled={saving || isSyncing || Object.keys(mappings).length === 0}
          style={{
            ...styles.saveButton,
            opacity: saving || isSyncing || Object.keys(mappings).length === 0 ? 0.6 : 1
          }}
        >
          {isSyncing ? 'Syncing...' : saving ? 'Saving...' : 'Save Mappings'}
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: '#1e293b',
    borderRadius: '0.75rem',
    padding: '1.25rem',
    marginTop: '1rem',
  },
  header: {
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#f1f5f9',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    margin: '0.25rem 0 0 0',
    lineHeight: '1.4',
  },
  loading: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: '2rem',
  },
  emptyState: {
    textAlign: 'center',
    color: '#cbd5e1',
    padding: '1.5rem',
  },
  message: {
    padding: '0.75rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    fontSize: '0.875rem',
    color: '#fff',
    textAlign: 'center',
  },
  accountsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  institutionGroup: {
    backgroundColor: '#0f172a',
    borderRadius: '0.5rem',
    overflow: 'hidden',
  },
  institutionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
  },
  institutionName: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0',
  },
  accountRow: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #1e293b',
  },
  accountInfo: {
    marginBottom: '0.5rem',
  },
  accountName: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#f1f5f9',
  },
  accountMask: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  accountDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.25rem',
  },
  accountType: {
    fontSize: '0.625rem',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  accountBalance: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  mappingControls: {
    marginTop: '0.5rem',
  },
  select: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    color: '#f1f5f9',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  addCardButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: '#1e293b',
    border: '1px dashed #475569',
    borderRadius: '0.375rem',
    color: '#94a3b8',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  },
  cardConfig: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.5rem',
    backgroundColor: '#1e293b',
    borderRadius: '0.375rem',
    border: '1px solid #10b981',
  },
  cardConfigRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  cardConfigLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    minWidth: '70px',
    flexShrink: 0,
  },
  cardInput: {
    flex: 1,
    padding: '0.375rem 0.5rem',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.25rem',
    color: '#f1f5f9',
    fontSize: '0.8125rem',
  },
  cardSelect: {
    flex: 1,
    padding: '0.375rem 0.5rem',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.25rem',
    color: '#f1f5f9',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  },
  removeButton: {
    alignSelf: 'flex-end',
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    border: '1px solid #7f1d1d',
    borderRadius: '0.25rem',
    color: '#ef4444',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  summary: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #334155',
  },
  summaryText: {
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  saveButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
};

export default AccountMappingUI;
