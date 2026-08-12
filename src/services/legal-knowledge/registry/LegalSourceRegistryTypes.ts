// Sprint 4.1A – Legal Source Registry: Typen, Enums, deutsche Labels.
// Keine Persistenz-Logik. Reine Deklarationen und Konstanten.

export type LegalSourceType =
  | "law"
  | "ordinance"
  | "administrative_regulation"
  | "circular"
  | "court_decision"
  | "eu_regulation"
  | "internal_guideline"
  | "editorial_guideline"
  | "other";

export type LegalSourceLifecycle =
  | "draft"
  | "imported"
  | "needs_review"
  | "verified"
  | "active"
  | "outdated"
  | "archived"
  | "rejected";

export type LegalSourceVerification =
  | "unverified"
  | "technical_validated"
  | "editorial_reviewed"
  | "authority_verified";

export const LEGAL_SOURCE_TYPE_LABELS: Record<LegalSourceType, string> = {
  law: "Gesetz",
  ordinance: "Rechtsverordnung",
  administrative_regulation: "Verwaltungsvorschrift",
  circular: "Runderlass",
  court_decision: "Gerichtsentscheidung",
  eu_regulation: "EU-Rechtsakt",
  internal_guideline: "Interne Richtlinie",
  editorial_guideline: "Redaktionelle Handreichung",
  other: "Sonstige",
};

export const LEGAL_SOURCE_LIFECYCLE_LABELS: Record<LegalSourceLifecycle, string> = {
  draft: "Entwurf",
  imported: "Importiert",
  needs_review: "Prüfung erforderlich",
  verified: "Fachlich geprüft",
  active: "Aktiv",
  outdated: "Veraltet",
  archived: "Archiviert",
  rejected: "Abgelehnt",
};

export const LEGAL_SOURCE_VERIFICATION_LABELS: Record<LegalSourceVerification, string> = {
  unverified: "Nicht geprüft",
  technical_validated: "Technisch validiert",
  editorial_reviewed: "Redaktionell geprüft",
  authority_verified: "Amtlich bestätigt",
};

// Erlaubte Statusübergänge (Whitelist). Alles andere → InvalidSourceStatusTransitionError.
export const LEGAL_LIFECYCLE_TRANSITIONS: Record<LegalSourceLifecycle, LegalSourceLifecycle[]> = {
  draft: ["imported", "needs_review", "archived", "rejected"],
  imported: ["needs_review", "verified", "archived", "rejected"],
  needs_review: ["verified", "rejected", "archived"],
  verified: ["active", "outdated", "archived"],
  active: ["outdated", "archived"],
  outdated: ["archived", "active"],
  archived: ["draft"],
  rejected: ["draft", "archived"],
};

export interface LegalSourceDomain {
  id: string;
  title: string;
  shortName: string | null;
  description: string | null;
  scope: string | null;
  legalArea: string | null;
  jurisdiction: string | null;
  authority: string | null;
  officialUrl: string | null;
  federalState: string | null;
  schoolType: string | null;
  educationalArea: string | null;
  legalDomain: string | null;
  versionLabel: string | null;
  publishedAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  lastReviewedAt: string | null;
  lastVerifiedAt: string | null;
  supersedesSourceId: string | null;
  replacedBySourceId: string | null;
  officialSource: boolean;
  authorityVerified: boolean;
  editorialVerified: boolean;
  verificationStatus: LegalSourceVerification;
  lifecycleStatus: LegalSourceLifecycle;
  sourceType: LegalSourceType;
  sourceFormat: string | null;
  sourceLanguage: string;
  checksum: string | null;
  lastIngestedAt: string | null;
  originalContent: string | null;
  normalizedContent: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface LegalSourceListFilter {
  search?: string;
  lifecycle?: LegalSourceLifecycle | "all";
  verification?: LegalSourceVerification | "all";
  type?: LegalSourceType | "all";
  jurisdiction?: string | "all";
  onlyOfficial?: boolean;
}

export interface LegalSourceReviewEvent {
  id: string;
  sourceId: string;
  fromStatus: LegalSourceLifecycle | null;
  toStatus: LegalSourceLifecycle;
  actorId: string | null;
  note: string | null;
  createdAt: string;
}
