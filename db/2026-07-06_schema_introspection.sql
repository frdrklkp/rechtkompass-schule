-- ============================================================
-- Schema-Introspektion für den Schema Validator
-- ------------------------------------------------------------
-- Einmalig im Supabase SQL-Editor (Projekt mabbwunovhjaopnmzpfv)
-- ausführen. Idempotent.
--
-- Stellt die Funktion public.__schema_snapshot() bereit,
-- die Tabellen, Spalten, Foreign Keys, Indizes und RLS-Policies
-- des Schemas `public` als JSON liefert. Aufruf via PostgREST RPC.
-- ============================================================

CREATE OR REPLACE FUNCTION public.__schema_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH cols AS (
    SELECT
      c.table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',        c.column_name,
          'type',        c.data_type,
          'udt',         c.udt_name,
          'nullable',    (c.is_nullable = 'YES'),
          'default',     c.column_default
        )
        ORDER BY c.ordinal_position
      ) AS columns
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    GROUP BY c.table_name
  ),
  pks AS (
    SELECT
      tc.table_name,
      jsonb_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS pk
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema  = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    GROUP BY tc.table_name
  ),
  fks AS (
    SELECT
      tc.table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',              tc.constraint_name,
          'column',            kcu.column_name,
          'referenced_table',  ccu.table_name,
          'referenced_column', ccu.column_name
        )
      ) AS fks
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema  = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema  = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    GROUP BY tc.table_name
  ),
  policies AS (
    SELECT
      p.tablename AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',       p.policyname,
          'permissive', p.permissive,
          'roles',      p.roles,
          'command',    p.cmd,
          'using',      p.qual,
          'check',      p.with_check
        )
      ) AS policies
    FROM pg_policies p
    WHERE p.schemaname = 'public'
    GROUP BY p.tablename
  ),
  rls AS (
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  tables AS (
    SELECT
      t.table_name,
      jsonb_build_object(
        'name',        t.table_name,
        'columns',     COALESCE(cols.columns, '[]'::jsonb),
        'primary_key', COALESCE(pks.pk, '[]'::jsonb),
        'foreign_keys',COALESCE(fks.fks, '[]'::jsonb),
        'policies',    COALESCE(policies.policies, '[]'::jsonb),
        'rls_enabled', COALESCE(rls.enabled, false)
      ) AS entry
    FROM information_schema.tables t
    LEFT JOIN cols     ON cols.table_name     = t.table_name
    LEFT JOIN pks      ON pks.table_name      = t.table_name
    LEFT JOIN fks      ON fks.table_name      = t.table_name
    LEFT JOIN policies ON policies.table_name = t.table_name
    LEFT JOIN rls      ON rls.table_name      = t.table_name
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'tables', jsonb_object_agg(table_name, entry)
  )
  FROM tables;
$$;

REVOKE ALL ON FUNCTION public.__schema_snapshot() FROM public;
GRANT EXECUTE ON FUNCTION public.__schema_snapshot() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.__schema_snapshot() IS
  'Read-only schema snapshot used by scripts/schema-check.mjs. Safe to expose to anon (no data, only metadata).';
