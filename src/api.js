// Single source of truth for the API base URL.
// Production: the Express app runs as a Vercel function on this same origin, so ''.
// Local dev: `npm run server` on :3001. VITE_API_URL overrides both.
export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');
