-- Sprint 4.6M: Dauerhafte Fallakte nach Abschluss der Fallbearbeitung im
-- Decision Navigator (Phase 9 "Ergebnis & Abschluss"). Bislang lebte eine
-- Navigator-Sitzung ausschließlich im localStorage an einem einzigen,
-- überschreibbaren Slot ("aktueller-vorgang") - kein Server, keine
-- Fallnummer, kein Wiederaufruf nach Gerätewechsel oder Cache-Leerung.
--
-- case_files ist bewusst schlank: ein Snapshot der zum Abschlusszeitpunkt
-- vorhandenen Navigator-Kontextdaten (Situation, Bewertung, Maßnahmen,
-- Rechtsgrundlagen, Dokumente) als jsonb, nicht normalisiert - die Fallakte
-- ist ein unveränderliches Abschlussprotokoll, kein weiter bearbeitbarer
-- Datensatz. Eigentümerschaft läuft über dieselbe Lehrkräfte-Anmeldung
-- (Magic-Link), die für die automatische Fallgenerierung eingeführt wurde.

create table if not exists public.case_files (
  id uuid primary key default gen_random_uuid(),
  file_no bigint generated always as identity,
  case_number text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text,
  situation_snapshot jsonb,
  assessment_snapshot jsonb,
  actions_snapshot jsonb,
  legal_snapshot jsonb,
  documents_snapshot jsonb,
  open_points jsonb not null default '[]'::jsonb,
  practice_case_id uuid references public.practice_cases(id) on delete set null,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists case_files_owner_id_closed_at_idx
  on public.case_files (owner_id, closed_at desc);

-- Menschenlesbare Fallnummer aus fortlaufender file_no + Abschlussjahr,
-- z. B. "RK-2026-000042". Per Trigger statt generierter Spalte, weil
-- closed_at beim Insert gesetzt wird und file_no erst danach feststeht.
create or replace function public.set_case_file_case_number()
returns trigger language plpgsql as $$
begin
  if new.case_number is null then
    new.case_number := 'RK-' || to_char(coalesce(new.closed_at, now()), 'YYYY') || '-' || lpad(new.file_no::text, 6, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_case_files_case_number on public.case_files;
create trigger trg_case_files_case_number
  before insert on public.case_files
  for each row execute function public.set_case_file_case_number();

alter table public.case_files enable row level security;

-- Nur die eigene Lehrkraft sieht/verwaltet ihre Fallakten. Keine
-- Editor-/Admin-Ausnahme - Fallakten sind rein persönliche Aufzeichnungen,
-- kein redaktioneller Inhalt.
drop policy if exists "case_files: owner select" on public.case_files;
create policy "case_files: owner select"
  on public.case_files for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "case_files: owner insert" on public.case_files;
create policy "case_files: owner insert"
  on public.case_files for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "case_files: owner delete" on public.case_files;
create policy "case_files: owner delete"
  on public.case_files for delete
  to authenticated
  using (owner_id = auth.uid());

-- Bewusst keine UPDATE-Policy: eine Fallakte ist ein unveränderliches
-- Abschlussprotokoll zum Zeitpunkt des Abschlusses.

grant select, insert, delete on public.case_files to authenticated;
grant all on public.case_files to service_role;

notify pgrst, 'reload schema';
