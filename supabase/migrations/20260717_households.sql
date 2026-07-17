create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_id_idx on public.household_members(user_id);

alter table public.households enable row level security;
alter table public.household_members enable row level security;

create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.create_household(household_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  created_household public.households;
  generated_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;

  loop
    generated_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 4) || '-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 4));
    exit when not exists (select 1 from public.households where invite_code = generated_code);
  end loop;

  insert into public.households(name, invite_code, created_by)
  values (trim(household_name), generated_code, auth.uid())
  returning * into created_household;

  insert into public.household_members(household_id, user_id, role)
  values (created_household.id, auth.uid(), 'owner');

  return created_household;
end;
$$;

create or replace function public.join_household(code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.households;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;

  select * into target from public.households where invite_code = upper(trim(code));
  if target.id is null then raise exception 'Invite code not found'; end if;

  insert into public.household_members(household_id, user_id, role)
  values (target.id, auth.uid(), 'member');
  return target;
end;
$$;

create policy "members can read households" on public.households
for select using (public.is_household_member(id));

create policy "owners can update households" on public.households
for update using (public.is_household_owner(id)) with check (public.is_household_owner(id));

create policy "members can read membership" on public.household_members
for select using (public.is_household_member(household_id));

create policy "owners can remove members" on public.household_members
for delete using (public.is_household_owner(household_id) or user_id = auth.uid());

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;