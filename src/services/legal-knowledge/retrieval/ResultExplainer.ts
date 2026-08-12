/**
 * Erzeugt lesbare Erklärungen ("Warum wurde dieser Treffer gewählt?").
 * Keine KI, nur regelbasiert.
 */
import type { RetrievalHit } from "./types";

export const ResultExplainer = {
  explain(hit: RetrievalHit): string[] {
    const out: string[] = [];
    const b = hit.scoreBreakdown;
    if (b.vector > 0.5) out.push("Sehr hohe inhaltliche Nähe zur Frage.");
    else if (b.vector > 0.25) out.push("Passt inhaltlich zum Sachverhalt.");
    if (b.keyword > 0.5) out.push("Kernbegriffe der Frage kommen direkt vor.");
    else if (b.keyword > 0.2) out.push("Wichtige Stichwörter kommen vor.");
    if (b.metadata > 0.4) out.push("Paragraph/Artikel/Gesetz passt zur Suche.");
    if (b.reviewBoost >= 0.8) out.push("Aus geprüfter, aktiver Quelle.");
    if (b.reviewBoost < 0.3) out.push("Quelle sollte redaktionell geprüft werden.");
    if (out.length === 0) out.push("Allgemeiner Treffer mit niedriger Konfidenz.");
    return out;
  },
};
