# Coreva Logistics Brokerage Dashboard

Cargo management and checklist platform — web dashboard + API. See the project's `CLAUDE.md` (one directory up) for full product context.

This repo covers the **web dashboard and backend API only**. The React Native driver app is planned as a separate repo.

## Structure

```
apps/
  web/     React + Vite dashboard (Tailwind, navy/orange design system)
  server/  Express modular monolith API (Supabase-backed)
supabase/
  schema.sql   full DDL for the app's data model
  README.md    how to apply it to a Supabase project
```

## Getting started

```bash
nvm use          # Node 20
npm install       # installs both workspaces

cp apps/server/.env.example apps/server/.env   # fill in Supabase + Google Vision creds
cp apps/web/.env.example apps/web/.env         # fill in Supabase public URL/anon key

npm run dev       # runs web (Vite) + server (Express) together
```

Without real Supabase credentials, `apps/server` still boots — `GET /api/health` reports a `degraded` status instead of crashing, so the stack is runnable before a Supabase project exists.

## Database

`supabase/schema.sql` has the full table/enum/RLS definitions for profiles, trucks, trailers, loads, load stops, checklists (+ photos/signatures), GPS pings, and discrepancy reports. See `supabase/README.md` to apply it once a Supabase project is created.

Checklist photos are typed `bol` / `load_secured` / `damage` / `other` — `load_secured` is the post-strap, pre-seal photo of the load (matches the reference photos in `example of loads being staps/`), used for both strap/security compliance and the MFO OCR cross-check against the BOL. `checklists.single_stack_confirmed` tracks the "secure every load, even single-stacked, no exceptions" rule explicitly.

## Scripts (root)

- `npm run dev` — web + server together
- `npm run dev:web` / `npm run dev:server` — individually
- `npm run build` — production build of the web app
- `npm test` — server + web test suites
- `npm run lint` — server + web

## Roadmap / not yet wired

This is a skeleton pass — folder structure, tooling, the Supabase schema, and one working end-to-end health-check page. Feature modules (loads, trailers, checklists, OCR, GPS ingestion) and their dashboard pages come next, one vertical slice at a time.

Tech-stack choices already decided but not yet installed (add them when the first real usage lands, not before):
- **React Hook Form** — first form (e.g. load creation) pulls this in
- **Framer Motion** — first page transition/animation pulls this in
- **Sileo** (toast/alert notifications, sileo.aaryan.design) — first toast usage pulls this in
