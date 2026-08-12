/**
 * Deterministic hash + id derivation for chunks.
 * Same normalized content + path + version → same hash across runs.
 */
import { createHash } from "crypto";

export interface ChunkHashInput {
  sourceId: string | null;
  path: string;
  normalizedContent: string;
  version?: string;
}

export function buildStableHash(input: ChunkHashInput): string {
  const payload = [
    input.sourceId ?? "?",
    input.path,
    input.version ?? "",
    input.normalizedContent,
  ].join("::");
  return sha1(payload);
}

export function buildChunkId(sourceId: string | null, path: string, order: number): string {
  return sha1(`${sourceId ?? "?"}::${path}::${order}`).slice(0, 20);
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}
