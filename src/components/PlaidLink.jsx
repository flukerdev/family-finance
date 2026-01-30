import { useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

const PlaidLink = ({ onSuccess }) => {
  const [linkToken, setLinkToken] = useState(null);

  useEffect(() => {
    // Fetch link token from backend
    const fetchLinkToken = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/create_link_token', {
          method: 'POST',
        });
        const data = await response.json();
        setLinkToken(data.link_token);
      } catch (error) {
        console.error('Error fetching link token:', error);
      }
    };

    fetchLinkToken();
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      // Exchange public token for access token
      try {
        const response = await fetch('http://localhost:3001/api/exchange_public_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution // Pass institution name
          }),
        });
        const data = await response.json();
        if (data.success) {
          onSuccess && onSuccess(metadata);
        }
      } catch (error) {
        console.error('Error exchanging token:', error);
      }
    },
  });

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      style={{
        padding: '0.75rem 1.5rem',
        backgroundColor: ready ? '#10b981' : '#334155',
        border: 'none',
        borderRadius: '0.5rem',
        color: '#fff',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: ready ? 'pointer' : 'not-allowed',
        transition: 'all 0.2s',
        opacity: ready ? 1 : 0.6,
      }}
    >
      {ready ? '🔗 Connect Bank Account' : '⏳ Loading...'}
    </button>
  );
};

export default PlaidLink;
