/**
 * Deterministische Zitat- und Zahlenprüfung (Qualitätsschritt 20.10.2026).
 *
 * Anlass: Fehler kamen in Wellen, die jeweils erst spät und eher zufällig
 * auffielen - § 53 Abs. 8 statt Abs. 9 SchulG in 22 Fällen (von der KI-
 * Überarbeitung teils wieder eingeführt), § 66 statt § 28 VwVfG, unbelegte
 * Fristen wie "3 Tage". Die Claim-Validierung ist selbst eine KI und liest
 * Absatznummern nicht zuverlässig. Dieses Modul prüft ohne KI:
 *
 *  1. ABSATZ: Gibt es den zitierten Absatz (bzw. Satz) im Normtext? Nur
 *     wenn die Gliederung des Abschnitts bekannt ist (siehe absatzStructure);
 *     sonst wird nicht geraten.
 *  2. ZAHL: Steht jede Zahl mit Einheit (Tage, Wochen, Minuten, Prozent ...)
 *     aus dem Falltext auch im Wortlaut der verknüpften Normen? Eine Zahl
 *     ohne Fundstelle ist eine unbelegte Frist/Grenze und wird gemeldet.
 *
 * Bewusst rein (keine Datenbank): Aufrufer laden Falltext und Abschnitte.
 */
import { extractLegalCitationsForCoverage, type ExtractedCitation } from "./legalCitationExtractor";

// ---------------------------------------------------------------------------
// 1. Absatzstruktur
// ---------------------------------------------------------------------------

export interface AbsatzStructure {
  /** Text je Absatz, Index 0 = Abs. 1. */
  absaetze: string[];
  /** Woher die Gliederung stammt. */
  basis: "zeilen" | "marken";
}

/** Kopfzeile mit Änderungshistorie ("§ 53 zuletzt geändert durch ..."), die vor Abs. 1 steht. */
const HISTORY_LINE = /^(§§?|Art\.?)\s*[\d, a-z]+.*(geändert|eingefügt|neu gefasst|aufgehoben|in Kraft getreten|angefügt)/i;

/**
 * Gliederung eines Abschnitts in Absätze, falls zuverlässig erkennbar:
 *  - "marken": der Text enthält "(1) ... (2) ..." in aufsteigender Folge
 *  - "zeilen": je Absatz eine Zeile (so liegt das SchulG NRW im Bestand vor;
 *    am 20.10.2026 für §§ 43, 53, 120 gegen den amtlichen Text geprüft)
 * Liefert null, wenn die Gliederung beim Import verloren ging (ein einziger
 * Fließtextblock) - dann prüft der Aufrufer keine Absatznummer.
 */
export function absatzStructure(content: string, opts: { lineStructured?: boolean } = {}): AbsatzStructure | null {
  const text = (content ?? "").trim();
  if (!text) return null;
  // Bekannte Zeilengliederung hat Vorrang: "(1)" kann im Fließtext auch eine
  // Notenstufe ("sehr gut (1)") oder ein Zitat sein (Fund 20.10.2026, § 2/§ 48 SchulG).
  if (opts.lineStructured) {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    while (lines.length > 1 && HISTORY_LINE.test(lines[0])) lines.shift();
    return { absaetze: lines, basis: "zeilen" };
  }
  const markers = [...text.matchAll(/(?:^|\s)\((\d{1,2})\)\s/g)];
  if (markers.length >= 2) {
    // nur eine sauber aufsteigende Folge ab (1) gilt als Gliederung
    const nums = markers.map((m) => Number(m[1]));
    const seq: number[] = [];
    for (const n of nums) if (n === seq.length + 1) seq.push(n);
    if (seq.length >= 2 && nums[0] === 1) {
      const parts: string[] = [];
      let from = 0;
      let expect = 1;
      for (const m of markers) {
        if (Number(m[1]) !== expect) continue;
        if (expect > 1) parts.push(text.slice(from, m.index).trim());
        from = (m.index ?? 0) + m[0].length;
        expect++;
      }
      parts.push(text.slice(from).trim());
      return { absaetze: parts, basis: "marken" };
    }
  }
  return null;
}

export interface AbsatzRef { absatz?: number; satz?: number }

/** "§ 120 Absatz 7 Satz 1 des Schulgesetzes NRW" -> { absatz: 7, satz: 1 } */
export function parseAbsatzRef(raw: string): AbsatzRef {
  const abs = raw.match(/\b(?:Abs\.|Absatz)\s*(\d{1,2})/);
  const satz = raw.match(/\b(?:Satz|S\.)\s*(\d{1,2})/);
  return { absatz: abs ? Number(abs[1]) : undefined, satz: satz ? Number(satz[1]) : undefined };
}

/** Grobe Satzzählung innerhalb eines Absatzes; Abkürzungen wie "Abs." oder "z. B." zählen nicht als Satzende. */
export function countSentences(absatz: string): number {
  const cleaned = absatz
    .replace(/\b(Abs|Nr|Art|bzw|ggf|vgl|z\. ?B|u\. ?a|S|Buchst|lit|Ziff|d\. ?h|i\. ?V\. ?m|i\. ?S\. ?d|ca|etc|usw|insb|S\. ?\d+)\./g, "$1")
    .replace(/(\d)\./g, "$1");
  return cleaned.split(/[.!?](?:\s+|$)/).map((s) => s.trim()).filter((s) => s.length > 3).length;
}

export interface AbsatzFinding {
  kind: "absatz_fehlt" | "satz_fehlt";
  raw: string;
  paragraph: string;
  lawAbbrev: string;
  cited: number;
  vorhanden: number;
  field: string;
}

export interface LawSectionLookup {
  /** Abschnitt zur Norm "§ N <Gesetz>" bzw. "Art. N", sofern eindeutig im Bestand. */
  find(lawAbbrev: string, paragraph: string, kind: ExtractedCitation["kind"]): { content: string; lineStructured: boolean; absatzCount?: number } | null;
}

/** Prüft alle Absatz-/Satzangaben eines Textfelds gegen die Gliederung der zitierten Norm. */
export function checkAbsatzCitations(field: string, text: string, lookup: LawSectionLookup): AbsatzFinding[] {
  const out: AbsatzFinding[] = [];
  for (const c of extractLegalCitationsForCoverage(text ?? "")) {
    const ref = parseAbsatzRef(c.raw);
    if (!ref.absatz) continue;
    const sec = lookup.find(c.lawAbbrev, c.paragraph, c.kind);
    if (!sec) continue;
    const st = absatzStructure(sec.content, { lineStructured: sec.lineStructured });
    // amtlich ermittelte Absatzzahl (metadata.absatz_count, _restore-absatz-structure.ts) hat Vorrang
    const count = sec.absatzCount ?? st?.absaetze.length;
    if (!count) continue;
    if (ref.absatz > count) {
      out.push({ kind: "absatz_fehlt", raw: c.raw, paragraph: c.paragraph, lawAbbrev: c.lawAbbrev, cited: ref.absatz, vorhanden: count, field });
      continue;
    }
    if (ref.satz && st && st.absaetze.length === count) {
      const n = countSentences(st.absaetze[ref.absatz - 1]);
      // Satzzählung ist eine Schätzung: erst bei klarer Überschreitung melden
      if (n > 0 && ref.satz > n + 1) out.push({ kind: "satz_fehlt", raw: c.raw, paragraph: c.paragraph, lawAbbrev: c.lawAbbrev, cited: ref.satz, vorhanden: n, field });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Zahlen und Fristen
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8,
  neun: 9, zehn: 10, elf: 11, zwölf: 12, vierzehn: 14, fünfzehn: 15, zwanzig: 20, dreißig: 30, sechzig: 60, neunzig: 90,
};
const UNIT_GROUPS: Array<[RegExp, string]> = [
  [/^(kalender|werk|schul|unterrichts|arbeits)?tage?n?$|^tages?$/i, "Tag"],
  [/^wochen?$/i, "Woche"],
  [/^monate?n?$|^monats$/i, "Monat"],
  [/^jahre?n?$|^jahres$/i, "Jahr"],
  [/^(unterrichts|schul|zeit)?stunden?$/i, "Stunde"],
  [/^minuten?$/i, "Minute"],
  [/^prozent$|^%$/i, "Prozent"],
  [/^euro$|^€$/i, "Euro"],
];
const QUANTITY = new RegExp(
  "(?<![§\\w.,/-])(\\d{1,4}(?:,\\d+)?|" + Object.keys(NUMBER_WORDS).join("|") + ")" +
    "(?:\\s*(?:bis|-|–)\\s*(\\d{1,4}|" + Object.keys(NUMBER_WORDS).join("|") + "))?" +
    "\\s*(?:-\\s*)?((?:Kalender|Werk|Schul|Unterrichts|Arbeits)?[Tt]age?n?|Tages|Wochen?|Monate?n?|Monats|Jahre?n?|Jahres|(?:Unterrichts|Schul|Zeit)?[Ss]tunden?|Minuten?|Prozent|%|Euro|€)(?![a-zäöüß])",
  "gi",
);

export interface Quantity { value: number; unit: string; raw: string }

const toNumber = (s: string): number | null => {
  const k = s.toLowerCase();
  if (k in NUMBER_WORDS) return NUMBER_WORDS[k];
  const n = Number(k.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const unitOf = (u: string): string | null => {
  for (const [re, name] of UNIT_GROUPS) if (re.test(u)) return name;
  return null;
};

/** Zahlen mit Zeit-, Prozent- oder Geldeinheit; Bereiche ("2 bis 3 Tage") liefern beide Werte. */
export function extractQuantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  for (const m of (text ?? "").matchAll(QUANTITY)) {
    const unit = unitOf(m[3]);
    if (!unit) continue;
    // "ein Tag", "eine Woche" ohne Zahlwert-Funktion ("an einem Tag") sind meist keine Fristen
    if (/^ein(e[mnr]?)?$/i.test(m[1]) && !m[2]) continue;
    for (const v of [m[1], m[2]].filter(Boolean) as string[]) {
      const value = toNumber(v);
      if (value !== null) out.push({ value, unit, raw: m[0].trim() });
    }
  }
  return out;
}

export interface QuantityFinding { raw: string; value: number; unit: string; field: string; context: string }

/**
 * Meldet Zahlen mit Einheit aus dem Falltext, die in keinem verknüpften
 * Normtext vorkommen. Vergleich über (Wert, Einheit), damit "drei Tage" und
 * "3 Tagen" als gleich gelten.
 */
export function checkQuantities(field: string, text: string, sourceTexts: string[]): QuantityFinding[] {
  const known = new Set(sourceTexts.flatMap((t) => extractQuantities(t)).map((q) => `${q.value}|${q.unit}`));
  const out: QuantityFinding[] = [];
  const seen = new Set<string>();
  for (const q of extractQuantities(text)) {
    const key = `${q.value}|${q.unit}`;
    if (known.has(key) || seen.has(key)) continue;
    seen.add(key);
    const at = text.indexOf(q.raw);
    out.push({ raw: q.raw, value: q.value, unit: q.unit, field, context: text.slice(Math.max(0, at - 80), at + q.raw.length + 60).replace(/\s+/g, " ").trim() });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Gesamtprüfung eines Falls
// ---------------------------------------------------------------------------

/** Lehrkräfte-sichtbare Felder eines Falls; FAQ und Entscheidungsbaum werden als Text geprüft. */
export const INTEGRITY_FIELDS = [
  "short_answer", "legal_explanation", "immediate_actions", "recommendation", "responsibilities",
  "practice_tip", "checklist", "documentation", "common_mistakes", "faq", "decision_tree",
] as const;

export function fieldText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(fieldText).join("\n");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(fieldText).join("\n");
  return String(value);
}

export interface IntegrityReport { absatz: AbsatzFinding[]; zahlen: QuantityFinding[] }

export function checkCaseIntegrity(caseRow: Record<string, unknown>, lookup: LawSectionLookup, linkedSourceTexts: string[]): IntegrityReport {
  const report: IntegrityReport = { absatz: [], zahlen: [] };
  for (const f of INTEGRITY_FIELDS) {
    const text = fieldText(caseRow[f]);
    if (!text) continue;
    report.absatz.push(...checkAbsatzCitations(f, text, lookup));
    report.zahlen.push(...checkQuantities(f, text, linkedSourceTexts));
  }
  // dieselbe Zahl in mehreren Feldern nur einmal melden
  const seen = new Set<string>();
  report.zahlen = report.zahlen.filter((z) => { const k = `${z.value}|${z.unit}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return report;
}
