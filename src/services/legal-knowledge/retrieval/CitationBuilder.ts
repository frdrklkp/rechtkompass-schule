/**
 * Baut eine kanonische, redaktionell verwendbare Zitierung aus einem Chunk.
 * Keine Freitextzitate; alle Felder stammen aus Metadaten oder Pfad.
 */
import type { PersistedChunk } from "../embeddings/repositories/InMemoryRepositories";
import type { RetrievalCitation } from "./types";

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = v.toString().trim();
  return s.length === 0 ? null : s;
}

export const CitationBuilder = {
  build(chunk: PersistedChunk): RetrievalCitation {
    const md = chunk.metadata ?? {};
    const law = str(md.law ?? md.sourceLabel);
    const paragraph = str(md.paragraph);
    const article = str(md.article);
    const absatz = str(md.absatz);
    const sentence = str(md.sentence);
    const number = str(md.number);
    const annex = str(md.annex);
    const chapter = str(md.chapter);
    const section = str(md.section);
    const version = str(md.version);

    const parts: string[] = [];
    if (article) parts.push(`Art. ${article}`);
    if (paragraph) parts.push(`§ ${paragraph}`);
    if (absatz) parts.push(`Abs. ${absatz}`);
    if (sentence) parts.push(`S. ${sentence}`);
    if (number) parts.push(`Nr. ${number}`);
    if (annex) parts.push(`Anlage ${annex}`);
    const locator = parts.join(" ");
    const display = [locator, law].filter(Boolean).join(" ") ||
      chunk.displayPath || chunk.title || chunk.id;

    return {
      display,
      law,
      chapter,
      section,
      paragraph,
      article,
      absatz,
      sentence,
      number,
      annex,
      path: chunk.path,
      version,
      sourceId: chunk.sourceId,
      sourceLabel: law,
      chunkId: chunk.id,
      officialUrl: str((md as Record<string, unknown>).officialUrl),
    };
  },
};
