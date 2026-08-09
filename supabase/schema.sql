-- Coreva Logistics Brokerage Dashboard — core schema
-- Run in the Supabase SQL editor on a fresh project (after enabling the
-- pgcrypto/uuid extension, which Supabase enables by default).

create extension if not exists "pgcrypto";

-- ============================================================================
-- Enums
-- ============================================================================

create type public.user_role as enum ('admin', 'dispatcher', 'driver', 'customer');

create type public.trailer_status as enum ('available', 'in_use', 'dropped', 'maintenance');

create type public.load_status as enum (
  'pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'dropped'
);

create type public.stop_type as enum ('pickup', 'delivery');

create type public.checklist_status as enum ('in_progress', 'locked');

-- 'load_secured' = the post-strap, pre-seal photo of the load interior.
-- Used for strap/security compliance verification AND the MFO OCR
-- cross-check against the BOL (see CLAUDE.md step 6).
create type public.photo_type as enum ('bol', 'load_secured', 'damage', 'other');

create type public.discrepancy_type as enum ('mismatch', 'equipment_damage', 'other');

-- ============================================================================
-- Tables
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  phone text,
  -- Only meaningful for role = 'customer', e.g. 'International Paper'.
  customer_company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trucks (
  id uuid primary key default gen_random_uuid(),
  unit_number text not null unique,
  plate text,
  active boolean not null default true,
  current_lat double precision,
  current_lng double precision,
  last_ping_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.trailers (
  id uuid primary key default gen_random_uuid(),
  trailer_number text not null unique,
  type text,
  status public.trailer_status not null default 'available',
  current_lat double precision,
  current_lng double precision,
  last_ping_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The recipient of a shipment on behalf of a Coreva customer (e.g. one of
-- International Paper's own customers, like New Balance) -- scoped per
-- customer_company so a second Coreva customer gets its own independent
-- list, not a shared global one.
create table public.consignees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  customer_company text not null,
  created_at timestamptz not null default now(),
  unique (customer_company, name)
);

create table public.loads (
  id uuid primary key default gen_random_uuid(),
  load_number text not null unique,
  status public.load_status not null default 'pending',
  driver_id uuid references public.profiles (id),
  truck_id uuid references public.trucks (id),
  trailer_id uuid references public.trailers (id),
  customer_company text not null default 'International Paper',
  consignee_id uuid references public.consignees (id),
  origin_address text,
  destination_address text,
  pickup_appointment_at timestamptz,
  delivery_appointment_at timestamptz,
  -- Extracted by OCR from the BOL photo (CLAUDE.md step 5).
  bol_trailer_number text,
  bol_mfo text,
  bol_po_number text,
  bol_seal_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Multiple pickups/deliveries per load.
create table public.load_stops (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads (id) on delete cascade,
  sequence int not null,
  stop_type public.stop_type not null,
  address text not null,
  appointment_at timestamptz,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  unique (load_id, sequence)
);

-- One row per driver per load: every driver who has ever handled a load
-- gets their own checklist, so history is preserved across handoffs.
-- Once seal_number is set and status flips to 'locked', the row is frozen
-- (see RLS policy below) — this encodes "once a seal is placed, that
-- driver's checklist is locked."
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads (id) on delete cascade,
  driver_id uuid not null references public.profiles (id),
  status public.checklist_status not null default 'in_progress',
  -- "Secure every load, even single-stacked, no exceptions."
  single_stack_confirmed boolean not null default false,
  seal_number text,
  sealed_at timestamptz,
  locked_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.checklist_photos (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  type public.photo_type not null,
  storage_path text not null,
  ocr_raw jsonb,
  uploaded_at timestamptz not null default now()
);

create table public.checklist_signatures (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  driver_id uuid not null references public.profiles (id),
  signature_path text not null,
  signed_at timestamptz not null default now()
);

-- High-frequency phone-based GPS pings; only written while a driver is
-- clocked into an active load.
create table public.gps_pings (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.profiles (id),
  load_id uuid references public.loads (id),
  trailer_id uuid references public.trailers (id),
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

create table public.discrepancy_reports (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid references public.checklists (id),
  load_id uuid not null references public.loads (id),
  type public.discrepancy_type not null,
  description text,
  photo_paths text[] not null default '{}',
  reported_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_at timestamptz
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index loads_driver_id_idx on public.loads (driver_id);
create index loads_trailer_id_idx on public.loads (trailer_id);
create index loads_status_idx on public.loads (status);
create index load_stops_load_id_idx on public.load_stops (load_id);
create index checklists_load_id_idx on public.checklists (load_id);
create index checklists_driver_id_idx on public.checklists (driver_id);
create index checklist_photos_checklist_id_idx on public.checklist_photos (checklist_id);
create index gps_pings_driver_id_recorded_at_idx on public.gps_pings (driver_id, recorded_at desc);
create index gps_pings_load_id_recorded_at_idx on public.gps_pings (load_id, recorded_at desc);
create index discrepancy_reports_load_id_idx on public.discrepancy_reports (load_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

create function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.trailers
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.loads
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.checklists
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS helper functions
-- SECURITY DEFINER + fixed search_path so these can read `profiles` from
-- inside a policy on `profiles` itself without recursing into RLS.
-- ============================================================================

create function public.current_role() returns public.user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create function public.is_staff() returns boolean as $$
  select public.current_role() in ('admin', 'dispatcher');
$$ language sql stable security definer set search_path = public;

create function public.is_driver() returns boolean as $$
  select public.current_role() = 'driver';
$$ language sql stable security definer set search_path = public;

create function public.current_customer_company() returns text as $$
  select customer_company from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.trucks enable row level security;
alter table public.trailers enable row level security;
alter table public.consignees enable row level security;
alter table public.loads enable row level security;
alter table public.load_stops enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_photos enable row level security;
alter table public.checklist_signatures enable row level security;
alter table public.gps_pings enable row level security;
alter table public.discrepancy_reports enable row level security;

-- profiles: everyone can read/update their own row; staff can read/update all.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy profiles_insert_self on public.profiles for insert
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_staff());

-- trucks: staff and drivers see everything; customers see only trucks
-- currently assigned to one of their own loads (for the Live Map) -- same
-- shape as the trailers policy below, since a truck can be in a different
-- place than the trailer it usually pulls once decoupled.
create policy trucks_select on public.trucks for select
  using (
    public.is_staff()
    or public.is_driver()
    or exists (
      select 1 from public.loads
      where loads.truck_id = trucks.id
        and loads.customer_company = public.current_customer_company()
    )
  );
create policy trucks_write on public.trucks for all
  using (public.is_staff()) with check (public.is_staff());

-- trailers: staff and drivers see everything; customers see only trailers
-- currently assigned to one of their own loads (for the Live Map). Trailers
-- have no customer_company column of their own -- they're Coreva's
-- equipment, reassigned across customers over time -- so this scopes through
-- the loads table instead of a direct column match.
create policy trailers_select on public.trailers for select
  using (
    public.is_staff()
    or public.is_driver()
    or exists (
      select 1 from public.loads
      where loads.trailer_id = trailers.id
        and loads.customer_company = public.current_customer_company()
    )
  );
create policy trailers_write on public.trailers for all
  using (public.is_staff()) with check (public.is_staff());

-- consignees: staff manage the list; a customer sees only their own
-- environment's entries (e.g. IP sees IP's consignees, not a future second
-- customer's).
create policy consignees_select on public.consignees for select
  using (public.is_staff() or customer_company = public.current_customer_company());
create policy consignees_write on public.consignees for all
  using (public.is_staff()) with check (public.is_staff());

-- loads: staff see everything; drivers see their own assigned loads;
-- customers see only their own company's loads.
create policy loads_select on public.loads for select
  using (
    public.is_staff()
    or driver_id = auth.uid()
    or customer_company = public.current_customer_company()
  );
create policy loads_write on public.loads for all
  using (public.is_staff() or driver_id = auth.uid())
  with check (public.is_staff() or driver_id = auth.uid());

-- load_stops: mirrors the parent load.
create policy load_stops_select on public.load_stops for select
  using (
    exists (
      select 1 from public.loads l
      where l.id = load_stops.load_id
        and (
          public.is_staff()
          or l.driver_id = auth.uid()
          or l.customer_company = public.current_customer_company()
        )
    )
  );
create policy load_stops_write on public.load_stops for all
  using (
    public.is_staff()
    or exists (
      select 1 from public.loads l
      where l.id = load_stops.load_id and l.driver_id = auth.uid()
    )
  )
  with check (
    public.is_staff()
    or exists (
      select 1 from public.loads l
      where l.id = load_stops.load_id and l.driver_id = auth.uid()
    )
  );

-- checklists: staff see everything; a driver sees/edits their own rows but
-- can never edit one already locked (seal placed); customers see checklists
-- tied to their own company's loads (read-only, via loads_select join).
create policy checklists_select on public.checklists for select
  using (
    public.is_staff()
    or driver_id = auth.uid()
    or exists (
      select 1 from public.loads l
      where l.id = checklists.load_id
        and l.customer_company = public.current_customer_company()
    )
  );
create policy checklists_insert on public.checklists for insert
  with check (public.is_staff() or driver_id = auth.uid());
create policy checklists_update on public.checklists for update
  using (public.is_staff() or (driver_id = auth.uid() and status = 'in_progress'))
  with check (public.is_staff() or (driver_id = auth.uid() and status = 'in_progress'));

-- checklist_photos / checklist_signatures: mirror the parent checklist.
create policy checklist_photos_select on public.checklist_photos for select
  using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_photos.checklist_id
        and (
          public.is_staff()
          or c.driver_id = auth.uid()
          or exists (
            select 1 from public.loads l
            where l.id = c.load_id
              and l.customer_company = public.current_customer_company()
          )
        )
    )
  );
create policy checklist_photos_insert on public.checklist_photos for insert
  with check (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_photos.checklist_id
        and (public.is_staff() or (c.driver_id = auth.uid() and c.status = 'in_progress'))
    )
  );

create policy checklist_signatures_select on public.checklist_signatures for select
  using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_signatures.checklist_id
        and (
          public.is_staff()
          or c.driver_id = auth.uid()
          or exists (
            select 1 from public.loads l
            where l.id = c.load_id
              and l.customer_company = public.current_customer_company()
          )
        )
    )
  );
create policy checklist_signatures_insert on public.checklist_signatures for insert
  with check (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_signatures.checklist_id
        and (public.is_staff() or (c.driver_id = auth.uid() and c.status = 'in_progress'))
    )
  );

-- gps_pings: a driver writes their own pings; staff read everything;
-- customers can read pings tied to their own company's loads (simplified
-- live map on the customer dashboard).
create policy gps_pings_select on public.gps_pings for select
  using (
    public.is_staff()
    or driver_id = auth.uid()
    or exists (
      select 1 from public.loads l
      where l.id = gps_pings.load_id
        and l.customer_company = public.current_customer_company()
    )
  );
create policy gps_pings_insert on public.gps_pings for insert
  with check (driver_id = auth.uid());

-- discrepancy_reports: staff see everything; drivers see/report their own
-- (via checklist ownership); customers can read reports on their own loads.
create policy discrepancy_reports_select on public.discrepancy_reports for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.checklists c
      where c.id = discrepancy_reports.checklist_id and c.driver_id = auth.uid()
    )
    or exists (
      select 1 from public.loads l
      where l.id = discrepancy_reports.load_id
        and l.customer_company = public.current_customer_company()
    )
  );
create policy discrepancy_reports_insert on public.discrepancy_reports for insert
  with check (
    public.is_staff()
    or exists (
      select 1 from public.checklists c
      where c.id = discrepancy_reports.checklist_id and c.driver_id = auth.uid()
    )
  );

-- ============================================================================
-- load_notes — dispatcher-internal coordination notes on a load. Added for
-- the Load Detail page's "Internal Notes" panel.
-- ============================================================================

create table public.load_notes (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index load_notes_load_id_idx on public.load_notes (load_id);

alter table public.load_notes enable row level security;

-- Dispatcher-only, per the "Dispatcher Only" badge in the reference design —
-- drivers and customers don't see internal coordination notes.
create policy load_notes_select on public.load_notes for select
  using (public.is_staff());
create policy load_notes_insert on public.load_notes for insert
  with check (public.is_staff() and author_id = auth.uid());

-- ============================================================================
-- Messaging — two separate real-time systems:
--   team_messages: internal staff-only chat, not tied to any load
--   load_messages: per-load customer chat, split into two independent
--     threads (channel): 'dispatch' (customer <-> staff) and 'driver'
--     (customer <-> driver, direct — see Load Detail's Messages card)
-- ============================================================================

create table public.team_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index team_messages_created_at_idx on public.team_messages (created_at);

alter table public.team_messages enable row level security;

create policy team_messages_select on public.team_messages for select
  using (public.is_staff());
create policy team_messages_insert on public.team_messages for insert
  with check (public.is_staff() and author_id = auth.uid());

create type public.message_channel as enum ('dispatch', 'driver');

create table public.load_messages (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads (id) on delete cascade,
  channel public.message_channel not null,
  sender_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index load_messages_load_id_created_at_idx on public.load_messages (load_id, created_at);

alter table public.load_messages enable row level security;

-- Staff see and can post in both threads (oversight, and acting as "the
-- company" in the dispatch thread). Customers see/post both threads on
-- their own load. Drivers see/post only their own driver-thread messages.
create policy load_messages_select on public.load_messages for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.loads l
      where l.id = load_messages.load_id
        and (
          l.customer_company = public.current_customer_company()
          or (channel = 'driver' and l.driver_id = auth.uid())
        )
    )
  );
create policy load_messages_insert on public.load_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_staff()
      or exists (
        select 1 from public.loads l
        where l.id = load_messages.load_id
          and (
            l.customer_company = public.current_customer_company()
            or (channel = 'driver' and l.driver_id = auth.uid())
          )
      )
    )
  );
