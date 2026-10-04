-- ============================================================================
-- Sprint: Retrieval-Performance – Serverseitige Vektorsuche
-- Datum: 2026-09-29
-- Zweck: Die Hybrid-Retrieval-Engine lud bisher alle Embeddings ohne Vektoren
--        (Payload-Schutz) in den Prozess, wodurch der Vector-Arm faktisch tot
--        war (scoreBreakdown.vector = 0). Diese Migration verlagert die
--        Cosine-Suche nach Postgres (pgvector) und ergänzt einen HNSW-Index.
-- Externes Supabase (nicht Lovable Cloud). Idempotent. Muss manuell ausgeführt werden.
-- Modell: openai/text-embedding-3-small (1536 Dimensionen), analog
--         match_practice_case_embeddings (db/2026-07-14_practice_case_search_embeddings.sql).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW-Index nur über aktive (nicht invalidierte) Embeddings – das ist exakt
-- die Menge, die die Match-Funktion durchsucht.
CREATE INDEX IF NOT EXISTS legal_chunk_embeddings_hnsw_idx
  ON public.legal_chunk_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WHERE invalidated_at IS NULL;

-- Match-RPC: Top-K ähnlichste Chunk-Embeddings über Cosine-Distance.
-- Rückgabe: chunk_id (uuid, = legal_chunks.id) + stable hash + similarity 0..1.
-- Filter: nur aktive Embeddings (invalidated_at IS NULL, status 'embedded'),
--         optional source_ids, optional nur aktive Chunks.
--
-- WICHTIG (Performance): Der HNSW-Scan greift nur beim Muster
-- "ORDER BY embedding <=> $1 LIMIT k" ohne Distanz-Filter in der WHERE-Klausel.
-- Deshalb: innerer Nearest-Neighbor-Scan zuerst, Similarity-/Chunk-Filter danach.
-- hnsw.iterative_scan (pgvector >= 0.8) scannt weiter, falls source_ids-Filter
-- viele Kandidaten verwerfen.
CREATE OR REPLACE FUNCTION public.match_legal_chunk_embeddings (
  query_embedding vector(1536),
  source_ids      uuid[] DEFAULT NULL,
  match_count     int    DEFAULT 30,
  min_similarity  float  DEFAULT 0,
  active_only     boolean DEFAULT true
)
RETURNS TABLE (
  chunk_id          uuid,
  chunk_stable_hash text,
  similarity        float
)
LANGUAGE sql STABLE
SET hnsw.iterative_scan = strict_order
AS $$
  WITH nearest AS (
    SELECT
      e.chunk_id,
      e.chunk_stable_hash,
      1 - (e.embedding <=> query_embedding) AS sim
    FROM public.legal_chunk_embeddings e
    WHERE e.invalidated_at IS NULL
      AND e.embedding_status = 'embedded'
      AND (source_ids IS NULL OR e.source_id = ANY (source_ids))
    ORDER BY e.embedding <=> query_embedding
    -- Puffer für Kandidaten, die der Chunk-/Similarity-Filter unten verwirft.
    LIMIT greatest(match_count * 3, 60)
  )
  SELECT n.chunk_id, n.chunk_stable_hash, n.sim AS similarity
  FROM nearest n
  INNER JOIN public.legal_chunks c ON c.id = n.chunk_id
  WHERE n.sim >= min_similarity
    AND (NOT active_only OR c.active)
  ORDER BY n.sim DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_legal_chunk_embeddings(vector, uuid[], int, float, boolean)
  TO anon, authenticated, service_role;

-- Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
