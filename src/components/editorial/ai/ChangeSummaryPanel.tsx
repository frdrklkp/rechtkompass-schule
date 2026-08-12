// Änderungszusammenfassung: erzeugt Kurz-/Ausführlich-/Highlights-Variante
// zwischen der aktuellen (im caseRow steckenden) Version und der letzten
// veröffentlichten oder vorherigen Version.

import { useState } from "react";
import { FileDiff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  buildChangeSummary,
  isAIError,
  useAISession,
  type ChangeSummaryResult,
} from "@/services/editorial/ai";
import type { EditorialCaseRow } from "@/services/editorial/types";

interface Props {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  /** Vorheriger Zustand (z. B. letzte veröffentlichte Version) – falls leer, wird der Auftrag geblockt. */
  previous: Record<string, unknown> | null;
  canEdit: boolean;
}

export function ChangeSummaryPanel({ caseRow, previous, canEdit }: Props) {
  const session = useAISession();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ChangeSummaryResult | null>(null);

  const hasPrev = !!previous;

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1"
        disabled={!canEdit || !hasPrev || busy}
        title={!hasPrev ? "Keine vergleichbare Vorversion vorhanden" : ""}
        onClick={async () => {
          if (!previous) return;
          setBusy(true);
          try {
            const r = await buildChangeSummary(caseRow, previous);
            session.add(r.short);
            session.add(r.detailed);
            session.add(r.highlights);
            setResult(r);
            toast.success("Zusammenfassungen erstellt.");
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
        <FileDiff className="h-3.5 w-3.5" />
        Änderungen zusammenfassen
      </Button>

      {!hasPrev && (
        <p className="text-[11px] text-muted-foreground">
          Keine Vorversion – sobald der Fall einmal veröffentlicht wurde,
          steht ein Vergleich zur Verfügung.
        </p>
      )}
      {busy && <Skeleton className="h-16 w-full" />}
      {result && (
        <div className="rounded-md border border-border bg-card p-2 text-xs">
          <div className="font-semibold">Geänderte Felder</div>
          <div className="text-[11px] text-muted-foreground">
            {result.changedFields.length === 0
              ? "keine strukturellen Änderungen erkannt"
              : result.changedFields.join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}
