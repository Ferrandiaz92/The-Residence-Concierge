# Security Fixes — The Residence Concierge

5 critical issues fixed. Deploy in the order below.

---

## Files changed

| File | Fix |
|------|-----|
| `app/api/webhook/route.js` | #1 — Twilio signature validation |
| `app/api/payments/webhook/route.js` | #2 — Stripe idempotency guard |
| `src/lib/abuse.js` | #3 — Rate limit operator bug |
| `lib/csrf.js` | #4 — CSRF protection utility (new file) |
| `src/lib/supabase.js` | #5 — Messages table helpers |
| `supabase/migration_messages_table.sql` | #5 — DB migration (run first) |

---

## Deployment order

### 1. Run the SQL migration (Fix #5)

In **Supabase Dashboard → SQL Editor**, run:
```
supabase/migration_messages_table.sql
```

This is non-destructive — it creates the new `messages` table and migrates
existing data. The old `conversations.messages` JSONB column is left in place
until you verify everything works (drop it after a few days).

### 2. Add environment variables

In `.env.local` and your **Vercel project settings**, add:

```
WEBHOOK_FULL_URL=https://yourapp.vercel.app/api/webhook
NEXT_PUBLIC_APP_URL=https://yourapp.vercel.app
```

`WEBHOOK_FULL_URL` must exactly match the URL configured in your Twilio console
(Messaging → Senders → your WhatsApp number → Webhook URL). Copy it directly —
no trailing slash, include https://.

### 3. Deploy the updated files

Copy all files from this folder into your project, maintaining the same paths:

```
app/api/webhook/route.js              → replace existing
app/api/payments/webhook/route.js     → replace existing
src/lib/abuse.js                      → replace existing
src/lib/supabase.js                   → replace existing
lib/csrf.js                           → new file, create it
```

### 4. Add CSRF checks to mutating routes (Fix #4)

After deploying `lib/csrf.js`, add the guard to each route that modifies data.
Two lines per route:

```js
import { checkCsrf } from '../../../lib/csrf.js'  // adjust path as needed

export async function POST(req) {
  const csrf = checkCsrf(req)
  if (csrf) return csrf
  // ... rest of route unchanged
}

export async function DELETE(req) {
  const csrf = checkCsrf(req)
  if (csrf) return csrf
  // ...
}
```

Routes to update (POST/PATCH/DELETE only — not GET):
- `app/api/staff/route.js`
- `app/api/guests/[id]/route.js`
- `app/api/knowledge/route.js`
- `app/api/tickets/route.js`
- `app/api/partners/route.js`
- `app/api/products/route.js`
- `app/api/scheduled/route.js`
- `app/api/security/route.js`
- `app/api/config/route.js`
- `app/api/flag/route.js`

### 5. Test

After deploying:

**Fix #1 — Twilio validation**
Send a real WhatsApp message → should work as normal.
Try a curl POST with no signature header → should get 403.

**Fix #2 — Stripe idempotency**
In Stripe Dashboard → Webhooks → your endpoint → find a past
`checkout.session.completed` event → click "Resend". The webhook
should log "already processed" and return 200 without creating a duplicate order.

**Fix #3 — Rate limit**
Verify in `src/lib/abuse.js` that line ~90 reads:
`guest?.stay_status !== 'active'` (not `!guest?.stay_status === 'active'`).

**Fix #5 — Messages table**
After a few messages, check in Supabase:
`select * from messages order by created_at desc limit 10;`
Should see your test messages as individual rows.

---

## What each fix does

**Fix #1 — Twilio webhook signature**
Anyone who discovers your webhook URL could POST to it as any phone number,
creating fake bookings and triggering partner alerts. Twilio signs every
request with HMAC-SHA1 — we now verify that signature before processing.

**Fix #2 — Stripe idempotency**
Stripe retries webhooks on timeout/5xx (up to 4× over 72h). Vercel cold starts
and Supabase latency spikes cause timeouts in production. Without this guard,
each retry creates a duplicate order and sends another payment link to the guest.

**Fix #3 — Rate limit operator bug**
`!guest?.stay_status === 'active'` always evaluates to `false` due to JS
operator precedence (`!string` → `false`, `false === 'active'` → `false`).
The active-guest protection never worked — checked-in guests could be silently
auto-blocked while messaging about broken AC at 3am. One character fix: `!==`.

**Fix #4 — CSRF protection**
A malicious webpage loaded by a logged-in staff member could make authenticated
API calls (create manager accounts, delete guests, export data) without their
knowledge. Origin/Referer validation stops cross-site requests cold.

**Fix #5 — Messages table**
All messages stored as a growing JSONB blob on the conversations row.
Every message required a full read-modify-write cycle. Two rapid messages
could overwrite each other (race condition). Long-staying guests would hit
Postgres TOAST limits. The new messages table fixes all of this with a
simple single-row INSERT per message.
