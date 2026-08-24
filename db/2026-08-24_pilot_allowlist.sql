-- Pilotphasen-Zugangskontrolle: nur eingeladene Lehrkräfte (10-15 Personen)
-- sollen die öffentliche Seite nutzen können, bevor RechtKompass für alle
-- Lehrkräfte freigegeben wird.
--
-- Baut bewusst auf bereits vorhandener Infrastruktur auf (Sprint 1.1
-- user_profiles/app_role, Sprint 4.6K signInWithMagicLink) statt eine neue
-- Auth-Lösung zu erfinden: Anmeldung bleibt der bestehende Magic-Link-Flow
-- für Lehrkräfte (Rolle "teacher"), NEU ist ausschließlich die Prüfung, ob
-- die E-Mail-Adresse auf der Pilotliste steht. Redaktions-/Adminrollen
-- (editor/reviewer/admin/superadmin) sind ohnehin bereits privilegiert und
-- werden von der Pilotprüfung ausgenommen.
--
-- Idempotent: darf mehrfach ausgeführt werden.

create table if not exists public.pilot_allowlist (
  email text primary key,
  name text,
  note text,
  added_at timestamptz not null default now()
);

comment on table public.pilot_allowlist is
  'Zugelassene E-Mail-Adressen für die RechtKompass-Pilotphase (10-15 Lehrkräfte). Wird ausschließlich über is_pilot_approved() abgefragt, nie direkt an normale Nutzer exponiert.';

grant select, insert, update, delete on public.pilot_allowlist to authenticated;
grant all on public.pilot_allowlist to service_role;

alter table public.pilot_allowlist enable row level security;

-- Nur Admin/Superadmin dürfen die Liste selbst lesen oder pflegen - normale
-- Lehrkräfte bekommen die Liste nie direkt zu sehen (siehe is_pilot_approved
-- unten für den einzigen Weg, wie ein Nutzer den eigenen Status abfragt).
drop policy if exists "pilot_allowlist: admin read" on public.pilot_allowlist;
create policy "pilot_allowlist: admin read"
  on public.pilot_allowlist for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
  );

drop policy if exists "pilot_allowlist: admin manage" on public.pilot_allowlist;
create policy "pilot_allowlist: admin manage"
  on public.pilot_allowlist for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
  );

-- Security-Definer Helfer (analog has_role/current_app_role aus Sprint 1.1):
-- prüft NUR, ob die EIGENE E-Mail freigeschaltet ist, ohne dass der Aufrufer
-- Leserechte auf die volle Tabelle braucht. Redaktions-/Adminrollen sind
-- automatisch freigeschaltet.
create or replace function public.is_pilot_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.pilot_allowlist
      where lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
    )
    or public.has_role(auth.uid(), 'editor')
    or public.has_role(auth.uid(), 'reviewer')
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'superadmin')
$$;

grant execute on function public.is_pilot_approved() to authenticated;

notify pgrst, 'reload schema';
