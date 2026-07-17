# Corvus Planner Supabase Setup

## Authentication

In Supabase, enable Email authentication and add the production application URL to Authentication > URL Configuration.

Production URL:

`https://ravenstride.github.io/corvus-planner/`

## Household database

Open the Supabase SQL Editor and run:

`supabase/migrations/20260717_households.sql`

This creates:

- `households`
- `household_members`
- secure create/join RPC functions
- owner/member roles
- row-level security policies
- unique invite codes

The browser only uses the public publishable key. Never add the service-role key to this repository or client-side JavaScript.

## Current storage boundary

Household identity and membership are stored in Supabase. Existing bills and appointments remain in local storage during this milestone so current user data is not lost. Moving planner records into household-scoped Supabase tables is the next cloud-sync build.