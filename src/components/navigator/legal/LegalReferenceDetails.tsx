/**
 * Sprint 4.6G – Detailansicht einer Rechtsgrundlage.
 * Einzige Stelle, an der technische IDs und Versionsangaben sichtbar sind.
 */
import type { LegalReference } from "@/services/legal-context";
import { formatDateDe } from "./legalPresentation";

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function LegalReferenceDetails({ reference }: { reference: LegalReference }) {
  const validityFrom = formatDateDe(reference.sectionValidFrom ?? reference.source?.validFrom);
  const validityTo = formatDateDe(reference.sectionValidTo ?? reference.source?.validTo);
  const validity = validityFrom || validityTo
    ? `${validityFrom ?? "unbekannt"} bis ${validityTo ?? "unbegrenzt"}`
    : null;
  const lastReview =
    formatDateDe(reference.sectionLastReviewedAt) ??
    formatDateDe(reference.source?.lastReviewedAt) ??
    formatDateDe(reference.source?.lastVerifiedAt);

  return (
    <div
      className="mt-3 rounded-lg border border-border bg-muted/30 p-3"
      aria-label={`Technische Details zu ${reference.reference}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Technische Angaben
      </p>
      <dl className="mt-2 space-y-1.5 text-xs">
        <Row label="Fassung" value={reference.sectionVersionLabel ?? reference.source?.versionLabel ?? null} />
        <Row label="Gültigkeitszeitraum" value={validity} />
        <Row label="Letzte fachliche Prüfung" value={lastReview} />
        <Row label="Abschnittsstatus" value={reference.sectionStatus} />
        <Row
          label="Quellenstand"
          value={formatDateDe(reference.source?.updatedAt ?? reference.sectionUpdatedAt)}
        />
        <Row label="Verknüpfung seit" value={formatDateDe(reference.linkCreatedAt)} />
        <Row label="Abschnitts-ID" value={reference.sectionId} />
        <Row label="Verknüpfungs-ID" value={reference.linkId} />
        <Row label="Quellen-ID" value={reference.source?.id ?? null} />
      </dl>
    </div>
  );
}
