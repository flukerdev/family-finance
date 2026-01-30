import { useState, useEffect } from 'react';

// Available app account types for mapping
const ACCOUNT_BUCKETS = [
  { value: '', label: '-- Select Bucket --', group: 'none' },
  { value: 'give', label: 'Give (Checking)', group: 'checking' },
  { value: 'save', label: 'Save (Checking)', group: 'checking' },
  { value: 'live', label: 'Live (Checking)', group: 'checking' },
  { value: 'mat', label: "Mat's Personal", group: 'checking' },
  { value: 'mara', label: "Mara's Personal", group: 'checking' },
  { value: 'blue_total', label: 'Blue Amex (Credit Card)', group: 'credit' },
  { value: 'gold_total', label: 'Gold Amex (Credit Card)', group: 'credit' },
  { value: 'discover_total', label: 'Discover (Credit Card)', group: 'credit' },
];

const AccountMappingUI = ({ onMappingSaved }) => {
  const [accounts, setAccounts] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch accounts and their current mappings
  useEffect(() => {
    fetchAccountsWithMappings();
  }, []);

  const fetchAccountsWithMappings = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/accounts/with-mappings');
      const data = await response.json();

      setAccounts(data.accounts || []);

      // Initialize mappings from current data
      const currentMappings = {};
      (data.accounts || []).forEach(acc => {
        if (acc.mapped_to) {
          currentMappings[acc.account_id] = acc.mapped_to;
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

  const handleMappingChange = (accountId, bucketValue) => {
    setMappings(prev => {
      const updated = { ...prev };
      if (bucketValue) {
        updated[accountId] = bucketValue;
      } else {
        delete updated[accountId];
      }
      return updated;
    });
  };

  const saveMappings = async () => {
    setSaving(true);
    setMessage('');

    try {
      // Convert mappings object to array format for database
      const mappingsArray = Object.entries(mappings).map(([plaidAccountId, appAccountType]) => {
        const account = accounts.find(a => a.account_id === plaidAccountId);
        return {
          plaid_account_id: plaidAccountId,
          plaid_account_name: account?.name || 'Unknown',
          app_account_type: appAccountType,
          is_credit_card: appAccountType.includes('blue') || appAccountType.includes('gold') || appAccountType.includes('discover'),
        };
      });

      const response = await fetch('http://localhost:3001/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: mappingsArray }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✅ Saved ${data.count} account mappings!`);
        onMappingSaved && onMappingSaved();
      } else {
        setMessage('❌ Error saving mappings');
      }
    } catch (error) {
      console.error('Error saving mappings:', error);
      setMessage('❌ Error saving mappings. Check server connection.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // Group accounts by institution
  const groupedAccounts = accounts.reduce((groups, account) => {
    const institution = account.institution || 'Unknown';
    if (!groups[institution]) {
      groups[institution] = [];
    }
    groups[institution].push(account);
    return groups;
  }, {});

  // Check which buckets are already assigned
  const usedBuckets = new Set(Object.values(mappings));

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
          <p>No bank accounts connected yet.</p>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Connect your banks using the button above, then return here to configure mappings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>Account Mapping</h4>
        <p style={styles.subtitle}>
          Assign each bank account to its corresponding budget bucket
        </p>
      </div>

      {message && (
        <div style={{
          ...styles.message,
          backgroundColor: message.includes('✅') ? '#064e3b' : '#7f1d1d'
        }}>
          {message}
        </div>
      )}

      <div style={styles.accountsList}>
        {Object.entries(groupedAccounts).map(([institution, institutionAccounts]) => (
          <div key={institution} style={styles.institutionGroup}>
            <div style={styles.institutionHeader}>
              <span style={styles.institutionIcon}>🏦</span>
              <span style={styles.institutionName}>{institution}</span>
            </div>

            {institutionAccounts.map(account => {
              const currentMapping = mappings[account.account_id] || '';
              const isCredit = account.type === 'credit';

              return (
                <div key={account.account_id} style={styles.accountRow}>
                  <div style={styles.accountInfo}>
                    <div style={styles.accountName}>
                      {account.name}
                      {account.mask && (
                        <span style={styles.accountMask}>••••{account.mask}</span>
                      )}
                    </div>
                    <div style={styles.accountDetails}>
                      <span style={{
                        ...styles.accountType,
                        backgroundColor: isCredit ? '#7f1d1d' : '#064e3b'
                      }}>
                        {isCredit ? 'Credit Card' : 'Checking/Savings'}
                      </span>
                      <span style={styles.accountBalance}>
                        ${Math.abs(account.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div style={styles.mappingSelect}>
                    <select
                      value={currentMapping}
                      onChange={(e) => handleMappingChange(account.account_id, e.target.value)}
                      style={{
                        ...styles.select,
                        borderColor: currentMapping ? '#10b981' : '#334155'
                      }}
                    >
                      {ACCOUNT_BUCKETS.map(bucket => {
                        const isUsed = usedBuckets.has(bucket.value) && bucket.value !== currentMapping;
                        const isWrongType = (isCredit && bucket.group === 'checking') || (!isCredit && bucket.group === 'credit');

                        return (
                          <option
                            key={bucket.value}
                            value={bucket.value}
                            disabled={isUsed || isWrongType}
                            style={{
                              color: isUsed ? '#64748b' : isWrongType ? '#64748b' : '#fff'
                            }}
                          >
                            {bucket.label} {isUsed ? '(assigned)' : ''}
                          </option>
                        );
                      })}
                    </select>
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
          disabled={saving || Object.keys(mappings).length === 0}
          style={{
            ...styles.saveButton,
            opacity: saving || Object.keys(mappings).length === 0 ? 0.6 : 1
          }}
        >
          {saving ? 'Saving...' : 'Save Mappings'}
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
  institutionIcon: {
    fontSize: '1.25rem',
  },
  institutionName: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0',
  },
  accountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #1e293b',
    gap: '1rem',
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#f1f5f9',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
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
  mappingSelect: {
    flexShrink: 0,
  },
  select: {
    padding: '0.5rem 0.75rem',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    color: '#f1f5f9',
    fontSize: '0.875rem',
    cursor: 'pointer',
    minWidth: '180px',
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
