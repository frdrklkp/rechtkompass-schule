-- Ground-Truth-Overrides für das Suchtest-Set (/admin/suchtest → Editor).
-- Ersetzt/erweitert die statische SEARCH_TESTSET-Definition redaktionell,
-- ohne dass Code-Änderungen nötig sind. Idempotent. Manuell ausführen.

CREATE TABLE IF NOT EXISTS public.search_testset_overrides (
  test_id             text PRIMARY KEY,
  expected_case_ids   uuid[] NOT NULL DEFAULT '{}',
  acceptable_case_ids uuid[] NOT NULL DEFAULT '{}',
  audit               text,
  note                text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.search_testset_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_testset_overrides TO authenticated;
GRANT ALL ON public.search_testset_overrides TO service_role;

ALTER TABLE public.search_testset_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "testset_overrides_read_public" ON public.search_testset_overrides;
CREATE POLICY "testset_overrides_read_public"
  ON public.search_testset_overrides
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "testset_overrides_write_authenticated" ON public.search_testset_overrides;
CREATE POLICY "testset_overrides_write_authenticated"
  ON public.search_testset_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.search_testset_overrides_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS search_testset_overrides_touch_tg ON public.search_testset_overrides;
CREATE TRIGGER search_testset_overrides_touch_tg
  BEFORE UPDATE ON public.search_testset_overrides
  FOR EACH ROW EXECUTE FUNCTION public.search_testset_overrides_touch();
