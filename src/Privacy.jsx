// Public privacy policy page (Plaid compliance). Rendered at /privacy without login.
export default function Privacy({ theme }) {
  const styles = { container: { backgroundColor: theme.bg, color: theme.text, fontFamily: 'Inter, system-ui, sans-serif' } };
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
