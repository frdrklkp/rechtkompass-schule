-- Sprint 1.1: Produktive Authentifizierung & Rollenmodell.
-- Ersetzt die frühere Dummy-Auth. Nur diese Tabelle/Enum/Policies sind neu;
-- bestehende Tabellen und Policies bleiben unangetastet.
-- Idempotent: darf mehrfach ausgeführt werden.

-- 1) Rollen-Enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('teacher','editor','reviewer','admin','superadmin');
  end if;
end $$;

-- 2) user_profiles Tabelle
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  role public.app_role not null default 'teacher',
  organization text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Grants (Data API)
grant select on public.user_profiles to authenticated;
grant update (display_name, organization) on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

-- 4) RLS
alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles: self select" on public.user_profiles;
create policy "user_profiles: self select"
  on public.user_profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "user_profiles: self update" on public.user_profiles;
create policy "user_profiles: self update"
  on public.user_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 5) Security-Definer Rollen-Helfer (bricht keine RLS-Rekursion aus)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = _user_id and role = _role
  )
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.current_app_role() to authenticated;

-- Admin-Übersicht: alle Profile lesen dürfen admin/superadmin
drop policy if exists "user_profiles: admin read all" on public.user_profiles;
create policy "user_profiles: admin read all"
  on public.user_profiles for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
  );

drop policy if exists "user_profiles: admin write all" on public.user_profiles;
create policy "user_profiles: admin write all"
  on public.user_profiles for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
  );

-- 6) Trigger: Profil beim Signup anlegen (Standardrolle teacher)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7) updated_at Autowartung
create or replace function public.touch_user_profiles_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.touch_user_profiles_updated_at();

notify pgrst, 'reload schema';
