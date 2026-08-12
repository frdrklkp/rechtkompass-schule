-- Sprint 3.1 – Editorial Indexes (revidiert nach SQL-Review)
--
-- Bereinigte Indexliste:
--   * Keine Indizes, deren linkes Präfix bereits durch einen UNIQUE-
--     Constraint abgedeckt ist (z.B. case_versions(case_id) — vom
--     UNIQUE (case_id, version_no) getragen).
--   * Ein partieller UNIQUE-Index erzwingt maximal ein offenes Review
--     (status = 'pending') pro Fall.
--
-- Idempotent. Setzt das editorial_schema voraus.

BEGIN;

-- practice_cases -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS practice_cases_workflow_status_idx
  ON public.practice_cases (workflow_status);

CREATE INDEX IF NOT EXISTS practice_cases_publication_tier_idx
  ON public.practice_cases (publication_tier);

CREATE INDEX IF NOT EXISTS practice_cases_workflow_tier_idx
  ON public.practice_cases (workflow_status, publication_tier);

CREATE INDEX IF NOT EXISTS practice_cases_quality_grade_idx
  ON public.practice_cases (quality_grade);

CREATE INDEX IF NOT EXISTS practice_cases_legal_update_required_idx
  ON public.practice_cases (legal_update_required)
  WHERE legal_update_required = true;

CREATE INDEX IF NOT EXISTS practice_cases_created_by_idx
  ON public.practice_cases (created_by);

CREATE INDEX IF NOT EXISTS practice_cases_updated_by_idx
  ON public.practice_cases (updated_by);

CREATE INDEX IF NOT EXISTS practice_cases_published_at_idx
  ON public.practice_cases (published_at DESC);

CREATE INDEX IF NOT EXISTS practice_cases_submitted_at_idx
  ON public.practice_cases (submitted_at DESC);

CREATE INDEX IF NOT EXISTS practice_cases_current_version_idx
  ON public.practice_cases (current_version_id);

-- case_versions ------------------------------------------------------------
-- HINWEIS: kein separater Index auf (case_id) — das UNIQUE (case_id, version_no)
--          deckt das linke Präfix bereits ab. Nur DESC-Variante für Auflistungen.
CREATE INDEX IF NOT EXISTS case_versions_case_version_desc_idx
  ON public.case_versions (case_id, version_no DESC);

CREATE INDEX IF NOT EXISTS case_versions_created_at_idx
  ON public.case_versions (created_at DESC);

CREATE INDEX IF NOT EXISTS case_versions_created_by_idx
  ON public.case_versions (created_by);

-- case_reviews -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS case_reviews_case_idx
  ON public.case_reviews (case_id);

CREATE INDEX IF NOT EXISTS case_reviews_case_version_idx
  ON public.case_reviews (case_version_id);

CREATE INDEX IF NOT EXISTS case_reviews_status_idx
  ON public.case_reviews (status);

CREATE INDEX IF NOT EXISTS case_reviews_assigned_to_idx
  ON public.case_reviews (assigned_to);

CREATE INDEX IF NOT EXISTS case_reviews_requested_by_idx
  ON public.case_reviews (requested_by);

CREATE INDEX IF NOT EXISTS case_reviews_decided_by_idx
  ON public.case_reviews (decided_by);

CREATE INDEX IF NOT EXISTS case_reviews_created_at_idx
  ON public.case_reviews (created_at DESC);

-- Maximal ein offenes Review je Praxisfall.
CREATE UNIQUE INDEX IF NOT EXISTS case_reviews_one_pending_per_case_uk
  ON public.case_reviews (case_id)
  WHERE status = 'pending';

-- case_events --------------------------------------------------------------
-- HINWEIS: kein separater Index auf (case_id) — der kombinierte
--          (case_id, created_at DESC) deckt das linke Präfix ab.
CREATE INDEX IF NOT EXISTS case_events_case_created_desc_idx
  ON public.case_events (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS case_events_event_type_idx
  ON public.case_events (event_type);

CREATE INDEX IF NOT EXISTS case_events_actor_idx
  ON public.case_events (actor_id);

CREATE INDEX IF NOT EXISTS case_events_actor_type_idx
  ON public.case_events (actor_type);

CREATE INDEX IF NOT EXISTS case_events_case_version_idx
  ON public.case_events (case_version_id);

CREATE INDEX IF NOT EXISTS case_events_correlation_idx
  ON public.case_events (correlation_id);

-- aggregate_version wird nur im Kontext eines Falls ausgewertet
-- (Reihenfolge / Konsistenzprüfung pro case_id).
CREATE INDEX IF NOT EXISTS case_events_case_aggregate_version_idx
  ON public.case_events (case_id, aggregate_version);

CREATE INDEX IF NOT EXISTS case_events_created_at_idx
  ON public.case_events (created_at DESC);

-- case_legal_review_flags --------------------------------------------------
CREATE INDEX IF NOT EXISTS case_legal_review_flags_case_idx
  ON public.case_legal_review_flags (case_id);

CREATE INDEX IF NOT EXISTS case_legal_review_flags_section_idx
  ON public.case_legal_review_flags (legal_section_id);

CREATE INDEX IF NOT EXISTS case_legal_review_flags_open_idx
  ON public.case_legal_review_flags (case_id)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS case_legal_review_flags_raised_at_idx
  ON public.case_legal_review_flags (raised_at DESC);

COMMIT;
