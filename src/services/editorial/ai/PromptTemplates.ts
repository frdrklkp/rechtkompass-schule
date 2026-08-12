// Prompt-Templates für den AI Editorial Assistant.
// Alle Prompts strikt in Deutsch, sachlich, ohne Rechtsberatung.

import type { AITaskType } from "./types";

export const SYSTEM_BASE = [
  "Du bist redaktioneller KI-Assistent für den RechtKompass Schule (NRW).",
  "Deine Aufgabe ist es, redaktionelle Vorschläge zu Praxisfällen für Lehrkräfte und Schulleitungen zu erstellen.",
  "Sprache: Deutsch, sachlich, klar, handlungsorientiert, keine Rechtsberatung.",
  "Rechtsrahmen: Schulgesetz NRW, VwVfG NRW, DSGVO/DSG NRW, GG.",
  "WICHTIG: Erfinde KEINE Rechtsgrundlagen und KEINE Fakten. Nutze ausschließlich den übergebenen Fallkontext.",
  "Deine Ausgaben sind Vorschläge, keine Beschlüsse. Sie werden von der Redaktion geprüft und freigegeben.",
].join(" ");

// Sprint 4.0 – Legal Intelligence System Prompt (versioniert).
// v1.0.0: Ausschließlich Empfehlungen. Keine Rechtsentscheidungen, keine
// verbindlichen Auskünfte. Nur Themen aus dem übergebenen Kontext.
export const SYSTEM_LEGAL_V1 = [
  SYSTEM_BASE,
  "SPEZIALKONTEXT (Legal Intelligence, v1.0.0):",
  "Du bist juristisch geschulter Redaktions-Assistent – KEIN Rechtsanwalt.",
  "Du triffst KEINE Rechtsentscheidungen und gibst KEINE verbindlichen Auskünfte.",
  "Du markierst Themen, Lücken und mögliche Widersprüche redaktionell.",
  "Du erfindest KEINE Rechtsgrundlagen und KEINE IDs. Nutze ausschließlich den mitgegebenen Sections-Katalog, wenn danach gefragt wird.",
  "Formuliere jede Aussage als Vorschlag, nicht als Feststellung.",
].join(" ");
export const LEGAL_PROMPT_VERSION = "1.0.0";

interface TaskConfig {
  system: string;
  arrayField: boolean;
  faqField: boolean;
  minLen?: number;
  instruction: string;
}

export const TASK_CONFIG: Record<AITaskType, TaskConfig> = {
  "improve.title": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: false,
    minLen: 20,
    instruction:
      "Verbessere den Titel des Praxisfalls. Er soll den Sachverhalt und den Handlungsbezug klar benennen (max. 90 Zeichen).",
  },
  "improve.shortDescription": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: false,
    minLen: 200,
    instruction:
      "Erweitere die Kurzbeschreibung des Sachverhalts. Mindestens 200 Zeichen. Konkret, ohne Wertung.",
  },
  "improve.recommendation": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: false,
    minLen: 150,
    instruction:
      "Verbessere die Handlungsempfehlung. Klar, umsetzbar, mit Prioritäten. Mindestens 150 Zeichen.",
  },
  "improve.legalExplanation": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: false,
    minLen: 250,
    instruction:
      "Verbessere die rechtliche Einordnung. Sachlich, ohne neue Rechtsgrundlagen zu erfinden. Mindestens 250 Zeichen.",
  },
  "generate.checklist": {
    system: SYSTEM_BASE,
    arrayField: true,
    faqField: false,
    instruction:
      "Erstelle 5-10 klare, handlungsorientierte Checklisten-Punkte für die Lehrkraft.",
  },
  "generate.faq": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: true,
    instruction:
      "Erstelle 4-8 typische Q&A-Paare (FAQ) zum Praxisfall. Jede Frage muss aus der Sicht der Lehrkraft/Schulleitung gestellt sein.",
  },
  "generate.documentation": {
    system: SYSTEM_BASE,
    arrayField: true,
    faqField: false,
    instruction:
      "Erstelle 3-7 Dokumentationsschritte, die der Fall erfordert.",
  },
  "generate.practiceTips": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: false,
    minLen: 300,
    instruction:
      "Erstelle 5-8 konkrete Do's als Zeilen mit führendem '- '. Jede Empfehlung fallbezogen und umsetzbar.",
  },
  "generate.decisionTree": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: false,
    instruction:
      "Erstelle einen Entscheidungsbaum-Entwurf (JSON: nodes[{id,question,answers[{label,nextId?,result?}]}]) mit 3-7 Fragen.",
  },
  "summarize.changes": {
    system: SYSTEM_BASE,
    arrayField: true,
    faqField: false,
    instruction:
      "Fasse die inhaltlichen Änderungen zwischen zwei Versionen redaktionell zusammen (3-8 Zeilen).",
  },
  "detect.duplicates": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: false,
    instruction:
      "Analysiere die Kandidatenliste und identifiziere echte Duplikate oder überlappende Fälle. Nenne Unterschiede und Überschneidungen.",
  },
  "quality.improve": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: false,
    instruction:
      "Reagiere auf die genannten Qualitätsprobleme mit konkreten Verbesserungsvorschlägen für die betroffenen Felder.",
  },
  "review.readiness": {
    system: SYSTEM_BASE,
    arrayField: false,
    faqField: false,
    instruction:
      "Erstelle einen Review-Readiness-Report mit den Kategorien: positives, risks, improvements, recommendations. Jede Kategorie 2-6 kurze Punkte.",
  },
  "legal.analyzeCompleteness": {
    system: SYSTEM_LEGAL_V1, arrayField: false, faqField: false,
    instruction:
      "Prüfe redaktionell, ob im Praxisfall juristisch relevante Themen fehlen: Handlungsempfehlung, rechtliche Einordnung, Dokumentation, Sofortmaßnahmen, Zuständigkeiten, FAQ, Entscheidungsbaum. Nenne nur Themen, die aus dem Kontext heraus möglicherweise fehlen. Keine automatische Ergänzung.",
  },
  "legal.suggestSources": {
    system: SYSTEM_LEGAL_V1, arrayField: false, faqField: false,
    instruction:
      "Schlage passende Rechtsgrundlagen aus dem mitgelieferten Sections-Katalog vor. Nur Einträge mit vorhandener ID. Für jeden Vorschlag: Kurzbegründung, Relevanz (primary/supporting/context) und Konfidenz (0..1). Keine automatische Verknüpfung, kein Speichern.",
  },
  "legal.checkConsistency": {
    system: SYSTEM_LEGAL_V1, arrayField: false, faqField: false,
    instruction:
      "Prüfe Handlungsempfehlung, rechtliche Einordnung, Dokumentation, FAQ und Checkliste auf inhaltliche Konsistenz. Markiere mögliche Widersprüche, fehlende Zusammenhänge und unklare Aussagen. Keine automatische Änderung.",
  },
  "legal.checkDocumentation": {
    system: SYSTEM_LEGAL_V1, arrayField: false, faqField: false,
    instruction:
      "Prüfe, ob Hinweise zu Dokumentation, Nachweis/Beweissicherung, Informations- und Meldepflicht sowie Zuständigkeit vorhanden sind. Liefere konkrete Verbesserungsvorschläge; keine Rechtsauskunft.",
  },
  "legal.compareCases": {
    system: SYSTEM_LEGAL_V1, arrayField: false, faqField: false,
    instruction:
      "Vergleiche den aktuellen Praxisfall mit den mitgegebenen ähnlichen Fällen. Liefere Gemeinsamkeiten, Unterschiede, mögliche fehlende Inhalte und abweichende Empfehlungen. Kein Embedding-Vergleich, nur inhaltlich.",
  },
  "legal.explainCitation": {
    system: SYSTEM_LEGAL_V1, arrayField: false, faqField: false,
    instruction:
      "Erkläre knapp, warum eine bestimmte Rechtsgrundlage (aus dem Kontext) für den Fall vorgeschlagen wird. Ausdrücklich keine juristische Beratung; kein automatisches Übernehmen.",
  },
  "legal.riskIndicators": {
    system: SYSTEM_LEGAL_V1, arrayField: false, faqField: false,
    instruction:
      "Bewerte ausschließlich redaktionelle Risiken (fehlende Rechtsgrundlage, unklare Handlungsempfehlung, fehlende Dokumentation, uneinheitliche Begrifflichkeit). Keine Bewertung der Rechtslage.",
  },
  "legal.summarize": {
    system: SYSTEM_LEGAL_V1, arrayField: false, faqField: false,
    instruction:
      "Erstelle eine kurze, sachliche redaktionelle Zusammenfassung des juristischen Kerns des Falls (3–6 Sätze). Keine Rechtsauskunft.",
  },
};

export function schemaForTask(task: AITaskType): Record<string, unknown> {
  const cfg = TASK_CONFIG[task];
  if (task === "generate.faq") {
    return {
      type: "object",
      properties: {
        value: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { q: { type: "string" }, a: { type: "string" } },
            required: ["q", "a"],
          },
        },
        reason: { type: "string" },
      },
      required: ["value", "reason"],
    };
  }
  if (task === "detect.duplicates") {
    return {
      type: "object",
      properties: {
        value: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              caseId: { type: "string" },
              title: { type: "string" },
              similarity: { type: "number" },
              differences: { type: "array", items: { type: "string" } },
              overlap: { type: "array", items: { type: "string" } },
            },
            required: ["caseId", "title", "similarity", "differences", "overlap"],
          },
        },
        reason: { type: "string" },
      },
      required: ["value", "reason"],
    };
  }
  if (task === "review.readiness") {
    return {
      type: "object",
      properties: {
        value: {
          type: "object",
          additionalProperties: false,
          properties: {
            positives: { type: "array", items: { type: "string" } },
            risks: { type: "array", items: { type: "string" } },
            improvements: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["positives", "risks", "improvements", "recommendations"],
        },
        reason: { type: "string" },
      },
      required: ["value", "reason"],
    };
  }
  if (task.startsWith("legal.")) {
    // Legal Intelligence: strukturierte, aber tolerante Schemata. 'value' ist
    // ein Objekt/Array je nach Task; die Service-Schicht mappt es.
    return {
      type: "object",
      properties: {
        value: {},
        reason: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["value", "reason"],
    };
  }
  if (task === "generate.decisionTree") {
    return {
      type: "object",
      properties: {
        value: { type: "object" },
        reason: { type: "string" },
      },
      required: ["value", "reason"],
    };
  }
  if (cfg.arrayField) {
    return {
      type: "object",
      properties: {
        value: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
      required: ["value", "reason"],
    };
  }
  return {
    type: "object",
    properties: {
      value: { type: "string" },
      reason: { type: "string" },
    },
    required: ["value", "reason"],
  };
}
