/**
 * Einfache Ähnlichkeitsprüfung gegen bestehende Praxisfälle.
 * Basierend auf Titel-Tokens + Kategorie. Kein KI-Aufruf.
 */

const STOP = new Set([
  "der","die","das","und","oder","in","im","an","am","auf","für","fuer","zu","zur","zum",
  "mit","ohne","bei","ein","eine","einer","eines","dem","den","des","als","wie","von","aus",
  "beim","kein","keine","nicht","es","ist","sind","werden","wird","wurde","wurden",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export type SimilarCandidate = {
  id: string;
  title: string;
  category?: string | null;
};

export function findSimilar(
  candidate: { title: string; category?: string | null },
  existing: SimilarCandidate[],
  threshold = 0.55,
): Array<SimilarCandidate & { score: number }> {
  const ct = tokenize(candidate.title);
  const cc = (candidate.category ?? "").toLowerCase().trim();
  const out: Array<SimilarCandidate & { score: number }> = [];
  for (const e of existing) {
    const et = tokenize(e.title);
    let score = jaccard(ct, et);
    if (cc && (e.category ?? "").toLowerCase().trim() === cc) score += 0.1;
    if (score >= threshold) out.push({ ...e, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
