// Vollständigkeitsassistent – deterministisch (kein KI-Call bis auf Klick).
// Zeigt fehlende/dünne Felder mit "Erzeugen"-Buttons.

import { useState } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AIEditorialService,
  detectCompletenessGaps,
  isAIError,
  useAISession,
} from "@/services/editorial/ai";
import type { EditorialCaseRow } from "@/services/editorial/types";
import type { CaseQualityAssessment } from "@/services/editorial/quality/types";

interface Props {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality: CaseQualityAssessment | null;
  canEdit: boolean;
}

export function CompletenessAssistant({ caseRow, quality, canEdit }: Props) {
  const session = useAISession();
  const [runningField, setRunningField] = useState<string | null>(null);
  const gaps = detectCompletenessGaps(caseRow);

  if (gaps.length === 0) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300">
        Alle Kern-Felder sind gefüllt.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {gaps.map((g) => (
        <div
          key={g.field}
          className="flex items-start justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-xs"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1 font-medium">
              <AlertCircle className="h-3 w-3 text-amber-600" />
              {g.label}
            </div>
            <div className="text-[10px] text-muted-foreground">{g.reason}</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 text-[11px]"
            disabled={!canEdit || runningField !== null}
            onClick={async () => {
              setRunningField(g.field);
              try {
                const s = await AIEditorialService.suggest({
                  task: g.suggestedTask,
                  caseRow,
                  quality: quality ?? null,
                  hint: `Fehlendes/kurzes Feld „${g.label}“ ausfüllen bzw. ergänzen.`,
                });
                session.add(s);
                toast.success("Vorschlag erstellt.");
              } catch (err) {
                toast.error(
                  isAIError(err)
                    ? err.userMessage
                    : err instanceof Error
                      ? err.message
                      : "KI-Aufruf fehlgeschlagen.",
                );
              } finally {
                setRunningField(null);
              }
            }}
          >
            <Sparkles className="h-3 w-3" />
            Erzeugen
            {runningField === g.field && (
              <span className="text-[10px] text-muted-foreground">…</span>
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
