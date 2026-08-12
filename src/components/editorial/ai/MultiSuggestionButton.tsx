// Multi-Suggestion-Picker: fordert N Varianten für dieselbe Aufgabe an
// und schreibt sie als eigenständige SuggestionCards in die Session.

import { useState } from "react";
import { Layers, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  isAIError,
  requestVariants,
  useAISession,
  type AITaskType,
} from "@/services/editorial/ai";
import type { EditorialCaseRow } from "@/services/editorial/types";
import type { CaseQualityAssessment } from "@/services/editorial/quality/types";

interface Props {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality: CaseQualityAssessment | null;
  task: AITaskType;
  label: string;
  canEdit: boolean;
}

export function MultiSuggestionButton({ caseRow, quality, task, label, canEdit }: Props) {
  const session = useAISession();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1"
      disabled={!canEdit || busy}
      onClick={async () => {
        setBusy(true);
        try {
          const variants = await requestVariants({
            task,
            caseRow,
            quality: quality ?? null,
            count: 3,
          });
          for (const v of variants) session.add(v);
          toast.success(`${variants.length} Varianten erstellt.`);
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
      <Layers className="h-3.5 w-3.5" />
      <Sparkles className="h-3 w-3" />
      {label}
      {busy && <span className="text-[10px] text-muted-foreground">…</span>}
    </Button>
  );
}
