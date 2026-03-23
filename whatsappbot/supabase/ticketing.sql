-- ============================================================
-- INTERNAL TICKETING SYSTEM
-- Run this in Supabase SQL Editor after schema.sql
-- ============================================================

-- ── DEPARTMENT CONTACTS ──────────────────────────────────────
-- Each hotel has contacts per department with escalation chain
create table department_contacts (
  id              uuid primary key default gen_random_uuid(),
  hotel_id        uuid references hotels(id) on delete cascade,
  department      text not null,  -- maintenance | housekeeping | fnb | concierge | security
  role            text not null,  -- supervisor | team | manager
  name            text not null,
  phone           text not null,  -- WhatsApp number e.g. +35799000020
  active          boolean default true,
  created_at      timestamptz default now()
);

-- ── INTERNAL TICKETS ─────────────────────────────────────────
create table internal_tickets (
  id                  uuid primary key default gen_random_uuid(),
  hotel_id            uuid references hotels(id) on delete cascade,
  guest_id            uuid references guests(id),           -- null if not guest-related
  ticket_number       serial,                               -- human-readable #47
  department          text not null,
  category            text not null,                        -- ac_heating | plumbing | towels | etc
  description         text not null,
  room                text,
  priority            text default 'normal',                -- normal | urgent | emergency
  status              text default 'pending',               -- pending | accepted | in_progress | resolved | escalated | cancelled
  created_by          text not null,                        -- 'bot' | 'staff:Andreas'
  assigned_to_name    text,
  assigned_to_phone   text,
  escalation_level    int default 0,                        -- 0=supervisor, 1=team, 2=manager
  escalation_due_at   timestamptz,                          -- when to escalate next
  accepted_at         timestamptz,
  resolved_at         timestamptz,
  resolution_note     text,
  alert_sid           text,                                 -- Twilio SID of latest alert sent
  created_at          timestamptz default now()
);

-- ── TICKET TIMELINE ──────────────────────────────────────────
-- Every action logged for accountability
create table ticket_events (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid references internal_tickets(id) on delete cascade,
  event_type  text not null,  -- created | alert_sent | accepted | escalated | resolved | cancelled
  actor       text,           -- phone number or 'system' or 'staff:Andreas'
  note        text,
  created_at  timestamptz default now()
);

-- ── INDEXES ──────────────────────────────────────────────────
create index idx_tickets_hotel     on internal_tickets(hotel_id);
create index idx_tickets_status    on internal_tickets(status);
create index idx_tickets_escalation on internal_tickets(escalation_due_at)
  where status not in ('resolved', 'cancelled');
create index idx_dept_hotel        on department_contacts(hotel_id, department);

-- ── SEED: TEST HOTEL CONTACTS ─────────────────────────────────
-- Replace hotel_id with your actual hotel UUID from Supabase

insert into department_contacts (hotel_id, department, role, name, phone)
select id, 'maintenance', 'supervisor', 'Nikos (Maintenance Supervisor)', '+35799000020'
from hotels where name = 'Four Seasons Limassol Test';

insert into department_contacts (hotel_id, department, role, name, phone)
select id, 'maintenance', 'team', 'Petros (Maintenance)', '+35799000021'
from hotels where name = 'Four Seasons Limassol Test';

insert into department_contacts (hotel_id, department, role, name, phone)
select id, 'maintenance', 'team', 'Stavros (Maintenance)', '+35799000022'
from hotels where name = 'Four Seasons Limassol Test';

insert into department_contacts (hotel_id, department, role, name, phone)
select id, 'maintenance', 'manager', 'Elena (General Manager)', '+35799000030'
from hotels where name = 'Four Seasons Limassol Test';

insert into department_contacts (hotel_id, department, role, name, phone)
select id, 'housekeeping', 'supervisor', 'Maria (Housekeeping Supervisor)', '+35799000023'
from hotels where name = 'Four Seasons Limassol Test';

insert into department_contacts (hotel_id, department, role, name, phone)
select id, 'housekeeping', 'team', 'Ioanna (Housekeeping)', '+35799000024'
from hotels where name = 'Four Seasons Limassol Test';

insert into department_contacts (hotel_id, department, role, name, phone)
select id, 'housekeeping', 'manager', 'Elena (General Manager)', '+35799000030'
from hotels where name = 'Four Seasons Limassol Test';

insert into department_contacts (hotel_id, department, role, name, phone)
select id, 'fnb', 'supervisor', 'Andreas (F&B Supervisor)', '+35799000025'
from hotels where name = 'Four Seasons Limassol Test';

insert into department_contacts (hotel_id, department, role, name, phone)
select id, 'concierge', 'supervisor', 'Christos (Head Concierge)', '+35799000026'
from hotels where name = 'Four Seasons Limassol Test';

-- ── HELPER VIEW ───────────────────────────────────────────────
create view v_open_tickets as
select
  t.id,
  t.hotel_id,
  t.ticket_number,
  t.department,
  t.category,
  t.description,
  t.room,
  t.priority,
  t.status,
  t.escalation_level,
  t.escalation_due_at,
  t.created_at,
  t.accepted_at,
  t.assigned_to_name,
  g.name || ' ' || coalesce(g.surname,'') as guest_name,
  extract(epoch from (now() - t.created_at))/60 as minutes_open
from internal_tickets t
left join guests g on g.id = t.guest_id
where t.status not in ('resolved','cancelled')
order by
  case t.priority when 'urgent' then 1 when 'normal' then 2 else 3 end,
  t.created_at asc;
