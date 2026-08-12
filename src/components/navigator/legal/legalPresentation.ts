/**
 * Sprint 4.6G – Darstellungstexte des Legal Context.
 * Reine Beschriftungslogik (Labels, Fundstelle, Datumsformat); keine Fachlogik.
 */
import type {
  LegalFreshnessStatus,
  LegalLinkRelevance,
  LegalReference,
  LegalSourceInfo,
} from "@/services/legal-context";

/** Verständliche Texte der vorhandenen Freshness-Zustände. */
export const FRESHNESS_LABEL: Record<LegalFreshnessStatus, string> = {
  current: "Aktuelle Fassung",
  aging: "Ältere geprüfte Fassung",
  outdated: "Prüfung empfohlen",
  unknown: "Aktualität unbekannt",
};

export const RELEVANCE_LABEL: Record<LegalLinkRelevance, string> = {
  high: "Zentrale Rechtsgrundlage",
  medium: "Ergänzende Rechtsgrundlage",
  low: "Weiterführender Hinweis",
};

export const RELEVANCE_NONE_LABEL = "Ohne redaktionelle Einstufung";

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  law: "Gesetz",
  ordinance: "Verordnung",
  administrative_regulation: "Verwaltungsvorschrift",
  circular: "Erlass",
  eu_regulation: "EU-Verordnung",
  court_decision: "Gerichtsentscheidung",
  internal_guideline: "Dienstanweisung",
  editorial_guideline: "Redaktioneller Leitfaden",
  other: "Rechtsquelle",
};

export function sourceTypeLabel(sourceType: string | null): string {
  if (!sourceType) return "Quellenart nicht hinterlegt";
  return SOURCE_TYPE_LABEL[sourceType] ?? sourceType;
}

/** Anzeigename der Quelle (Kurzname bevorzugt). */
export function sourceDisplayName(source: LegalSourceInfo | null): string | null {
  if (!source) return null;
  return source.shortName ?? (source.name || null);
}

/** Fundstelle, z. B. „SchulG NRW, § 53“. */
export function fundstelle(reference: LegalReference): string {
  const source = sourceDisplayName(reference.source);
  return source ? `${source}, ${reference.reference}` : reference.reference;
}

/** Datum in deutscher Formatierung; null bei fehlender/ungültiger Angabe. */
export function formatDateDe(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString("de-DE");
}
