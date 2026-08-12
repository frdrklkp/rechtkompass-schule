-- Sprint 3.1 – Editorial Schema (revidiert nach SQL-Review)
--
-- Enthält:
--   * Enums für Workflow-, Publikations- und Review-Status
--   * Editorial-Spalten auf public.practice_cases
--   * Neue Tabellen: case_versions, case_reviews, case_events,
--     case_legal_review_flags
--   * Referentielle Integritätsgarantien: current_version_id,
--     case_reviews.case_version_id und case_events.case_version_id
--     dürfen ausschließlich auf eine Version desselben Falls zeigen
--     (zusammengesetzte Fremdschlüssel über (case_id, id)).
--   * RLS wird auf allen neuen Tabellen aktiviert, aber ohne Policies
--     (Policies folgen in Sprint 3.2).
--
-- Bewusst NICHT enthalten:
--   * Trigger
--   * RPCs
--   * RLS-Policies
--   * Änderungen an der Legacy-Spalte practice_cases.status
--   * Automatische Ableitung von quality_grade aus quality_score
--     (Grenzwerte sind noch nicht verbindlich dokumentiert; die
--     Ableitung erfolgt in Sprint 3.2. Bis dahin bleibt quality_grade
--     nullable und wird redaktionell/programmatisch gefüllt.)
--
-- Idempotent. Kann mehrfach ausgeführt werden.

BEGIN;

-- 1. Enums -------------------------------------------------------------------
--    Prüfung schema-spezifisch über to_regtype('public.<typ>').

DO $$
BEGIN
  IF to_regtype('public.case_workflow_status') IS NULL THEN
    CREATE TYPE public.case_workflow_status AS ENUM (
      'draft',
      'in_review',
      'approved',
      'published',
      'archived'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public.case_publication_tier') IS NULL THEN
    CREATE TYPE public.case_publication_tier AS ENUM (
      'internal',
      'beta',
      'public',
      'premium'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public.review_status') IS NULL THEN
    CREATE TYPE public.review_status AS ENUM (
      'pending',
      'approved',
      'changes_requested',
      'rejected',
      'cancelled'
    );
  END IF;
END $$;

-- 2. practice_cases erweitern -----------------------------------------------
--    Die Legacy-Spalte "status" bleibt unverändert.
--
--    Hinweis quality_grade:
--      Nullable text. Automatische Ableitung aus quality_score erfolgt
--      in Sprint 3.2, sobald die Grenzwerte verbindlich dokumentiert
--      sind. CHECK-Constraint erlaubt aktuell nur die Werte A|B|C|D
--      oder NULL, damit eine spätere GENERATED-STORED-Umstellung
--      möglich bleibt.

ALTER TABLE public.practice_cases
  ADD COLUMN IF NOT EXISTS workflow_status       public.case_workflow_status  NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS publication_tier      public.case_publication_tier NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS quality_score         numeric(5,2),
  ADD COLUMN IF NOT EXISTS quality_grade         text,
  ADD COLUMN IF NOT EXISTS legal_update_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at           timestamptz,
  ADD COLUMN IF NOT EXISTS published_at          timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at           timestamptz,
  ADD COLUMN IF NOT EXISTS current_version_id    uuid;

-- CHECK-Constraint für quality_grade (nur A|B|C|D oder NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practice_cases_quality_grade_chk'
      AND conrelid = 'public.practice_cases'::regclass
  ) THEN
    ALTER TABLE public.practice_cases
      ADD CONSTRAINT practice_cases_quality_grade_chk
      CHECK (quality_grade IS NULL OR quality_grade IN ('A','B','C','D'));
  END IF;
END $$;

-- 3. Neue Tabellen ----------------------------------------------------------

-- 3.1 case_versions: unveränderliche Snapshots eines Falls.
CREATE TABLE IF NOT EXISTS public.case_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  version_no   integer NOT NULL,
  payload      jsonb NOT NULL,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_versions_case_version_uk UNIQUE (case_id, version_no)
);

-- Zusammengesetzter Unique-Key (case_id, id) als Ziel für Composite-FKs.
-- Damit lässt sich referentiell erzwingen, dass abhängige Zeilen nur auf
-- eine Version desselben Falls zeigen können.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_versions_case_id_id_uk'
      AND conrelid = 'public.case_versions'::regclass
  ) THEN
    ALTER TABLE public.case_versions
      ADD CONSTRAINT case_versions_case_id_id_uk UNIQUE (case_id, id);
  END IF;
END $$;

-- practice_cases.current_version_id -> case_versions (case_id, id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practice_cases_current_version_fk'
      AND conrelid = 'public.practice_cases'::regclass
  ) THEN
    ALTER TABLE public.practice_cases
      ADD CONSTRAINT practice_cases_current_version_fk
      FOREIGN KEY (id, current_version_id)
      REFERENCES public.case_versions(case_id, id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- 3.2 case_reviews: Reviewvorgänge (Reviewer-Entscheidungen).
--     Benennung gemäß eingefrorener Architektur:
--       version_id     -> case_version_id
--       reviewer_id    -> assigned_to
--       + decided_by
CREATE TABLE IF NOT EXISTS public.case_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  case_version_id  uuid,
  status           public.review_status NOT NULL DEFAULT 'pending',
  requested_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comment          text,
  decided_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Composite-FK auf (case_id, case_version_id) -> case_versions (case_id, id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_reviews_case_version_fk'
      AND conrelid = 'public.case_reviews'::regclass
  ) THEN
    ALTER TABLE public.case_reviews
      ADD CONSTRAINT case_reviews_case_version_fk
      FOREIGN KEY (case_id, case_version_id)
      REFERENCES public.case_versions(case_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3.3 case_events: zentraler Ereignis-/Audit-Log.
CREATE TABLE IF NOT EXISTS public.case_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id            uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  case_version_id    uuid,
  event_type         text NOT NULL,
  actor_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role         text,
  actor_type         text NOT NULL DEFAULT 'user',
  aggregate_version  integer,
  correlation_id     uuid,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- actor_type auf definierte Werte einschränken.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_events_actor_type_chk'
      AND conrelid = 'public.case_events'::regclass
  ) THEN
    ALTER TABLE public.case_events
      ADD CONSTRAINT case_events_actor_type_chk
      CHECK (actor_type IN ('user','system','ai','migration','scheduler'));
  END IF;
END $$;

-- Composite-FK: case_version_id muss zum selben case_id gehören.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_events_case_version_fk'
      AND conrelid = 'public.case_events'::regclass
  ) THEN
    ALTER TABLE public.case_events
      ADD CONSTRAINT case_events_case_version_fk
      FOREIGN KEY (case_id, case_version_id)
      REFERENCES public.case_versions(case_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3.4 case_legal_review_flags: markiert Fälle, die aufgrund einer
--     Rechtsänderung erneut redaktionell geprüft werden müssen.
CREATE TABLE IF NOT EXISTS public.case_legal_review_flags (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  legal_section_id  uuid REFERENCES public.legal_sections(id) ON DELETE SET NULL,
  reason            text,
  raised_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 4. RLS aktivieren (ohne Policies) -----------------------------------------
--    Policies folgen in Sprint 3.2. Ohne Policies bleibt der Zugriff für
--    nicht-privilegierte Rollen standardmäßig verweigert; service_role
--    umgeht RLS ohnehin.

ALTER TABLE public.case_versions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_reviews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_legal_review_flags  ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
