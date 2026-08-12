// Duplikatassistent – ruft detectDuplicates ohne Kandidatenliste auf.
// Der Server-Prompt darf sich nur auf den übergebenen Kontext stützen
// (siehe PromptTemplates), es werden KEINE fremden Fall-IDs gesendet.
// Editor sieht Ähnlichkeit, Unterschiede und Empfehlung.

import { useState } from "react";
import { Copy, GitMerge, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AIEditorialService,
  isAIError,
  useAISession,
  type AISuggestion,
  type DuplicateCandidate,
} from "@/services/editorial/ai";
import type { EditorialCaseRow } from "@/services/editorial/types";

interface Props {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  candidates?: Array<{
    id: string;
    title: string;
    short_description?: string | null;
    category?: string | null;
  }>;
  canEdit: boolean;
}

function recommendation(sim: number): { label: string; Icon: typeof Copy; tone: string } {
  if (sim >= 0.85) return { label: "Zusammenführen", Icon: GitMerge, tone: "text-red-700" };
  if (sim >= 0.6) return { label: "Verlinken", Icon: Link2, tone: "text-amber-700" };
  return { label: "Neu behalten", Icon: Plus, tone: "text-emerald-700" };
}

export function DuplicateAssistant({ caseRow, candidates, canEdit }: Props) {
  const session = useAISession();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AISuggestion<DuplicateCandidate[]> | null>(null);

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1"
        disabled={!canEdit || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const s = await AIEditorialService.detectDuplicates(
              caseRow,
              candidates ?? [],
            );
            session.add(s);
            setResult(s);
            toast.success("Ähnlichkeitsanalyse fertig.");
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
        <Copy className="h-3.5 w-3.5" />
        Ähnliche Praxisfälle prüfen
        {busy && <span className="text-[10px] text-muted-foreground">…</span>}
      </Button>

      {result && (
        <div className="space-y-1.5">
          {(result.suggestedContent ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Keine belastbaren Duplikate erkannt.
            </p>
          )}
          {(result.suggestedContent ?? []).map((c, i) => {
            const rec = recommendation(c.similarity);
            return (
              <div
                key={`${c.caseId}-${i}`}
                className="rounded-md border border-border bg-card p-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Ähnlichkeit: {(c.similarity * 100).toFixed(0)}%
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${rec.tone}`}
                  >
                    <rec.Icon className="h-3 w-3" />
                    {rec.label}
                  </span>
                </div>
                {c.overlap?.length > 0 && (
                  <div className="mt-1.5">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Überschneidungen
                    </div>
                    <ul className="ml-3 list-disc text-[11px]">
                      {c.overlap.slice(0, 5).map((o, idx) => (
                        <li key={idx}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.differences?.length > 0 && (
                  <div className="mt-1.5">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Unterschiede
                    </div>
                    <ul className="ml-3 list-disc text-[11px]">
                      {c.differences.slice(0, 5).map((o, idx) => (
                        <li key={idx}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
