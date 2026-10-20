/**
 * Unbelegte Zahlen und Fristen neutral umformulieren (20.10.2026).
 *
 * Die Zitatprüfung (citationIntegrity.ts) meldet Zahlen mit Einheit, die in
 * keiner verknüpften oder zitierten Norm stehen - fast immer KI-erfundene
 * Fristen in Entscheidungsbäumen und FAQ ("innerhalb von 3-5 Schultagen",
 * "Frist von mindestens 2 Wochen"). Lehrkräfte lesen sie als verbindliche
 * Vorgabe.
 *
 * Ablauf: Nur die betroffenen Sätze gehen an das Sprachmodell; jede
 * Neufassung wird danach deterministisch geprüft (Zahl weg, keine neue Zahl,
 * Länge plausibel) und nur dann eingesetzt. Die KI-Funktion wird injiziert,
 * damit das Modul ohne Netz testbar bleibt.
 */
import { extractQuantities, INTEGRITY_FIELDS } from "./citationIntegrity";

export type Rewriter = (items: Array<{ i: number; text: string; remove: string[] }>) => Promise<Array<{ i: number; text: string }>>;

export interface Target { path: (string | number)[]; sentence: string; remove: string[] }

const SENTENCE = /[^.!?\n]+(?:[.!?](?!\d)|\n|$)/g;
// Abkürzungen ("z. B.", "mind.", "Nr.") sind kein Satzende (Fund 20.10.2026: "z.B. 25%, 30%" wurde zerschnitten)
const ABBREV = /\b(z\. ?B|u\. ?a|d\. ?h|i\. ?d\. ?R|bzw|ggf|vgl|Nr|Abs|Art|ca|inkl|max|mind|min|evtl|insb|sog|usw|etc)\./g;
const PROTECT = "\u2063";
function sentencesOf(text: string): string[] {
  const protectedText = text.replace(ABBREV, (m) => m.replace(/\./g, PROTECT));
  return [...protectedText.matchAll(SENTENCE)].map((m) => m[0].split(PROTECT).join("."));
}
const qkey = (q: { value: number; unit: string }) => `${q.value}|${q.unit}`;

/** Alle Text-Blätter eines Feldwerts mit Pfad (Strings in Arrays/Objekten, z. B. FAQ und Entscheidungsbaum). */
export function leaves(value: unknown, path: (string | number)[] = []): Array<{ path: (string | number)[]; text: string }> {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, [...path, i]));
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, [...path, k]));
  return [];
}

/** Sätze, die mindestens eine der unbelegten Mengen enthalten. */
export function findTargets(caseRow: Record<string, unknown>, unbelegt: Set<string>): Target[] {
  const out: Target[] = [];
  for (const f of INTEGRITY_FIELDS) {
    for (const leaf of leaves(caseRow[f], [f])) {
      for (const sentence of sentencesOf(leaf.text)) {
        const hits = extractQuantities(sentence).filter((q) => unbelegt.has(qkey(q)));
        if (hits.length) out.push({ path: leaf.path, sentence, remove: [...new Set(hits.map((h) => h.raw))] });
      }
    }
  }
  return out;
}

/** Eine Neufassung gilt nur, wenn die gemeldeten Mengen weg sind, keine neue Menge dazukommt und der Satz nicht verstümmelt ist. */
export function acceptRewrite(original: string, rewritten: string, unbelegt: Set<string>): boolean {
  const t = rewritten.trim();
  const o = original.trim();
  // kurze Einträge ("sofort (innerhalb von 24 Stunden)" -> "unverzüglich") dürfen stark schrumpfen
  if (!t || (o.length >= 60 && t.length < o.length * 0.4) || t.length < 3) return false;
  const before = new Set(extractQuantities(original).map(qkey));
  for (const q of extractQuantities(t)) {
    if (unbelegt.has(qkey(q))) return false;
    if (!before.has(qkey(q))) return false;
  }
  return true;
}

function setAt(root: Record<string, unknown>, path: (string | number)[], fn: (s: string) => string): void {
  let cur: any = root;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  const last = path[path.length - 1];
  cur[last] = fn(cur[last]);
}

export interface NeutralizeResult { patch: Record<string, unknown>; replaced: number; rejected: Array<{ sentence: string; rewritten: string }> }

/**
 * Liefert die geänderten Felder (tiefe Kopien) für ein Update des Falls.
 * Unveränderte Felder fehlen im Patch.
 */
export async function neutralizeQuantities(caseRow: Record<string, unknown>, unbelegt: Set<string>, rewrite: Rewriter): Promise<NeutralizeResult> {
  const targets = findTargets(caseRow, unbelegt);
  const res: NeutralizeResult = { patch: {}, replaced: 0, rejected: [] };
  if (!targets.length) return res;
  const raw = await rewrite(targets.map((t, i) => ({ i, text: t.sentence.trim(), remove: t.remove })));
  const answers = Array.isArray(raw) ? raw : [];
  const byI = new Map(answers.map((a) => [a.i, a.text]));
  const work: Record<string, unknown> = {};
  targets.forEach((t, i) => {
    const neu = byI.get(i);
    if (neu == null || !acceptRewrite(t.sentence, neu, unbelegt)) { res.rejected.push({ sentence: t.sentence.trim(), rewritten: neu ?? "" }); return; }
    const field = String(t.path[0]);
    if (!(field in work)) work[field] = structuredClone(caseRow[field]);
    const keepTrailing = t.sentence.match(/\s*$/)?.[0] ?? "";
    const replacement = neu.trim() + keepTrailing;
    if (t.path.length === 1) work[field] = String(work[field]).replace(t.sentence, (t.sentence.match(/^\s*/)?.[0] ?? "") + replacement);
    else setAt(work as Record<string, unknown>, t.path, (s) => s.replace(t.sentence, (t.sentence.match(/^\s*/)?.[0] ?? "") + replacement));
    res.replaced++;
  });
  res.patch = work;
  return res;
}

export const NEUTRALIZE_SYSTEM = [
  "Du überarbeitest einzelne Sätze aus Praxisfällen für Lehrkräfte in NRW (Schulrecht).",
  "In jedem Satz stehen Zahlen oder Fristen (Feld remove), für die es keine Rechtsgrundlage gibt. Formuliere den Satz so um, dass genau diese Zahlen und Fristen verschwinden.",
  "Ersetze sie durch neutrale Wendungen wie 'zeitnah', 'unverzüglich' nur wenn es um sofortiges Handeln geht, 'angemessene Frist', 'nach angemessener Zeit', 'über einen angemessenen Zeitraum', 'regelmäßig'. Ist die Zahl nur ein Beispiel ('z. B. 80 % der Fehltage'), streiche das Beispiel.",
  "Ändere sonst nichts: gleicher Inhalt, gleiche Aussagen, gleiche Normzitate, gleicher Stil, gleiche Satzzeichen am Ende. Keine neuen Zahlen, keine neuen Rechtsbehauptungen, keine Erklärungen.",
  "Der neue Satz muss grammatisch sauber sein: keine Doppelungen wie 'Fristsetzung von angemessener Frist' (richtig: 'eine angemessene Frist setzen') und keine Klammer, die nur noch ein Füllwort enthält.",
  "Gib für jeden Eintrag nur den neuen Satz zurück.",
].join(" ");

export const NEUTRALIZE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { items: { type: "array", items: { type: "object", additionalProperties: false, properties: { i: { type: "integer" }, text: { type: "string" } }, required: ["i", "text"] } } },
  required: ["items"],
};
