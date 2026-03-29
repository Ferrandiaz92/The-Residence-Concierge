# High Priority Fixes

4 fixes. One SQL migration, then deploy the files.

---

## Files in this zip

| File | Fix |
|------|-----|
| `supabase/migration_highpriority.sql` | Creates retry, sessions tables + indexes |
| `src/lib/partner-retries.js` | #1 — Retry queue logic (new file) |
| `app/api/cron/partner-retries/route.js` | #1 — Retry cron endpoint (new file) |
| `lib/gdpr.js` | #4 — GDPR erasure covering all PII tables |
| `app/api/cron/messages/route.js` | #3 — Cron route with logging |
| `src/lib/scheduled-catchup-patch.js` | #3 — Catchup-aware scheduler (read below) |

---

## Step 1 — Run SQL migration

In **Supabase → SQL Editor**, run `supabase/migration_highpriority.sql`.

Also run these two extra columns for Fix #3:
```sql
alter table scheduled_messages add column if not exists was_catchup boolean default false;
alter table scheduled_messages add column if not exists skip_reason text;
```

---

## Step 2 — Deploy new and updated files

**New files (create these):**
```
src/lib/partner-retries.js
app/api/cron/partner-retries/route.js
```

**Updated files (replace existing):**
```
lib/gdpr.js
app/api/cron/messages/route.js
```

---

## Step 3 — Apply the scheduled messages catchup patch

`scheduled-catchup-patch.js` is NOT a drop-in replacement for the whole
`scheduled.js` file — it contains only the `processScheduledMessages()`
function with the catchup logic.

Open `src/lib/scheduled.js` and replace the existing
`processScheduledMessages()` function (from `export async function
processScheduledMessages(hotelId) {` to its closing `}`) with the
function from `scheduled-catchup-patch.js`.

Everything else in `scheduled.js` stays unchanged.

---

## Step 4 — Add the retry cron to vercel.json

Open `vercel.json` and add the new cron entry:

```json
{
  "crons": [
    { "path": "/api/cron/escalate",        "schedule": "*/2 * * * *" },
    { "path": "/api/cron/booking-checks",  "schedule": "*/5 * * * *" },
    { "path": "/api/cron/messages",        "schedule": "0 * * * *"   },
    { "path": "/api/cron/partner-retries", "schedule": "*/5 * * * *" }
  ]
}
```

---

## What each fix does

### Fix #1 — Partner alert retry queue

Before: if Twilio failed to send an alert to a taxi driver, the booking
was saved but the partner never knew. Guest was told "confirmed" and
nobody showed up.

After: on failure, a retry is queued. The cron retries 3 times with
exponential backoff (2min → 10min → 30min). If all 3 fail, reception
gets a dashboard notification to contact the partner manually.

How it integrates with whatsapp-inbound.js — in `_sendToPartner()`:
```js
import { queuePartnerAlert, markRetrySucceeded } from '../lib/partner-retries.js'

try {
  const msg = await sendWhatsApp(partner.phone, formatPartnerAlert(booking, guest, hotel))
  await supabase.from('bookings').update({ partner_alert_sid: msg.sid }).eq('id', saved.id)
  await markRetrySucceeded(saved.id)  // cancel any queued retries for this booking
} catch(e) {
  await queuePartnerAlert({
    hotelId:   hotel.id,
    bookingId: saved.id,
    partner,
    message:   formatPartnerAlert(booking, guest, hotel),
    lastError: e.message,
  })
  await log.critical('Partner alert failed — queued for retry', e, { ... })
}
```

### Fix #4 — GDPR erasure completeness

Before: deleting a guest cascaded through guests → conversations →
bookings, but missed `abuse_events`, `message_rate`, and
`blocked_phones` — all of which store the guest's phone number as PII.

After: `deleteGuestData()` explicitly deletes from all three phone-keyed
tables before deleting the guest row, then logs the erasure to audit_log
before any deletion happens (GDPR Article 5(2) accountability).

### Fix #3 — Scheduled messages catchup

Before: each message type checked `localToday === targetDate` exactly.
If the server was down or the cron missed that window, the message was
permanently lost with no flag, no retry, no alert.

After: uses `isOnOrOverdue(targetDate, graceDays)` — checks if the
target date has passed AND we're still within the grace window. Messages
that were missed yesterday will be caught and sent today (within limits).
Catchup sends are flagged as `was_catchup: true` in `scheduled_messages`
so you can track how often it happens.

Grace periods:
- `pre_checkin_7d` → 5 days (still useful before arrival)
- `pre_checkin_24h` → 12 hours (same-day is still useful)
- `day1_upsell` → no catchup (morning-specific)
- `midstay_upsell` → 1 day (guest still there)
- `pre_checkout` → evening-only, no catchup
- `post_checkout` → 3 days (review request still relevant)
