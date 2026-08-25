/**
 * Zentrale Hybrid-Ranking-Gewichtungen und Score-Kombination.
 * Nicht in UI-Komponenten duplizieren.
 *
 * Neue Signale: Intent / Beteiligte / Situation / Handlung
 * (via searchSignals) plus negativeMismatchPenalty für fachlich
 * falsche semantische Treffer.
 */

import type { CaseData } from "@/data/cases";
import type { SearchResult } from "@/lib/intelligentSearch";
import {
  extractCaseSignals,
  extractQuerySignals,
  computeSignalScores,
  type SignalScores,
  type CaseSignals,
} from "@/lib/searchSignals";

export type HybridWeights = {
  semantic: number;
  structured: number;
  topics: number;
  signals: number; // Intent/Situation/Action/Participant
  legal: number;
  quality: number;
};

/**
 * Referenz-Gewichtung (Variante A). Weitere Varianten werden im
 * Sweep über /admin/suchtest getestet.
 *
 * Anpassung 2026-08-18 (Nutzerrückmeldung: exakte Suchbegriffe fanden den
 * passenden Fall teils nicht): legal/quality sind reine Vollständigkeits-
 * Boni des Falls selbst - unabhängig davon, ob er zur Anfrage passt. Bei
 * 0.1+0.1 konnten sie das Ranking bei knappen Score-Unterschieden stärker
 * verzerren als der tatsächliche Stichwort-Treffer. Gewicht auf structured
 * (den direkten, für Nutzer:innen nachvollziehbaren Wortabgleich) verlagert.
 */
export const HYBRID_WEIGHTS: HybridWeights = {
  semantic: 0.5,
  structured: 0.32,
  topics: 0.1,
  signals: 0.0,
  legal: 0.05,
  quality: 0.03,
};

/** Vordefinierte Gewichtungsvarianten für den Sweep. */
export const HYBRID_WEIGHT_VARIANTS: Array<{ id: string; label: string; weights: HybridWeights }> = [
  { id: "A", label: "A – bisherige Referenz", weights: { semantic: 0.50, structured: 0.20, topics: 0.10, signals: 0.00, legal: 0.10, quality: 0.10 } },
  { id: "B", label: "B – Signale + reduziert",  weights: { semantic: 0.40, structured: 0.20, topics: 0.15, signals: 0.20, legal: 0.05, quality: 0.00 } },
  { id: "C", label: "C – signalstark",           weights: { semantic: 0.35, structured: 0.20, topics: 0.20, signals: 0.25, legal: 0.00, quality: 0.00 } },
  { id: "D", label: "D – ausgewogen",            weights: { semantic: 0.40, structured: 0.15, topics: 0.15, signals: 0.25, legal: 0.00, quality: 0.05 } },
  { id: "E", label: "E – signalmaximiert",       weights: { semantic: 0.30, structured: 0.20, topics: 0.20, signals: 0.30, legal: 0.00, quality: 0.00 } },
];

export type SemanticHit = { caseId: string; similarity: number };

export type HybridCandidate = {
  case: CaseData;
  semantic: number;      // 0..1
  structured: number;    // 0..~1.35 (oberhalb der Sättigungsschwelle asymptotisch, siehe normalizeStructuredScore)
  topics: number;        // 0..1
  legal: number;         // 0..1
  quality: number;       // 0..1
  intentScore: number;
  participantScore: number;
  situationScore: number;
  actionScore: number;
  signalScore: number;
  negativeMismatchPenalty: number;
  baseScore: number;     // gewichteter Score vor Penalty (0..1)
  finalScore: number;    // 0..1
  matchedTerms: string[];
  matchedTopics: string[];
  matchReasons: string[];
  penaltyReasons: string[];
  confidenceLabel: SearchResult["confidenceLabel"];
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Fund 2026-08-20: reale Rohwerte aus searchPublishedPracticeCases liegen
 * für nur mäßig passende Treffer bereits bei 200-260 (IDF-Gewichtung +
 * mehrere Feldtreffer je Term), während die alte Deckelung bei 40 lag -
 * dadurch sättigte der structured-Score praktisch immer bei 1.0 und verlor
 * jede Differenzierung. Ein zu generischer Treffer (z. B. nur "schüler",
 * "unterricht", "regelmäßig") und ein inhaltlich präziser Treffer waren im
 * structured-Score ununterscheidbar. 300 ist so gewählt, dass eindeutig gute
 * Treffer (Rohwert 450-950 in Stichproben) weiterhin nahe 1.0 sättigen,
 * während schwächere, nur zufällig überlappende Treffer (Rohwert ~200-260)
 * spürbar darunter bleiben und damit Raum für die Handlungs-/Situations-
 * Mismatch-Penalty aus computeSignalScores() lassen, statt von ihr
 * überstimmt zu werden.
 */
function normalizeStructuredScore(score: number): number {
  const CEILING = 300;
  if (score <= CEILING) return clamp01(score / CEILING);
  // Fund 2026-08-25 (Nutzerrückmeldung: exakter Titeltreffer landete nicht auf
  // Platz 1): die harte Kappung bei 1.0 machte JEDEN Rohwert ab 300 score-
  // identisch - ein Treffer mit Rohwert 493 (Zielfall, exakter Titeltreffer)
  // und einer mit 567 (bloß thematisch ähnlicher Fall) waren im dominanten
  // structured-Signal (Gewicht 0.32) dadurch ununterscheidbar, sobald die
  // semantische Suche ausfiel (siehe fetchSemanticHits-Fehlerpfad) - das
  // Ranking hing dann am Rauschen der viel kleineren übrigen Gewichte statt
  // am eigentlich stärksten Signal. Oberhalb der Sättigungsschwelle bleibt
  // die Kurve streng monoton (mit abnehmendem Grenznutzen) statt hart zu
  // kappen; Rohwerte 0-300 verhalten sich exakt wie zuvor.
  const extra = 0.35 * (1 - Math.exp(-(score - CEILING) / 350));
  return 1 + extra;
}

function normalizeTopic(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[äáàâ]/g, "a")
    .replace(/[öóòô]/g, "o")
    .replace(/[üúùû]/g, "u")
    .trim();
}

/**
 * Themen-Seltenheits-Gewichtung (IDF), analog zur Begriffs-IDF in
 * intelligentSearch.ts (Fund 2026-08-14): ein Kategorie-Alignment auf ein
 * riesiges Thema wie "Prüfungen" (in diesem Corpus sehr viele Fälle)
 * unterscheidet Fälle kaum voneinander, während ein Alignment auf ein
 * seltenes Thema (wenige Fälle dieser Kategorie) ein starkes, treffsicheres
 * Signal ist. Gleiche geglättete Formel wie in intelligentSearch.ts, hier
 * auf Kategorie-Häufigkeit statt Begriffs-Häufigkeit angewendet.
 */
function computeTopicIdf(allCases: CaseData[], topics: string[]): Map<string, number> {
  const n = allCases.length;
  const weights = new Map<string, number>();
  if (n === 0) return weights;
  const catNorms = allCases.map((c) => normalizeTopic(c.category ?? ""));
  for (const topic of topics) {
    const tn = normalizeTopic(topic);
    if (!tn) continue;
    const df = catNorms.filter((catN) => catN && (catN === tn || catN.includes(tn) || tn.includes(catN))).length;
    weights.set(topic, Math.log((1 + n) / (1 + df)) + 1);
  }
  return weights;
}

/**
 * Themenscore basiert auf der Anzahl erkannter Themen und einem
 * allgemeingültigen Kategorie-Alignment-Bonus: Wenn die Kategorie des
 * Falls einem der in der Query erkannten Themen entspricht, ist der Fall
 * thematisch stärker gebunden. Der Alignment-Bonus wird zusätzlich mit der
 * Themen-IDF gewichtet, damit seltene, treffsichere Themen stärker zählen
 * als riesige Standardkategorien.
 */
function topicsScore(r: SearchResult, c: CaseData, topicIdf: Map<string, number>, totalCases: number): number {
  if (r.matchedTopics.length === 0) return 0;
  const base = 0.3 + 0.15 * Math.min(3, r.matchedTopics.length);
  const catN = normalizeTopic(c.category ?? "");
  const alignedTopic = catN
    ? r.matchedTopics.find((t) => {
        const tn = normalizeTopic(t);
        return tn && (catN === tn || catN.includes(tn) || tn.includes(catN));
      })
    : undefined;
  if (!alignedTopic) return clamp01(base);

  // idf liegt zwischen 1 (Thema deckt praktisch den ganzen Corpus ab) und
  // ln(N+1)+1 (Thema kommt so gut wie nirgends sonst vor). Auf [0,1]
  // normalisieren und den Alignment-Bonus zwischen 0.20 (häufigstes Thema -
  // etwas weniger als der bisherige feste Bonus 0.35) und 0.50 (seltenstes
  // Thema - deutlich mehr als vorher) spreizen, statt ihn wie bisher pauschal
  // auf 0.35 zu setzen.
  const idf = topicIdf.get(alignedTopic) ?? 1;
  const maxIdf = Math.log(1 + totalCases) + 1;
  const t = maxIdf > 1 ? clamp01((idf - 1) / (maxIdf - 1)) : 0;
  const bonus = 0.2 + 0.3 * t;
  return clamp01(base + bonus);
}

function legalContextScore(c: CaseData): number {
  const n = (c.legalSections ?? []).length + (c.legalBasis ?? []).length;
  if (n <= 0) return 0.2;
  if (n === 1) return 0.55;
  if (n === 2) return 0.8;
  return 1;
}

function qualityScore(c: CaseData): number {
  let s = 0.4;
  if (c.shortAnswer) s += 0.15;
  if (c.recommendation) s += 0.1;
  if (c.checklist && c.checklist.length >= 3) s += 0.15;
  if (c.documentation && c.documentation.length >= 2) s += 0.1;
  if ((c.legalSections ?? []).length > 0) s += 0.1;
  return clamp01(s);
}

/**
 * Fund 2026-08-18 (Nutzerrückmeldung): exakte Suchbegriffe eines Falls
 * fanden diesen teils nicht, weil semantische/generische Scores das
 * Ranking überstimmen konnten. Sicherheitsnetz: kommen alle bedeutungs-
 * tragenden Suchwörter (>= 5 Zeichen) wortwörtlich im Falltitel vor, wird
 * der Fall unabhängig vom berechneten Score ganz nach oben gesetzt. Ein
 * einzelnes Wort reicht bewusst nicht (zu unspezifisch), erst ab zwei
 * Wörtern gilt der Titel als eindeutig getroffen.
 */
function hasFullTitleCoverage(query: string, title: string): boolean {
  if (!query || !title) return false;
  const qTokens = normalizeTopic(query)
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5);
  if (qTokens.length < 2) return false;
  const normTitle = normalizeTopic(title).replace(/[^a-z0-9\s]/gi, " ");
  return qTokens.every((w) => normTitle.includes(w));
}

function labelFromScore(final: number): SearchResult["confidenceLabel"] {
  if (final >= 0.72) return "sehr-hoch";
  if (final >= 0.5) return "hoch";
  return "moeglich";
}

export type CombineOptions = {
  weights?: HybridWeights;
  /** Nutzerfrage — für Signal-Extraktion. Bei "" werden Signal-Scores 0. */
  query?: string;
  /** Wenn true, negativeMismatchPenalty vom Basisscore abziehen. */
  applyNegativePenalty?: boolean;
};

export function combineHybrid(
  structuredResults: SearchResult[],
  semanticHits: SemanticHit[],
  allCases: CaseData[],
  options?: CombineOptions,
): HybridCandidate[] {
  const weights = options?.weights ?? HYBRID_WEIGHTS;
  const applyNeg = options?.applyNegativePenalty !== false; // default true
  const query = (options?.query ?? "").trim();
  const querySignals: CaseSignals | null = query ? extractQuerySignals(query) : null;

  const byId = new Map<string, CaseData>();
  for (const c of allCases) byId.set(c.id, c);

  const semById = new Map<string, number>();
  for (const h of semanticHits) semById.set(h.caseId, clamp01(h.similarity));

  const structById = new Map<string, SearchResult>();
  for (const r of structuredResults) structById.set(r.case.id, r);

  // matchedTopics ist pro Suchlauf für alle Ergebnisse identisch (kommt aus
  // derselben detectTopics()-Erkennung in intelligentSearch.ts) - einmal
  // sammeln reicht, statt es pro Kandidat neu zu bilden.
  const allTopics = [...new Set(structuredResults.flatMap((r) => r.matchedTopics))];
  const topicIdf = computeTopicIdf(allCases, allTopics);

  const ids = new Set<string>([...structById.keys(), ...semById.keys()]);
  const out: HybridCandidate[] = [];

  for (const id of ids) {
    const c = byId.get(id);
    if (!c) continue;

    const r = structById.get(id);
    const semantic = semById.get(id) ?? 0;
    const structured = r ? normalizeStructuredScore(r.relevanceScore) : 0;
    const topics = r ? topicsScore(r, c, topicIdf, allCases.length) : 0;
    const legal = legalContextScore(c);
    const quality = qualityScore(c);

    let sig: SignalScores = {
      intentScore: 0, participantScore: 0, situationScore: 0, actionScore: 0,
      signalScore: 0, negativeMismatchPenalty: 0,
      matchedIntents: [], matchedSituations: [], matchedActions: [], matchedParticipants: [],
      penaltyReasons: [],
    };
    if (querySignals) {
      sig = computeSignalScores(querySignals, extractCaseSignals(c));
    }

    const baseScore = clamp01(
      weights.semantic * semantic +
        weights.structured * structured +
        weights.topics * topics +
        weights.signals * sig.signalScore +
        weights.legal * legal +
        weights.quality * quality,
    );

    const penalty = applyNeg ? sig.negativeMismatchPenalty : 0;
    const finalScore = clamp01(baseScore - penalty);

    const reasons: string[] = [];
    if (semantic >= 0.6) reasons.push("Semantische Nähe zur Formulierung");
    else if (semantic >= 0.35) reasons.push("Themennähe zur Formulierung");
    if (sig.matchedSituations.length) reasons.push(`Situation passt: ${sig.matchedSituations.join(", ")}`);
    if (sig.matchedActions.length) reasons.push(`Handlung passt: ${sig.matchedActions.join(", ")}`);
    if (r?.matchReasons?.length) reasons.push(...r.matchReasons.slice(0, 2));
    if (legal >= 0.8 && weights.legal > 0) reasons.push("Mehrere passende Rechtsgrundlagen hinterlegt");

    if (hasFullTitleCoverage(query, c.title ?? "")) {
      reasons.unshift("Alle Suchbegriffe kommen wortwörtlich im Falltitel vor");
    }

    out.push({
      case: c,
      semantic,
      structured,
      topics,
      legal,
      quality,
      intentScore: sig.intentScore,
      participantScore: sig.participantScore,
      situationScore: sig.situationScore,
      actionScore: sig.actionScore,
      signalScore: sig.signalScore,
      negativeMismatchPenalty: penalty,
      baseScore,
      finalScore,
      matchedTerms: r?.matchedTerms ?? [],
      matchedTopics: r?.matchedTopics ?? [],
      matchReasons: reasons.length ? reasons : ["Bester verfügbarer Treffer aus der Wissensbasis"],
      penaltyReasons: sig.penaltyReasons,
      confidenceLabel: labelFromScore(finalScore),
    });
  }

  const titleHitIds = new Set(
    out.filter((cand) => hasFullTitleCoverage(query, cand.case.title ?? "")).map((cand) => cand.case.id),
  );

  out.sort((a, b) => {
    const aHit = titleHitIds.has(a.case.id);
    const bHit = titleHitIds.has(b.case.id);
    if (aHit !== bHit) return aHit ? -1 : 1;
    return b.finalScore - a.finalScore;
  });
  return out;
}
