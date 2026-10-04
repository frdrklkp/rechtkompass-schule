/**
 * Baut den Prompt-Kontext (Verlauf + grounded chunks) für den PromptBuilder.
 * Keine KI-Aufrufe.
 */
import type { CopilotSessionSnapshot, GroundedChunk } from "./types";

export interface AssembledContext {
  historyForPrompt: Array<{ role: "user" | "assistant"; text: string }>;
  groundedForPrompt: Array<{
    refId: string;
    citation: string;
    law: string | null;
    excerpt: string;
    reviewStatus: string;
    score: number;
  }>;
}

/**
 * Kurze Fundstellen-Bezeichnung für den Prompt, z. B. "SchulG NRW § 2" statt
 * "Schulgesetz für das Land Nordrhein-Westfalen (Schulgesetz NRW - SchulG) § § 2".
 * Grund (Messung 04.10.2026): Die KI wiederholt die lange Bezeichnung mehrfach
 * im Antworttext; das kostet pro Nennung ~25 Ausgabe-Token und trieb Antworten
 * über die Token-Obergrenze. Nur für den Prompt - citation.display (UI, Guard)
 * bleibt unverändert.
 */
export function compactCitationLabel(display: string, sectionNumber?: unknown): string {
  const d = (display ?? "").replace(/\s+/g, " ").trim();
  // Bereits kurze Bezeichnungen ("§ 42 SchulG NRW", CitationBuilder) unverändert lassen.
  if (d.length <= 40 && !d.includes("(")) return d;
  // Nummer: metadata.sectionNumber ("§ 28") oder letzte "§ N"/"Art N"-Angabe der Bezeichnung.
  const num =
    (typeof sectionNumber === "string" && sectionNumber.trim()) ||
    [...d.matchAll(/(§|Art\.?)\s*(?:§\s*)?(\d+[a-z]?)/g)].map((m) => `${m[1].startsWith("Art") ? "Art." : "§"} ${m[2]}`).pop() ||
    "";
  // Kurzname: letzter Klammerzusatz wie "(Schulgesetz NRW - SchulG)" → "SchulG NRW" bzw. "(... – VwVfG NRW)" → "VwVfG NRW".
  const paren = [...d.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]).pop() ?? "";
  const short = paren.split(/\s[-–]\s/).pop()?.trim() ?? "";
  let law = short;
  if (/^SchulG$/i.test(short) && /NRW/i.test(paren)) law = "SchulG NRW";
  if (!law) {
    // Ohne Klammerzusatz: Bezeichnung bis zur ersten Pfad-/Nummernangabe kürzen.
    law = d.split(/\s(?:Teil|Kapitel|Abschnitt|§|Art\.?)\b/)[0].trim().slice(0, 40);
  }
  const label = [law, num].filter(Boolean).join(" ").trim();
  return label || d.slice(0, 60);
}

export const ContextAssembler = {
  assemble(session: CopilotSessionSnapshot, grounded: GroundedChunk[], maxHistory = 6): AssembledContext {
    const history = session.turns
      .filter((t) => t.role === "user" || t.role === "assistant")
      .slice(-maxHistory)
      .map((t) => ({
        role: t.role as "user" | "assistant",
        text: (t.question ?? t.answerSummary ?? "").toString().slice(0, 500),
      }))
      .filter((h) => h.text.length > 0);

    const groundedForPrompt = grounded.map((g) => ({
      refId: g.refId,
      citation: compactCitationLabel(g.hit.citation.display, (g.hit.metadata as { sectionNumber?: unknown } | undefined)?.sectionNumber),
      law: g.hit.citation.law,
      excerpt: g.hit.content ?? g.hit.excerpt ?? "",
      reviewStatus: (g.hit.metadata?.reviewStatus ?? "unverified").toString(),
      score: g.hit.score,
    }));

    return { historyForPrompt: history, groundedForPrompt };
  },
};
