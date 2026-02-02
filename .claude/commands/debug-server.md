The Express server at server/index.js may be returning errors. Please debug step by step:

1. Check which git branch we're on (`git branch`)
2. Check if the Express server is running on port 3001
3. Check if the .env file exists in the project root and has PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV set (mask the values when showing me)
4. If the server is running, check its console output for credential loading — look for "NOT SET" warnings
5. If credentials show "NOT SET" or placeholder values, the .env is not loading — check the dotenv path resolution in server/index.js
6. Restart the server: stop any existing process on port 3001, then run `npm run server`
7. Test the /api/create_link_token endpoint and report the result

IMPORTANT: The server reads .env ONLY on startup. If .env was changed, the server MUST be restarted.

Explain each step and what you find so I can learn from the debugging process.
