/**
 * Sprint 4.5C – Berechnung eines deterministischen Deltas gegen einen
 * bestehenden Snapshot. Unveränderte Knoten werden ausdrücklich als
 * „unchanged" markiert, damit der Persistenz-Adapter sie überspringen kann.
 */
import type {
  LegalImportDelta,
  LegalImportNodeChange,
  LegalImportSnapshot,
  NormalizedLegalDocument,
} from "./types";
import { flatten, hashNode } from "./hashing";

export function buildSnapshot(doc: NormalizedLegalDocument): LegalImportSnapshot {
  const nodes = flatten(doc.root);
  const nodeHashes: Record<string, string> = {};
  for (const n of nodes) nodeHashes[n.localId] = hashNode(n);
  return {
    sourceKey: doc.source.key,
    versionLabel: doc.version.label,
    nodeHashes,
  };
}

export function computeDelta(
  doc: NormalizedLegalDocument,
  previous: LegalImportSnapshot | null | undefined,
): LegalImportDelta {
  const current = buildSnapshot(doc);
  const changes: LegalImportNodeChange[] = [];
  let added = 0, updated = 0, unchanged = 0, removed = 0;

  const prevHashes = previous?.nodeHashes ?? {};
  for (const [localId, hash] of Object.entries(current.nodeHashes)) {
    const prev = prevHashes[localId];
    if (prev == null) {
      added++;
      changes.push({ op: "added", localId, hash });
    } else if (prev === hash) {
      unchanged++;
      changes.push({ op: "unchanged", localId, hash });
    } else {
      updated++;
      changes.push({ op: "updated", localId, hash, previousHash: prev });
    }
  }
  for (const [localId, prev] of Object.entries(prevHashes)) {
    if (!(localId in current.nodeHashes)) {
      removed++;
      changes.push({ op: "removed", localId, previousHash: prev });
    }
  }

  return { added, updated, unchanged, removed, changes };
}
