/**
 * Grounding Engine – begrenzt den Copilot ausschließlich auf Retrieval-Ergebnisse.
 * Keine externen Quellen, keine erfundenen Fakten.
 */
import type { RetrievalHit, RetrievalResult } from "../legal-knowledge/retrieval/types";
import type { GroundedChunk } from "./types";

export interface GroundingOptions {
  /** Höchste Anzahl Retrieval-Treffer im Prompt. */
  maxHits?: number;
  /** Score-Schwelle – Treffer darunter werden verworfen. */
  minScore?: number;
  /** Höchste Textlänge (Zeichen) pro Auszug im Prompt. */
  maxExcerpt?: number;
}

const DEFAULTS: Required<GroundingOptions> = {
  maxHits: 6,
  minScore: 0.15,
  maxExcerpt: 800,
};

export interface GroundingReport {
  grounded: GroundedChunk[];
  droppedChunkIds: string[];
  reasonings: string[];
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

export const GroundingEngine = {
  ground(retrieval: RetrievalResult, opts: GroundingOptions = {}): GroundingReport {
    const cfg = { ...DEFAULTS, ...opts };
    const grounded: GroundedChunk[] = [];
    const droppedChunkIds: string[] = [];
    const reasonings: string[] = [];

    let idx = 1;
    for (const hit of retrieval.hits) {
      if (grounded.length >= cfg.maxHits) {
        droppedChunkIds.push(hit.chunkId);
        reasonings.push(`Verworfen ${hit.chunkId}: über maxHits=${cfg.maxHits}.`);
        continue;
      }
      if (hit.score < cfg.minScore) {
        droppedChunkIds.push(hit.chunkId);
        reasonings.push(`Verworfen ${hit.chunkId}: Score ${hit.score.toFixed(2)} < ${cfg.minScore}.`);
        continue;
      }
      const clean = truncate(hit.content ?? hit.excerpt ?? "", cfg.maxExcerpt);
      const refId = `R${idx++}`;
      const withClamp: RetrievalHit = { ...hit, content: clean };
      grounded.push({ refId, hit: withClamp });
      reasonings.push(`Aufgenommen ${refId} ← ${hit.chunkId} (Score ${hit.score.toFixed(2)}).`);
    }
    return { grounded, droppedChunkIds, reasonings };
  },
};
