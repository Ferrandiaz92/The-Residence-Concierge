# Performance & Reliability Improvements

Three improvements bundled together.

---

## Files changed

| File | Improvement |
|------|-------------|
| `src/webhooks/whatsapp-inbound.js` | #1 Parallel DB calls + #3 Logging |
| `src/webhooks/partner-reply.js` | #2 Guest notification + #3 Logging |
| `lib/logger.js` | #3 New — Pino + Sentry structured logging |

---

## Setup before deploying

### Install dependencies

```bash
npm install pino @sentry/nextjs
```

### Add environment variables

In `.env.local` and Vercel project settings:

```
SENTRY_DSN=https://xxx@oyyy.ingest.sentry.io/zzz
LOG_LEVEL=info
```

Get your `SENTRY_DSN` from:
1. Go to sentry.io → Create account (free tier is enough)
2. New Project → Next.js
3. Copy the DSN from the setup screen

`LOG_LEVEL` options: `debug` (verbose, dev only) | `info` (default) | `warn` | `error`

### Set up a Sentry alert

In Sentry dashboard → Alerts → Create Alert Rule:
- Condition: "A new issue is created"
- Filter: level = fatal OR level = error
- Action: Send email to your address (or Slack webhook)

This means you'll be woken up at 3am if Claude goes down or a payment fails.

---

## What each improvement does

### Improvement 1 — Parallel DB calls (~400–600ms saved per message)

Before (sequential — each line waits for the previous):
```js
const partners   = await getPartners(hotel.id)        // ~150ms
const facilities = await getFacilities(hotel.id)       // ~150ms
const kbEntries  = await getKnowledgeBase(hotel.id)    // ~150ms
const products   = await getAvailableProducts(hotel.id) // ~150ms
const memory     = await loadGuestMemory(guest.id)     // ~150ms
const history    = await getConversationHistory(conv.id) // ~150ms
// Total: ~900ms before Claude is even called
```

After (parallel — all fire at once, total = slowest one):
```js
const [partners, facilities, kbEntries, products, memory, history] = await Promise.all([
  getPartners(hotel.id),
  getFacilities(hotel.id),
  getKnowledgeBase(hotel.id),
  getAvailableProducts(hotel.id),
  loadGuestMemory(guest.id),
  getConversationHistory(conv.id, 20),
])
// Total: ~150ms (the slowest query)
```

### Improvement 2 — Partner confirmation → guest notification in dashboard

Before:
- Partner replies ✅ → guest gets WhatsApp "taxi confirmed"
- Dashboard showed nothing — staff couldn't see if confirmation was sent
- No record in chat timeline

After:
- Same WhatsApp to guest
- Confirmation message appended to conversation with `sent_by: 'partner_reply'`
- Dashboard chat timeline now shows "✅ Your taxi is confirmed..." at the right timestamp
- Added de/fr/es/it/pt/zh/ar/nl/el confirmation messages (was only en/ru/he)

### Improvement 3 — Structured logging (Pino + Sentry)

Before:
```js
console.log('Partner reply from +35799...')
console.error('Claude API failed:', err.message)
```

After:
```js
log.info('Partner reply received', { partnerId, bookingId, replyType })
await log.critical('Claude API failed — guest left without response', err, { hotelId, guestId, room })
```

Every log line is JSON with hotel/guest/room context attached automatically.
Critical failures (Claude down, payment link failed, partner alert failed) → Sentry alert.

---

## Deployment

1. Run `npm install pino @sentry/nextjs`
2. Add `SENTRY_DSN` and `LOG_LEVEL` to env vars
3. Replace the three files (same paths as existing)
4. Deploy — no DB migration needed for these changes
