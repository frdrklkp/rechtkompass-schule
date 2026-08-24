/**
 * Baut eine Markdown-Zusammenfassung eines Praxisfalls für den PDF-Export
 * (Ebene 2 der Fall-Detailseite). Reine Textzusammenführung aus bereits
 * vorhandenen Feldern – keine neue Bewertung, keine erfundenen Inhalte.
 *
 * Fund 2026-08-20 (Nutzer-Regelwerk "Drei-Ebenen-Trennung"): Aussagen
 * werden nach "rechtlich vorgegeben" / "rechtliche Einordnung" /
 * "organisatorisch empfohlen" getrennt dargestellt, statt als
 * unstrukturierter Fließtext. Die Trennung stützt sich auf zwei bereits
 * vorhandene Mechanismen statt auf ein neues DB-Schema:
 *  - splitLegalExplanation() trennt legal_explanation an den vom
 *    Entwurfs-Prompt vorgegebenen Markern "RECHTLICH VORGEGEBEN:" /
 *    "RECHTLICHE EINORDNUNG:" (fehlen die Marker bei älteren Fällen,
 *    landet der gesamte Text unter "Rechtlich vorgegeben" - keine
 *    Information geht verloren).
 *  - Do's/Don'ts/Checkliste tragen optional ein "[Label]"-Präfix je
 *    Punkt (parseTieredItem), das die Gruppierung steuert; unmarkierte
 *    Punkte (ältere Fälle) laufen in eine eigene, unbeschriftete Gruppe.
 */
import type { CaseData, LegalSectionCard } from "@/data/cases";
import { splitLegalExplanation, type TieredItem } from "@/lib/caseEnrichment";

const AMPEL_URGENCY: Record<string, string> = {
  gruen: "Dokumentieren und beobachten",
  gelb: "Zeitnah klären",
  rot: "Sofort handeln – Schulleitung einbeziehen",
};

function section(title: string, body: string | null | undefined): string {
  if (!body || body.trim().length === 0) return "";
  return `## ${title}\n\n${body.trim()}\n\n`;
}

function listSection(title: string, items: string[]): string {
  if (!items || items.length === 0) return "";
  return `## ${title}\n\n${items.map((i) => `- ${i}`).join("\n")}\n\n`;
}

/**
 * Gruppiert TieredItems nach Label, in fester, in `order` vorgegebener
 * Reihenfolge.
 *
 * Fund 2026-08-21: der Legal Export Quality Gate kann ein Element beim
 * Herabstufen ("herabgestuft") ein Label aus der FALSCHEN Feld-Vokabular
 * vergeben (z. B. "Organisatorisch empfohlen" für ein documentation-Element,
 * dessen Vokabular nur "Rechtlich erforderlich"/"Zur Nachvollziehbarkeit
 * empfohlen" kennt) - live beobachtet. Ein Label, das in `order` nicht
 * vorkommt, darf NICHT stillschweigend verschwinden (genau die Art
 * "Scheinvollständigkeit durch stille Auslassung", die dieses Regelwerk an
 * anderer Stelle ausdrücklich verbietet) - es wird als eigene, zusätzliche
 * Gruppe MIT seinem tatsächlichen (unerwarteten) Label angehängt statt
 * verworfen.
 */
function groupByLabel(items: TieredItem[], order: string[]): Array<{ label: string; items: string[] }> {
  const groups = new Map<string, string[]>();
  for (const it of items) {
    const key = it.label ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it.text);
  }
  const ordered: Array<{ label: string; items: string[] }> = [];
  for (const label of order) {
    const found = groups.get(label);
    if (found && found.length) ordered.push({ label, items: found });
  }
  for (const [key, found] of groups) {
    if (key === "" || order.includes(key)) continue;
    if (found.length) ordered.push({ label: key, items: found });
  }
  const unlabeled = groups.get("");
  if (unlabeled && unlabeled.length) ordered.push({ label: "", items: unlabeled });
  return ordered;
}

function tieredSection(
  title: string,
  items: TieredItem[],
  order: string[],
): string {
  if (!items || items.length === 0) return "";
  const groups = groupByLabel(items, order);
  let md = `## ${title}\n\n`;
  for (const g of groups) {
    if (g.label) md += `**${g.label}**\n\n`;
    md += g.items.map((i) => `- ${i}`).join("\n") + "\n\n";
  }
  return md;
}

/**
 * Fund 2026-08-21 (Legal Export Quality Gate, Regel 11): Normtexte dürfen im
 * Export nicht unkontrolliert mit "…" mitten im Satz abgeschnitten werden.
 *
 * Korrektur 2026-08-21 (Nutzer-Regelwerk "FINAL LEGAL PRECISION PASS", Regeln
 * 15-17): die daraufhin gewählte Lösung - immer den VOLLEN Normtext zeigen -
 * ist für Lehrkräfte kaum lesbar und suggeriert, der ganze Absatz sei
 * fallrelevant. Der Legal Export Quality Gate liefert deshalb je Quelle
 * gezielt eine kompakte, klar als "Wortlaut" (kurzes, nahezu wörtliches
 * Zitat) oder "Regelungsinhalt – zusammengefasst" (eigene Kurzfassung)
 * gekennzeichnete Fassung (case_legal_links.content_summary/-kind) samt
 * kleinstmöglicher tatsächlich erkennbarer Fundstelle (precise_reference,
 * NIE erfunden). Fälle, die den Gate-Durchlauf noch nicht durchlaufen haben
 * (ältere Fälle, oder falls der Aufruf einmal fehlschlägt), zeigen ehrlich
 * den vollständigen Volltext statt einer stillschweigend erfundenen Kürzung.
 */
function legalSourcesSection(sections: LegalSectionCard[]): string {
  if (!sections || sections.length === 0) return "";
  let md = `## Rechtsgrundlagen\n\n`;
  for (const s of sections) {
    const bezeichnung = s.source?.name || "Unbekannte Quelle";
    // Fund 2026-08-21: manche section_number/title-Werte im Bestand enden
    // bereits mit einem Komma - ohne Trim entsteht beim Anhängen von
    // preciseReference ein doppeltes Komma ("...Nichtversetzung,, Absatz 2-3").
    const fundstelleBasis = [s.section_number, s.title].filter(Boolean).join(" – ").replace(/[,\s]+$/, "");
    const fundstelle = s.preciseReference?.trim()
      ? `${fundstelleBasis}${fundstelleBasis ? ", " : ""}${s.preciseReference.trim()}`
      : fundstelleBasis;
    md += `### ${fundstelle || bezeichnung}\n\n`;
    md += `Bezeichnung: ${bezeichnung}\n\n`;
    if (fundstelle) md += `Fundstelle: ${fundstelle}\n\n`;
    if (s.contentSummary?.trim()) {
      const kindLabel = s.contentSummaryKind === "wortlaut" ? "Wortlaut" : "Regelungsinhalt – zusammengefasst";
      md += `${kindLabel}: ${s.contentSummary.trim()}\n\n`;
    } else {
      const regelungsinhalt = (s.full_text || s.summary || "").trim();
      md += `Regelungsinhalt: ${regelungsinhalt || "Die genannte Rechtsgrundlage enthält hierzu keinen hinterlegten Volltext."}\n\n`;
    }
    md += `Bedeutung für diesen Fall: ${s.explanation?.trim() || "Keine fallbezogene Begründung hinterlegt."}\n\n`;
  }
  return md;
}

/**
 * Fund 2026-08-21 (Regel 13): "Stand" darf nicht mehrere unterschiedliche
 * Datumsbedeutungen vermischen. Von den vier möglichen Quellendatums-Feldern
 * ist im echten Datenbestand nur `version_label` je gefüllt (Stichprobe
 * 16.167 Zeilen) - `valid_from`/`valid_to`/`last_reviewed_at` sind
 * ausnahmslos leer. Gezeigt wird deshalb nur, was tatsächlich bekannt ist:
 * die Fassung/der Stand der Quelle selbst, plus das echte, zur Exportzeit
 * berechenbare Prüfdatum (wann DIESES Dokument erzeugt wurde) - keine
 * Erfindung der leeren Felder.
 */
function sourceStatusSection(sections: LegalSectionCard[]): string {
  if (!sections || sections.length === 0) return "";
  const exportDate = new Date().toLocaleDateString("de-DE");
  const lines = sections.map((s) => {
    const label = [s.source?.name, s.section_number].filter(Boolean).join(" ") || "Unbekannte Quelle";
    const stand = s.version_label?.trim() && s.version_label.trim() !== "Unbekannte Fassung"
      ? `Fassung/Stand der Quelle: ${s.version_label.trim()}`
      : "Aktualitätsstatus nicht abschließend verifiziert";
    return `${label} – ${stand}; im RechtsKompass-Datenbestand geprüft am ${exportDate}`;
  });
  return listSection("Quellenstatus", lines);
}

function reviewStatusSection(c: CaseData): string {
  if (!c.legalReviewStatus) return "";
  const label = { gruen: "Grün – zentrale Rechtsaussagen ausreichend belegt", gelb: "Gelb – Kernaussage belegt, einzelne Nebenpunkte offen", rot: "Rot – fachliche Prüfung erforderlich" }[c.legalReviewStatus];
  let md = `## Prüfstatus\n\n${label}\n\n`;
  if (c.legalReviewReasoning?.trim()) md += `${c.legalReviewReasoning.trim()}\n\n`;
  return md;
}

/** Leitet eine "Konkrete Rechtsfrage" aus dem Titel ab, falls dieser als Frage formuliert ist. */
function deriveLegalQuestion(title: string): string {
  const t = title.trim();
  return t.endsWith("?") ? t : "";
}

const DO_ORDER = ["Rechtlich erforderlich", "Praktisch empfohlen", "Bei Unsicherheit"];
const CHECKLIST_ORDER = ["Rechtlich erforderlich", "Organisatorisch empfohlen", "Rechtlich zu prüfen", "Optional"];
const DONT_ORDER = ["Rechtlich problematisch", "Organisatorisch ungünstig"];
const DOCUMENTATION_ORDER = ["Rechtlich erforderlich", "Zur Nachvollziehbarkeit empfohlen"];

export interface PracticeCaseMarkdownOptions {
  /** Bereits auf der Seite berechnete "Das sollten Sie tun"-Liste, mit Ebenen-Label je Punkt. */
  tips: TieredItem[];
  /** Übrige "Das sollten Sie vermeiden"-Punkte mit Ebenen-Label je Punkt. */
  donts: TieredItem[];
  /** Checkliste mit Ebenen-Label je Punkt. */
  checklist: TieredItem[];
  /** Dokumentationspunkte mit Ebenen-Label je Punkt (Regel 13). */
  documentation: TieredItem[];
  /** Offene, nicht abschließend geklärte Rechtsfragen (aus case_legal_review_flags). */
  openQuestions: string[];
}

export function buildPracticeCaseSummaryMarkdown(
  c: CaseData,
  opts: PracticeCaseMarkdownOptions,
): string {
  const { vorgegeben, einordnung } = splitLegalExplanation(c.legalExplanation);
  const legalQuestion = deriveLegalQuestion(c.title);
  const legalSections = c.legalSections ?? [];

  let md = `# ${c.title}\n\n`;
  md += `**${c.category}${c.subcategory ? ` · ${c.subcategory}` : ""}**  \n`;
  md += `Dringlichkeit: ${AMPEL_URGENCY[c.ampel] ?? c.ampel}\n\n`;

  md += section("Das Wichtigste auf einen Blick", c.shortAnswer);
  md += section("Ausgangssituation", c.shortDescription);
  if (legalQuestion) md += section("Konkrete Rechtsfrage", legalQuestion);
  md += section("Rechtlich vorgegeben", vorgegeben);
  md += section("Bedeutung für diesen Fall", einordnung);
  md += section("Organisatorisch empfohlen", c.recommendation);
  md += listSection("Offene Rechtsfragen", opts.openQuestions);
  md += tieredSection("Das sollten Sie jetzt tun", opts.tips, DO_ORDER);
  md += tieredSection("Das sollten Sie vermeiden", opts.donts, DONT_ORDER);
  md += section("Zuständigkeit", c.responsibleParty);
  md += tieredSection("Dokumentation", opts.documentation, DOCUMENTATION_ORDER);
  md += tieredSection("Checkliste", opts.checklist, CHECKLIST_ORDER);
  md += legalSourcesSection(legalSections);
  md += sourceStatusSection(legalSections);
  md += reviewStatusSection(c);
  // Fund 2026-08-21 (Regel 20): der Disclaimer erscheint bereits in der
  // PDF-Fußzeile auf jeder Seite (PdfExportAdapter.ts) - ein zusätzlicher
  // "## Hinweis"-Absatz im Fließtext wäre eine Dopplung und entfällt hier.

  return md.trim();
}
