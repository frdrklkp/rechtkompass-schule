// DB-Row <-> Domain-Mapper. Toleriert Bestandsdatensätze ohne neue Spalten
// (Migration liegt bei; falls sie noch nicht ausgeführt wurde, fallen die
// neuen Felder auf sinnvolle Defaults zurück).

import type {
  LegalSourceDomain,
  LegalSourceLifecycle,
  LegalSourceType,
  LegalSourceVerification,
  LegalSourceReviewEvent,
} from "./LegalSourceRegistryTypes";

type Row = Record<string, unknown>;

function s(r: Row, k: string): string | null {
  const v = r[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}
function b(r: Row, k: string, fb = false): boolean {
  const v = r[k];
  return typeof v === "boolean" ? v : fb;
}

const TYPE_SET = new Set([
  "law","ordinance","administrative_regulation","circular","court_decision",
  "eu_regulation","internal_guideline","editorial_guideline","other",
]);
const LC_SET = new Set([
  "draft","imported","needs_review","verified","active","outdated","archived","rejected",
]);
const VER_SET = new Set([
  "unverified","technical_validated","editorial_reviewed","authority_verified",
]);

function pickType(r: Row): LegalSourceType {
  const v2 = s(r, "source_type_v2");
  if (v2 && TYPE_SET.has(v2)) return v2 as LegalSourceType;
  const legacy = s(r, "source_type");
  if (legacy && TYPE_SET.has(legacy)) return legacy as LegalSourceType;
  return "other";
}

export function toDomain(row: Row): LegalSourceDomain {
  return {
    id: String(row.id),
    title: String(row.title ?? row.name ?? ""),
    shortName: s(row, "short_name"),
    description: s(row, "description"),
    scope: s(row, "scope"),
    legalArea: s(row, "legal_area"),
    jurisdiction: s(row, "jurisdiction"),
    authority: s(row, "authority"),
    officialUrl: s(row, "official_url"),
    federalState: s(row, "federal_state"),
    schoolType: s(row, "school_type"),
    educationalArea: s(row, "educational_area"),
    legalDomain: s(row, "legal_domain"),
    versionLabel: s(row, "version_label"),
    publishedAt: s(row, "published_at"),
    validFrom: s(row, "valid_from"),
    validTo: s(row, "valid_to"),
    lastReviewedAt: s(row, "last_reviewed_at"),
    lastVerifiedAt: s(row, "last_verified_at"),
    supersedesSourceId: s(row, "supersedes_source_id"),
    replacedBySourceId: s(row, "replaced_by_source_id"),
    officialSource: b(row, "official_source"),
    authorityVerified: b(row, "authority_verified"),
    editorialVerified: b(row, "editorial_verified"),
    verificationStatus: (() => {
      const v = s(row, "verification_status");
      return v && VER_SET.has(v) ? (v as LegalSourceVerification) : "unverified";
    })(),
    lifecycleStatus: (() => {
      const v = s(row, "lifecycle_status");
      return v && LC_SET.has(v) ? (v as LegalSourceLifecycle) : "active";
    })(),
    sourceType: pickType(row),
    sourceFormat: s(row, "source_format"),
    sourceLanguage: s(row, "source_language") ?? "de",
    checksum: s(row, "checksum"),
    lastIngestedAt: s(row, "last_ingested_at"),
    originalContent: s(row, "original_content"),
    normalizedContent: s(row, "normalized_content"),
    createdAt: String(row.created_at ?? ""),
    updatedAt: s(row, "updated_at"),
  };
}

export function toReviewEvent(row: Row): LegalSourceReviewEvent {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    fromStatus: (s(row, "from_status") as LegalSourceLifecycle | null),
    toStatus: (s(row, "to_status") as LegalSourceLifecycle) ?? "draft",
    actorId: s(row, "actor_id"),
    note: s(row, "note"),
    createdAt: String(row.created_at ?? ""),
  };
}
