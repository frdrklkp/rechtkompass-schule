// AISuggestionCard – vergleicht Original und Vorschlag, ermöglicht
// Übernahme (setzt genau EIN Feld) oder Ablehnung. Kein Workflow-Change.

import { useEffect, useState } from "react";
import { Check, X, AlertTriangle, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  FeedbackStore,
  updateEditorialCaseField,
  useAISession,
  type AISuggestion,
  type AIEditorialField,
  type FeedbackVote,
} from "@/services/editorial/ai";
import { editorialQueryKeys } from "@/services/editorial";

interface Props {
  caseId: string;
  suggestion: AISuggestion;
  canEdit: boolean;
  isDraft: boolean;
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === "string") return `• ${x}`;
        if (x && typeof x === "object" && "q" in x && "a" in x) {
          const item = x as { q: string; a: string };
          return `Q: ${item.q}\nA: ${item.a}`;
        }
        return JSON.stringify(x);
      })
      .join("\n");
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function AISuggestionCard({ caseId, suggestion, canEdit, isDraft }: Props) {
  const session = useAISession();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [vote, setVote] = useState<FeedbackVote | null>(
    () => FeedbackStore.get(suggestion.id)?.vote ?? null,
  );
  useEffect(() => {
    setVote(FeedbackStore.get(suggestion.id)?.vote ?? null);
  }, [suggestion.id]);

  function castVote(v: FeedbackVote) {
    FeedbackStore.set(suggestion.id, v);
    setVote(v);
  }

  const canApply =
    canEdit &&
    isDraft &&
    suggestion.affectedField !== null &&
    suggestion.status === "pending";

  async function accept() {
    if (!suggestion.affectedField) return;
    setBusy(true);
    try {
      await updateEditorialCaseField({
        caseId,
        field: suggestion.affectedField as AIEditorialField,
        value: suggestion.suggestedContent,
      });
      session.setStatus(suggestion.id, "accepted");
      await qc.invalidateQueries({ queryKey: editorialQueryKeys.case(caseId) });
      await qc.invalidateQueries({
        queryKey: editorialQueryKeys.quality.case(caseId),
      });
      toast.success("Vorschlag übernommen.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Übernahme fehlgeschlagen.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    session.setStatus(suggestion.id, "rejected");
  }

  const badgeClass =
    suggestion.status === "accepted"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : suggestion.status === "rejected"
      ? "bg-muted text-muted-foreground"
      : "bg-violet-500/10 text-violet-700 dark:text-violet-400";
  const badgeLabel =
    suggestion.status === "accepted"
      ? "übernommen"
      : suggestion.status === "rejected"
      ? "abgelehnt"
      : "Vorschlag";

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
            >
              {badgeLabel}
            </span>
            <span className="text-xs text-muted-foreground">
              {suggestion.affectedField ?? "kein Feld"} · Konfidenz{" "}
              {suggestion.confidence}
            </span>
          </div>
          <h4 className="mt-1 font-medium">{suggestion.title}</h4>
          {suggestion.reason && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {suggestion.reason}
            </p>
          )}
        </div>
      </div>

      {suggestion.affectedField && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="rounded-md border border-border bg-background p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Original
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">
              {formatValue(suggestion.originalContent)}
            </pre>
          </div>
          <div className="rounded-md border border-violet-500/40 bg-violet-500/5 p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
              Vorschlag
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">
              {formatValue(suggestion.suggestedContent)}
            </pre>
          </div>
        </div>
      )}

      {!suggestion.affectedField && (
        <div className="mt-2 rounded-md border border-border bg-background p-2">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs">
            {formatValue(suggestion.suggestedContent)}
          </pre>
        </div>
      )}

      {suggestion.status === "pending" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {suggestion.affectedField ? (
            <>
              <Button
                size="sm"
                className="h-8 gap-1"
                onClick={accept}
                disabled={!canApply || busy}
                title={
                  !canEdit
                    ? "Keine Bearbeitungsrechte"
                    : !isDraft
                    ? "Nur im Entwurfstatus übernehmbar"
                    : ""
                }
              >
                <Check className="h-3.5 w-3.5" />
                Übernehmen
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1"
                onClick={reject}
                disabled={busy}
              >
                <X className="h-3.5 w-3.5" />
                Verwerfen
              </Button>
              {!isDraft && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> Übernahme nur im Entwurf
                </span>
              )}
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={reject}
            >
              <X className="h-3.5 w-3.5" />
              Schließen
            </Button>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-1 border-t border-border/50 pt-2">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Bewertung
        </span>
        <Button
          size="icon"
          variant="ghost"
          className={`h-6 w-6 ${vote === "up" ? "text-emerald-600" : "text-muted-foreground"}`}
          onClick={() => castVote("up")}
          title="Vorschlag war hilfreich"
        >
          <ThumbsUp className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={`h-6 w-6 ${vote === "down" ? "text-red-600" : "text-muted-foreground"}`}
          onClick={() => castVote("down")}
          title="Vorschlag war nicht hilfreich"
        >
          <ThumbsDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
