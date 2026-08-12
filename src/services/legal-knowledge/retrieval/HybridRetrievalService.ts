/**
 * HybridRetrievalService – Orchestrator der Retrieval-Pipeline.
 *
 * Pipeline:
 *  1. Query normalisieren
 *  2. Query-Embedding erzeugen (nur bei hybrid/vector)
 *  3. Vector Search
 *  4. Keyword Search
 *  5. Metadata Filter
 *  6. Merge
 *  7. Ranking
 *  8. Citation Builder
 *  9. Validation
 * 10. RetrievalResult
 *
 * Keine Antwortgenerierung, keine KI-Zusammenfassungen.
 */
import { DEFAULT_RETRIEVAL_CONFIG, type RetrievalConfig } from "./config";
import { SearchQueryBuilder } from "./SearchQueryBuilder";
import { EmbeddingSearch } from "./EmbeddingSearch";
import { KeywordSearch } from "./KeywordSearch";
import { MetadataFilter } from "./MetadataFilter";
import { ResultMerger } from "./ResultMerger";
import { ChunkRanker } from "./ChunkRanker";
import { CitationBuilder } from "./CitationBuilder";
import { RetrievalValidator } from "./RetrievalValidator";
import { RetrievalStatistics } from "./RetrievalStatistics";
import { Highlighter } from "./Highlighter";
import { ResultExplainer } from "./ResultExplainer";
import { retrievalTelemetry } from "./telemetry";
import { RetrievalDisabledError, RetrievalError } from "./errors";
import { legalRetrievalFlags } from "./featureFlags";
import type { RetrievalRepositoryPort } from "./repositories/RetrievalRepository";
import type {
  RetrievalDebugPayload,
  RetrievalFilters,
  RetrievalHit,
  RetrievalResult,
  SearchType,
} from "./types";
import { RETRIEVAL_DOMAIN_VERSION } from "./types";
import type { EmbeddingProvider } from "../embeddings/providers/types";

export interface HybridRetrievalInput {
  query: string;
  filters?: RetrievalFilters;
  limit?: number;
  offset?: number;
  searchType?: SearchType;
  debug?: boolean;
  /** Erzwingt den Mock-Provider (Tests). */
  forceMock?: boolean;
  /** Vorab bereitgestellter Provider (Tests). */
  provider?: EmbeddingProvider;
  /** Modell-Override. */
  modelId?: string;
  /** Konfig-Overrides. */
  config?: Partial<RetrievalConfig>;
}

function now(): number { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

export class HybridRetrievalService {
  constructor(private repo: RetrievalRepositoryPort) {}

  async search(input: HybridRetrievalInput): Promise<RetrievalResult> {
    if (!legalRetrievalFlags.enabled) throw new RetrievalDisabledError();
    const cfg = { ...DEFAULT_RETRIEVAL_CONFIG, ...(input.config ?? {}) };
    const started = now();
    const times = { normalize: 0, embed: 0, vector: 0, keyword: 0, filter: 0, merge: 0, rank: 0, cite: 0, validate: 0 };

    // 1) Normalize
    let t = now();
    const query = SearchQueryBuilder.build({
      query: input.query,
      filters: input.filters,
      limit: input.limit,
      offset: input.offset,
      searchType: input.searchType ?? "hybrid",
      debug: input.debug ?? legalRetrievalFlags.debug,
      config: input.config,
    });
    times.normalize = now() - t;

    retrievalTelemetry.emit({ event: "retrieval_started", searchType: query.searchType });

    try {
      // Corpus laden
      const corpus = await this.repo.loadCorpus({ sourceIds: query.filters.sourceIds, activeOnly: query.filters.activeOnly ?? true });

      // Blocklist (rejected/archived) hart entfernen
      const chunks = corpus.chunks.filter((c) => !MetadataFilter.isBlocked(c));

      // 2 + 3) Vector Search
      let vectorHits: Awaited<ReturnType<typeof EmbeddingSearch.rank>> = [];
      if (query.searchType !== "keyword_only" && corpus.embeddings.length > 0) {
        t = now();
        const q = await EmbeddingSearch.embedQuery(query.normalizedQuery, {
          modelId: input.modelId,
          provider: input.provider,
          forceMock: input.forceMock,
        });
        times.embed = now() - t;
        t = now();
        vectorHits = EmbeddingSearch.rank(q.vector, corpus.embeddings, {
          topK: cfg.vectorTopK,
          minSimilarity: cfg.minVectorSimilarity,
        });
        times.vector = now() - t;
      }

      // 4) Keyword Search
      let keywordHits: ReturnType<typeof KeywordSearch.search> = [];
      if (query.searchType !== "vector_only" && legalRetrievalFlags.keywordSearchEnabled) {
        t = now();
        keywordHits = KeywordSearch.search(chunks, query.keywords, {
          topK: cfg.keywordTopK,
          minScore: cfg.minKeywordScore,
        });
        times.keyword = now() - t;
      }

      // 6) Merge
      t = now();
      const merged = ResultMerger.merge({
        chunks,
        embeddings: corpus.embeddings,
        vectorHits,
        keywordHits,
      });
      times.merge = now() - t;

      // 5) Metadata Filter
      t = now();
      const { kept } = MetadataFilter.apply(merged, query.filters);
      times.filter = now() - t;

      // 7) Ranking
      t = now();
      const ranked = ChunkRanker.rank(kept, { keywords: query.keywords, filters: query.filters }, cfg);
      times.rank = now() - t;

      // 8+ ) Cite, Highlight, Explain
      t = now();
      const paged = ranked
        .filter((r) => r.score >= cfg.minFinalScore)
        .slice(query.offset, query.offset + query.limit);
      const hits: RetrievalHit[] = paged.map((r, index) => {
        const chunk = r.bundle.chunk;
        const citation = legalRetrievalFlags.citationEnabled
          ? CitationBuilder.build(chunk)
          : { display: chunk.displayPath || chunk.title || chunk.id } as ReturnType<typeof CitationBuilder.build>;
        const highlights = Highlighter.extract(chunk.normalizedContent || chunk.content, query.keywords, cfg.highlightsPerHit);
        const excerpt = Highlighter.excerpt(chunk.content || chunk.normalizedContent, query.keywords, cfg.excerptChars);
        const hit: RetrievalHit = {
          chunkId: chunk.id,
          chunkStableHash: chunk.stableHash,
          score: r.score,
          confidence: r.score,
          rankingPosition: index + 1 + query.offset,
          scoreBreakdown: r.breakdown,
          reasons: r.reasons,
          citation,
          highlights,
          excerpt,
          content: chunk.content,
          metadata: chunk.metadata ?? {},
          references: (chunk as unknown as { references?: unknown[] }).references ?? [],
          path: chunk.path,
          displayPath: chunk.displayPath || chunk.path,
          chunkType: (chunk.metadata?.chunkStrategy as string) ?? "paragraph",
        };
        // Ergänze Reasons mit Explainer.
        for (const msg of ResultExplainer.explain(hit)) hit.reasons.push({ code: "explanation", message: msg });
        return hit;
      });
      times.cite = now() - t;

      // 9) Validate
      t = now();
      const validation = RetrievalValidator.validate(hits);
      times.validate = now() - t;

      const latencyMs = now() - started;
      const statistics = RetrievalStatistics.build({
        totalCandidates: chunks.length,
        vectorCandidates: vectorHits.length,
        keywordCandidates: keywordHits.length,
        merged: merged.length,
        filtered: kept.length,
        hits,
        latencyBreakdown: times,
        latencyMs,
      });

      const debug: RetrievalDebugPayload | null = query.debug ? {
        normalized: query.normalizedQuery,
        keywords: query.keywords,
        expansions: query.expansions,
        weights: cfg.weights,
        candidates: ranked.slice(0, 50).map((r) => ({
          chunkId: r.bundle.chunk.id,
          fromVector: r.bundle.vectorScore > 0,
          fromKeyword: r.bundle.keywordScore > 0,
          vectorScore: r.bundle.vectorScore,
          keywordScore: r.bundle.keywordScore,
          metadataScore: r.breakdown.metadata,
          finalScore: r.score,
        })),
      } : null;

      const result: RetrievalResult = {
        query,
        hits,
        statistics,
        validation,
        debug,
        createdAt: new Date().toISOString(),
        domainVersion: RETRIEVAL_DOMAIN_VERSION,
      };

      retrievalTelemetry.emit({
        event: "retrieval_completed",
        searchType: query.searchType,
        latencyMs,
        averageScore: statistics.averageScore,
        averageResults: statistics.returned,
        returned: statistics.returned,
        totalCandidates: statistics.totalCandidates,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      retrievalTelemetry.emit({ event: "retrieval_failed", searchType: query.searchType, errorCode: (err as { code?: string }).code ?? "unknown", data: { message } });
      if (err instanceof RetrievalError) throw err;
      throw new RetrievalError("repository_failed", message, err);
    }
  }
}
