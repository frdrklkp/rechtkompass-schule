/**
 * Halluzinationsschutz.
 * Prüft, ob die KI-Antwort ausschließlich vorgegebene Referenz-IDs nutzt
 * und keine Paragraphen/Artikel/Gesetze erfindet.
 */
import type { GroundedChunk } from "./types";

export interface HallucinationReport {
  ok: boolean;
  violations: string[];
}

const REF_RE = /\[(R\d+)\]/g;
// Verdächtige Freitextzitate (deutsches Recht)
const FREE_CITE_RE = /(§\s?\d+[a-z]?)(?:\s?Abs\.\s?\d+)?(?:\s?[A-ZÄÖÜ][A-ZÄÖÜa-zäöü]+)?|Art\.?\s?\d+/g;
// Deutsche Gesetzeskürzel (grob), ohne dass sie mit einer bekannten Citation abgedeckt sind
const KNOWN_LAW_TOKEN_RE = /\b(SchulG|BASS|DSGVO|GG|SGB|StGB|BGB|APO|GsVO|SoFVO|AO-GS|AO-SF)\b/g;

export const HallucinationGuard = {
  check(answerText: string, grounded: GroundedChunk[]): HallucinationReport {
    const allowedRefs = new Set(grounded.map((g) => g.refId));
    const allowedLaws = new Set(
      grounded
        .map((g) => (g.hit.citation.law ?? "").toString())
        .filter((s) => s.length > 0)
        .map((s) => s.toLowerCase()),
    );
    const allowedDisplays = grounded.map((g) => g.hit.citation.display.toLowerCase());
    const violations: string[] = [];

    // 1. Unbekannte [R#]
    const refs = [...answerText.matchAll(REF_RE)].map((m) => m[1]);
    for (const r of refs) {
      if (!allowedRefs.has(r)) violations.push(`Unbekannte Fundstellen-ID: ${r}`);
    }

    // 2. Freitext-Paragraphen ohne umgebende [R#]
    const chunks = answerText.split(/[\n\.;]/);
    for (const chunk of chunks) {
      const hasFree = FREE_CITE_RE.test(chunk);
      FREE_CITE_RE.lastIndex = 0;
      if (!hasFree) continue;
      const hasRef = /\[R\d+\]/.test(chunk);
      if (!hasRef) {
        // Ist der Freitext exakt im display einer erlaubten Citation?
        const lower = chunk.toLowerCase();
        const covered = allowedDisplays.some((d) => lower.includes(d));
        if (!covered) {
          violations.push(`Freitext-Fundstelle ohne [R#]: "${chunk.trim().slice(0, 120)}"`);
        }
      }
    }

    // 3. Nicht abgedeckte Gesetzeskürzel
    const laws = [...answerText.matchAll(KNOWN_LAW_TOKEN_RE)].map((m) => m[1].toLowerCase());
    for (const l of laws) {
      const covered = [...allowedLaws].some((al) => al.includes(l) || l.includes(al));
      if (!covered) violations.push(`Nicht belegtes Gesetzeskürzel: ${l.toUpperCase()}`);
    }

    return { ok: violations.length === 0, violations };
  },
};
