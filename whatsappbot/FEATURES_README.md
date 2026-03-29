# Feature Sprint — 5, 2, 7, 12

Four new features. One SQL migration, then files to deploy.

---

## Files in this zip

| File | Feature |
|------|---------|
| `supabase/migration_features.sql` | DB changes for all features |
| `src/lib/cancellations.js` | #2 — Cancellation flows A/B/C |
| `src/lib/images.js` | #5 — Image sending |
| `src/lib/prospect-nurture.js` | #7 — Prospect nurture |
| `src/lib/fallback.js` | #12 — Rule-based fallback |
| `src/webhooks/whatsapp-inbound-feature-patch.js` | Patch instructions for inbound handler |
| `app/api/cancellations/route.js` | #2 — Cancellation acknowledgement API |
| `app/api/cron/prospect-nurture/route.js` | #7 — Nurture cron |
| `components/CancellationAlerts.js` | #2 — Alert cards UI (desktop + mobile) |

---

## Step 1 — Run SQL migration

In Supabase → SQL Editor, run `supabase/migration_features.sql`.

---

## Step 2 — Deploy new library files

All 4 files are new — just copy them in:
```
src/lib/cancellations.js
src/lib/images.js
src/lib/prospect-nurture.js
src/lib/fallback.js
app/api/cancellations/route.js
app/api/cron/prospect-nurture/route.js
components/CancellationAlerts.js
```

---

## Step 3 — Patch whatsapp-inbound.js

Open `src/webhooks/whatsapp-inbound.js` and apply the 5 patches
described in `whatsapp-inbound-feature-patch.js`. Each patch is clearly
labelled PATCH 1 through PATCH 5 with exact find/replace instructions.

---

## Step 4 — Add CancellationAlerts to LiveTab and MobileLiveTab

### Desktop (LiveTab.js)

Find the section in `ReceptionistView` where bookings/tickets are rendered.
Add `CancellationAlerts` at the top of the alerts column:

```jsx
import CancellationAlerts from './CancellationAlerts'

// Inside ReceptionistView, at the top of the right/alerts column:
<CancellationAlerts
  hotelId={hotelId}
  session={session}
  isMobile={false}
/>
```

### Mobile (MobileLiveTab.js)

In the Portal subtab or Issues subtab, add:

```jsx
import CancellationAlerts from './CancellationAlerts'

<CancellationAlerts
  hotelId={hotelId}
  session={session}
  isMobile={true}
/>
```

---

## Step 5 — Add prospect nurture cron to cron-job.org

Add a new job on cron-job.org:
- URL: `https://yourapp.vercel.app/api/cron/prospect-nurture`
- Schedule: Once daily at 10:00am
- Header: `Authorization: Bearer YOUR_CRON_SECRET`

---

## Step 6 — Configure hotel images (Feature #5)

For each hotel, add an `images` object to `hotel.config` in Supabase:

```sql
update hotels set config = config || '{
  "images": {
    "menu":         "https://your-cdn.com/hotel-menu.jpg",
    "spa_menu":     "https://your-cdn.com/spa-menu.jpg",
    "map":          "https://your-cdn.com/area-map.jpg",
    "activities":   "https://your-cdn.com/activities.jpg",
    "pool":         "https://your-cdn.com/pool-info.jpg"
  }
}'::jsonb
where id = 'your-hotel-id';
```

Images must be publicly accessible URLs (use Supabase Storage, Cloudinary, or similar).
If a type isn't configured, the bot falls back to text — no errors.

---

## What each feature does

### Feature #5 — Image sending
Bot can now send menus, maps, spa brochures as WhatsApp images.
Claude emits `[SEND_IMAGE]{"type":"menu","label":"Our restaurant menu"}`.
Bot fetches the URL from hotel config and sends via Twilio media message.
Graceful fallback to text if image not configured.

### Feature #2 — Booking cancellation
Three flows as designed:
- **Flow A** (facility): bot cancels internal ticket, notifies reception dashboard
- **Flow B** (partner booking): bot notifies partner via WhatsApp, reverses commission, creates cancellation alert card
- **Flow C** (room): bot NEVER cancels — escalates to reception immediately

Cancellation alert cards appear in the Live tab for receptionist/supervisor/manager.
Three acknowledgement buttons: Acknowledged / Partner confirmed / Issue.
Works on both desktop and mobile.

### Feature #7 — Prospect nurture
Detects what prospects are interested in (spa, tennis, restaurant, room etc).
Sends 3 follow-up messages over 7 days:
- Day 1: personalised follow-up based on their interest
- Day 3: availability/value offer
- Day 7: final gentle nudge

After 14 days with no conversion, marks prospect as "lost".
When a prospect makes a booking, marks them as "converted" and promotes to pre_arrival guest.

### Feature #12 — Rule-based fallback
When Claude API fails, instead of a dead-end error message, the bot:
1. Matches the guest's message against 10 common request patterns
2. Answers directly using hotel config data (WiFi password, checkout time, pool hours etc)
3. If no rule matches: sends a holding message + escalates to reception
4. All fallback events logged to `fallback_events` table for monitoring

Rules covered: WiFi, check-out time, check-in time, restaurant hours, pool hours,
taxi request, room service, housekeeping, reception/emergency, parking.
