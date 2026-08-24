/**
 * Sprint 4.6H – Phase „Dokumentation“ des Decision Navigators.
 * Container: Die Fachlogik liegt vollständig in useDocumentation und den
 * Services des Dokumentationsassistenten; diese Komponente wählt nur die
 * Darstellung.
 */
import { LoadingState } from "@/components/DataStates";
import { useDocumentation } from "@/hooks/documentation/useDocumentation";
import { DocumentationView } from "./DocumentationView";

export interface DocumentationStepPanelProps {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
  canGoBack: boolean;
  onBack: () => void;
}

export function DocumentationStepPanel({
  navigatorId,
  workflowId,
  context,
  onPatchContext,
}: DocumentationStepPanelProps) {
  const docs = useDocumentation({ navigatorId, workflowId, context, onPatchContext });

  /* Blockiert: ohne erfassten Sachverhalt werden keine Dokumente erzeugt. */
  if (!docs.hasSituation) {
    return (
      <section
        className="rounded-2xl border border-border bg-card p-5"
        aria-label="Dokumentation – Sachverhalt fehlt"
      >
        <h3 className="text-base font-semibold text-foreground">Dokumentation</h3>
        <p className="mt-2 text-sm text-foreground/85">
          Für diese Bearbeitung wurde noch kein Sachverhalt erfasst.
        </p>
        <p className="mt-1 text-sm text-foreground/85">
          Dokumente werden ausschließlich aus den erfassten Angaben erzeugt. Bitte erfassen Sie
          den Sachverhalt zuerst in der Phase „Situation“.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Es werden keine Tatsachen ergänzt oder angenommen.
        </p>
      </section>
    );
  }

  if (!docs.entry) {
    if (docs.error) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground"
        >
          <p>{docs.error}</p>
          <button
            type="button"
            onClick={() => void docs.refresh()}
            className="mt-3 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Erneut versuchen
          </button>
        </div>
      );
    }
    return <LoadingState label="Dokumentvorlagen werden vorbereitet …" />;
  }

  return (
    <div className="space-y-4">
      {docs.error && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground"
        >
          {docs.error}
        </p>
      )}
      <DocumentationView
        entry={docs.entry}
        overall={docs.overall}
        readinessByTemplate={docs.readinessByTemplate}
        isStale={docs.isStale}
        staleDraftIds={docs.staleDraftIds}
        preparing={docs.preparing}
        onRefresh={() => void docs.refresh()}
        onGenerate={docs.generate}
        onUpdateDraft={docs.updateDraft}
        onRemoveDraft={docs.removeDraft}
        onExport={(draftId, format) => void docs.exportDraft(draftId, format)}
      />
    </div>
  );
}
