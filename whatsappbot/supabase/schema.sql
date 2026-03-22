-- ============================================================
-- THE RESIDENCE CONCIERGE — Database Schema
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- ── HOTELS ──────────────────────────────────────────────────
create table hotels (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  whatsapp_number   text not null unique,  -- Twilio number e.g. +35799123456
  system_prompt     text,                  -- hotel-specific AI instructions
  config            jsonb default '{}',    -- menu, hours, policies etc
  active            boolean default true,
  created_at        timestamptz default now()
);

-- ── GUESTS ──────────────────────────────────────────────────
create table guests (
  id                uuid primary key default gen_random_uuid(),
  hotel_id          uuid references hotels(id) on delete cascade,
  phone             text not null,          -- guest WhatsApp number e.g. +447700900123
  name              text,
  surname           text,
  room              text,
  language          text default 'en',      -- detected: en | ru | he
  check_in          date,
  check_out         date,
  notes             text,
  created_at        timestamptz default now(),
  unique(hotel_id, phone)
);

-- ── CONVERSATIONS ────────────────────────────────────────────
create table conversations (
  id                uuid primary key default gen_random_uuid(),
  guest_id          uuid references guests(id) on delete cascade,
  hotel_id          uuid references hotels(id) on delete cascade,
  messages          jsonb default '[]',     -- array of {role, content, ts}
  status            text default 'active',  -- active | resolved | escalated
  last_message_at   timestamptz default now(),
  created_at        timestamptz default now()
);

-- ── PARTNERS ────────────────────────────────────────────────
create table partners (
  id                uuid primary key default gen_random_uuid(),
  hotel_id          uuid references hotels(id) on delete cascade,
  name              text not null,           -- e.g. "Christos Taxi"
  type              text not null,           -- taxi | restaurant | activity | other
  phone             text not null,           -- WhatsApp number for alerts
  commission_rate   numeric(5,2) default 10, -- percentage e.g. 10.00
  details           jsonb default '{}',      -- extra info (car plate, cuisine etc)
  active            boolean default true,
  created_at        timestamptz default now()
);

-- ── BOOKINGS ────────────────────────────────────────────────
create table bookings (
  id                uuid primary key default gen_random_uuid(),
  hotel_id          uuid references hotels(id) on delete cascade,
  guest_id          uuid references guests(id) on delete cascade,
  partner_id        uuid references partners(id),
  type              text not null,           -- taxi | restaurant | activity | late_checkout
  details           jsonb default '{}',      -- time, pax, destination, notes
  status            text default 'pending',  -- pending | confirmed | declined | cancelled
  commission_amount numeric(10,2),
  created_by        text default 'bot',      -- bot | staff
  created_at        timestamptz default now(),
  confirmed_at      timestamptz,
  partner_alert_sid text                     -- Twilio message SID for tracking
);

-- ── COMMISSIONS ─────────────────────────────────────────────
create table commissions (
  id                uuid primary key default gen_random_uuid(),
  hotel_id          uuid references hotels(id) on delete cascade,
  booking_id        uuid references bookings(id) on delete cascade,
  amount            numeric(10,2) not null,
  status            text default 'pending',  -- pending | paid
  month             text,                    -- e.g. '2026-03' for monthly statements
  created_at        timestamptz default now(),
  paid_at           timestamptz
);

-- ── STAFF ───────────────────────────────────────────────────
create table staff (
  id                uuid primary key default gen_random_uuid(),
  hotel_id          uuid references hotels(id) on delete cascade,
  email             text not null unique,
  name              text,
  role              text default 'receptionist', -- receptionist | manager | admin
  created_at        timestamptz default now()
);

-- ── INDEXES ─────────────────────────────────────────────────
create index idx_guests_hotel      on guests(hotel_id);
create index idx_guests_phone      on guests(phone);
create index idx_guests_room       on guests(room);
create index idx_guests_surname    on guests(surname);
create index idx_convs_guest       on conversations(guest_id);
create index idx_convs_hotel       on conversations(hotel_id);
create index idx_convs_last_msg    on conversations(last_message_at desc);
create index idx_bookings_hotel    on bookings(hotel_id);
create index idx_bookings_guest    on bookings(guest_id);
create index idx_bookings_status   on bookings(status);
create index idx_bookings_created  on bookings(created_at desc);
create index idx_commissions_hotel on commissions(hotel_id);
create index idx_commissions_month on commissions(month);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
alter table hotels      enable row level security;
alter table guests      enable row level security;
alter table conversations enable row level security;
alter table partners    enable row level security;
alter table bookings    enable row level security;
alter table commissions enable row level security;
alter table staff       enable row level security;

-- Service role bypasses RLS (used by your backend)
-- Anon key has no access (security)
-- Add hotel-specific policies here when you add hotel logins

-- ── SEED: TEST HOTEL ─────────────────────────────────────────
insert into hotels (name, whatsapp_number, system_prompt, config) values (
  'Four Seasons Limassol Test',
  '+35799000001',
  'You are the personal concierge at Four Seasons Limassol. You are warm, attentive and professional. Always respond in the same language the guest uses. You can help with: restaurant bookings, taxi transfers, boat trips, activities, room requests, and local recommendations. Never make up information. If unsure, say you will check and get back to them.',
  '{
    "hotel_name": "Four Seasons Limassol Test",
    "address": "Amathus Ave, Limassol 4532, Cyprus",
    "checkin_time": "15:00",
    "checkout_time": "12:00",
    "currency": "EUR",
    "languages": ["en", "ru", "he"],
    "restaurant": {
      "name": "Sea Breeze Restaurant",
      "hours": "07:00 - 23:00",
      "breakfast": "07:00 - 10:30",
      "lunch": "12:00 - 15:00",
      "dinner": "18:30 - 23:00"
    },
    "pool": {
      "hours": "08:00 - 20:00"
    },
    "spa": {
      "hours": "09:00 - 21:00",
      "phone": "+35799000002"
    }
  }'::jsonb
);

-- Seed test partners
insert into partners (hotel_id, name, type, phone, commission_rate, details)
select 
  id,
  'Christos Taxi',
  'taxi',
  '+35799000010',
  10.00,
  '{"car": "Mercedes E-Class", "plate": "MMN 43343", "languages": ["en", "ru"]}'::jsonb
from hotels where name = 'Four Seasons Limassol Test';

insert into partners (hotel_id, name, type, phone, commission_rate, details)
select 
  id,
  'Meze & More Restaurant',
  'restaurant',
  '+35799000011',
  8.00,
  '{"cuisine": "Cypriot", "address": "12 Anexartisias St, Old Town", "capacity": 60}'::jsonb
from hotels where name = 'Four Seasons Limassol Test';

insert into partners (hotel_id, name, type, phone, commission_rate, details)
select 
  id,
  'Blue Ocean Boat Tours',
  'activity',
  '+35799000012',
  12.00,
  '{"type": "boat_tour", "duration": "4 hours", "price_per_person": 65}'::jsonb
from hotels where name = 'Four Seasons Limassol Test';

-- ── HELPER VIEWS ─────────────────────────────────────────────

-- Dashboard: active conversations with guest info
create view v_active_conversations as
select 
  c.id,
  c.hotel_id,
  c.status,
  c.last_message_at,
  g.name || ' ' || coalesce(g.surname, '') as guest_name,
  g.room,
  g.phone,
  g.language,
  jsonb_array_length(c.messages) as message_count
from conversations c
join guests g on g.id = c.guest_id
where c.status = 'active'
order by c.last_message_at desc;

-- Dashboard: recent bookings with all details
create view v_recent_bookings as
select
  b.id,
  b.hotel_id,
  b.type,
  b.status,
  b.commission_amount,
  b.created_at,
  g.name || ' ' || coalesce(g.surname, '') as guest_name,
  g.room,
  g.phone,
  p.name as partner_name,
  p.type as partner_type,
  b.details
from bookings b
join guests g on g.id = b.guest_id
left join partners p on p.id = b.partner_id
order by b.created_at desc;

-- Dashboard: monthly commission summary
create view v_commission_summary as
select
  hotel_id,
  month,
  count(*) as booking_count,
  sum(amount) as total_commission,
  sum(case when status = 'paid' then amount else 0 end) as paid_commission,
  sum(case when status = 'pending' then amount else 0 end) as pending_commission
from commissions
group by hotel_id, month
order by month desc;