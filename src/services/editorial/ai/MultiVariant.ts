// Multi-Variant-Wrapper: mehrere Varianten für dieselbe Aufgabe erzeugen.
// Läuft sequentiell (per AIRequestQueue in AIEditorialService), damit die
// Session-Historie konsistent bleibt und keine parallelen Requests entstehen.

import type { CaseQualityAssessment } from "../quality/types";
import { AIEditorialService } from "./AIEditorialService";
import type { EditorialCaseRow } from "../types";
import type { AISuggestion, AITaskType } from "./types";

export interface MultiVariantOptions {
  task: AITaskType;
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality?: CaseQualityAssessment | null;
  count?: number; // 2..4
  signal?: AbortSignal;
}

const VARIANT_HINTS = [
  "Variante A – sachlich und knapp.",
  "Variante B – ausführlich mit klarer Handlungslogik.",
  "Variante C – lehrkraftorientiert mit Beispielsprache.",
  "Variante D – schulleitungsorientiert, formaler Ton.",
];

/**
 * Fordert N Varianten desselben Vorschlags an. Jede Variante bekommt einen
 * abweichenden `hint`, der Tonalität/Länge lenkt. Keine parallelen Aufrufe.
 */
export async function requestVariants(
  opts: MultiVariantOptions,
): Promise<AISuggestion[]> {
  const n = Math.max(2, Math.min(4, opts.count ?? 3));
  const results: AISuggestion[] = [];
  for (let i = 0; i < n; i++) {
    const s = await AIEditorialService.suggest({
      task: opts.task,
      caseRow: opts.caseRow,
      quality: opts.quality ?? null,
      hint: VARIANT_HINTS[i] ?? `Variante ${i + 1}`,
      signal: opts.signal,
    });
    results.push({ ...s, title: `${s.title} – Variante ${String.fromCharCode(65 + i)}` });
  }
  return results;
}
