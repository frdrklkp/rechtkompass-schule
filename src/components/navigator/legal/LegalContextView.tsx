/**
 * Sprint 4.6G – Reine Darstellung des aufgelösten Rechtskontexts.
 * Gruppiert nach redaktioneller Relevanz; enthält keine Fachlogik.
 */
import type { LegalContextResult } from "@/services/legal-context";
import { LegalContextHeader } from "./LegalContextHeader";
import { LegalIssues } from "./LegalIssues";
import { LegalLimitations } from "./LegalLimitations";
import { LegalReferenceGroup } from "./LegalReferenceGroup";
import { LegalStaleNotice } from "./LegalStaleNotice";

export interface LegalContextViewProps {
  result: LegalContextResult;
  isStale: boolean;
  onRefresh: () => void;
  onDismissStale: () => void;
}

export function LegalContextView({
  result,
  isStale,
  onRefresh,
  onDismissStale,
}: LegalContextViewProps) {
  const central = result.references.filter((r) => r.relevance === "high");
  const supporting = result.references.filter((r) => r.relevance === "medium");
  const contextual = result.references.filter(
    (r) => r.relevance !== "high" && r.relevance !== "medium",
  );

  return (
    <div className="space-y-4">
      <LegalContextHeader result={result} />

      {isStale && <LegalStaleNotice onRefresh={onRefresh} onDismiss={onDismissStale} />}

      <LegalIssues issues={result.issues} />

      {result.references.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-sm text-foreground/85">
          Für diesen Praxisfall sind aktuell keine Rechtsgrundlagen verknüpft.
        </p>
      ) : (
        <>
          <LegalReferenceGroup
            title="Zentrale Rechtsgrundlagen"
            description="Von der Redaktion als tragend für diesen Praxisfall eingestuft."
            references={central}
          />
          <LegalReferenceGroup
            title="Ergänzende Rechtsgrundlagen"
            description="Ergänzen die zentralen Grundlagen um weitere Regelungen."
            references={supporting}
          />
          <LegalReferenceGroup
            title="Kontextquellen und weiterführende Hinweise"
            description="Weiterführende Quellen ohne zentrale Einstufung."
            references={contextual}
          />
        </>
      )}

      <LegalLimitations />
    </div>
  );
}
