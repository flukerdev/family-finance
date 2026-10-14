// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json)
// and handled by the same Express app that `npm run server` runs locally.
import app from '../server/index.js';
export default app;
