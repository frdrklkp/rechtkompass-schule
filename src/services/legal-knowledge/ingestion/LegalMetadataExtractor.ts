// Deterministische Metadaten-Extraktion. Reine Regex-Heuristik, keine KI.

import type { LegalIngestionMetadata } from "./LegalIngestionTypes";

const DATE_RE = /\b(0?[1-9]|[12]\d|3[01])\.(0?[1-9]|1[0-2])\.((?:19|20)\d{2})\b/;
const PARA_RE = /§\s*\d+[a-z]?/g;
const ART_RE = /(?:Art\.|Artikel)\s*\d+/g;

const FEDERAL_STATES: Record<string, string> = {
  "Nordrhein-Westfalen": "DE-NW",
  "NRW": "DE-NW",
  "Bayern": "DE-BY",
  "Baden-Württemberg": "DE-BW",
  "Berlin": "DE-BE",
  "Brandenburg": "DE-BB",
  "Bremen": "DE-HB",
  "Hamburg": "DE-HH",
  "Hessen": "DE-HE",
  "Mecklenburg-Vorpommern": "DE-MV",
  "Niedersachsen": "DE-NI",
  "Rheinland-Pfalz": "DE-RP",
  "Saarland": "DE-SL",
  "Sachsen": "DE-SN",
  "Sachsen-Anhalt": "DE-ST",
  "Schleswig-Holstein": "DE-SH",
  "Thüringen": "DE-TH",
};

function detectJurisdiction(text: string): { code?: string; confidence: number } {
  for (const [name, code] of Object.entries(FEDERAL_STATES)) {
    if (text.includes(name)) return { code, confidence: 0.75 };
  }
  if (/\b(Bund|Bundesrepublik|Deutschland)\b/i.test(text)) return { code: "DE", confidence: 0.5 };
  return { confidence: 0 };
}

function detectTitle(text: string): { title?: string; confidence: number } {
  const firstLine = text.split("\n").find((l) => l.trim().length > 0)?.trim();
  if (!firstLine) return { confidence: 0 };
  const clipped = firstLine.slice(0, 200);
  const confidence = firstLine.length > 8 && firstLine.length < 200 ? 0.6 : 0.3;
  return { title: clipped, confidence };
}

function detectShortName(text: string): { shortName?: string; confidence: number } {
  // Klassiker: "(SchulG NRW)" oder "– SchulG –"
  const m = text.match(/\(([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß\-\d]{1,15}(?:\s+[A-ZÄÖÜ]{2,5})?)\)/);
  if (m?.[1]) return { shortName: m[1], confidence: 0.7 };
  return { confidence: 0 };
}

function detectSourceType(text: string): { type?: string; confidence: number } {
  const lower = text.toLowerCase();
  if (/(runderlass|erlass des ministeriums)/i.test(lower)) return { type: "circular", confidence: 0.8 };
  if (/verwaltungsvorschrift/i.test(lower)) return { type: "administrative_regulation", confidence: 0.8 };
  if (/(rechtsverordnung|verordnung)/i.test(lower)) return { type: "ordinance", confidence: 0.7 };
  if (/(schulgesetz|gesetz\s+über|allgemeines gesetz)/i.test(lower)) return { type: "law", confidence: 0.7 };
  if (/(urteil|beschluss|az\.:|beschl\.)/i.test(lower)) return { type: "court_decision", confidence: 0.7 };
  return { confidence: 0 };
}

function detectAuthority(text: string): { authority?: string; confidence: number } {
  const m = text.match(/(Ministerium[^\n]{3,80})/);
  if (m?.[1]) return { authority: m[1].trim(), confidence: 0.6 };
  if (/Bundestag/.test(text)) return { authority: "Deutscher Bundestag", confidence: 0.7 };
  if (/Landtag/.test(text)) return { authority: "Landtag", confidence: 0.5 };
  return { confidence: 0 };
}

function toIsoDate(day: string, month: string, year: string): string {
  const d = day.padStart(2, "0");
  const m = month.padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function detectDates(text: string): { publishedAt?: string; validFrom?: string; confidence: number } {
  const iso: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(DATE_RE, "g");
  while ((m = re.exec(text)) !== null) {
    iso.push(toIsoDate(m[1]!, m[2]!, m[3]!));
    if (iso.length >= 3) break;
  }
  if (iso.length === 0) return { confidence: 0 };
  return { publishedAt: iso[0], validFrom: iso[1], confidence: 0.55 };
}

function detectVersionLabel(text: string): { versionLabel?: string; confidence: number } {
  const m = text.match(/\b(?:Fassung|Stand)[:\s]+([^\n]{3,60})/i);
  if (m?.[1]) return { versionLabel: m[1].trim(), confidence: 0.65 };
  return { confidence: 0 };
}

function detectLanguage(text: string): { language?: string; confidence: number } {
  const germanHits = (text.match(/\b(der|die|das|und|oder|sowie|nicht|dass|dieser|dieses)\b/gi) || []).length;
  if (germanHits > 5) return { language: "de", confidence: 0.9 };
  return { language: "de", confidence: 0.3 };
}

export function extractLegalMetadata(text: string): LegalIngestionMetadata {
  if (!text || !text.trim()) return { confidence: {} };
  const conf: Record<string, number> = {};

  const t = detectTitle(text); conf.title = t.confidence;
  const sn = detectShortName(text); conf.shortName = sn.confidence;
  const st = detectSourceType(text); conf.sourceType = st.confidence;
  const j = detectJurisdiction(text); conf.jurisdiction = j.confidence;
  const a = detectAuthority(text); conf.authority = a.confidence;
  const d = detectDates(text); conf.dates = d.confidence;
  const v = detectVersionLabel(text); conf.versionLabel = v.confidence;
  const l = detectLanguage(text); conf.language = l.confidence;

  const paragraphs = (text.match(PARA_RE) || []).length;
  const articles = (text.match(ART_RE) || []).length;

  return {
    detectedTitle: t.title,
    detectedShortName: sn.shortName,
    detectedType: st.type,
    detectedJurisdiction: j.code,
    detectedAuthority: a.authority,
    detectedPublishedAt: d.publishedAt,
    detectedValidFrom: d.validFrom,
    detectedVersionLabel: v.versionLabel,
    detectedLanguage: l.language,
    paragraphCount: paragraphs,
    articleCount: articles,
    confidence: conf,
  };
}
