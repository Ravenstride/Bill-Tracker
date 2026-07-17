create extension if not exists pgcrypto;

create table if not exists public.corvus_households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.corvus_household_members (
  household_id uuid not null references public.corvus_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id,user_id)
);

create table if not exists public.corvus_household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.corvus_households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.corvus_household_state (
  household_id uuid primary key references public.corvus_households(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create or replace function public.corvus_is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.corvus_household_members where household_id = target_household and user_id = auth.uid());
$$;

create or replace function public.corvus_create_household(household_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists(select 1 from public.corvus_household_members where user_id=auth.uid()) then raise exception 'This account already belongs to a household'; end if;
  insert into public.corvus_households(name,owner_id) values(coalesce(nullif(trim(household_name),''),'My Household'),auth.uid()) returning id into new_id;
  insert into public.corvus_household_members(household_id,user_id,role) values(new_id,auth.uid(),'owner');
  insert into public.corvus_household_state(household_id,payload,updated_by) values(new_id,'{}'::jsonb,auth.uid());
  return new_id;
end;
$$;

create or replace function public.corvus_create_invite()
returns text language plpgsql security definer set search_path = public as $$
declare hid uuid; invite_code text;
begin
  select household_id into hid from public.corvus_household_members where user_id=auth.uid() and role='owner' limit 1;
  if hid is null then raise exception 'Only a household owner can create an invite'; end if;
  invite_code := upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
  insert into public.corvus_household_invites(household_id,code,created_by) values(hid,invite_code,auth.uid());
  return invite_code;
end;
$$;

create or replace function public.corvus_join_household(invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.corvus_household_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists(select 1 from public.corvus_household_members where user_id=auth.uid()) then raise exception 'This account already belongs to a household'; end if;
  select * into inv from public.corvus_household_invites where code=upper(trim(invite_code)) and used_at is null and expires_at>now() for update;
  if inv.id is null then raise exception 'Invite code is invalid or expired'; end if;
  insert into public.corvus_household_members(household_id,user_id,role) values(inv.household_id,auth.uid(),'member');
  update public.corvus_household_invites set used_at=now(),used_by=auth.uid() where id=inv.id;
  return inv.household_id;
end;
$$;

create or replace function public.corvus_delete_household(confirm_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare hid uuid; current_name text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select h.id,h.name into hid,current_name
  from public.corvus_households h
  join public.corvus_household_members m on m.household_id=h.id
  where m.user_id=auth.uid() and m.role='owner' and h.owner_id=auth.uid()
  limit 1;
  if hid is null then raise exception 'Only the household owner can delete this household'; end if;
  if trim(coalesce(confirm_name,'')) <> current_name then raise exception 'Household name does not match'; end if;
  delete from public.corvus_households where id=hid;
  return true;
end;
$$;

alter table public.corvus_households enable row level security;
alter table public.corvus_household_members enable row level security;
alter table public.corvus_household_invites enable row level security;
alter table public.corvus_household_state enable row level security;

drop policy if exists "Members can read households" on public.corvus_households;
create policy "Members can read households" on public.corvus_households for select to authenticated using (public.corvus_is_household_member(id));
drop policy if exists "Members can read household members" on public.corvus_household_members;
create policy "Members can read household members" on public.corvus_household_members for select to authenticated using (public.corvus_is_household_member(household_id));
drop policy if exists "Owners can manage invites" on public.corvus_household_invites;
create policy "Owners can manage invites" on public.corvus_household_invites for select to authenticated using (exists(select 1 from public.corvus_household_members m where m.household_id=corvus_household_invites.household_id and m.user_id=auth.uid() and m.role='owner'));
drop policy if exists "Members can read household state" on public.corvus_household_state;
create policy "Members can read household state" on public.corvus_household_state for select to authenticated using (public.corvus_is_household_member(household_id));
drop policy if exists "Members can insert household state" on public.corvus_household_state;
create policy "Members can insert household state" on public.corvus_household_state for insert to authenticated with check (public.corvus_is_household_member(household_id));
drop policy if exists "Members can update household state" on public.corvus_household_state;
create policy "Members can update household state" on public.corvus_household_state for update to authenticated using (public.corvus_is_household_member(household_id)) with check (public.corvus_is_household_member(household_id));

grant select on public.corvus_households, public.corvus_household_members, public.corvus_household_invites, public.corvus_household_state to authenticated;
grant insert, update on public.corvus_household_state to authenticated;
grant execute on function public.corvus_create_household(text), public.corvus_create_invite(), public.corvus_join_household(text), public.corvus_delete_household(text), public.corvus_is_household_member(uuid) to authenticated;
