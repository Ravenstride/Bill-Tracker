create table if not exists public.corvus_planner_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.corvus_planner_state enable row level security;

drop policy if exists "Users can read their Corvus Planner data" on public.corvus_planner_state;
create policy "Users can read their Corvus Planner data"
on public.corvus_planner_state for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their Corvus Planner data" on public.corvus_planner_state;
create policy "Users can insert their Corvus Planner data"
on public.corvus_planner_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their Corvus Planner data" on public.corvus_planner_state;
create policy "Users can update their Corvus Planner data"
on public.corvus_planner_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.corvus_planner_state to authenticated;
