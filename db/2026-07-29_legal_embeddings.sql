-- ============================================================================
-- Sprint 4.1D – Legal Embedding Platform
-- Datum: 2026-07-29
-- Zweck: Persistente Chunks (legal_chunks) sowie providerunabhängige
--        Embedding-Speicherung (legal_chunk_embeddings) inkl. Batch-Jobs
--        (legal_embedding_jobs, legal_embedding_job_items).
--
-- ARCHITEKTURENTSCHEIDUNGEN
--  E1: Persistente Chunks werden eingeführt (für stabile FK, Rebuilds,
--      Invalidierung). InMemory-Chunks bleiben als Testfixture.
--  E2: Erste Produktversion nutzt EIN Standardmodell mit 1536 Dimensionen
--      (openai/text-embedding-3-small). embedding vector(1536) wird
--      typisiert. Modelle mit abweichenden Dimensionen erfordern eine
--      separate Tabelle oder halfvec-Strategie in einem späteren Sprint.
--  E3: Cosine als Standardmetrik. Vektorindex per Feature-Flag (nicht in
--      dieser Migration erzwungen; bei kleinen Datenmengen unnötig).
--  E4: DB-basierte Queue (worker_id + processing_started_at + Lease).
--
-- Keine Änderungen an Editorial-Workflow, Review oder Publishing.
-- ============================================================================

create extension if not exists vector;

-- 1) Enums --------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_embedding_status') then
    create type public.legal_embedding_status as enum (
      'embedded','outdated','failed','disabled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_embedding_job_status') then
    create type public.legal_embedding_job_status as enum (
      'queued','preparing','running','partially_completed','completed','failed','cancelled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_embedding_job_trigger') then
    create type public.legal_embedding_job_trigger as enum (
      'manual','source_import','source_rebuild','model_migration','retry','maintenance'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'legal_embedding_item_status') then
    create type public.legal_embedding_item_status as enum (
      'pending','processing','completed','skipped','retryable','failed'
    );
  end if;
end $$;

-- 2) legal_chunks -------------------------------------------------------------
create table if not exists public.legal_chunks (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null references public.legal_sources(id) on delete cascade,
  primary_section_id  uuid references public.legal_sections(id) on delete set null,
  chunk_id            text not null,
  stable_hash         text not null,
  content_hash        text not null,
  path                text not null,
  display_path        text,
  breadcrumb          jsonb not null default '[]'::jsonb,
  chunk_type          text not null,
  title               text,
  content             text not null,
  normalized_content  text not null,
  section_ids         jsonb not null default '[]'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  "references"        jsonb not null default '[]'::jsonb,
  token_estimate      integer not null default 0,
  character_count     integer not null default 0,
  word_count          integer not null default 0,
  sentence_count      integer not null default 0,
  order_index         integer not null default 0,
  parent_chunk_id     uuid references public.legal_chunks(id) on delete set null,
  confidence          numeric,
  chunk_version       integer not null default 1,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source_id, chunk_id, chunk_version)
);

create index if not exists legal_chunks_source_idx        on public.legal_chunks(source_id);
create index if not exists legal_chunks_stable_hash_idx   on public.legal_chunks(stable_hash);
create index if not exists legal_chunks_active_idx        on public.legal_chunks(active);
create index if not exists legal_chunks_primary_section_idx on public.legal_chunks(primary_section_id);
create index if not exists legal_chunks_type_idx          on public.legal_chunks(chunk_type);

create or replace function public.tg_legal_chunks_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_chunks_touch on public.legal_chunks;
create trigger trg_legal_chunks_touch
  before update on public.legal_chunks
  for each row execute function public.tg_legal_chunks_touch();

-- 3) legal_chunk_embeddings ---------------------------------------------------
create table if not exists public.legal_chunk_embeddings (
  id                     uuid primary key default gen_random_uuid(),
  source_id              uuid not null references public.legal_sources(id) on delete cascade,
  chunk_id               uuid not null references public.legal_chunks(id) on delete cascade,
  chunk_stable_hash      text not null,
  chunk_path             text not null,
  provider_id            text not null,
  model_id               text not null,
  model_version          text not null,
  dimensions             integer not null,
  embedding              vector(1536) not null,
  embedding_status       public.legal_embedding_status not null default 'embedded',
  content_hash           text not null,
  input_format_version   integer not null default 1,
  token_count            integer,
  input_character_count  integer,
  usage_metadata         jsonb not null default '{}'::jsonb,
  cost_metadata          jsonb not null default '{}'::jsonb,
  error_code             text,
  error_message          text,
  attempt_count          integer not null default 0,
  embedded_at            timestamptz not null default now(),
  invalidated_at         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Nur ein aktives Embedding pro Chunk × Modell × Modellversion × Inputformat.
create unique index if not exists legal_chunk_embeddings_active_uniq
  on public.legal_chunk_embeddings (chunk_id, model_id, model_version, input_format_version)
  where invalidated_at is null;

create index if not exists legal_chunk_embeddings_source_idx      on public.legal_chunk_embeddings(source_id);
create index if not exists legal_chunk_embeddings_chunk_idx       on public.legal_chunk_embeddings(chunk_id);
create index if not exists legal_chunk_embeddings_stable_hash_idx on public.legal_chunk_embeddings(chunk_stable_hash);
create index if not exists legal_chunk_embeddings_model_idx       on public.legal_chunk_embeddings(model_id, model_version);
create index if not exists legal_chunk_embeddings_status_idx      on public.legal_chunk_embeddings(embedding_status);
create index if not exists legal_chunk_embeddings_embedded_at_idx on public.legal_chunk_embeddings(embedded_at desc);

create or replace function public.tg_legal_chunk_embeddings_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_chunk_embeddings_touch on public.legal_chunk_embeddings;
create trigger trg_legal_chunk_embeddings_touch
  before update on public.legal_chunk_embeddings
  for each row execute function public.tg_legal_chunk_embeddings_touch();

-- 4) legal_embedding_jobs -----------------------------------------------------
create table if not exists public.legal_embedding_jobs (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null references public.legal_sources(id) on delete cascade,
  provider_id         text not null,
  model_id            text not null,
  model_version       text not null,
  input_format_version integer not null default 1,
  status              public.legal_embedding_job_status not null default 'queued',
  requested_by        uuid,
  trigger_type        public.legal_embedding_job_trigger not null default 'manual',
  total_chunks        integer not null default 0,
  pending_chunks      integer not null default 0,
  processed_chunks    integer not null default 0,
  successful_chunks   integer not null default 0,
  failed_chunks       integer not null default 0,
  skipped_chunks      integer not null default 0,
  estimated_tokens    integer not null default 0,
  actual_tokens       integer not null default 0,
  estimated_cost      numeric not null default 0,
  actual_cost         numeric not null default 0,
  cost_source         text not null default 'estimated',
  started_at          timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  error_summary       jsonb not null default '{}'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists legal_embedding_jobs_source_idx  on public.legal_embedding_jobs(source_id);
create index if not exists legal_embedding_jobs_status_idx  on public.legal_embedding_jobs(status);
create index if not exists legal_embedding_jobs_created_idx on public.legal_embedding_jobs(created_at desc);

create or replace function public.tg_legal_embedding_jobs_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_embedding_jobs_touch on public.legal_embedding_jobs;
create trigger trg_legal_embedding_jobs_touch
  before update on public.legal_embedding_jobs
  for each row execute function public.tg_legal_embedding_jobs_touch();

-- 5) legal_embedding_job_items ------------------------------------------------
create table if not exists public.legal_embedding_job_items (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references public.legal_embedding_jobs(id) on delete cascade,
  chunk_id              uuid not null references public.legal_chunks(id) on delete cascade,
  chunk_stable_hash     text not null,
  status                public.legal_embedding_item_status not null default 'pending',
  attempt_count         integer not null default 0,
  provider_request_id   text,
  token_count           integer,
  latency_ms            integer,
  worker_id             text,
  processing_started_at timestamptz,
  processing_lease_until timestamptz,
  error_code            text,
  error_message         text,
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists legal_embedding_job_items_job_idx    on public.legal_embedding_job_items(job_id);
create index if not exists legal_embedding_job_items_chunk_idx  on public.legal_embedding_job_items(chunk_id);
create index if not exists legal_embedding_job_items_status_idx on public.legal_embedding_job_items(status);

create or replace function public.tg_legal_embedding_job_items_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_legal_embedding_job_items_touch on public.legal_embedding_job_items;
create trigger trg_legal_embedding_job_items_touch
  before update on public.legal_embedding_job_items
  for each row execute function public.tg_legal_embedding_job_items_touch();

-- 6) Grants (analog Sprint 4.1A/B) -------------------------------------------
grant select, insert, update, delete on public.legal_chunks              to anon, authenticated;
grant all on public.legal_chunks              to service_role;
grant select, insert, update, delete on public.legal_chunk_embeddings    to anon, authenticated;
grant all on public.legal_chunk_embeddings    to service_role;
grant select, insert, update, delete on public.legal_embedding_jobs      to anon, authenticated;
grant all on public.legal_embedding_jobs      to service_role;
grant select, insert, update, delete on public.legal_embedding_job_items to anon, authenticated;
grant all on public.legal_embedding_job_items to service_role;

-- 7) RLS (Pilot-Policy, konsistent mit anderen legal_*-Tabellen) -------------
alter table public.legal_chunks              enable row level security;
alter table public.legal_chunk_embeddings    enable row level security;
alter table public.legal_embedding_jobs      enable row level security;
alter table public.legal_embedding_job_items enable row level security;

drop policy if exists "legal_chunks pilot all" on public.legal_chunks;
create policy "legal_chunks pilot all"
  on public.legal_chunks for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "legal_chunk_embeddings pilot all" on public.legal_chunk_embeddings;
create policy "legal_chunk_embeddings pilot all"
  on public.legal_chunk_embeddings for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "legal_embedding_jobs pilot all" on public.legal_embedding_jobs;
create policy "legal_embedding_jobs pilot all"
  on public.legal_embedding_jobs for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "legal_embedding_job_items pilot all" on public.legal_embedding_job_items;
create policy "legal_embedding_job_items pilot all"
  on public.legal_embedding_job_items for all to anon, authenticated
  using (true) with check (true);

-- 8) Schema-Cache neu laden ---------------------------------------------------
notify pgrst, 'reload schema';
