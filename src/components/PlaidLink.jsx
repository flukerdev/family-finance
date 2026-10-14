import { useEffect, useState, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';

import { API_URL } from '../api';

const PlaidLinkButton = ({ linkToken, onSuccess, authFetch }) => {
  const onPlaidSuccess = useCallback(async (publicToken, metadata) => {
    try {
      const response = await authFetch(`${API_URL}/api/exchange_public_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          public_token: publicToken,
          institution: metadata.institution
        }),
      });
      const data = await response.json();
      if (data.success) {
        onSuccess && onSuccess(metadata);
      }
    } catch (error) {
      console.error('Error exchanging token:', error);
    }
  }, [onSuccess, authFetch]);

  const config = {
    token: linkToken,
    onSuccess: onPlaidSuccess,
  };

  const { open, ready } = usePlaidLink(config);

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      style={{
        padding: '0.75rem 1.5rem',
        backgroundColor: ready ? '#5FB58A' : '#2A3038',
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
      {ready ? 'Connect Account' : 'Loading...'}
    </button>
  );
};

const PlaidLink = ({ onSuccess, authFetch }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchLinkToken = async () => {
      try {
        const response = await authFetch(`${API_URL}/api/create_link_token`, {
          method: 'POST',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create link token');
        }

        const data = await response.json();
        if (isMounted && data.link_token) {
          setLinkToken(data.link_token);
        }
      } catch (error) {
        console.error('Error fetching link token:', error);
        if (isMounted) {
          setError(error.message);
        }
      }
    };

    fetchLinkToken();

    return () => {
      isMounted = false;
    };
  }, [authFetch]);

  if (error) {
    return (
      <div style={{ color: '#E07A7A', padding: '1rem', backgroundColor: '#0F1115', borderRadius: '0.5rem' }}>
        <strong>Error:</strong> {error}
        <br />
        <small>Check that the server is running and Plaid credentials are correct.</small>
      </div>
    );
  }

  if (!linkToken) {
    return (
      <button
        disabled
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#2A3038',
          border: 'none',
          borderRadius: '0.5rem',
          color: '#fff',
          fontSize: '1rem',
          fontWeight: '600',
          cursor: 'not-allowed',
          opacity: 0.6,
        }}
      >
        Loading...
      </button>
    );
  }

  return <PlaidLinkButton linkToken={linkToken} onSuccess={onSuccess} authFetch={authFetch} />;
};

export default PlaidLink;
