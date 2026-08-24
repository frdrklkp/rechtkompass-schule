/**
 * Zentrale intelligente Suche für Praxisfälle.
 * - Arbeitet ausschließlich auf veröffentlichten Praxisfällen (Aufrufer liefert die Liste).
 * - Erfindet nichts: liefert nur Kandidaten aus der übergebenen Wissensbasis.
 * - Hybrides Ranking über Titel, Sachverhalt, Kategorie, Empfehlung, Handlungsschritte,
 *   Rechtsgrundlagen-Labels, Tags/Suchbegriffe.
 * - Erkennt zu vage Anfragen und stellt gezielte Rückfragen bereit.
 * - Kein neuer Legal-Matching- oder Quality-Pfad.
 */

import type { CaseData } from "@/data/cases";
import { expandSearch } from "@/lib/synonyms";

export type SearchResult = {
  case: CaseData;
  relevanceScore: number;
  confidenceLabel: "sehr-hoch" | "hoch" | "moeglich";
  matchedTerms: string[];
  matchedTopics: string[];
  matchReasons: string[];
};

export type ClarificationOption = { label: string; value: string };
export type ClarificationQuestion = {
  key: string;
  question: string;
  options: ClarificationOption[];
};

export type IntelligentSearchResponse = {
  query: string;
  interpretedQuery: string;
  detectedTopics: string[];
  detectedKeywords: string[];
  results: SearchResult[];
  bestMatch: SearchResult | null;
  alternatives: SearchResult[];
  confidence: number; // 0..1 des besten Treffers
  clarificationNeeded: boolean;
  clarificationQuestions: ClarificationQuestion[];
  warnings: string[];
};

// Themen-/Kategorie-Signale (deutsche Alltagssprache → Kategorie/Themen-Tags).
const TOPIC_MAP: Record<string, string[]> = {
  Datenschutz: [
    "datenschutz","dsgvo","privatsphäre","persönlichkeitsrecht","persoenlichkeitsrecht",
    "aufnahme","filmen","video","mitschneiden","foto","bild","weitergabe","vertraulich","verschwiegenheit",
    "schülerdaten","schuelerdaten","personenbezogen","personenbezogene daten",
    "cloud","speicher","speichern","speicherung","verarbeitung","verarbeiten",
  ],
  Digitalisierung: ["handy","smartphone","iphone","mobiltelefon","ki","chatgpt","tiktok","whatsapp","messenger","internet"],
  Ordnungsmaßnahmen: ["ordnungsmaßnahme","strafarbeit","verweis","ausschluss","suspendierung","tadel"],
  Aufsicht: ["aufsicht","pause","haftung","unfall","sportunterricht","sport","exkursion","klassenfahrt"],
  "Fehlzeiten und Schulpflicht": ["fehlzeit","fehlen","unentschuldigt","schwänzen","schwaenzen","schulpflicht","attest","krank"],
  Prüfungen: ["prüfung","klausur","test","täuschung","spicken","abschreiben","betrug","note","bewertung","ungenügend"],
  Leistungsbewertung: ["note","zensur","bewertung","leistungsbewertung","ungenügend","versetzung"],
  "Eltern und Kommunikation": ["eltern","erziehungsberechtigte","sorgeberechtigte","elternabend","whatsapp"],
  Kindeswohl: [
    "mobbing","cybermobbing","gewalt","waffe","messer","drohung","misshandlung","gefährdung","kindeswohl","drogen","alkohol",
    "gemobbt","mobben","fertigmachen","fertiggemacht","ausgrenzen","ausgrenzung","ausgegrenzt","hänseln","hänselei","haenseln",
  ],
  Dienstrecht: ["kollege","kollegin","lehrerzimmer","schulleitung","dienstpflicht","konferenz","weisung"],
  Unterricht: ["unterricht","störung","stoerung","verhalten","klassenraum"],
};

const STOPWORDS = new Set([
  "ich","du","er","sie","es","wir","ihr","was","wer","wie","wo","warum","darf","kann","muss","soll",
  "ein","eine","einen","einem","einer","der","die","das","den","dem","des","und","oder","aber","mit","ohne",
  "in","im","an","am","auf","aus","zu","zum","zur","für","fuer","von","vom","bei","über","ueber","nach",
  "nicht","kein","keine","mein","dein","sein","ihre","ihr","ihrer","ihm","ihn","mich","dir","mir","sich","uns","euch",
  "jetzt","heute","gerade","mal","noch","wieder","schon","auch","nur","sehr","echt","bitte",
  "machen","tun","gehen","kommen","sagen","haben","sein","werden","habe","hat","hatte","bin","ist","sind","wird",
]);

const VAGUE_PHRASES = [
  "was darf ich","was soll ich","was mache ich","was tun","hilfe","was jetzt","ich brauche hilfe",
  "was kann ich tun","weiß nicht","weiss nicht",
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[äáàâ]/g, "a")
    .replace(/[öóòô]/g, "o")
    .replace(/[üúùû]/g, "u");
}

function tokenize(q: string): string[] {
  const words = q
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s-]/gi, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return Array.from(new Set(words));
}

function detectTopics(qLower: string): string[] {
  const hits: string[] = [];
  const qn = normalize(qLower);
  for (const [topic, kws] of Object.entries(TOPIC_MAP)) {
    if (kws.some((k) => qn.includes(normalize(k)))) hits.push(topic);
  }
  return hits;
}

function expandWithSynonyms(tokens: string[]): string[] {
  const set = new Set<string>(tokens);
  for (const t of tokens) for (const e of expandSearch(t)) set.add(e);
  return Array.from(set);
}

function haystack(c: CaseData): {
  title: string;
  category: string;
  facts: string;
  actions: string;
  keywords: string;
  legal: string;
} {
  return {
    title: normalize(c.title ?? ""),
    category: normalize(`${c.category ?? ""} ${c.subcategory ?? ""}`),
    facts: normalize(
      [c.shortDescription, c.shortAnswer, c.legalExplanation].filter(Boolean).join(" "),
    ),
    actions: normalize(
      [
        c.recommendation,
        (c.checklist ?? []).join(" "),
        (c.documentation ?? []).join(" "),
        c.practiceTip ?? "",
        Array.isArray(c.commonMistakesRaw)
          ? c.commonMistakesRaw.join(" ")
          : c.commonMistakesRaw ?? "",
      ]
        .filter(Boolean)
        .join(" "),
    ),
    keywords: normalize([...(c.tags ?? []), ...(c.searchTerms ?? [])].join(" ")),
    legal: normalize(
      [
        ...(c.legalBasis ?? []),
        ...((c.legalSections ?? []).map((s) =>
          [s.section_number, s.title, s.source?.name].filter(Boolean).join(" "),
        )),
      ].join(" "),
    ),
  };
}

function countHits(hay: string, term: string): number {
  if (!term) return 0;
  const t = normalize(term);
  if (t.length < 3) return 0;
  let idx = 0;
  let n = 0;
  while ((idx = hay.indexOf(t, idx)) !== -1) {
    n++;
    idx += t.length;
  }
  return n;
}

const WEIGHTS = {
  title: 6,
  category: 3,
  facts: 4,
  actions: 2,
  keywords: 5,
  legal: 3,
  topic: 2,
};

/**
 * Begriffs-Seltenheits-Gewichtung (IDF), Fund 2026-08-14: reine Trefferzahl
 * ohne Rücksicht auf Seltenheit lässt in diesem Corpus generische, aber
 * häufig auftauchende Wörter wie "prüfung" fast jeden Fall ähnlich stark
 * treffen - ein Fall, der zufällig VIELE Prüfungs-Erwähnungen enthält,
 * schlägt dadurch einen Fall, der thematisch exakt passt, aber die
 * Suchbegriffe seltener wiederholt. Klassische IDF-Glättung
 * (ln((1+N)/(1+df))+1) hält Vielfach-Vorkommende bei ~1 (kein Nachteil
 * gegenüber dem bisherigen Verhalten), boostet aber Begriffe, die nur in
 * wenigen Fällen vorkommen - genau die, die eine Anfrage tatsächlich von
 * anderen Fällen unterscheiden.
 */
function computeIdfWeights(cases: CaseData[], terms: string[]): Map<string, number> {
  const n = cases.length;
  const weights = new Map<string, number>();
  if (n === 0) return weights;
  for (const term of terms) {
    let df = 0;
    for (const c of cases) {
      const h = haystack(c);
      const hit =
        countHits(h.title, term) > 0 ||
        countHits(h.keywords, term) > 0 ||
        countHits(h.facts, term) > 0 ||
        countHits(h.category, term) > 0 ||
        countHits(h.actions, term) > 0 ||
        countHits(h.legal, term) > 0;
      if (hit) df++;
    }
    weights.set(term, Math.log((1 + n) / (1 + df)) + 1);
  }
  return weights;
}

function scoreCase(
  c: CaseData,
  terms: string[],
  topics: string[],
  idfWeights: Map<string, number>,
): { score: number; matched: string[]; reasons: string[] } {
  const h = haystack(c);
  const matched = new Set<string>();
  const reasons: string[] = [];
  let score = 0;

  for (const term of terms) {
    let termScore = 0;
    const inTitle = countHits(h.title, term);
    if (inTitle) { termScore += inTitle * WEIGHTS.title; matched.add(term); }
    const inKw = countHits(h.keywords, term);
    if (inKw) { termScore += inKw * WEIGHTS.keywords; matched.add(term); }
    const inFacts = countHits(h.facts, term);
    if (inFacts) { termScore += inFacts * WEIGHTS.facts; matched.add(term); }
    const inCat = countHits(h.category, term);
    if (inCat) { termScore += inCat * WEIGHTS.category; matched.add(term); }
    const inActions = countHits(h.actions, term);
    if (inActions) { termScore += inActions * WEIGHTS.actions; matched.add(term); }
    const inLegal = countHits(h.legal, term);
    if (inLegal) { termScore += inLegal * WEIGHTS.legal; matched.add(term); }
    score += termScore * (idfWeights.get(term) ?? 1);
  }

  // Themen-Signal (Kategorie exakt oder inhaltlich passend)
  for (const topic of topics) {
    const tn = normalize(topic);
    if (h.category.includes(tn) || h.title.includes(tn) || h.facts.includes(tn)) {
      score += WEIGHTS.topic * 3;
      reasons.push(`Thema „${topic}“ passt zur Kategorie des Falls.`);
    } else if (TOPIC_MAP[topic]?.some((k) => h.facts.includes(normalize(k)) || h.title.includes(normalize(k)))) {
      score += WEIGHTS.topic;
      reasons.push(`Thema „${topic}“ wird im Sachverhalt behandelt.`);
    }
  }

  // Begründungen aus Feldtreffern (kompakt).
  if (matched.size > 0) {
    const list = Array.from(matched).slice(0, 4).join(", ");
    reasons.unshift(`Treffer zu: ${list}`);
  }

  return { score, matched: Array.from(matched), reasons };
}

function isVague(q: string, tokens: string[]): boolean {
  const qn = q.trim().toLowerCase();
  if (qn.length < 6) return true;
  // Ein einzelnes, hinreichend langes/spezifisches Wort (z.B. "Werkzeugmaschine",
  // "Klassenfahrt") ist meist kein vages Anliegen - nur sehr kurze 1-Wort-
  // Anfragen sind es. Verhindert, dass eine eindeutige Kurzsuche in eine
  // Rückfrage statt ins Ergebnis läuft (Nutzerrückmeldung 2026-08-18).
  if (tokens.length === 1 && tokens[0].length >= 6) return false;
  if (tokens.length < 2) return true;
  return VAGUE_PHRASES.some((p) => qn.includes(p)) && tokens.length < 3;
}

function buildClarificationQuestions(topics: string[]): ClarificationQuestion[] {
  const themen: ClarificationOption[] = [
    { label: "Unterricht & Verhalten", value: "Unterricht" },
    { label: "Prüfungen & Noten", value: "Prüfungen" },
    { label: "Fehlzeiten & Schulpflicht", value: "Fehlzeiten und Schulpflicht" },
    { label: "Datenschutz", value: "Datenschutz" },
    { label: "Eltern & Kommunikation", value: "Eltern und Kommunikation" },
    { label: "Aufsicht & Sicherheit", value: "Aufsicht" },
    { label: "Dienstrecht & Kollegium", value: "Dienstrecht" },
    { label: "Etwas anderes", value: "" },
  ];
  const questions: ClarificationQuestion[] = [
    { key: "topic", question: "Worum geht es hauptsächlich?", options: themen },
  ];
  if (topics.length === 0) {
    questions.push({
      key: "actor",
      question: "Wer ist hauptsächlich betroffen?",
      options: [
        { label: "Schüler/in", value: "Schüler" },
        { label: "Eltern", value: "Eltern" },
        { label: "Lehrkraft", value: "Lehrkraft" },
        { label: "Schulleitung", value: "Schulleitung" },
        { label: "Kollegium", value: "Kollegium" },
      ],
    });
  }
  return questions;
}

/**
 * Fund 2026-08-20: `ratio = score / best` ist für den Treffer, der selbst
 * `best` ist, immer exakt 1 - das Label des Spitzenreiters hing dadurch
 * praktisch nur an einer niedrigen absoluten Score-Schwelle (8 bzw. 15).
 * Ein einzelner generischer Begriff (z. B. "unterricht", der in fast jedem
 * Fall vorkommt) konnte durch Mehrfachtreffer über mehrere Felder hinweg
 * diese Schwelle allein erreichen und wurde dann als "Hohe Übereinstimmung"
 * ausgegeben, obwohl inhaltlich nichts Passendes vorlag. Zusätzlich zur
 * Score-Schwelle wird jetzt verlangt, dass mehrere UNTERSCHIEDLICHE
 * Suchbegriffe zum Treffer beigetragen haben - ein einzelnes generisches
 * Wort reicht dann nicht mehr für eine hohe Kennzeichnung.
 */
function confidenceLabel(
  score: number,
  best: number,
  matchedTermCount: number,
): SearchResult["confidenceLabel"] {
  const ratio = best > 0 ? score / best : 0;
  if (ratio >= 0.9 && score >= 15 && matchedTermCount >= 3) return "sehr-hoch";
  if (ratio >= 0.6 && score >= 8 && matchedTermCount >= 2) return "hoch";
  return "moeglich";
}

export function searchPublishedPracticeCases(
  query: string,
  cases: CaseData[],
  options?: { limit?: number },
): IntelligentSearchResponse {
  const limit = options?.limit ?? 5;
  const q = (query ?? "").trim();
  const warnings: string[] = [];

  if (!q) {
    return {
      query: q,
      interpretedQuery: "",
      detectedTopics: [],
      detectedKeywords: [],
      results: [],
      bestMatch: null,
      alternatives: [],
      confidence: 0,
      clarificationNeeded: false,
      clarificationQuestions: [],
      warnings,
    };
  }

  const tokens = tokenize(q);
  const topics = detectTopics(q);
  const terms = expandWithSynonyms(tokens);
  const vague = isVague(q, tokens);

  // Kandidaten scoren
  const idfWeights = computeIdfWeights(cases, terms);
  const scored = cases
    .map((c) => ({ case: c, ...scoreCase(c, terms, topics, idfWeights) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      query: q,
      interpretedQuery: terms.join(" "),
      detectedTopics: topics,
      detectedKeywords: tokens,
      results: [],
      bestMatch: null,
      alternatives: [],
      confidence: 0,
      clarificationNeeded: vague,
      clarificationQuestions: vague ? buildClarificationQuestions(topics) : [],
      warnings,
    };
  }

  const best = scored[0].score;
  const results: SearchResult[] = scored.slice(0, limit).map((r) => ({
    case: r.case,
    relevanceScore: r.score,
    confidenceLabel: confidenceLabel(r.score, best, r.matched.length),
    matchedTerms: r.matched,
    matchedTopics: topics,
    matchReasons: r.reasons,
  }));

  const bestMatch = results[0];
  const alternatives = results.slice(1);

  // Konfidenz auf 0..1 mappen (heuristisch)
  const confidence = Math.min(1, best / 40);

  // Bei sehr niedrigem Top-Score und vager Anfrage: Rückfragen anbieten.
  const clarificationNeeded = vague && bestMatch.confidenceLabel === "moeglich";

  return {
    query: q,
    interpretedQuery: terms.join(" "),
    detectedTopics: topics,
    detectedKeywords: tokens,
    results,
    bestMatch,
    alternatives,
    confidence,
    clarificationNeeded,
    clarificationQuestions: clarificationNeeded ? buildClarificationQuestions(topics) : [],
    warnings,
  };
}

export function confidenceLabelText(l: SearchResult["confidenceLabel"]): string {
  return l === "sehr-hoch"
    ? "Sehr hohe Übereinstimmung"
    : l === "hoch"
      ? "Hohe Übereinstimmung"
      : "Möglicherweise passend";
}
