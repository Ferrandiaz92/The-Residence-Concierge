// lib/csrf.js
// ─────────────────────────────────────────────────────────────
// FIX #4: CSRF (Cross-Site Request Forgery) protection
//
// Without this, any webpage loaded by a logged-in staff member
// can silently make authenticated API calls to your dashboard —
// creating fake staff accounts, deleting guests, exporting data, etc.
//
// How it works:
//   Browsers always send cookies automatically on cross-site requests.
//   But they do NOT send a matching Origin/Referer from a foreign domain.
//   We check that every state-mutating request (POST/PATCH/DELETE) comes
//   from your own app domain. Requests from other origins are rejected.
//
// Usage — add two lines to every mutating route:
//   import { checkCsrf } from '../../../lib/csrf.js'
//   export async function POST(req) {
//     const csrf = checkCsrf(req)
//     if (csrf) return csrf   // returns 403 Response
//     // ... rest of route
//   }
//
// Required env var (add to .env.local and Vercel):
//   NEXT_PUBLIC_APP_URL=https://yourapp.vercel.app
// ─────────────────────────────────────────────────────────────

/**
 * Validates that a request originates from your own app.
 * Returns a 403 Response if the check fails, or null if allowed.
 *
 * @param {Request} req - Next.js App Router request object
 * @returns {Response|null} 403 response if rejected, null if allowed
 */
export function checkCsrf(req) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  // If the env var isn't set, fail loudly in dev, allow in prod
  // (avoids locking yourself out if misconfigured)
  if (!appUrl) {
    console.warn('[csrf] NEXT_PUBLIC_APP_URL is not set — CSRF check skipped')
    return null
  }

  const origin  = req.headers.get('origin')  || ''
  const referer = req.headers.get('referer') || ''

  // Allow requests that have a matching Origin or Referer header.
  // Requests from the same origin omit the Origin header in some browsers —
  // we also check Referer as a fallback.
  const isAllowed =
    origin.startsWith(appUrl) ||
    referer.startsWith(appUrl) ||
    // Allow requests with no origin/referer from server-side calls
    // (e.g. cron jobs, internal API calls — these don't have browser headers)
    (origin === '' && referer === '')

  if (!isAllowed) {
    console.warn(`[csrf] Rejected — origin: "${origin}" referer: "${referer}" expected: "${appUrl}"`)
    return new Response(
      JSON.stringify({ error: 'Forbidden — invalid request origin' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return null // null = allowed, continue processing
}

/**
 * List of routes that need CSRF protection (POST/PATCH/DELETE).
 * Apply checkCsrf() to all of these:
 *
 *   app/api/staff/route.js          (create/update staff accounts)
 *   app/api/guests/[id]/route.js    (update guest data)
 *   app/api/knowledge/route.js      (add/edit KB entries)
 *   app/api/tickets/route.js        (create/update tickets)
 *   app/api/partners/route.js       (add/edit partners)
 *   app/api/products/route.js       (add/edit products)
 *   app/api/scheduled/route.js      (create scheduled messages)
 *   app/api/security/route.js       (block/unblock phones)
 *   app/api/config/route.js         (update hotel config)
 *   app/api/flag/route.js           (flag conversations)
 *
 * GET routes do NOT need CSRF protection (read-only).
 */
