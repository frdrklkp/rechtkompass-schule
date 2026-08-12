/**
 * Sprint 4.6H – Veraltungserkennung für die Dokumentationsphase.
 *
 * Ein Stand gilt als veraltet, wenn sich Situation, Bewertung, Maßnahmenplan,
 * Rechtskontext, Praxisfall oder Vorlagen seit der Vorbereitung geändert
 * haben. Grundlage ist ein djb2-Hash über die fachlich relevante Eingabe
 * (gleiches Verfahren wie Assessment Engine und Legal Context).
 */
import {
  computeInputHash as computeSituationHash,
  djb2,
  stableStringify,
} from "@/services/assessment-engine";
import type { ActionPlan } from "@/services/action-engine";
import type { AssessmentResult } from "@/services/assessment-engine";
import type { LegalContextResult } from "@/services/legal-context";
import type { SituationCase } from "@/services/situation-analyzer";
import type { DocumentationPracticeCaseRef } from "./DocumentationContextBuilder";
import type { DocumentationContextEntry, DocumentationDraft } from "./types";

export interface DocumentationHashParts {
  situation: SituationCase | null;
  assessment: AssessmentResult | null;
  actionPlan: ActionPlan | null;
  legalContext: LegalContextResult | null;
  practiceCase: DocumentationPracticeCaseRef | null;
  templates: Array<{ id: string; markdownBody: string }>;
}

/** Stabiler Hash über alle fachlich relevanten Eingaben. */
export function computeDocumentationInputHash(parts: DocumentationHashParts): string {
  const projection = {
    situation: parts.situation
      ? {
          h: computeSituationHash(parts.situation),
          updatedAt: parts.situation.updatedAt,
          status: parts.situation.status,
        }
      : null,
    assessment: parts.assessment
      ? {
          h: parts.assessment.inputHash,
          evaluated: parts.assessment.evaluatedInputHash,
          updatedAt: parts.assessment.updatedAt,
          trafficLight: parts.assessment.trafficLight,
        }
      : null,
    actionPlan: parts.actionPlan
      ? {
          updatedAt: parts.actionPlan.updatedAt,
          items: parts.actionPlan.actions
            .map((a) => `${a.actionKey}:${a.status}:${a.signature}`)
            .sort(),
          completion: parts.actionPlan.progress.completionPercentage,
        }
      : null,
    legalContext: parts.legalContext ? parts.legalContext.inputHash : null,
    practiceCase: parts.practiceCase
      ? { id: parts.practiceCase.id, version: parts.practiceCase.version }
      : null,
    templates: parts.templates
      .map((t) => ({ id: t.id, body: djb2(t.markdownBody) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return djb2(stableStringify(projection));
}

/** true, wenn der vorbereitete Stand nicht mehr zur aktuellen Eingabe passt. */
export function isDocumentationStale(
  entry: DocumentationContextEntry,
  currentInputHash: string,
): boolean {
  return entry.inputHash !== currentInputHash;
}

/** Entwürfe, deren Eingabe sich seit der Erzeugung geändert hat. */
export function staleDrafts(
  entry: DocumentationContextEntry,
  currentInputHash: string,
): DocumentationDraft[] {
  return entry.drafts.filter((d) => d.inputHash !== currentInputHash);
}
