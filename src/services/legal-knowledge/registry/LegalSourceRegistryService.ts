// Registry-Service: fachliche Operationen auf legal_sources.

import { LegalSourceRepository } from "../repositories/LegalSourceRepository";
import {
  InvalidSourceStatusTransitionError,
  LegalSourceValidationError,
  LegalSourceVersionConflictError,
} from "../runtime/ingestionErrors";
import type {
  LegalSourceDomain,
  LegalSourceLifecycle,
  LegalSourceListFilter,
  LegalSourceType,
  LegalSourceVerification,
} from "./LegalSourceRegistryTypes";
import { LEGAL_LIFECYCLE_TRANSITIONS } from "./LegalSourceRegistryTypes";

export interface CreateLegalSourceInput {
  title: string;
  shortName?: string | null;
  description?: string | null;
  scope?: string | null;
  legalArea?: string | null;
  jurisdiction?: string | null;
  authority?: string | null;
  officialUrl?: string | null;
  sourceType?: LegalSourceType;
  versionLabel?: string | null;
  publishedAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  officialSource?: boolean;
  originalContent?: string | null;
  normalizedContent?: string | null;
  checksum?: string | null;
  lifecycleStatus?: LegalSourceLifecycle;
  supersedesSourceId?: string | null;
}

function toRow(input: Partial<CreateLegalSourceInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.shortName !== undefined) out.short_name = input.shortName;
  if (input.description !== undefined) out.description = input.description;
  if (input.scope !== undefined) out.scope = input.scope;
  if (input.legalArea !== undefined) out.legal_area = input.legalArea;
  if (input.jurisdiction !== undefined) out.jurisdiction = input.jurisdiction;
  if (input.authority !== undefined) out.authority = input.authority;
  if (input.officialUrl !== undefined) out.official_url = input.officialUrl;
  if (input.sourceType !== undefined) {
    out.source_type_v2 = input.sourceType;
    out.source_type = input.sourceType; // Legacy-Kompat.
  }
  if (input.versionLabel !== undefined) out.version_label = input.versionLabel;
  if (input.publishedAt !== undefined) out.published_at = input.publishedAt;
  if (input.validFrom !== undefined) out.valid_from = input.validFrom;
  if (input.validTo !== undefined) out.valid_to = input.validTo;
  if (input.officialSource !== undefined) out.official_source = input.officialSource;
  if (input.originalContent !== undefined) out.original_content = input.originalContent;
  if (input.normalizedContent !== undefined) out.normalized_content = input.normalizedContent;
  if (input.checksum !== undefined) out.checksum = input.checksum;
  if (input.lifecycleStatus !== undefined) out.lifecycle_status = input.lifecycleStatus;
  if (input.supersedesSourceId !== undefined) out.supersedes_source_id = input.supersedesSourceId;
  return out;
}

export const LegalSourceRegistryService = {
  list(filter?: LegalSourceListFilter) {
    return LegalSourceRepository.list(filter);
  },
  get(id: string) {
    return LegalSourceRepository.get(id);
  },
  versionsOf(id: string) {
    return LegalSourceRepository.versionsOf(id);
  },
  reviewEvents(id: string) {
    return LegalSourceRepository.reviewEvents(id);
  },

  async create(input: CreateLegalSourceInput): Promise<LegalSourceDomain> {
    if (!input.title || input.title.trim().length < 3) {
      throw new LegalSourceValidationError("Titel muss mindestens 3 Zeichen enthalten.");
    }
    const row = toRow({
      lifecycleStatus: "draft",
      sourceType: "other",
      ...input,
    });
    if (!row.source_type_v2) row.source_type_v2 = "other";
    if (!row.source_type) row.source_type = "other";
    return LegalSourceRepository.insert(row);
  },

  update(id: string, patch: Partial<CreateLegalSourceInput>) {
    return LegalSourceRepository.update(id, toRow(patch));
  },

  async transitionStatus(
    id: string,
    to: LegalSourceLifecycle,
    note: string | null,
  ): Promise<LegalSourceDomain> {
    const current = await LegalSourceRepository.get(id);
    const allowed = LEGAL_LIFECYCLE_TRANSITIONS[current.lifecycleStatus] ?? [];
    if (!allowed.includes(to)) {
      throw new InvalidSourceStatusTransitionError(current.lifecycleStatus, to);
    }
    const patch: Record<string, unknown> = { lifecycle_status: to };
    if (to === "verified") patch.last_verified_at = new Date().toISOString();
    if (to === "archived" || to === "rejected") patch.last_verified_at = current.lastVerifiedAt;
    const next = await LegalSourceRepository.update(id, patch);
    await LegalSourceRepository.logReviewEvent(id, current.lifecycleStatus, to, note);
    return next;
  },

  async setVerification(id: string, status: LegalSourceVerification): Promise<LegalSourceDomain> {
    return LegalSourceRepository.update(id, {
      verification_status: status,
      authority_verified: status === "authority_verified",
      editorial_verified: status === "editorial_reviewed" || status === "authority_verified",
    });
  },

  async createNewVersion(
    ofSourceId: string,
    input: CreateLegalSourceInput,
  ): Promise<LegalSourceDomain> {
    if (ofSourceId === input.supersedesSourceId) {
      throw new LegalSourceVersionConflictError("Eine Quelle kann sich nicht selbst ersetzen.");
    }
    const next = await this.create({ ...input, supersedesSourceId: ofSourceId });
    await LegalSourceRepository.update(ofSourceId, {
      replaced_by_source_id: next.id,
      lifecycle_status: "outdated",
    });
    await LegalSourceRepository.logReviewEvent(ofSourceId, null, "outdated", "Neue Fassung angelegt.");
    return next;
  },
};
