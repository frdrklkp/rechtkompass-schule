/**
 * Sprint 4.6G – Karte einer aufgelösten Rechtsgrundlage.
 * Darstellend; alle fachlichen Angaben stammen aus dem Legal Context.
 */
import { useState } from "react";
import { ExternalLink, FileText, Info } from "lucide-react";
import type { LegalReference } from "@/services/legal-context";
import { LegalFreshnessBadge } from "./LegalFreshnessBadge";
import { LegalOriginalText } from "./LegalOriginalText";
import { LegalReferenceDetails } from "./LegalReferenceDetails";
import {
  RELEVANCE_LABEL,
  RELEVANCE_NONE_LABEL,
  fundstelle,
  sourceDisplayName,
  sourceTypeLabel,
} from "./legalPresentation";

export function LegalReferenceCard({ reference }: { reference: LegalReference }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showText, setShowText] = useState(false);

  const sourceName = reference.source?.name ?? null;
  const relevanceLabel = reference.relevance
    ? RELEVANCE_LABEL[reference.relevance]
    : RELEVANCE_NONE_LABEL;

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Mit diesem Praxisfall verknüpfte Rechtsgrundlage
          </p>
          <h4 className="mt-0.5 text-sm font-semibold text-foreground">
            {reference.reference}
            {reference.title ? ` – ${reference.title}` : ""}
          </h4>
        </div>
        <LegalFreshnessBadge
          status={reference.freshness}
          reason={reference.freshnessReasons[0] ?? null}
        />
      </div>

      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex flex-wrap gap-x-1">
          <dt className="text-muted-foreground">Rechtsquelle:</dt>
          <dd className="font-medium text-foreground">
            {sourceName ?? "Keine Rechtsquelle hinterlegt"}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-1">
          <dt className="text-muted-foreground">Quellenart:</dt>
          <dd className="text-foreground">{sourceTypeLabel(reference.source?.sourceType ?? null)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-1">
          <dt className="text-muted-foreground">Fundstelle:</dt>
          <dd className="text-foreground">{fundstelle(reference)}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-1">
          <dt className="text-muted-foreground">Relevanz:</dt>
          <dd>
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
              {relevanceLabel}
            </span>
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-xs leading-relaxed text-foreground/80">
        <span className="font-medium text-foreground">Begründung der Anzeige: </span>
        {reference.explanation}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {showDetails ? "Details ausblenden" : "Details"}
        </button>
        <button
          type="button"
          onClick={() => setShowText((v) => !v)}
          aria-expanded={showText}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {showText ? "Originaltext ausblenden" : "Originaltext anzeigen"}
        </button>
        {reference.officialUrl && (
          <a
            href={reference.officialUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Offizielle Quelle
          </a>
        )}
      </div>

      {showDetails && <LegalReferenceDetails reference={reference} />}
      {showText && (
        <LegalOriginalText
          text={reference.originalText}
          sourceLabel={sourceDisplayName(reference.source)}
          versionLabel={reference.sectionVersionLabel ?? reference.source?.versionLabel ?? null}
        />
      )}
    </article>
  );
}
