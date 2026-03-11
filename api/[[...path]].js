/**
 * Vercel Serverless Function — catch-all API handler.
 *
 * This file is the single entry point for ALL /api/* requests in production.
 * It exports the Express app from server/app.js, which Vercel runs as a
 * serverless function. All routing is handled internally by Express.
 *
 * In local development, Vite proxies /api/* to the Express dev server
 * running on port 3001 (via `npm run dev:server`).
 */
import app from '../server/app.js'

export default app
