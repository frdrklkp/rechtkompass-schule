// Änderungszusammenfassung: erzeugt zwei Varianten (kurz + ausführlich)
// plus redaktionelle Highlights auf Basis eines Diffs zwischen previous
// und current. Nutzt intern `summarize.changes`.

import type { EditorialCaseRow } from "../types";
import { AIEditorialService } from "./AIEditorialService";
import type { AISuggestion } from "./types";

type Row = EditorialCaseRow & Record<string, unknown>;

const TRACKED_FIELDS = [
  "title",
  "short_description",
  "recommendation",
  "legal_explanation",
  "practice_tip",
  "immediate_actions",
  "responsibilities",
  "checklist",
  "documentation",
  "faq",
  "common_mistakes",
] as const;

function diff(previous: Record<string, unknown>, current: Record<string, unknown>) {
  const changed: Record<string, { before: unknown; after: unknown }> = {};
  for (const f of TRACKED_FIELDS) {
    const a = previous[f];
    const b = current[f];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changed[f] = { before: a ?? null, after: b ?? null };
    }
  }
  return changed;
}

export interface ChangeSummaryResult {
  short: AISuggestion<string[]>;
  detailed: AISuggestion<string[]>;
  highlights: AISuggestion<string[]>;
  changedFields: string[];
}

export async function buildChangeSummary(
  current: Row,
  previous: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ChangeSummaryResult> {
  const changed = diff(previous, current);
  const changedFields = Object.keys(changed);

  const runVariant = async (hint: string) => {
    return AIEditorialService.suggest<string[]>({
      task: "summarize.changes",
      caseRow: current,
      hint,
      extra: { previous, current, changedFields, diff: changed },
      signal,
    });
  };

  const short = await runVariant(
    "Nur eine knappe Version (2-3 Zeilen). Nenne die inhaltlichen Änderungen sachlich.",
  );
  const detailed = await runVariant(
    "Ausführliche Version (5-8 Zeilen). Erkläre pro geändertem Feld die inhaltliche Auswirkung.",
  );
  const highlights = await runVariant(
    "Nur redaktionelle Highlights (3-5 Zeilen), jeweils mit 'Wichtig:' prefix.",
  );

  return { short, detailed, highlights, changedFields };
}
