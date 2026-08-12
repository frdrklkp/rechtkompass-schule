// Erkennt fehlende oder auffällig dünne Inhaltsfelder eines Praxisfalls
// deterministisch (ohne KI). Dient der Vollständigkeits-Assistenz: die KI
// bekommt anschließend nur die tatsächlich fehlenden Felder als Aufgaben.

import type { EditorialCaseRow } from "../types";
import type { AITaskType } from "./types";

type Row = EditorialCaseRow & Record<string, unknown>;

export interface CompletenessGap {
  field: string;
  label: string;
  reason: string;
  suggestedTask: AITaskType;
}

function len(v: unknown): number {
  if (typeof v === "string") return v.trim().length;
  if (Array.isArray(v)) return v.length;
  return 0;
}

export function detectCompletenessGaps(row: Row): CompletenessGap[] {
  const gaps: CompletenessGap[] = [];

  const push = (
    field: string,
    label: string,
    reason: string,
    suggestedTask: AITaskType,
  ) => gaps.push({ field, label, reason, suggestedTask });

  if (len(row.faq) === 0)
    push("faq", "FAQ", "Keine Q&A-Paare hinterlegt.", "generate.faq");
  if (len(row.checklist) < 3)
    push(
      "checklist",
      "Checkliste",
      "Weniger als 3 Punkte – Handlungsschritte fehlen.",
      "generate.checklist",
    );
  if (len(row.documentation) === 0)
    push(
      "documentation",
      "Dokumentation",
      "Keine Dokumentationsschritte.",
      "generate.documentation",
    );
  if (len(row.practice_tip) < 40)
    push(
      "practice_tip",
      "Praxistipp",
      "Praxistipp fehlt oder zu knapp.",
      "generate.practiceTips",
    );
  if (len(row.recommendation) < 120)
    push(
      "recommendation",
      "Handlungsempfehlung",
      "Empfehlung wirkt unvollständig.",
      "improve.recommendation",
    );
  if (len(row.legal_explanation) < 180)
    push(
      "legal_explanation",
      "Rechtliche Einordnung",
      "Rechtliche Einordnung dünn.",
      "improve.legalExplanation",
    );
  if (len(row.short_description) < 160)
    push(
      "short_description",
      "Kurzbeschreibung",
      "Sachverhalt zu kurz beschrieben.",
      "improve.shortDescription",
    );
  if (len(row.immediate_actions) < 40)
    push(
      "immediate_actions",
      "Sofortmaßnahmen",
      "Keine oder zu wenige Sofortmaßnahmen.",
      "improve.recommendation", // wird als Empfehlungserweiterung mitgezogen
    );
  if (len(row.responsibilities) < 40)
    push(
      "responsibilities",
      "Zuständigkeiten",
      "Zuständigkeiten fehlen.",
      "improve.recommendation",
    );

  return gaps;
}
