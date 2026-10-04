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
// "SGB IX" wird samt Buchnummer erfasst, damit SGB IX nicht SGB VIII mit belegt.
const KNOWN_LAW_TOKEN_RE = /\b(SchulG|BASS|DSGVO|GG|SGB(?:\s[IVX]+\b)?|StGB|BGB|APO|GsVO|SoFVO|AO-GS|AO-SF)(?!\w)/g;
// Normierte Fundstellen-Nummern ("§ 120", "art 6"), um Freitext gegen die
// erlaubten Citations abzugleichen. Importierte Chunks tragen weder
// citation.paragraph noch citation.law - ihre Nummer steht nur in der
// Bezeichnung (displayPath, z. B. "... (Schulgesetz NRW - SchulG) § § 120")
// und in metadata.sectionNumber ("§ 120").
const SECTION_TOKEN_RE = /(§|art\.?)\s*(\d+[a-z]?)/gi;

function sectionTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SECTION_TOKEN_RE)) {
    out.push(`${m[1].toLowerCase().startsWith("art") ? "art" : "§"} ${m[2].toLowerCase()}`);
  }
  return out;
}

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
    const allowedSections = new Set<string>();
    for (const g of grounded) {
      const c = g.hit.citation;
      if (c.paragraph) allowedSections.add(`§ ${c.paragraph.toString().replace(/^§\s*/, "").toLowerCase()}`);
      if (c.article) allowedSections.add(`art ${c.article.toString().replace(/^art\.?\s*/i, "").toLowerCase()}`);
      const sectionNumber = (g.hit.metadata as { sectionNumber?: unknown } | undefined)?.sectionNumber;
      for (const tkn of sectionTokens(`${c.display} ${sectionNumber ?? ""}`)) allowedSections.add(tkn);
    }
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
        // Erlaubt, wenn die Bezeichnung einer Citation im Satz steht ODER jede
        // genannte Nummer zu einer erlaubten Fundstelle gehört. Vorher musste die
        // komplette Bezeichnung im Satz stehen - bei importierten Gesetzestiteln
        // ("Schulgesetz für das Land Nordrhein-Westfalen (...) § § 120") nie der
        // Fall, sodass korrekte Antworten mit "Schulgesetz NRW § 120" verworfen
        // wurden (gemessen 04.10.2026). Fremde Gesetzeskürzel fängt Regel 3.
        const lower = chunk.toLowerCase();
        const mentioned = sectionTokens(chunk);
        const covered =
          allowedDisplays.some((d) => lower.includes(d)) ||
          (mentioned.length > 0 && mentioned.every((tkn) => allowedSections.has(tkn)));
        if (!covered) {
          violations.push(`Freitext-Fundstelle ohne [R#]: "${chunk.trim().slice(0, 120)}"`);
        }
      }
    }

    // 3. Nicht abgedeckte Gesetzeskürzel
    const laws = [...answerText.matchAll(KNOWN_LAW_TOKEN_RE)].map((m) => m[1].toLowerCase());
    for (const l of laws) {
      // Importierte Chunks tragen kein metadata.law; das Kürzel steht dann nur
      // in der Fundstellen-Bezeichnung (Gesetzestitel, z.B. "... - SGB IX)").
      const covered =
        [...allowedLaws].some((al) => al.includes(l) || l.includes(al)) ||
        allowedDisplays.some((d) => d.includes(l));
      if (!covered) violations.push(`Nicht belegtes Gesetzeskürzel: ${l.toUpperCase()}`);
    }

    return { ok: violations.length === 0, violations };
  },
};
