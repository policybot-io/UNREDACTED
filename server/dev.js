/**
 * Local development entry point.
 * Starts the Express server on PORT (default 3001).
 * Vite dev server proxies /api/* here automatically.
 *
 * Usage:
 *   npm run dev:server        — start backend only
 *   npm run dev:all           — start frontend + backend together
 */
import app from './app.js'

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`\n  🚨 UNREDACTED backend running on http://localhost:${PORT}`)
  console.log(`  📡 Frontend dev server expected on http://localhost:3000\n`)
})
