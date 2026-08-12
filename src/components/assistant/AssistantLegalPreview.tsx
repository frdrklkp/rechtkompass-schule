/**
 * Sprint 4.6G – Kompakte Rechtsgrundlagen-Vorschau im Assistenten.
 * Zeigt ausschließlich aufgelöste Angaben des Legal Context (Anzahl und
 * bis zu drei Quellen). Die ausführliche Ansicht bleibt im Navigator.
 * Ohne bestätigten Praxisfall wird keine Vorschau dargestellt.
 */
import { ArrowRight, Scale } from "lucide-react";
import type { LegalFreshnessStatus } from "@/services/legal-context";
import { LegalFreshnessBadge } from "@/components/navigator/legal/LegalFreshnessBadge";

export interface AssistantLegalPreviewItem {
  id: string;
  /** Anzeigename der Quelle, z. B. „SchulG NRW“. */
  sourceLabel: string;
  /** Fundstelle, z. B. „§ 53“. */
  reference: string;
  freshness: LegalFreshnessStatus;
}

export interface AssistantLegalPreviewData {
  referenceCount: number;
  topReferences: AssistantLegalPreviewItem[];
}

export interface AssistantLegalPreviewProps {
  preview: AssistantLegalPreviewData;
  onOpenNavigator: () => void;
}

export function AssistantLegalPreview({ preview, onOpenNavigator }: AssistantLegalPreviewProps) {
  const countLabel =
    preview.referenceCount === 1
      ? "Zu diesem Praxisfall ist 1 Rechtsgrundlage hinterlegt."
      : `Zu diesem Praxisfall sind ${preview.referenceCount} Rechtsgrundlagen hinterlegt.`;

  return (
    <div
      className="rounded-xl border border-border bg-card p-3"
      aria-label="Rechtsgrundlagen-Vorschau"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Scale className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        {countLabel}
      </p>
      {preview.topReferences.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {preview.topReferences.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-medium text-foreground">{item.sourceLabel}</span>
              <span className="text-muted-foreground">{item.reference}</span>
              <LegalFreshnessBadge status={item.freshness} />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onOpenNavigator}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        Im Navigator ansehen <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
