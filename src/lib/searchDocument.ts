/**
 * Zentrale Erzeugung des Search-Document-Textes eines Praxisfalls.
 * Dieser Text wird für Embeddings verwendet.
 *
 * Ziel: fachlicher Suchkern statt langer Fließtext. Blockstruktur so gewählt,
 * dass Embedding-Modelle die zentrale Frage, Beteiligte, Situation und
 * Handlung erkennen — nicht nur oberflächliche Themennähe.
 *
 * Keine internen Admin- oder Debug-Inhalte. Keine vollständigen Gesetzestexte.
 */

import type { CaseData } from "@/data/cases";
import { extractCaseSignals } from "@/lib/searchSignals";
import { expandSearch } from "@/lib/synonyms";

export const SEARCH_EMBEDDING_MODEL = "openai/text-embedding-3-small";

/**
 * Version des Search-Document-Formats. Wird in den content_hash gemischt,
 * damit ein Formatwechsel garantiert alle bestehenden Embeddings als "stale"
 * markiert — selbst wenn der reine Textinhalt zufällig gleich bleiben würde.
 * Bei jeder inhaltlichen Umstellung von buildPracticeCaseSearchDocument() erhöhen.
 */
export const SEARCH_DOCUMENT_VERSION = "2";


function joinBlocks(...blocks: Array<string | null | undefined>): string {
  return blocks
    .map((b) => (b ?? "").trim())
    .filter((b) => b.length > 0)
    .join("\n\n");
}

function arrLine(v: string[] | null | undefined, sep = ", "): string {
  if (!v || v.length === 0) return "";
  return v.map((x) => x.trim()).filter(Boolean).join(sep);
}

function bullets(v: string[] | null | undefined, max = 5): string {
  if (!v || v.length === 0) return "";
  return v.slice(0, max).map((x) => `- ${x.trim()}`).filter((l) => l.length > 2).join("\n");
}

function truncate(s: string, max = 400): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, "").trim() + " …";
}

/**
 * Verdichtete Kernfrage aus shortAnswer/shortDescription.
 * Nimmt den ersten Satz oder den ersten Halbsatz vor einem Punkt.
 */
function coreQuestion(c: CaseData): string {
  const src = (c.shortAnswer || c.shortDescription || "").trim();
  if (!src) return "";
  const firstSentence = src.split(/(?<=[.!?])\s/)[0];
  return truncate(firstSentence, 240);
}

/**
 * Kompakte, kernorientierte Alltagssprache aus den relevantesten Tags/Search-Terms.
 * Erweitert nur die Top-Begriffe des Falls über die Synonymgruppen — nicht den
 * gesamten Text, damit der Embedding-Vektor nicht durch generische Wörter verwässert.
 */
function everydayLanguage(c: CaseData): string[] {
  const seeds = new Set<string>();
  for (const t of [...(c.tags ?? []), ...(c.searchTerms ?? [])]) {
    for (const term of expandSearch(t)) seeds.add(term);
  }
  // Titel-Kernwörter (>3 Zeichen) mit einbeziehen
  for (const w of (c.title ?? "").split(/\s+/)) {
    const clean = w.toLowerCase().replace(/[^a-zäöüß-]/g, "");
    if (clean.length > 3) {
      for (const term of expandSearch(clean)) seeds.add(term);
    }
  }
  return Array.from(seeds).slice(0, 30);
}

function legalLabels(c: CaseData): string[] {
  return (c.legalSections ?? [])
    .map((s) => [s.section_number, s.title, s.source?.name].filter(Boolean).join(" ").trim())
    .filter(Boolean);
}

/**
 * Kompakter Suchtext pro Praxisfall — kernorientierte Blockstruktur.
 * Reihenfolge ist bewusst gewählt: die ersten Blöcke tragen den fachlichen Kern
 * und wirken im Embedding stärker.
 */
export function buildPracticeCaseSearchDocument(c: CaseData): string {
  const signals = extractCaseSignals(c);
  const kernfrage = coreQuestion(c);
  const kategorie = [c.category, c.subcategory].filter(Boolean).join(" / ");
  const beteiligte = arrLine(signals.participants);
  const situation = arrLine(signals.situations);
  const handlung = arrLine(signals.actions);
  const alltag = arrLine(everydayLanguage(c));
  const tags = arrLine([...(c.tags ?? []), ...(c.searchTerms ?? [])]);
  const laws = legalLabels(c);
  const sachverhalt = truncate(c.shortDescription ?? "", 350);
  const empfehlung = truncate(c.recommendation ?? "", 300);
  const kernSchritte = bullets(c.checklist, 4);

  return joinBlocks(
    `TITEL: ${c.title ?? ""}`,
    kernfrage ? `KERNFRAGE: ${kernfrage}` : "",
    sachverhalt ? `SACHVERHALTSKERN: ${sachverhalt}` : "",
    beteiligte ? `BETEILIGTE: ${beteiligte}` : "",
    situation ? `SITUATION: ${situation}` : "",
    handlung ? `HANDLUNG / KONFLIKT: ${handlung}` : "",
    kategorie ? `RECHTSTHEMA / KATEGORIE: ${kategorie}` : "",
    alltag ? `ALLTAGSSPRACHE / SYNONYME: ${alltag}` : "",
    tags ? `SCHLAGWÖRTER: ${tags}` : "",
    kernSchritte ? `WICHTIGSTE HANDLUNGSSCHRITTE:\n${kernSchritte}` : "",
    empfehlung ? `EMPFEHLUNG: ${empfehlung}` : "",
    laws.length ? `RECHTSGRUNDLAGEN-LABELS: ${laws.join("; ")}` : "",
  );
}

/**
 * Stabiler Content-Hash (SHA-256 hex) für Änderungserkennung.
 * Nutzt Web Crypto (verfügbar im Worker- und Browser-Runtime).
 */
export async function computeContentHash(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Kanonischer Hash-Input für ein Praxisfall-Embedding.
 * Enthält Version, Modell und Text — bei jeder Änderung eines der drei
 * ändert sich der Hash zwingend, sodass "stale" korrekt erkannt wird.
 */
export async function computePracticeCaseHash(
  document: string,
  model: string,
): Promise<string> {
  return computeContentHash(`v${SEARCH_DOCUMENT_VERSION}::${model}::${document}`);
}

