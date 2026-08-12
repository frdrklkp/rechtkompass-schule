// Unit-Tests für Legal Knowledge (Sprint 4.1A).
// Runner-agnostisch (node:test), dependency-frei.

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeChecksum,
  computeContentStats,
  normalizeLegalContent,
} from "../ingestion/LegalContentNormalizer";
import { extractLegalMetadata } from "../ingestion/LegalMetadataExtractor";
import { validateIngestion } from "../ingestion/LegalIngestionValidator";
import { detectDuplicates } from "../ingestion/LegalDuplicateDetector";
import { InvalidSourceStatusTransitionError } from "../runtime/ingestionErrors";
import { LEGAL_LIFECYCLE_TRANSITIONS } from "../registry/LegalSourceRegistryTypes";
import type { LegalSourceDomain } from "../registry/LegalSourceRegistryTypes";

test("normalizer vereinheitlicht Whitespace und §-Referenzen", () => {
  const raw = "Zeile1\r\n\r\n\r\nZeile2  mit   spaces\n§5 Absatz  1";
  const out = normalizeLegalContent(raw);
  assert.ok(out.includes("Zeile1\n\nZeile2 mit spaces"));
  assert.ok(out.includes("§ 5"));
});

test("normalizer entfernt Steuerzeichen", () => {
  assert.equal(normalizeLegalContent("Ok\u0000\u0007end"), "Okend");
});

test("computeContentStats erkennt Marker", () => {
  const s = computeContentStats("§ 1 Zweck des Gesetzes");
  assert.equal(s.hasSectionMarkers, true);
  assert.equal(s.detectedFormat, "structured");
});

test("checksum ist deterministisch und unterscheidend", () => {
  assert.equal(computeChecksum("abc"), computeChecksum("abc"));
  assert.notEqual(computeChecksum("abc"), computeChecksum("abd"));
});

test("metadata: erkennt NRW und Paragraphen", () => {
  const m = extractLegalMetadata("Schulgesetz Nordrhein-Westfalen (SchulG NRW)\n§ 1 Zweck");
  assert.equal(m.detectedJurisdiction, "DE-NW");
  assert.ok((m.paragraphCount ?? 0) > 0);
  assert.equal(m.detectedShortName, "SchulG NRW");
});

test("metadata: Runderlass wird als circular erkannt", () => {
  const m = extractLegalMetadata("Runderlass des Ministeriums für Schule und Bildung");
  assert.equal(m.detectedType, "circular");
});

test("validator: leerer Inhalt blockiert", () => {
  const stats = computeContentStats("");
  const r = validateIngestion("", stats, {});
  assert.equal(r.readiness, "blocked");
  assert.equal(r.errorCount, 1);
});

test("validator: strukturierter Text ist bereit oder needs_input", () => {
  const text = "Schulgesetz Nordrhein-Westfalen (SchulG NRW)\n§ 1 Zweck des Gesetzes\nDer Zweck ist ein Gesetz mit Regelungen für Schulen.";
  const norm = normalizeLegalContent(text);
  const stats = computeContentStats(norm);
  const meta = extractLegalMetadata(norm);
  const r = validateIngestion(norm, stats, meta);
  assert.ok(r.readiness === "ready_for_review" || r.readiness === "needs_input");
});

const base: LegalSourceDomain = {
  id: "a", title: "Schulgesetz NRW", shortName: "SchulG NRW",
  description: null, scope: null, legalArea: null, jurisdiction: "DE-NW",
  authority: null, officialUrl: "https://example.org/x", federalState: null,
  schoolType: null, educationalArea: null, legalDomain: null,
  versionLabel: "2024", publishedAt: null, validFrom: null, validTo: null,
  lastReviewedAt: null, lastVerifiedAt: null,
  supersedesSourceId: null, replacedBySourceId: null,
  officialSource: true, authorityVerified: false, editorialVerified: false,
  verificationStatus: "unverified", lifecycleStatus: "active",
  sourceType: "law", sourceFormat: null, sourceLanguage: "de",
  checksum: "deadbeef", lastIngestedAt: null, originalContent: null,
  normalizedContent: null, createdAt: "", updatedAt: null,
};

test("duplicates: exakte Checksumme", () => {
  const d = detectDuplicates({ checksum: "deadbeef" }, [base]);
  assert.equal(d[0]?.matchKind, "exact_checksum");
});

test("duplicates: exakte URL", () => {
  const d = detectDuplicates({ officialUrl: "https://example.org/x" }, [base]);
  assert.equal(d[0]?.matchKind, "exact_url");
});

test("duplicates: Versionsvariante bei abweichender Fassung", () => {
  const d = detectDuplicates({ title: "Schulgesetz NRW", versionLabel: "2025" }, [base]);
  assert.equal(d[0]?.matchKind, "version_variant");
});

test("lifecycle-transitions: whitelist deckt zentrale Wege ab", () => {
  assert.ok(LEGAL_LIFECYCLE_TRANSITIONS.draft.includes("imported"));
  assert.ok(LEGAL_LIFECYCLE_TRANSITIONS.verified.includes("active"));
  assert.ok(!LEGAL_LIFECYCLE_TRANSITIONS.archived.includes("active"));
});

test("Fehlertyp InvalidSourceStatusTransitionError trägt code + userMessage", () => {
  const e = new InvalidSourceStatusTransitionError("draft", "active");
  assert.equal(e.code, "legal_invalid_transition");
  assert.ok(e.userMessage.length > 0);
});
