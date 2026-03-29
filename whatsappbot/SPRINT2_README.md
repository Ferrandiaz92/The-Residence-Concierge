# Sprint 2 — Facilities, Partner Picker, Search Fix

5 improvements in one deploy.

---

## Files in this zip

| File | What it does |
|------|-------------|
| `supabase/migration_facilities_sprint.sql` | Run first — adds contact_phone to facilities, creates facility_bookings table |
| `app/api/facilities/route.js` | New — CRUD for facilities (manager edit, others read) |
| `app/api/facility-bookings/route.js` | New — booking requests + confirm/reject/alternative |
| `app/api/config/route.js` | Updated — now also returns facilities list |
| `src/lib/facilities.js` | Updated — creates facility_booking row + WhatsApp alert to contact |
| `components/FacilitiesTab.js` | New — 7th dashboard tab, desktop + mobile same component |
| `components/LiveTab.js` | Updated — 3-way request type + partner picker + facility form |
| `components/MobileLiveTab.js` | Updated — same changes, mobile |
| `app/dashboard/page.js` | Updated — Facilities tab wired in, search "Room: Null" fixed |

---

## Step 1 — Run SQL migration

In Supabase → SQL Editor, run `supabase/migration_facilities_sprint.sql`.

---

## Step 2 — Deploy all files

**New files (create):**
```
app/api/facilities/route.js
app/api/facility-bookings/route.js
components/FacilitiesTab.js
```

**Replace existing:**
```
app/api/config/route.js
src/lib/facilities.js
components/LiveTab.js
components/MobileLiveTab.js
app/dashboard/page.js
```

---

## Step 3 — Configure facilities in Supabase

After deploying, go to the dashboard → Facilities tab → Add each facility:
- Name (Tennis Court A, Padel Court, Spa, Gym, Conference Room...)
- Department (sports / wellness / business / leisure)
- Category (court / pool / spa / gym / conference...)
- Contact name + WhatsApp phone (who gets the booking alert)
- Capacity + price (leave price blank for free facilities)
- Booking notes (shown to guest when confirmed)

---

## What each fix does

### 1. Facilities tab (new 7th tab)
- **Booking requests** — pending/confirmed/alternative queue with ✅/❌/🕐 buttons
- **Facility list** — manager can add/edit, others read-only
- Grouped by department (Sports / Wellness / Business)
- Role-gated: Communications can't confirm, Employee can't see it
- Same component renders on desktop and mobile (isMobile prop)

### 2. Facility booking confirmation loop
- Bot creates a `facility_booking` row (separate from internal tickets)
- Sends WhatsApp to the facility contact (tennis manager, spa, etc.)
- Contact replies ✅/❌/🕐 alternative time
- Guest gets notified automatically with confirmation or alternative offer
- Message appears in guest chat timeline on dashboard

### 3. Staff portal — 3-way request type
Internal Request is now split into:
- **External booking** — taxi, restaurant, activity (partners)
- **Internal ticket** — maintenance, housekeeping, F&B (problems)
- **Facility booking** — courts, spa, gym (reservations)

When External is selected, a **Partner picker** appears filtered by category.
Reception can override auto-match and pick a specific partner.

When Facility is selected, a **Facility form** appears:
facility, date, time, number of guests.

### 4. Search bar — "Room: Null" fixed
Prospects (guests with no room assigned) now show "🔍 Prospect" instead of "Room: null" in both desktop and mobile search results.

### 5. Facilities WhatsApp alert
When a guest requests a facility via WhatsApp, the bot now:
1. Creates a `facility_booking` row in the DB
2. Sends a WhatsApp alert to the facility contact phone
3. The contact replies ✅/❌/🕐 → guest is notified automatically
(Previously: only created an internal ticket, no WhatsApp, no loop)
