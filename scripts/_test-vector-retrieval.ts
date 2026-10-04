/**
 * Ad-hoc-Verifikation: serverseitige Vektorsuche (match_legal_chunk_embeddings).
 * bun run scripts/_test-vector-retrieval.ts
 */
import { createServiceSupabase } from "../src/lib/searchEmbeddings.supabase.server";
import { SupabaseRetrievalRepository } from "../src/services/legal-knowledge/retrieval/repositories/RetrievalRepository";
import { HybridRetrievalService } from "../src/services/legal-knowledge/retrieval";
import { EmbeddingSearch } from "../src/services/legal-knowledge/retrieval/EmbeddingSearch";

const supabase = createServiceSupabase();
const repo = new SupabaseRetrievalRepository(supabase);

// 1) Query-Embedding + direkte vectorSearch
const q = await EmbeddingSearch.embedQuery("Nachteilsausgleich bei Lese-Rechtschreib-Schwäche", {});
console.log("Query-Embedding: dim =", q.vector.length, "model =", q.model.modelId, "provider =", q.model.providerId);
const t0 = performance.now();
const hits = await repo.vectorSearch({ queryVector: q.vector, topK: 10, minSimilarity: 0.15 });
console.log(`vectorSearch: ${hits.length} Hits in ${(performance.now() - t0).toFixed(0)} ms`);
for (const h of hits.slice(0, 5)) console.log("  ", h.similarity.toFixed(4), h.chunkId);

// 2) Volle Pipeline
const service = new HybridRetrievalService(repo);
const t1 = performance.now();
const result = await service.search({ query: "Nachteilsausgleich bei LRS", debug: true, limit: 5 });
console.log(`\nHybrid search: ${(performance.now() - t1).toFixed(0)} ms gesamt`);
console.log("latencyBreakdown:", result.statistics.latencyBreakdown);
console.log("vectorCandidates:", result.statistics.vectorCandidates, "keywordCandidates:", result.statistics.keywordCandidates);
for (const h of result.hits) {
  console.log(`  vector=${h.scoreBreakdown.vector.toFixed(4)} keyword=${h.scoreBreakdown.keyword.toFixed(4)} final=${h.score.toFixed(4)} :: ${h.citation.display.slice(0, 70)}`);
}
