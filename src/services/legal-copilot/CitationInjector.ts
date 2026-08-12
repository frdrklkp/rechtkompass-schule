/**
 * Ersetzt [R#]-Referenzen im Antworttext durch die kanonische Fundstelle
 * aus der Retrieval Citation Engine. Freitext-Zitate werden NICHT akzeptiert.
 */
import type { RetrievalCitation } from "../legal-knowledge/retrieval/types";
import type { GroundedChunk } from "./types";

export interface InjectionResult {
  text: string;
  usedRefIds: string[];
  unknownRefIds: string[];
}

const REF_RE = /\[(R\d+)\]/g;

export const CitationInjector = {
  citationsFor(refIds: string[], grounded: GroundedChunk[]): RetrievalCitation[] {
    const map = new Map(grounded.map((g) => [g.refId, g.hit.citation] as const));
    const seen = new Set<string>();
    const out: RetrievalCitation[] = [];
    for (const id of refIds) {
      const c = map.get(id);
      if (c && !seen.has(id)) {
        seen.add(id);
        out.push(c);
      }
    }
    return out;
  },

  inject(text: string, grounded: GroundedChunk[]): InjectionResult {
    const map = new Map(grounded.map((g) => [g.refId, g.hit.citation.display] as const));
    const used = new Set<string>();
    const unknown = new Set<string>();
    const replaced = text.replace(REF_RE, (_m, id: string) => {
      const disp = map.get(id);
      if (disp) {
        used.add(id);
        return `${disp} [${id}]`;
      }
      unknown.add(id);
      return `[${id}]`;
    });
    return { text: replaced, usedRefIds: [...used], unknownRefIds: [...unknown] };
  },
};
