-- ============================================================================
-- Migration: legal_import_pages (BASS-Import-Manifest) - Pilot-RLS
-- Datum:     2026-07-11 (korrigiert)
-- Zweck:     Vollständige Import-Übersicht je gecrawlter Vorschriftenseite.
--            Ermöglicht Chunking, Resume, Fortschrittsanzeige und
--            Wissenskarten-Abdeckung.
--
-- Hinweis:   Das externe Supabase-Projekt besitzt aktuell KEINE has_role-
--            Funktion. Für den Pilotbetrieb werden daher offene Pilot-RLS-
--            Policies verwendet (analog zu legal_sections_rls_pilot).
--
-- Idempotent: alle Statements sind mit IF (NOT) EXISTS / DROP IF EXISTS oder
-- DO-Blöcken abgesichert und können mehrfach ausgeführt werden – auch nach
-- einem teilweise fehlgeschlagenen ersten Durchlauf.
-- ============================================================================

-- 1) Status-Enum ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'legal_import_page_status') then
    create type public.legal_import_page_status as enum (
      'discovered',
      'imported',
      'partial',
      'error',
      'skipped'
    );
  end if;
end$$;

-- 2) Manifest-Tabelle -------------------------------------------------------
create table if not exists public.legal_import_pages (
  id                       uuid primary key default gen_random_uuid(),
  source_id                uuid not null references public.legal_sources(id) on delete cascade,
  import_job_id            uuid null references public.import_jobs(id) on delete set null,
  url                      text not null,
  normalized_url           text not null,
  title                    text null,
  bass_number              text null,
  crawl_depth              integer not null default 0,
  status                   public.legal_import_page_status not null default 'discovered',
  section_count            integer not null default 0,
  imported_section_count   integer not null default 0,
  knowledge_card_count     integer not null default 0,
  source_hash              text null,
  last_seen_at             timestamptz not null default now(),
  last_imported_at         timestamptz null,
  error_message            text null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Falls die Tabelle in einer früheren Version ohne einzelne Spalten angelegt
-- wurde, hier defensiv nachziehen (idempotent).
alter table public.legal_import_pages add column if not exists import_job_id uuid null references public.import_jobs(id) on delete set null;
alter table public.legal_import_pages add column if not exists title text null;
alter table public.legal_import_pages add column if not exists bass_number text null;
alter table public.legal_import_pages add column if not exists crawl_depth integer not null default 0;
alter table public.legal_import_pages add column if not exists section_count integer not null default 0;
alter table public.legal_import_pages add column if not exists imported_section_count integer not null default 0;
alter table public.legal_import_pages add column if not exists knowledge_card_count integer not null default 0;
alter table public.legal_import_pages add column if not exists source_hash text null;
alter table public.legal_import_pages add column if not exists last_seen_at timestamptz not null default now();
alter table public.legal_import_pages add column if not exists last_imported_at timestamptz null;
alter table public.legal_import_pages add column if not exists error_message text null;

-- Unique (source_id, normalized_url) für Upsert / Dublettenschutz
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='legal_import_pages_source_normurl_key'
  ) then
    create unique index legal_import_pages_source_normurl_key
      on public.legal_import_pages(source_id, normalized_url);
  end if;
end$$;

create index if not exists legal_import_pages_source_idx  on public.legal_import_pages(source_id);
create index if not exists legal_import_pages_status_idx  on public.legal_import_pages(status);
create index if not exists legal_import_pages_job_idx     on public.legal_import_pages(import_job_id);
create index if not exists legal_import_pages_bass_idx    on public.legal_import_pages(bass_number);

-- updated_at Trigger
create or replace function public.tg_legal_import_pages_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_legal_import_pages_touch on public.legal_import_pages;
create trigger trg_legal_import_pages_touch
  before update on public.legal_import_pages
  for each row execute function public.tg_legal_import_pages_touch();

-- 3) Verknüpfung Abschnitt <-> Manifest-Seite -------------------------------
alter table public.legal_sections
  add column if not exists import_manifest_id uuid null
  references public.legal_import_pages(id) on delete set null;

create index if not exists legal_sections_import_manifest_idx
  on public.legal_sections(import_manifest_id);

-- 4) Grants -----------------------------------------------------------------
grant select, insert, update, delete on public.legal_import_pages to anon, authenticated;
grant all on public.legal_import_pages to service_role;

-- 5) Row Level Security (Pilot) --------------------------------------------
alter table public.legal_import_pages enable row level security;

-- Alte (fehlerhafte) Policies entfernen, falls vorhanden
drop policy if exists legal_import_pages_select_auth on public.legal_import_pages;
drop policy if exists legal_import_pages_write_admin on public.legal_import_pages;
drop policy if exists "legal_import_pages pilot all" on public.legal_import_pages;

-- Pilot-Policy: offener Zugriff für anon + authenticated
create policy "legal_import_pages pilot all"
  on public.legal_import_pages
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- 6) Schema-Cache neu laden -------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================================
-- Fertig. Nach dem Ausführen:
--   bun run schema:update
--   bun run schema:check
-- ============================================================================
