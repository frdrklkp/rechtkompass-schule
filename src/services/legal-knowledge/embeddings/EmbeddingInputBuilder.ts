/**
 * Deterministischer, versionsgebundener EmbeddingInput-Builder.
 * Formatänderungen erhöhen INPUT_FORMAT_VERSION → gezielte Neuberechnung.
 */
import { createHash } from "crypto";
import type { ChunkForEmbedding, EmbeddingInputPayload } from "./types";
import { INPUT_FORMAT_VERSION } from "./types";

function line(label: string, value: string | undefined | null): string {
  const v = (value ?? "").toString().trim();
  return v ? `${label}: ${v}` : "";
}

export const EmbeddingInputBuilder = {
  version: INPUT_FORMAT_VERSION,

  build(chunk: ChunkForEmbedding): EmbeddingInputPayload {
    const md = chunk.metadata ?? {};
    const parts: string[] = [
      line("Gesetz", md.law ?? md.sourceLabel),
      line("Fundstelle", chunk.displayPath || chunk.path),
      line("Titel", chunk.displayTitle || chunk.title),
    ].filter(Boolean);

    const text = [
      parts.join("\n"),
      "",
      chunk.normalizedContent,
    ].join("\n").trim();

    const tokenEstimate = chunk.token?.tokenEstimate ?? Math.ceil(text.length / 4);
    const contentHash = createHash("sha1").update(`${INPUT_FORMAT_VERSION}::${text}`).digest("hex");

    return {
      text,
      characterCount: text.length,
      tokenEstimate,
      contentHash,
      inputFormatVersion: INPUT_FORMAT_VERSION,
    };
  },
};
