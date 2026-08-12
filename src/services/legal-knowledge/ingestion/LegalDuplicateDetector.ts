// Deterministische Dubletten-Erkennung.

import type { LegalDuplicateCandidate } from "./LegalIngestionTypes";
import type { LegalSourceDomain } from "../registry/LegalSourceRegistryTypes";

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9äöüß§ .-]/g, "").replace(/\s+/g, " ").trim();
}

function titleSimilarity(a: string, b: string): number {
  const A = normalizeTitle(a);
  const B = normalizeTitle(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.length > 12 && B.length > 12 && (A.includes(B) || B.includes(A))) return 0.85;
  // Jaccard über Wortsätze
  const sa = new Set(A.split(" "));
  const sb = new Set(B.split(" "));
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface DuplicateInput {
  title?: string | null;
  officialUrl?: string | null;
  checksum?: string | null;
  versionLabel?: string | null;
}

export function detectDuplicates(
  input: DuplicateInput,
  candidates: LegalSourceDomain[],
  excludeId?: string | null,
): LegalDuplicateCandidate[] {
  const out: LegalDuplicateCandidate[] = [];
  const list = candidates.filter((c) => c.id !== excludeId);

  if (input.checksum) {
    for (const c of list) {
      if (c.checksum && c.checksum === input.checksum) {
        out.push({
          sourceId: c.id, title: c.title, shortName: c.shortName,
          matchKind: "exact_checksum", confidence: 1,
          reason: "Inhaltlich identisch (Prüfsumme).",
        });
      }
    }
  }
  if (input.officialUrl) {
    const url = input.officialUrl.toLowerCase().replace(/\/$/, "");
    for (const c of list) {
      const cu = (c.officialUrl ?? "").toLowerCase().replace(/\/$/, "");
      if (cu && cu === url) {
        out.push({
          sourceId: c.id, title: c.title, shortName: c.shortName,
          matchKind: "exact_url", confidence: 0.95,
          reason: "Identische offizielle URL.",
        });
      }
    }
  }
  if (input.title) {
    for (const c of list) {
      const sim = titleSimilarity(input.title, c.title);
      if (sim >= 0.75) {
        if (input.versionLabel && c.versionLabel && input.versionLabel !== c.versionLabel) {
          out.push({
            sourceId: c.id, title: c.title, shortName: c.shortName,
            matchKind: "version_variant", confidence: sim,
            reason: `Sehr ähnlicher Titel, aber abweichende Fassung ("${c.versionLabel}").`,
          });
        } else {
          out.push({
            sourceId: c.id, title: c.title, shortName: c.shortName,
            matchKind: "probable_title", confidence: sim,
            reason: `Titel-Ähnlichkeit ${Math.round(sim * 100)}%.`,
          });
        }
      }
    }
  }

  // Deduplizieren – höchste Confidence pro sourceId
  const map = new Map<string, LegalDuplicateCandidate>();
  for (const cand of out) {
    const prev = map.get(cand.sourceId);
    if (!prev || cand.confidence > prev.confidence) map.set(cand.sourceId, cand);
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence);
}
