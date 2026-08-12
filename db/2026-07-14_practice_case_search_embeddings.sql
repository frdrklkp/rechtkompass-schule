-- Semantische Suchindex-Tabelle für Praxisfälle.
-- Externes Supabase (nicht Lovable Cloud). Idempotent. Muss manuell ausgeführt werden.
-- Modell: openai/text-embedding-3-small via Lovable AI Gateway (1536 Dimensionen).
-- Bei Modellwechsel Spalte vector(<dims>) anpassen.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.practice_case_search_embeddings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES public.practice_cases(id) ON DELETE CASCADE,
  embedding        vector(1536) NOT NULL,
  content_hash     text NOT NULL,
  embedding_model  text NOT NULL DEFAULT 'openai/text-embedding-3-small',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_case_search_embeddings_case_uk UNIQUE (case_id)
);

-- HNSW-Index direkt (<= 2000 dims, kein halfvec-Cast nötig).
CREATE INDEX IF NOT EXISTS practice_case_search_embeddings_hnsw_idx
  ON public.practice_case_search_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS practice_case_search_embeddings_case_idx
  ON public.practice_case_search_embeddings(case_id);

ALTER TABLE public.practice_case_search_embeddings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.practice_case_search_embeddings TO anon;
GRANT SELECT ON TABLE public.practice_case_search_embeddings TO authenticated;
GRANT ALL    ON TABLE public.practice_case_search_embeddings TO service_role;

-- Pilot-RLS analog vorhandener Architektur. Ohne has_role().
DROP POLICY IF EXISTS "search_embeddings_read_public" ON public.practice_case_search_embeddings;
CREATE POLICY "search_embeddings_read_public"
  ON public.practice_case_search_embeddings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Writes ausschließlich service_role (RLS blockt anon/authenticated implizit).

-- Match-RPC: sucht ähnliche veröffentlichte Praxisfälle über Cosine-Distance.
-- Rückgabe: case_id + similarity in 0..1 (1 = identisch). Filtert published.
CREATE OR REPLACE FUNCTION public.match_practice_case_embeddings (
  query_embedding vector(1536),
  match_count     int DEFAULT 25
)
RETURNS TABLE (
  case_id    uuid,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.case_id,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.practice_case_search_embeddings e
  INNER JOIN public.practice_cases c ON c.id = e.case_id
  WHERE c.status = 'published'
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_practice_case_embeddings(vector, int) TO anon, authenticated, service_role;
