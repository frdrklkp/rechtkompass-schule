/**
 * Client-Utility: KI-gestützte Zuordnung von Schlagwörtern zu einem Praxisfall.
 * Kommuniziert mit /api/ai-match-keywords und liefert bereinigte Vorschläge.
 *
 * Enthält zentrale `applyKeywordMatches`-Funktion für persistente Zuordnung
 * (wird sowohl vom Schlagwort-Dialog als auch vom Vernetzungs-Assistenten genutzt).
 */

import { createKeyword, linkCaseKeyword, listKeywords } from "@/lib/coreBuilder";


export type KeywordMatch = {
  keyword: string;
  confidence: number;
  reason: string;
  is_new: boolean;
  already_linked: boolean;
};

export type KeywordMatchResponse = { matches: KeywordMatch[] };

export type CaseKeywordMatchInput = {
  title?: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  short_answer?: string;
  immediate_actions?: string;
  recommendation?: string;
  legal_explanation?: string;
  responsibilities?: string;
  practice_tip?: string;
  common_mistakes?: string[];
  checklist?: string[];
  documentation?: string[];
  legal_context?: string[];
  templates?: string[];
  existing_keywords: string[];
  already_linked?: string[];
};

export function keywordAmpel(c: number): "gruen" | "gelb" | "orange" | "rot" {
  if (c >= 90) return "gruen";
  if (c >= 70) return "gelb";
  if (c >= 50) return "orange";
  return "rot";
}

export function keywordAmpelDot(a: "gruen" | "gelb" | "orange" | "rot"): string {
  return a === "gruen" ? "🟢" : a === "gelb" ? "🟡" : a === "orange" ? "🟠" : "🔴";
}

export async function matchKeywords(
  input: CaseKeywordMatchInput,
): Promise<KeywordMatchResponse> {
  const res = await fetch("/api/ai-match-keywords", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `KI-Schlagwortzuordnung fehlgeschlagen (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as KeywordMatchResponse;
  return { matches: Array.isArray(json.matches) ? json.matches : [] };
}

export type KeywordApplyResult = {
  assigned: number;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ keyword: string; message: string; code?: string; details?: string }>;
};

type ApplyItem = { keyword: string };

/**
 * Zentrale Persistenz-Funktion für Schlagwort-Zuordnungen.
 * - existierende keywords werden case-insensitiv gematcht
 * - fehlende keywords werden angelegt
 * - Verknüpfung in case_keywords (Duplikate abgefangen)
 * - vollständiges Error-Reporting, kein stilles Verschlucken
 */
export async function applyKeywordMatches(
  caseId: string,
  items: ApplyItem[],
  opts?: {
    catalog?: Array<{ id: string; keyword: string }>;
    alreadyLinked?: string[]; // keyword names
  },
): Promise<KeywordApplyResult> {
  const result: KeywordApplyResult = {
    assigned: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  if (!caseId) {
    throw new Error("Keine case_id vorhanden – bitte Praxisfall zuerst speichern.");
  }
  // Katalog frisch laden, falls nicht übergeben
  let catalog =
    opts?.catalog ?? ((await listKeywords()) as Array<{ id: string; keyword: string }>);
  const byName = new Map<string, { id: string; keyword: string }>();
  for (const k of catalog) byName.set(k.keyword.trim().toLowerCase(), k);
  const linkedLower = new Set(
    (opts?.alreadyLinked ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean),
  );

  for (const item of items) {
    const name = item.keyword.trim();
    const lower = name.toLowerCase();
    if (!name) {
      result.skipped++;
      continue;
    }
    if (linkedLower.has(lower)) {
      result.skipped++;
      continue;
    }
    let entry = byName.get(lower);
    let wasCreated = false;
    try {
      if (!entry) {
        const created = await createKeyword(name);
        entry = { id: created.id, keyword: created.keyword };
        byName.set(lower, entry);
        wasCreated = true;
      }
      await linkCaseKeyword(caseId, entry.id);
      linkedLower.add(lower);
      result.assigned++;
      if (wasCreated) result.created++;
    } catch (e) {
      result.failed++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      result.errors.push({
        keyword: name,
        message: err?.message ?? String(e),
        code: err?.code,
        details: err?.details,
      });
      // Debug in DEV
      if (import.meta.env.DEV) {
        console.error("[applyKeywordMatches] failed", {
          caseId,
          keyword: name,
          keyword_id: entry?.id,
          error: err,
        });
      }
    }
  }
  return result;
}

