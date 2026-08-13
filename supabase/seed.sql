-- Sample data for the demo. Safe to run any time -- everything up through
-- the historical loads' checklists uses ON CONFLICT / idempotent UPDATEs.
-- The DRIVERS section further down needs 3 real auth accounts to exist
-- first; see its own header comment for exactly what to create.

-- current_lat/current_lng/last_ping_at mirror trailers -- TRK-294 and
-- TRK-118 are each paired with a live in-use load below (IP-8842-A,
-- IP-8843-B); TRK-410 sits idle at the yard, unpaired, so the Live Map still
-- shows an available truck alongside the in-use ones.
insert into public.trucks (unit_number, plate, active, current_lat, current_lng, last_ping_at) values
  ('TRK-294', 'GA-84921', true, 35.1495, -90.0490, now() - interval '3 minutes'),  -- Memphis, TN
  ('TRK-118', 'GA-77102', true, 33.7490, -84.3880, now() - interval '18 minutes'), -- Atlanta, GA
  ('TRK-410', 'GA-91177', true, 32.0809, -81.0912, now() - interval '3 days')      -- Savannah, GA
on conflict (unit_number) do update set
  current_lat = excluded.current_lat,
  current_lng = excluded.current_lng,
  last_ping_at = excluded.last_ping_at;

-- current_lat/current_lng are approximate coordinates for each trailer's
-- origin city, standing in for real GPS pings (which need the driver
-- mobile app -- see coreva_dashboard_rbac_scope memory) until that exists.
-- last_ping_at is similarly staggered to stand in for a real ping history,
-- for the Live Map's Active Units panel.
insert into public.trailers (trailer_number, type, status, current_lat, current_lng, last_ping_at) values
  ('TR-8492A', '53'' Dry Van', 'in_use', 35.1495, -90.0490, now() - interval '3 minutes'),    -- Memphis, TN
  ('TR-1102B', '53'' Dry Van', 'in_use', 33.7490, -84.3880, now() - interval '18 minutes'),   -- Atlanta, GA
  ('TR-9934C', '53'' Dry Van', 'in_use', 47.6062, -122.3321, now() - interval '2 hours'),     -- Seattle, WA
  ('TR-5541Z', '53'' Dry Van', 'dropped', 39.7392, -104.9903, now() - interval '1 day'),      -- Denver, CO
  ('TR-2290X', '53'' Dry Van', 'available', 32.0809, -81.0912, now() - interval '3 days')     -- Savannah, GA
on conflict (trailer_number) do update set
  current_lat = excluded.current_lat,
  current_lng = excluded.current_lng,
  last_ping_at = excluded.last_ping_at;

-- bol_* fields stand in for what the driver app's BOL-photo OCR step would
-- extract (CLAUDE.md step 5) -- populated for every load that's progressed
-- past "assigned" (i.e. the driver has actually done the BOL/checklist
-- step). pickup_appointment_at is set for all five; IP-8845-D's is in the
-- future since it hasn't been picked up yet.
insert into public.loads
  (load_number, status, trailer_id, truck_id, customer_company, origin_address, destination_address,
   pickup_appointment_at, updated_at, bol_trailer_number, bol_mfo, bol_po_number, bol_seal_number,
   commodity, unit_count, packaging_type, weight_lbs, total_distance_miles, deadhead_miles)
select
  v.load_number, v.status::public.load_status,
  (select id from public.trailers where trailer_number = v.trailer_number),
  (select id from public.trucks where unit_number = v.truck_number),
  'International Paper', v.origin_address, v.destination_address,
  v.pickup_appointment_at, v.updated_at, v.bol_trailer_number, v.bol_mfo, v.bol_po_number, v.bol_seal_number,
  v.commodity, v.unit_count, v.packaging_type, v.weight_lbs, v.total_distance_miles, v.deadhead_miles
from (
  values
    ('IP-8842-A', 'in_transit', 'TR-8492A', 'TRK-294', 'Memphis, TN', 'Chicago, IL',
      now() - interval '3 hours', now() - interval '10 minutes',
      'TR-8492A', 'MFO-48213', 'PO-2026-77410', 'SL-90214',
      'Kraft Paper Rolls', 48, 'Rolls', 44200, 530, 12),
    ('IP-8843-B', 'picked_up', 'TR-1102B', 'TRK-118', 'Atlanta, GA', 'Dallas, TX',
      now() - interval '2 hours', now() - interval '1 hour',
      'TR-1102B', 'MFO-52290', 'PO-2026-77522', 'SL-90335',
      'Corrugated Sheets', 26, 'Pallets', 42500, 781, 5),
    ('IP-8839-C', 'delivered', 'TR-9934C', null, 'Seattle, WA', 'Portland, OR',
      now() - interval '5 hours', now() - interval '2 hours',
      'TR-9934C', 'MFO-33187', 'PO-2026-77198', 'SL-90109',
      'Containerboard', 30, 'Pallets', 39800, 174, 8),
    ('IP-8845-D', 'assigned', 'TR-5541Z', null, 'Denver, CO', 'Omaha, NE',
      now() + interval '2 hours', now() - interval '4 hours',
      null, null, null, null,
      'Packaging Cases', 960, 'Cases', 38100, 540, 15),
    ('IP-8850-E', 'dropped', 'TR-2290X', null, 'Savannah, GA', 'Atlanta, GA',
      now() - interval '8 hours', now() - interval '5 hours',
      'TR-2290X', 'MFO-61042', 'PO-2026-77650', 'SL-90471',
      'Paperboard Rolls', 40, 'Rolls', 43950, 248, 3)
) as v(load_number, status, trailer_number, truck_number, origin_address, destination_address,
       pickup_appointment_at, updated_at, bol_trailer_number, bol_mfo, bol_po_number, bol_seal_number,
       commodity, unit_count, packaging_type, weight_lbs, total_distance_miles, deadhead_miles)
on conflict (load_number) do update set
  trailer_id = excluded.trailer_id,
  truck_id = excluded.truck_id,
  pickup_appointment_at = excluded.pickup_appointment_at,
  bol_trailer_number = excluded.bol_trailer_number,
  bol_mfo = excluded.bol_mfo,
  bol_po_number = excluded.bol_po_number,
  bol_seal_number = excluded.bol_seal_number,
  commodity = excluded.commodity,
  unit_count = excluded.unit_count,
  packaging_type = excluded.packaging_type,
  weight_lbs = excluded.weight_lbs,
  total_distance_miles = excluded.total_distance_miles,
  deadhead_miles = excluded.deadhead_miles;

-- International Paper's own customers -- the recipients IP ships to, tracked
-- per load via loads.consignee_id. All five live loads get one assigned so
-- the Loads Overview "Customer" column is fully populated; the historical
-- loads get theirs further below, once those rows exist.
-- address backs the driver app's Scan New Shipment destination picker --
-- selecting a known consignee auto-fills destination_address instead of
-- the driver retyping it every time. ON CONFLICT DO UPDATE (not DO
-- NOTHING) so re-running this file actually backfills address onto
-- consignees created before that column existed -- same class of bug as
-- the checklists idempotency fix above.
insert into public.consignees (name, customer_company, address) values
  ('New Balance', 'International Paper', '40 Life Way, Lawrence, MA 01843'),
  ('California Packaging', 'International Paper', '1200 W Artesia Blvd, Compton, CA 90220'),
  ('OSI', 'International Paper', '9 Parklawn Dr, Rochester, NY 14606')
on conflict (customer_company, name) do update set address = excluded.address;

update public.loads l set consignee_id = c.id
from (values
  ('IP-8842-A', 'New Balance'),
  ('IP-8843-B', 'California Packaging'),
  ('IP-8839-C', 'OSI'),
  ('IP-8845-D', 'New Balance'),
  ('IP-8850-E', 'California Packaging')
) as assign(load_number, consignee_name)
join public.consignees c
  on c.customer_company = 'International Paper' and c.name = assign.consignee_name
where l.load_number = assign.load_number;

-- Backdated, already-delivered loads spread across the last ~7 weeks, purely
-- so Analytics' weekly volume trend and on-time-delivery rate have real
-- variation to show instead of one flat spike. Still only International
-- Paper -- Coreva doesn't have other clients yet. trailer_id/truck_id/bol_*
-- are filled in just below: real fleets reuse the same handful of trailers
-- and trucks across many loads over time, so pointing an old delivered load
-- at one of today's 5 trailers/3 trucks is realistic, not a data error --
-- and leaving it null just made every historical Load Detail page look
-- broken when clicked into from Loads Overview.
insert into public.loads
  (load_number, status, customer_company, origin_address, destination_address, created_at, updated_at, delivery_appointment_at)
select
  v.load_number, 'delivered'::public.load_status, 'International Paper',
  v.origin_address, v.destination_address, v.dispatched_at, v.delivered_at, v.appointment_at
from (
  values
    ('IP-7901-F', 'Memphis, TN', 'Chicago, IL', now() - interval '52 days', now() - interval '50 days', (now() - interval '50 days') + interval '3 hours'),
    ('IP-7902-G', 'Atlanta, GA', 'Dallas, TX', now() - interval '49 days', now() - interval '47 days', (now() - interval '47 days') - interval '5 hours'),
    ('IP-7910-F', 'Seattle, WA', 'Portland, OR', now() - interval '45 days', now() - interval '43 days', (now() - interval '43 days') + interval '2 hours'),
    ('IP-7911-G', 'Denver, CO', 'Omaha, NE', now() - interval '42 days', now() - interval '40 days', (now() - interval '40 days') - interval '4 hours'),
    ('IP-7920-F', 'Savannah, GA', 'Atlanta, GA', now() - interval '38 days', now() - interval '36 days', (now() - interval '36 days') + interval '1 hour'),
    ('IP-7921-G', 'Memphis, TN', 'Nashville, TN', now() - interval '35 days', now() - interval '33 days', (now() - interval '33 days') + interval '4 hours'),
    ('IP-7930-F', 'Atlanta, GA', 'Charlotte, NC', now() - interval '31 days', now() - interval '29 days', (now() - interval '29 days') - interval '3 hours'),
    ('IP-7931-G', 'Seattle, WA', 'Boise, ID', now() - interval '28 days', now() - interval '26 days', (now() - interval '26 days') + interval '2 hours'),
    ('IP-7940-F', 'Denver, CO', 'Salt Lake City, UT', now() - interval '24 days', now() - interval '22 days', (now() - interval '22 days') + interval '5 hours'),
    ('IP-7941-G', 'Savannah, GA', 'Jacksonville, FL', now() - interval '21 days', now() - interval '19 days', (now() - interval '19 days') - interval '2 hours'),
    ('IP-7950-F', 'Memphis, TN', 'St. Louis, MO', now() - interval '17 days', now() - interval '15 days', (now() - interval '15 days') + interval '3 hours'),
    ('IP-7951-G', 'Atlanta, GA', 'Birmingham, AL', now() - interval '14 days', now() - interval '12 days', (now() - interval '12 days') + interval '1 hour'),
    ('IP-7960-F', 'Seattle, WA', 'Spokane, WA', now() - interval '10 days', now() - interval '8 days', (now() - interval '8 days') - interval '6 hours'),
    ('IP-7961-G', 'Denver, CO', 'Cheyenne, WY', now() - interval '7 days', now() - interval '5 days', (now() - interval '5 days') + interval '2 hours')
) as v(load_number, origin_address, destination_address, dispatched_at, delivered_at, appointment_at)
on conflict (load_number) do nothing;

-- Cycle the 14 historical loads across the real 5 trailers / 3 trucks, and
-- give each a plausible BOL record, the same way the 5 live loads already
-- have one -- see the comment above for why this is realistic, not just
-- filler.
-- Same three commodity profiles used for the live loads above, cycled
-- across the 14 historical ones so their Load Details cards aren't empty
-- either (mod-3 on load position, same spirit as the trailer/truck cycling).
update public.loads l set
  trailer_id = t.id,
  truck_id = tr.id,
  bol_trailer_number = t.trailer_number,
  bol_mfo = assign.bol_mfo,
  bol_po_number = assign.bol_po_number,
  bol_seal_number = assign.bol_seal_number,
  commodity = assign.commodity,
  unit_count = assign.unit_count,
  packaging_type = assign.packaging_type,
  weight_lbs = assign.weight_lbs,
  total_distance_miles = assign.total_distance_miles,
  deadhead_miles = assign.deadhead_miles
from (values
  ('IP-7901-F', 'TR-8492A', 'TRK-294', 'MFO-70011', 'PO-2026-70011', 'SL-80011', 'Kraft Paper Rolls', 48, 'Rolls', 44200, 612, 9),
  ('IP-7902-G', 'TR-1102B', 'TRK-118', 'MFO-70022', 'PO-2026-70022', 'SL-80022', 'Corrugated Sheets', 26, 'Pallets', 42500, 781, 5),
  ('IP-7910-F', 'TR-9934C', 'TRK-410', 'MFO-70033', 'PO-2026-70033', 'SL-80033', 'Packaging Cases', 960, 'Cases', 38100, 174, 8),
  ('IP-7911-G', 'TR-5541Z', 'TRK-294', 'MFO-70044', 'PO-2026-70044', 'SL-80044', 'Kraft Paper Rolls', 48, 'Rolls', 44200, 540, 15),
  ('IP-7920-F', 'TR-2290X', 'TRK-118', 'MFO-70055', 'PO-2026-70055', 'SL-80055', 'Corrugated Sheets', 26, 'Pallets', 42500, 248, 3),
  ('IP-7921-G', 'TR-8492A', 'TRK-410', 'MFO-70066', 'PO-2026-70066', 'SL-80066', 'Packaging Cases', 960, 'Cases', 38100, 210, 6),
  ('IP-7930-F', 'TR-1102B', 'TRK-294', 'MFO-70077', 'PO-2026-70077', 'SL-80077', 'Kraft Paper Rolls', 48, 'Rolls', 44200, 245, 4),
  ('IP-7931-G', 'TR-9934C', 'TRK-118', 'MFO-70088', 'PO-2026-70088', 'SL-80088', 'Corrugated Sheets', 26, 'Pallets', 42500, 508, 11),
  ('IP-7940-F', 'TR-5541Z', 'TRK-410', 'MFO-70099', 'PO-2026-70099', 'SL-80099', 'Packaging Cases', 960, 'Cases', 38100, 392, 7),
  ('IP-7941-G', 'TR-2290X', 'TRK-294', 'MFO-70110', 'PO-2026-70110', 'SL-80110', 'Kraft Paper Rolls', 48, 'Rolls', 44200, 330, 10),
  ('IP-7950-F', 'TR-8492A', 'TRK-118', 'MFO-70121', 'PO-2026-70121', 'SL-80121', 'Corrugated Sheets', 26, 'Pallets', 42500, 289, 2),
  ('IP-7951-G', 'TR-1102B', 'TRK-410', 'MFO-70132', 'PO-2026-70132', 'SL-80132', 'Packaging Cases', 960, 'Cases', 38100, 197, 6),
  ('IP-7960-F', 'TR-9934C', 'TRK-294', 'MFO-70143', 'PO-2026-70143', 'SL-80143', 'Kraft Paper Rolls', 48, 'Rolls', 44200, 155, 5),
  ('IP-7961-G', 'TR-5541Z', 'TRK-118', 'MFO-70154', 'PO-2026-70154', 'SL-80154', 'Corrugated Sheets', 26, 'Pallets', 42500, 88, 3)
) as assign(load_number, trailer_number, truck_number, bol_mfo, bol_po_number, bol_seal_number,
            commodity, unit_count, packaging_type, weight_lbs, total_distance_miles, deadhead_miles)
join public.trailers t on t.trailer_number = assign.trailer_number
join public.trucks tr on tr.unit_number = assign.truck_number
where l.load_number = assign.load_number;

-- Round-robin the same three consignees across the historical loads so the
-- Loads Overview "Customer" column and Analytics are fully populated there
-- too, not just on the five live loads.
update public.loads l set consignee_id = c.id
from (values
  ('IP-7901-F', 'New Balance'), ('IP-7902-G', 'California Packaging'), ('IP-7910-F', 'OSI'),
  ('IP-7911-G', 'New Balance'), ('IP-7920-F', 'California Packaging'), ('IP-7921-G', 'OSI'),
  ('IP-7930-F', 'New Balance'), ('IP-7931-G', 'California Packaging'), ('IP-7940-F', 'OSI'),
  ('IP-7941-G', 'New Balance'), ('IP-7950-F', 'California Packaging'), ('IP-7951-G', 'OSI'),
  ('IP-7960-F', 'New Balance'), ('IP-7961-G', 'California Packaging')
) as assign(load_number, consignee_name)
join public.consignees c
  on c.customer_company = 'International Paper' and c.name = assign.consignee_name
where l.load_number = assign.load_number;

-- Equipment/trailer requirements for the driver app's Load Details screen --
-- International Paper's standard SOP (CLAUDE.md: secure every load with
-- straps/load bars, never break an existing seal), same for every load, so
-- a flat unconditional update rather than a per-load cycle. Runs here
-- (after BOTH load inserts above) rather than right after the live-loads
-- insert, so it actually reaches the 14 historical loads too -- it used to
-- run before they existed and silently missed all of them.
update public.loads set equipment_requirements = array[
  '53'' Dry Van',
  'Swing doors',
  'Trailer free of damage',
  'No reefer trailers',
  'Straps or load bars required',
  'Strict seal policy'
] where customer_company = 'International Paper';

-- Every load seeded above already has real (fictional) BOL data baked in --
-- treat those as already verified rather than showing a "pending
-- verification" badge on demo data that was never actually run through the
-- new OCR flow. bol_verified_by stays null (no real dispatcher account
-- reliably exists at seed time -- see the DRIVERS section below for why).
update public.loads set
  bol_verification_status = 'dispatch_verified',
  bol_verified_at = coalesce(updated_at, created_at)
where bol_trailer_number is not null;

-- ============================================================================
-- DRIVERS -- run this section only after creating these 3 accounts in the
-- Supabase dashboard: Authentication > Users > Add User (check "Auto Confirm
-- User" so they don't need a real inbox to verify):
--   Marcus Johnson   marcus.johnson@example.com
--   Priya Patel      priya.patel@example.com
--   David Chen       david.chen@example.com
-- profiles.id is a strict FK to auth.users.id, and Supabase manages password
-- hashing and several other auth.users columns that aren't safe to
-- hand-populate via plain SQL -- these accounts can't be created by this
-- script alone. If a below UPDATE matches zero rows, the matching account
-- hasn't been created yet.
-- ============================================================================
insert into public.profiles (id, role, full_name)
select u.id, 'driver', v.full_name
from auth.users u
join (values
  ('marcus.johnson@example.com', 'Marcus Johnson'),
  ('priya.patel@example.com', 'Priya Patel'),
  ('david.chen@example.com', 'David Chen')
) as v(email, full_name) on u.email = v.email
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

update public.loads l set driver_id = u.id
from (values
  ('IP-8842-A', 'marcus.johnson@example.com'),
  ('IP-8843-B', 'priya.patel@example.com'),
  ('IP-8845-D', 'david.chen@example.com'),
  ('IP-8839-C', 'david.chen@example.com'),
  ('IP-8850-E', 'marcus.johnson@example.com'),
  ('IP-7901-F', 'marcus.johnson@example.com'), ('IP-7902-G', 'priya.patel@example.com'), ('IP-7910-F', 'david.chen@example.com'),
  ('IP-7911-G', 'marcus.johnson@example.com'), ('IP-7920-F', 'priya.patel@example.com'), ('IP-7921-G', 'david.chen@example.com'),
  ('IP-7930-F', 'marcus.johnson@example.com'), ('IP-7931-G', 'priya.patel@example.com'), ('IP-7940-F', 'david.chen@example.com'),
  ('IP-7941-G', 'marcus.johnson@example.com'), ('IP-7950-F', 'priya.patel@example.com'), ('IP-7951-G', 'david.chen@example.com'),
  ('IP-7960-F', 'marcus.johnson@example.com'), ('IP-7961-G', 'priya.patel@example.com')
) as assign(load_number, email)
join auth.users u on u.email = assign.email
where l.load_number = assign.load_number;

-- Checklists for the four live loads that have progressed past "assigned"
-- (i.e. the driver has actually done the pickup/BOL/checklist step per
-- CLAUDE.md's physical workflow) -- IP-8845-D is skipped since it hasn't
-- been picked up yet. Timestamps are relative to each load's own
-- pickup_appointment_at so sealed/locked/signed stay in a sane order.
-- Uses ON CONFLICT DO UPDATE (not the old WHERE NOT EXISTS pattern) so
-- re-running this file actually backfills new columns onto a checklist row
-- that was first created before those columns existed -- WHERE NOT EXISTS
-- silently skipped every already-existing row, which is why arrived_at
-- (and plant_copy_turned_in_at before it) never landed on IP-8842-A's row
-- across several schema additions. This does mean any real in-app testing
-- progress on these four specific demo loads gets reset on every re-run --
-- matches the same reset-to-known-state behavior the `loads` upsert above
-- already has.
insert into public.checklists
  (load_id, driver_id, status, arrived_at, plant_copy_turned_in_at, single_stack_confirmed, seal_number, sealed_at, locked_at, signed_at)
select l.id, l.driver_id, v.status::public.checklist_status,
  l.pickup_appointment_at + interval '5 minutes',
  l.pickup_appointment_at + interval '25 minutes',
  true, l.bol_seal_number,
  l.pickup_appointment_at + interval '30 minutes',
  l.pickup_appointment_at + interval '35 minutes',
  l.pickup_appointment_at + interval '40 minutes'
from public.loads l
join (values
  ('IP-8842-A', 'locked'),
  ('IP-8843-B', 'locked'),
  ('IP-8839-C', 'locked'),
  ('IP-8850-E', 'locked')
) as v(load_number, status) on l.load_number = v.load_number
where l.driver_id is not null
on conflict (load_id, driver_id) do update set
  status = excluded.status,
  arrived_at = excluded.arrived_at,
  plant_copy_turned_in_at = excluded.plant_copy_turned_in_at,
  single_stack_confirmed = excluded.single_stack_confirmed,
  seal_number = excluded.seal_number,
  sealed_at = excluded.sealed_at,
  locked_at = excluded.locked_at,
  signed_at = excluded.signed_at;

-- Departure from pickup lives on loads.picked_up_at, not the (already
-- locked) checklist row -- see schema.sql's comment on that column.
update public.loads set picked_up_at = pickup_appointment_at + interval '45 minutes'
where load_number in ('IP-8842-A', 'IP-8843-B', 'IP-8839-C', 'IP-8850-E');

-- Same for the 14 historical loads -- all delivered, so all locked. They
-- have no pickup_appointment_at (never set for these backdated rows), so
-- timestamps anchor to created_at (dispatch) instead, safely inside the
-- created_at -> updated_at (delivery) window each one already has.
insert into public.checklists
  (load_id, driver_id, status, arrived_at, plant_copy_turned_in_at, single_stack_confirmed, seal_number, sealed_at, locked_at, signed_at)
select l.id, l.driver_id, 'locked',
  l.created_at + interval '1 hour 45 minutes',
  l.created_at + interval '1 hour 50 minutes',
  true, l.bol_seal_number,
  l.created_at + interval '2 hours',
  l.created_at + interval '2 hours 15 minutes',
  l.created_at + interval '2 hours 30 minutes'
from public.loads l
where l.load_number like 'IP-79%'
  and l.driver_id is not null
on conflict (load_id, driver_id) do update set
  status = excluded.status,
  arrived_at = excluded.arrived_at,
  plant_copy_turned_in_at = excluded.plant_copy_turned_in_at,
  single_stack_confirmed = excluded.single_stack_confirmed,
  seal_number = excluded.seal_number,
  sealed_at = excluded.sealed_at,
  locked_at = excluded.locked_at,
  signed_at = excluded.signed_at;

update public.loads set picked_up_at = created_at + interval '2 hours 35 minutes'
where load_number like 'IP-79%';

-- Pre-trip inspections for every load that already has a checklist (i.e.
-- has actually been picked up) -- same 8-item list the driver app uses
-- (lib/preTrip.js), all passing, so a fully-progressed demo load doesn't
-- show a phantom incomplete inspection step.
insert into public.pre_trip_inspections (load_id, driver_id, truck_id, items, overall_result, completed_at)
select l.id, l.driver_id, l.truck_id,
  jsonb_build_array(
    jsonb_build_object('label', 'Lights & Signals', 'result', 'pass', 'notes', ''),
    jsonb_build_object('label', 'Tires & Wheels', 'result', 'pass', 'notes', ''),
    jsonb_build_object('label', 'Brakes', 'result', 'pass', 'notes', ''),
    jsonb_build_object('label', 'Mirrors & Horn', 'result', 'pass', 'notes', ''),
    jsonb_build_object('label', 'Coupling System', 'result', 'pass', 'notes', ''),
    jsonb_build_object('label', 'Trailer Doors & Body', 'result', 'pass', 'notes', ''),
    jsonb_build_object('label', 'Fluid Levels', 'result', 'pass', 'notes', ''),
    jsonb_build_object('label', 'Emergency Equipment', 'result', 'pass', 'notes', '')
  ),
  'pass', c.arrived_at + interval '5 minutes'
from public.loads l
join public.checklists c on c.load_id = l.id
on conflict (load_id, driver_id) do update set
  items = excluded.items,
  overall_result = excluded.overall_result,
  completed_at = excluded.completed_at;

-- One open discrepancy, matching the "forklift scanned the wrong trailer"
-- edge case from CLAUDE.md, so the Discrepancy Reports card shows something
-- other than an empty state at least once in the demo.
insert into public.discrepancy_reports (checklist_id, load_id, type, description, resolved)
select c.id, l.id, 'mismatch',
  'Forklift-loaded MFO does not match the BOL MFO (' || l.bol_mfo || ') -- pending dispatcher review.',
  false
from public.loads l
join public.checklists c on c.load_id = l.id
where l.load_number = 'IP-8842-A'
  and not exists (select 1 from public.discrepancy_reports d where d.load_id = l.id);
