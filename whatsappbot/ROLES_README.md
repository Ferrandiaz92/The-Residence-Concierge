# Roles Migration — The Residence Concierge

## What this adds

Five clearly defined roles with GDPR-compliant data access enforced at both
the application layer (route guards) and the database layer (RLS + views).

---

## The 5 Roles

| Role            | Primary function                        | Data access level       |
|-----------------|-----------------------------------------|-------------------------|
| `manager`       | Full system control                     | All PII, all data       |
| `communications`| Bot content, strategy, analytics        | Anonymised only         |
| `supervisor`    | Field ops, shifts, escalations          | Room number on tickets  |
| `receptionist`  | Guest-facing, check-in, conversations   | Full guest PII          |
| `employee`      | Department tasks, own tickets           | Room on assigned ticket |

---

## Setup Instructions

### Step 1 — Run the SQL migration

In Supabase Dashboard → SQL Editor, run in order:
1. `supabase/schema.sql` (if not already done)
2. `supabase/ticketing.sql` (if not already done)
3. `supabase/01_roles_migration.sql` ← new file

### Step 2 — Install bcryptjs

```bash
npm install bcryptjs
```

### Step 3 — Copy the updated files

Replace existing files with the new versions:

```
lib/gdpr.js                              ← NEW — GDPR utilities, role guards
app/api/auth/login/route.js              ← UPDATED — bcrypt auth + audit log
app/api/conversations/route.js           ← UPDATED — role-aware data filtering
app/api/qa/route.js                      ← UPDATED — comms role + audit log
app/api/tickets/route.js                 ← UPDATED — supervisor role + PII stripping
app/api/staff/route.js                   ← NEW — staff account management
```

---

## Test Accounts (Four Seasons Limassol Test)

> ⚠️  Change all passwords immediately after first login.
> These are seeded by the migration SQL.

| Role            | Email                                    | Password            |
|-----------------|------------------------------------------|---------------------|
| Manager         | manager@residence-concierge.com          | `Res!Manager2025`   |
| Communications  | communications@residence-concierge.com   | `Res!Comms2025`     |
| Supervisor      | supervisor@residence-concierge.com       | `Res!Super2025`     |
| Receptionist    | reception@residence-concierge.com        | `Res!Recept2025`    |
| Employee        | maintenance@residence-concierge.com      | `Res!Staff2025`     |

To reset a password via API (Manager only):
```
PATCH /api/staff
{ "staffId": "...", "password": "NewPassword123!" }
```

To create a new account (Manager only):
```
POST /api/staff
{
  "email": "newstaff@hotel.com",
  "name": "Maria",
  "role": "employee",
  "department": "housekeeping",
  "password": "SecurePass123!"
}
```

Password rules enforced by the API:
- Minimum 10 characters
- Hashed with bcrypt cost factor 12
- Sessions expire after 8 hours

---

## GDPR Design Decisions

### Communications role

- Sees conversations with **Guest #ID only** — no name, phone, or room.
- Sees **bot (assistant) turns only** in the QA review queue — guest messages
  are replaced with `[Guest message — redacted for privacy]` at the API layer,
  not just the UI.
- Bookings view strips all guest identity fields.
- Analytics are aggregated (counts, percentages) — no row-per-guest exports.
- Any CSV export produces aggregate data only.

### Supervisor role

- Zero access to guest records or conversations.
- Sees **room number only** on tickets they are handling — lawful basis is
  operational necessity (minimum necessary data principle, GDPR Article 5(1)(c)).
- No guest name, phone, or check-in dates ever visible.

### Employee role

- Sees only the room number and description on tickets assigned to their
  department.
- No guest identity in any form.

### Audit log

Every sensitive action is written to `audit_log`:
- Login success / failure
- Conversation viewed
- Q&A created / edited / deleted
- System prompt changed
- Data exported
- Staff account created or role changed
- GDPR deletion request executed

The audit log is append-only (no UPDATE or DELETE policies on `audit_log`).
Only Manager can read it via the dashboard. This satisfies GDPR Article 5(2)
accountability principle.

### Data deletion (Right to Erasure — GDPR Article 17)

Only the Manager role can execute a guest data deletion. The action is
always written to `audit_log` before the deletion executes, so there is
a permanent record that the erasure was carried out, by whom, and when.
The guest record is deleted via cascade (guests → conversations → bookings).

---

## Adding a New Hotel

After running the migration SQL for the first hotel, to add a second hotel:

```sql
-- 1. Insert hotel
insert into hotels (name, whatsapp_number, system_prompt, config)
values ('Your Hotel Name', '+357XXXXXXXXX', '...', '{}'::jsonb);

-- 2. Create manager account for new hotel
insert into staff (hotel_id, email, name, role, password_hash, active)
values (
  (select id from hotels where name = 'Your Hotel Name'),
  'manager@yourhotel.com',
  'Hotel Manager',
  'manager',
  -- Generate hash: node -e "const b=require('bcryptjs'); b.hash('YourPass123!',12).then(console.log)"
  '$2b$12$...',
  true
);
```

Each hotel is fully isolated — staff can only see data for their own hotel_id.
