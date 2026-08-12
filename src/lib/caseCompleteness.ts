/**
 * Vollständigkeits-Score für KI-generierte Praxisfall-Entwürfe.
 * Reine Client-Utility, keine Serveraufrufe.
 */

/**
 * Zählt konkrete Do's aus einem `practice_tip`-Feld (Text oder Liste).
 * Trennt nach Zeilenumbrüchen und Listenzeichen; leere und doppelte
 * Einträge werden verworfen.
 */
export function countBullets(input: string[] | string | null | undefined): number {
  if (input == null) return 0;
  const raw = Array.isArray(input) ? input : [input];
  const items: string[] = [];
  for (const entry of raw) {
    const s = String(entry ?? "").trim();
    if (!s) continue;
    const lines = s
      .split(/\r?\n+/)
      .map((l) => l.replace(/^\s*([-*•–—]|\d+[.)])\s+/, "").trim())
      .filter(Boolean);
    if (lines.length > 0) items.push(...lines);
    else items.push(s);
  }
  return new Set(items.map((x) => x.toLowerCase())).size;
}


export type CompletenessInput = {
  short_description?: string | null;
  legal_explanation?: string | null;
  responsibilities?: string | null;
  practice_tip?: string | null;
  common_mistakes?: string[] | null;
  checklist?: string[] | null;
  documentation?: string[] | null;
  faq?: Array<{ q: string; a: string }> | null;
  keyword_count?: number;
  legal_link_count?: number;
  template_count?: number;
};

export type CompletenessResult = {
  score: number; // 0..100
  ampel: "gruen" | "gelb" | "rot";
  missing: string[];
};

export function computeCompleteness(input: CompletenessInput): CompletenessResult {
  const missing: string[] = [];
  let score = 0;

  if ((input.legal_link_count ?? 0) >= 1) score += 15;
  else missing.push("Rechtsgrundlage");

  if ((input.template_count ?? 0) >= 1) score += 10;
  else missing.push("Dokumentvorlage");

  if ((input.keyword_count ?? 0) >= 3) score += 10;
  else missing.push("Schlagwörter (≥3)");

  if ((input.faq?.length ?? 0) >= 3) score += 10;
  else missing.push("FAQ (≥3)");

  if ((input.checklist?.length ?? 0) >= 3) score += 10;
  else missing.push("Checkliste (≥3)");

  const doCount = countBullets(input.practice_tip);
  if (doCount >= 5) score += 10;
  else missing.push(`Do's (mindestens 5 – aktuell ${doCount})`);

  if ((input.common_mistakes?.length ?? 0) >= 2) score += 10;
  else missing.push("Don'ts (Typische Fehler)");

  if ((input.legal_explanation ?? "").trim().length >= 200) score += 10;
  else missing.push("Rechtliche Erläuterung");

  if ((input.responsibilities ?? "").trim().length > 0) score += 10;
  else missing.push("Zuständigkeiten");

  if ((input.short_description ?? "").trim().length > 0) score += 5;
  else missing.push("Kurzbeschreibung");

  const ampel: CompletenessResult["ampel"] =
    score >= 85 ? "gruen" : score >= 60 ? "gelb" : "rot";

  return { score, ampel, missing };
}
