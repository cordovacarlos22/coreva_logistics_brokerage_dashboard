# Supabase setup

## 1. Create the project

Create a project at [supabase.com](https://supabase.com). Note down, from Project Settings → API:
- Project URL → `SUPABASE_URL` (server) / `VITE_SUPABASE_URL` (web)
- `anon` public key → `VITE_SUPABASE_ANON_KEY` (web only — safe to expose, RLS enforces access)
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose to the browser, bypasses RLS)

## 2. Apply the schema

Open the SQL editor in the Supabase dashboard, paste in `schema.sql`, and run it. It creates all enums, tables, indexes, `updated_at` triggers, and row-level-security policies for the four roles (`admin`, `dispatcher`, `driver`, `customer`).

The first profile row for each real user must be created after they sign up through Supabase Auth (the `profiles.id` foreign key points at `auth.users.id`) — there's no self-service signup flow, profiles are staff-provisioned. Create the first admin profile manually via the SQL editor:

```sql
insert into public.profiles (id, role, full_name)
values ('<auth-user-uuid-from-the-Auth-tab>', 'admin', 'Carlos Cordova');
```

Then run `seed.sql` (also in this folder) to populate a handful of demo trucks, trailers, and loads across every status — it doesn't depend on any auth user existing, so it's safe to run before or after the admin profile step above.

## 3. Storage buckets

Create these buckets under Storage (private, not public — access goes through signed URLs or RLS-gated storage policies):

| Bucket | Holds |
|---|---|
| `bol-photos` | BOL paperwork photos (checklist step 5) |
| `load-photos` | Load-secured photos — straps/wrap visible, pre-seal (checklist step 6) |
| `pod-photos` | Proof-of-delivery photos (delivery flow) |
| `signatures` | Driver signature images |
| `damage-reports` | Discrepancy/equipment-damage photos |

`checklist_photos.storage_path`, `delivery_records.pod_storage_path`, and `checklist_signatures.signature_path` store the object path within these buckets, not a public URL.

## 4. Realtime

Enable Realtime (Database → Replication) on `gps_pings` and `loads` — the dashboard's live map and loads-overview pages will subscribe to these for live updates. Also enable it on `team_messages` and `load_messages` for the internal team chat and per-load customer chat.
