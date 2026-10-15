# Day Book — Alice Carter Studio

Next.js (App Router, TypeScript) front end for the studio's existing Supabase database.
The app only reads and writes existing tables; it never creates, alters or seeds the schema.

## Setup
1. Vercel → Add New Project → import `peter6644/AliceCarterStudio`.
2. Add environment variables (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only).
3. Every push to `main` deploys automatically.

## Access
Role and class come from the `staff` table. Owner sees everything; producers are routed to
their own class. Row-Level Security in Supabase is the real lock — the UI only mirrors it.

## Checking the connection
After deploying, sign in and open `/debug` to see row counts per table, your role and
`current_period()`.
