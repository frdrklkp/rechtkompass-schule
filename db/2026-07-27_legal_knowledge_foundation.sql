-- ============================================================================
-- Sprint 4.1A – Legal Source Registry & Ingestion Foundation
-- Datum: 2026-07-27
-- Zweck: Erweitert legal_sources um Lifecycle-, Verifikations- und
--        Metadatenfelder. Ergänzt zwei neue Tabellen für Ingestion-Jobs und
--        Review-Ereignisse. Idempotent, additiv, ohne destruktive Umbenennungen.
--
-- WICHTIG: Kein pgvector, keine Embeddings, keine Chunks, kein RAG.
--          Bestehendes 'source_type' (text) bleibt unverändert. Neue Enum-Spalte
--          'source_type_v2' wird additiv ergänzt und aus dem Bestand befüllt.
-- ============================================================================

-- 1) Enums ------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_source_lifecycle') then
    create type public.legal_source_lifecycle as enum (
      'draft','imported','needs_review','verified','active','outdated','archived','rejected'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_source_verification') then
    create type public.legal_source_verification as enum (
      'unverified','technical_validated','editorial_reviewed','authority_verified'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_source_type') then
    create type public.legal_source_type as enum (
      'law','ordinance','administrative_regulation','circular','court_decision',
      'eu_regulation','internal_guideline','editorial_guideline','other'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_ingestion_status') then
    create type public.legal_ingestion_status as enum (
      'pending','loading','loaded','normalizing','validating',
      'ready_for_review','completed','failed','cancelled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_ingestion_input') then
    create type public.legal_ingestion_input as enum (
      'manual_text','official_url','existing_db','pdf','html','docx','markdown'
    );
  end if;
end $$;

-- 2) legal_sources – additive Erweiterung ----------------------------------
alter table public.legal_sources
  add column if not exists source_type_v2      public.legal_source_type,
  add column if not exists jurisdiction        text,
  add column if not exists authority           text,
  add column if not exists official_url        text,
  add column if not exists federal_state       text,
  add column if not exists school_type         text,
  add column if not exists educational_area    text,
  add column if not exists legal_domain        text,
  add column if not exists version_label       text,
  add column if not exists published_at        date,
  add column if not exists last_verified_at    timestamptz,
  add column if not exists supersedes_source_id  uuid references public.legal_sources(id) on delete set null,
  add column if not exists replaced_by_source_id uuid references public.legal_sources(id) on delete set null,
  add column if not exists official_source     boolean default false,
  add column if not exists authority_verified  boolean default false,
  add column if not exists editorial_verified  boolean default false,
  add column if not exists verification_status public.legal_source_verification default 'unverified',
  add column if not exists lifecycle_status    public.legal_source_lifecycle    default 'draft',
  add column if not exists source_format       text,
  add column if not exists source_language     text default 'de',
  add column if not exists checksum            text,
  add column if not exists ingestion_status    public.legal_ingestion_status,
  add column if not exists last_ingested_at    timestamptz,
  add column if not exists original_content    text,
  add column if not exists normalized_content  text,
  add column if not exists updated_at          timestamptz default now();

-- Backfill – nur Bestandsdatensätze berühren
update public.legal_sources
   set source_type_v2 = case
         when source_type in ('law','ordinance','administrative_regulation','circular',
                              'court_decision','eu_regulation','internal_guideline',
                              'editorial_guideline','other')
              then source_type::public.legal_source_type
         else 'other'::public.legal_source_type
       end
 where source_type_v2 is null;

update public.legal_sources
   set lifecycle_status = 'active'
 where lifecycle_status is null;

-- updated_at Trigger
create or replace function public.tg_legal_sources_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_sources_touch on public.legal_sources;
create trigger trg_legal_sources_touch
  before update on public.legal_sources
  for each row execute function public.tg_legal_sources_touch();

create index if not exists legal_sources_lifecycle_idx    on public.legal_sources(lifecycle_status);
create index if not exists legal_sources_verification_idx on public.legal_sources(verification_status);
create index if not exists legal_sources_type_v2_idx      on public.legal_sources(source_type_v2);
create index if not exists legal_sources_official_url_idx on public.legal_sources(official_url);
create index if not exists legal_sources_checksum_idx     on public.legal_sources(checksum);
create index if not exists legal_sources_supersedes_idx   on public.legal_sources(supersedes_source_id);

-- 3) legal_ingestion_jobs --------------------------------------------------
create table if not exists public.legal_ingestion_jobs (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid null references public.legal_sources(id) on delete set null,
  input_type          public.legal_ingestion_input not null,
  input_location      text,
  status              public.legal_ingestion_status not null default 'pending',
  started_at          timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  created_by          uuid,
  error_code          text,
  error_message       text,
  warnings            jsonb not null default '[]'::jsonb,
  extracted_metadata  jsonb not null default '{}'::jsonb,
  content_stats       jsonb not null default '{}'::jsonb,
  checksum            text,
  raw_input           text,
  normalized_output   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists legal_ingestion_jobs_source_idx on public.legal_ingestion_jobs(source_id);
create index if not exists legal_ingestion_jobs_status_idx on public.legal_ingestion_jobs(status);
create index if not exists legal_ingestion_jobs_created_idx on public.legal_ingestion_jobs(created_at desc);

create or replace function public.tg_legal_ingestion_jobs_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_ingestion_jobs_touch on public.legal_ingestion_jobs;
create trigger trg_legal_ingestion_jobs_touch
  before update on public.legal_ingestion_jobs
  for each row execute function public.tg_legal_ingestion_jobs_touch();

-- 4) legal_source_review_events -------------------------------------------
create table if not exists public.legal_source_review_events (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.legal_sources(id) on delete cascade,
  from_status  public.legal_source_lifecycle,
  to_status    public.legal_source_lifecycle not null,
  actor_id     uuid,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists legal_source_review_events_source_idx on public.legal_source_review_events(source_id);
create index if not exists legal_source_review_events_created_idx on public.legal_source_review_events(created_at desc);

-- 5) Grants (analog bestehender Muster) ------------------------------------
grant select, insert, update, delete on public.legal_ingestion_jobs      to anon, authenticated;
grant all on public.legal_ingestion_jobs to service_role;
grant select, insert, update, delete on public.legal_source_review_events to anon, authenticated;
grant all on public.legal_source_review_events to service_role;

-- 6) RLS (Pilot-Policy, konsistent mit legal_import_pages) ----------------
alter table public.legal_ingestion_jobs       enable row level security;
alter table public.legal_source_review_events enable row level security;

drop policy if exists "legal_ingestion_jobs pilot all"       on public.legal_ingestion_jobs;
create policy "legal_ingestion_jobs pilot all"
  on public.legal_ingestion_jobs for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "legal_source_review_events pilot all" on public.legal_source_review_events;
create policy "legal_source_review_events pilot all"
  on public.legal_source_review_events for all to anon, authenticated
  using (true) with check (true);

-- 7) Schema-Cache neu laden ------------------------------------------------
notify pgrst, 'reload schema';
