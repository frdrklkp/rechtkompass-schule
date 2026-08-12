// Kompaktes "✨ Mit KI verbessern"-Element für ein einzelnes Feld.
// Löst eine Suggestion aus, ohne dass der Editor die Copilot-Tabs öffnen muss.

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AIEditorialService,
  isAIError,
  useAISession,
  type AITaskType,
} from "@/services/editorial/ai";
import type { EditorialCaseRow } from "@/services/editorial/types";
import type { CaseQualityAssessment } from "@/services/editorial/quality/types";

interface Props {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality?: CaseQualityAssessment | null;
  task: AITaskType;
  label?: string;
  canEdit: boolean;
}

export function FieldAIAssistButton({ caseRow, quality, task, label, canEdit }: Props) {
  const session = useAISession();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 text-[11px] text-violet-700 hover:bg-violet-500/10 dark:text-violet-400"
      disabled={!canEdit || busy}
      onClick={async () => {
        setBusy(true);
        try {
          const s = await AIEditorialService.suggest({
            task,
            caseRow,
            quality: quality ?? null,
          });
          session.add(s);
          toast.success("KI-Vorschlag erstellt.");
        } catch (err) {
          toast.error(
            isAIError(err)
              ? err.userMessage
              : err instanceof Error
                ? err.message
                : "KI-Aufruf fehlgeschlagen.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <Sparkles className="h-3 w-3" />
      {label ?? "Mit KI verbessern"}
      {busy && <span className="text-[10px] text-muted-foreground">…</span>}
    </Button>
  );
}
