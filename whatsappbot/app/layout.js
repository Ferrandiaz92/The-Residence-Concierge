import '../dashboard.css'
import { validateConfig } from '../lib/config.js'

// Validate required env vars on every cold start.
// Throws with a clear message if anything critical is missing.
// This runs server-side only — never in the browser.
if (typeof window === 'undefined') {
  try { validateConfig() } catch (e) { console.error('[startup]', e.message) }
}

export const metadata = {
  title: 'The Residence Concierge',
  description: 'Intelligent Hotel Concierge Platform',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
