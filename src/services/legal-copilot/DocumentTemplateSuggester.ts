/**
 * DocumentTemplateSuggester – Vorschlagsmaschine für Dokumentvorlagen.
 *
 * Anforderungen (Sprint 4.2 – Abschluss):
 *  - Nur Vorschläge, keine automatische Erstellung.
 *  - Deterministisch, regelbasiert (Schlüsselwörter + genutzte Rechtsgrundlagen).
 *  - Erklärt jede Vorlage mit einer nachvollziehbaren Begründung.
 */
import type { CopilotAnswer, GroundedChunk } from "./types";

export type DocumentTemplateId =
  | "gespraechsprotokoll"
  | "elternbrief"
  | "aktennotiz"
  | "meldung_schulleitung"
  | "datenschutzprotokoll"
  | "ordnungsmassnahmen";

export interface DocumentTemplateSuggestion {
  id: DocumentTemplateId;
  name: string;
  description: string;
  reason: string;
  refIds: string[];
  score: number;
}

interface TemplateSpec {
  id: DocumentTemplateId;
  name: string;
  description: string;
  keywords: string[];
  lawHints: string[];
  baseReason: string;
}

const TEMPLATES: TemplateSpec[] = [
  {
    id: "gespraechsprotokoll",
    name: "Gesprächsprotokoll",
    description: "Vorlage zur schriftlichen Dokumentation eines Gesprächs mit Eltern, Schülerin/Schüler oder Kolleginnen und Kollegen.",
    keywords: ["gespräch", "elterngespräch", "beratung", "anhörung", "besprechung"],
    lawHints: [],
    baseReason: "Ein Gespräch sollte nachvollziehbar dokumentiert werden.",
  },
  {
    id: "elternbrief",
    name: "Elternbrief",
    description: "Vorlage für eine schriftliche Information an die Erziehungsberechtigten.",
    keywords: ["eltern", "erziehungsberechtigt", "sorgeberechtigt", "information"],
    lawHints: [],
    baseReason: "Die Situation berührt die Erziehungsberechtigten und sollte schriftlich mitgeteilt werden.",
  },
  {
    id: "aktennotiz",
    name: "Aktennotiz",
    description: "Kurze schriftliche Notiz zur Ablage in der Schülerakte.",
    keywords: ["dokumentation", "vorfall", "notiz", "vermerk", "sachverhalt"],
    lawHints: [],
    baseReason: "Der Sachverhalt sollte kurz und sachlich in der Akte festgehalten werden.",
  },
  {
    id: "meldung_schulleitung",
    name: "Meldung an die Schulleitung",
    description: "Formblatt für die interne Weitergabe eines Vorfalls an die Schulleitung.",
    keywords: ["schulleitung", "meldung", "vorfall", "gewalt", "körperlich", "waffe", "straftat", "diebstahl"],
    lawHints: [],
    baseReason: "Der Vorfall sollte der Schulleitung mitgeteilt werden.",
  },
  {
    id: "datenschutzprotokoll",
    name: "Datenschutz-Dokumentation",
    description: "Kurzprotokoll für die Verarbeitung personenbezogener Daten (Zweck, Rechtsgrundlage, Empfänger).",
    keywords: ["datenschutz", "foto", "video", "aufnahme", "veröffentlichung", "einwilligung", "personenbezogen"],
    lawHints: ["dsgvo", "dsg", "kdg", "bdsg"],
    baseReason: "Die Situation berührt personenbezogene Daten und sollte datenschutzkonform dokumentiert werden.",
  },
  {
    id: "ordnungsmassnahmen",
    name: "Anhörung zu Ordnungsmaßnahmen",
    description: "Vorlage für Anhörung, Beratung und Bescheid im Rahmen einer Ordnungsmaßnahme.",
    keywords: ["ordnungsmaßnahme", "ordnungsmassnahme", "verweis", "ausschluss", "schulverweis", "disziplinar", "beleidigung", "wiederholt"],
    lawHints: ["schulg"],
    baseReason: "Formale Ordnungsmaßnahmen erfordern eine dokumentierte Anhörung und einen schriftlichen Bescheid.",
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/ß/g, "ss");
}

export const DocumentTemplateSuggester = {
  /**
   * Erzeugt eine Vorschlagsliste (kein Zwang, kein Auto-Erstellen).
   * Ergebnis ist stabil sortiert nach Score.
   */
  suggest(params: {
    question: string;
    answer: CopilotAnswer;
    grounded: GroundedChunk[];
  }): DocumentTemplateSuggestion[] {
    if (!params.answer.answered) return [];
    const haystackParts: string[] = [
      params.question,
      params.answer.sections.kurzantwort,
      params.answer.sections.einordnung,
      params.answer.sections.begruendung,
      ...params.answer.sections.empfohleneHandlung,
      ...params.answer.sections.hinweise,
      ...params.answer.sections.naechsteSchritte,
    ];
    const haystack = norm(haystackParts.filter(Boolean).join(" \n "));
    const laws = params.grounded
      .map((g) => norm(g.hit.citation.law ?? ""))
      .filter(Boolean);

    const results: DocumentTemplateSuggestion[] = [];
    for (const spec of TEMPLATES) {
      const matchedKeywords: string[] = [];
      for (const kw of spec.keywords) if (haystack.includes(norm(kw))) matchedKeywords.push(kw);
      const matchedLaws: string[] = [];
      for (const l of spec.lawHints) if (laws.some((law) => law.includes(l))) matchedLaws.push(l);

      const score = matchedKeywords.length * 1 + matchedLaws.length * 1.5;
      if (score <= 0) continue;

      const refIds = params.grounded.slice(0, 3).map((g) => g.refId);
      const reasonParts: string[] = [spec.baseReason];
      if (matchedKeywords.length > 0) {
        reasonParts.push(`Passende Stichworte: ${matchedKeywords.slice(0, 4).join(", ")}.`);
      }
      if (matchedLaws.length > 0) {
        reasonParts.push(`Bezug zu ${matchedLaws.map((l) => l.toUpperCase()).join(", ")}.`);
      }

      results.push({
        id: spec.id,
        name: spec.name,
        description: spec.description,
        reason: reasonParts.join(" "),
        refIds,
        score,
      });
    }

    // Standard: Aktennotiz als sanfte Empfehlung, wenn kein Vorschlag greift.
    if (results.length === 0) {
      results.push({
        id: "aktennotiz",
        name: "Aktennotiz",
        description: TEMPLATES.find((t) => t.id === "aktennotiz")!.description,
        reason: "Ein kurzer schriftlicher Vermerk hilft, den Sachverhalt später nachvollziehen zu können.",
        refIds: params.grounded.slice(0, 2).map((g) => g.refId),
        score: 0.5,
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  },
};
