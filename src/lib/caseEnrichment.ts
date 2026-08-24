import { useEffect, useState } from "react";
import type { CaseData } from "@/data/cases";
import { CASES } from "@/data/cases";

/* ------------------------------------------------------------------ */
/* Deterministische Metadaten pro Fall                                */
/* ------------------------------------------------------------------ */

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export interface CaseMeta {
  duration: string;
  difficulty: "Einfach" | "Mittel" | "Anspruchsvoll";
  updated: string;
}

export function getCaseMeta(c: CaseData): CaseMeta {
  const h = hash(c.id);
  const durations = ["3 Min.", "5 Min.", "8 Min.", "10 Min.", "15 Min."];
  const duration =
    c.ampel === "rot" ? "10–15 Min." : c.ampel === "gelb" ? durations[2 + (h % 2)] : durations[h % 3];
  const difficulty: CaseMeta["difficulty"] =
    c.ampel === "rot" ? "Anspruchsvoll" : c.ampel === "gelb" ? "Mittel" : "Einfach";
  const dayOffset = h % 45;
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  const updated = d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  return { duration, difficulty, updated };
}

/* ------------------------------------------------------------------ */
/* Beispielsachverhalt                                                */
/* ------------------------------------------------------------------ */

export function getExampleScenario(c: CaseData): string {
  const subject = c.subcategory || c.category;
  const time = ["Mittwoch, 3. Stunde", "Dienstag, 5. Stunde", "Freitag, 1. Stunde", "Montag, 2. Stunde"][
    hash(c.id) % 4
  ];
  return `${time} im Klassenraum A2.14: In einer Unterrichtsstunde des Bildungsgangs Industriemechanik fällt Ihnen auf, dass es zu einem Vorfall im Bereich „${subject}“ kommt. Zwei bis drei Schüler:innen sind beteiligt, der reguläre Unterrichtsablauf ist beeinträchtigt. Sie müssen kurzfristig entscheiden, ob eine unmittelbare Reaktion erforderlich ist, wie Sie dokumentieren und wen Sie ggf. informieren. Der Fall „${c.title}“ zeigt genau, wie Sie in dieser Situation rechtssicher vorgehen.`;
}

/* ------------------------------------------------------------------ */
/* Text-/Listen-Normalisierung                                        */
/* ------------------------------------------------------------------ */

/**
 * Wandelt einen redaktionellen Fließtext oder eine bereits gepflegte
 * Liste in saubere Bulletpoints um. Erkennt:
 * - Array-Werte (direkt übernommen)
 * - Zeilenumbrüche
 * - Listenzeichen (-, *, •, –, —)
 * - Nummerierungen (1., 1))
 * - Fällt auf Satztrennung zurück, falls kein Bullet-Format erkennbar.
 */
function toBullets(input: string[] | string | null | undefined): string[] {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : [input];
  const items: string[] = [];
  for (const entry of raw) {
    const s = String(entry ?? "").trim();
    if (!s) continue;
    const lines = s.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1 || /^\s*([-*•–—]|\d+[.)])\s+/.test(s)) {
      for (const l of lines) {
        const cleaned = l.replace(/^\s*([-*•–—]|\d+[.)])\s+/, "").trim();
        if (cleaned) items.push(cleaned);
      }
    } else {
      // Ein einzelner Satz/Absatz — als einzelner Punkt übernehmen.
      items.push(s);
    }
  }
  // Duplikate entfernen, Reihenfolge erhalten.
  const seen = new Set<string>();
  return items.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}

/* ------------------------------------------------------------------ */
/* Ebenen-Label-Präfix ("[Rechtlich erforderlich] Text")               */
/* Fund 2026-08-20: die KI kennzeichnet einzelne Do's/Don'ts/Checklist-  */
/* Punkte mit einem Präfix, um "rechtlich vorgegeben" von "organisatorisch */
/* empfohlen" sichtbar zu trennen, ohne das DB-Schema zu ändern. Ältere  */
/* Fälle ohne Präfix bekommen label: null (kein Badge, unverändert       */
/* dargestellt) statt kaputt auszusehen.                                */
/* ------------------------------------------------------------------ */

export interface TieredItem {
  label: string | null;
  text: string;
}

export function parseTieredItem(raw: string): TieredItem {
  const m = /^\[([^\]]+)\]\s*(.+)$/s.exec(raw.trim());
  if (!m) return { label: null, text: raw.trim() };
  return { label: m[1].trim(), text: m[2].trim() };
}

/* ------------------------------------------------------------------ */
/* Häufige Fehler (Don'ts)                                            */
/* Quelle: ausschließlich common_mistakes aus dem Core Builder.        */
/* ------------------------------------------------------------------ */

export function getCommonMistakesTiered(c: CaseData): TieredItem[] {
  // Bevorzugt Rohwert (Array oder Text), fällt auf bereits normalisiertes
  // `risks` (string[]) zurück – beide stammen aus common_mistakes.
  const fromDb = toBullets(c.commonMistakesRaw ?? c.risks ?? null);
  return fromDb.map(parseTieredItem);
}

export function getCommonMistakes(c: CaseData): string[] {
  return getCommonMistakesTiered(c).map((t) => t.text);
}

/* ------------------------------------------------------------------ */
/* Praxistipps (Do's)                                                 */
/* Quelle: ausschließlich practice_tip aus dem Core Builder.          */
/* ------------------------------------------------------------------ */

export function getPracticeTipsTiered(c: CaseData): TieredItem[] {
  return toBullets(c.practiceTip ?? null).map(parseTieredItem);
}

export function getPracticeTips(c: CaseData): string[] {
  return getPracticeTipsTiered(c).map((t) => t.text);
}

/* ------------------------------------------------------------------ */
/* Checkliste                                                          */
/* Quelle: checklist aus dem Core Builder.                             */
/* ------------------------------------------------------------------ */

export function getChecklistTiered(c: CaseData): TieredItem[] {
  return (c.checklist ?? []).map(parseTieredItem);
}

export function getChecklist(c: CaseData): string[] {
  return getChecklistTiered(c).map((t) => t.text);
}

/* ------------------------------------------------------------------ */
/* Dokumentation                                                       */
/* Quelle: documentation aus dem Core Builder.                        */
/* ------------------------------------------------------------------ */

export function getDocumentationTiered(c: CaseData): TieredItem[] {
  return toBullets(c.documentation ?? null).map(parseTieredItem);
}

export function getDocumentation(c: CaseData): string[] {
  return getDocumentationTiered(c).map((t) => t.text);
}

/* ------------------------------------------------------------------ */
/* Rechtlich vorgegeben vs. rechtliche Einordnung                      */
/* Quelle: legal_explanation, per fest benannten Markern getrennt.     */
/* Fehlen die Marker (ältere Fälle), landet der gesamte Text unter     */
/* `vorgegeben` - keine Information geht verloren.                     */
/* ------------------------------------------------------------------ */

export interface LegalExplanationParts {
  vorgegeben: string;
  einordnung: string;
}

export function splitLegalExplanation(text: string | null | undefined): LegalExplanationParts {
  const t = (text ?? "").trim();
  if (!t) return { vorgegeben: "", einordnung: "" };
  const m = /^RECHTLICH VORGEGEBEN:\s*(.*?)\s*RECHTLICHE EINORDNUNG:\s*(.*)$/s.exec(t);
  if (!m) return { vorgegeben: t, einordnung: "" };
  return { vorgegeben: m[1].trim(), einordnung: m[2].trim() };
}


/* ------------------------------------------------------------------ */
/* Häufige Fragen                                                     */
/* ------------------------------------------------------------------ */

export interface FAQ {
  q: string;
  a: string;
}

export function getFAQs(c: CaseData): FAQ[] {
  const t = c.title.toLowerCase();
  const sub = c.subcategory || c.category;
  return [
    {
      q: `Muss ich in diesem Fall („${c.title}“) sofort die Schulleitung informieren?`,
      a:
        c.ampel === "rot"
          ? "Ja. Bei roter Ampel ist eine unverzügliche Information an die Schulleitung zwingend erforderlich, bevor weitere Maßnahmen ergriffen werden."
          : c.ampel === "gelb"
            ? "Nicht zwingend sofort. Rücksprache mit Klassenleitung, Bildungsgangleitung oder Schulleitung ist jedoch empfohlen, insbesondere bei Wiederholung."
            : "Nein, nicht in jedem Fall. Sie handeln pädagogisch eigenverantwortlich und informieren nur bei Bedarf.",
    },
    {
      q: "Welche Vorlage sollte ich für die Dokumentation verwenden?",
      a: `Empfohlen sind ${c.applicableTemplates.join(", ") || "Aktennotiz oder Gesprächsprotokoll"}. Diese Vorlagen finden Sie direkt unter „Dokumente“ am Ende dieser Fallakte.`,
    },
    {
      q: "Wie ausführlich muss die Dokumentation sein?",
      a: "So kurz wie möglich, so ausführlich wie nötig. Wichtig sind Datum, Uhrzeit, Ort, Beteiligte, konkrete Beobachtung (ohne Wertung) und ergriffene Maßnahme mit Begründung.",
    },
    {
      q: "Ist eine Anhörung der betroffenen Schüler:in erforderlich?",
      a: "Vor jeder belastenden Entscheidung ist rechtliches Gehör nach § 28 VwVfG NRW zu gewähren. Bei rein pädagogischen Maßnahmen genügt in der Regel ein sachliches Gespräch.",
    },
    {
      q: "Darf ich Eltern oder den Ausbildungsbetrieb informieren?",
      a: "Bei Minderjährigen sind die Eltern in der Regel zu informieren. Bei Auszubildenden ist eine Information des Betriebs möglich, wenn die Ausbildung berührt ist. Beachten Sie den Datenschutz.",
    },
    {
      q: `Was passiert, wenn ich im Fall „${sub}“ nichts unternehme?`,
      a: "Fehlende Reaktion kann als Duldung gewertet werden und schwächt spätere Maßnahmen. Zumindest eine kurze schriftliche Notiz sollte immer erfolgen.",
    },
    {
      q: "Wie wahre ich die Verhältnismäßigkeit?",
      a: "Prüfen Sie: geeignet, erforderlich, angemessen. Mildeste wirksame Maßnahme wählen und die Begründung nachvollziehbar dokumentieren.",
    },
    {
      q: "Welche Rechte hat die betroffene Schüler:in?",
      a: "Recht auf Anhörung, auf sachliche und diskriminierungsfreie Behandlung, auf Datenschutz sowie – bei belastenden Maßnahmen – auf ein formal korrektes Verfahren. Die konkrete Rechtsgrundlage ergibt sich aus den in dieser Fallakte hinterlegten Rechtsabschnitten.",
    },
    {
      q: "Wer ist am BKO für den Fall zuständig?",
      a: `Primäre Zuständigkeit: ${c.responsibleParty}. In Zweifelsfällen wenden Sie sich an die Bildungsgangleitung oder die Schulleitung.`,
    },
    {
      q: "Wie gehe ich mit sensiblen Daten um?",
      a: "Personenbezogene Daten ausschließlich über dienstliche Kommunikationswege verarbeiten, Zugriff auf berechtigte Personen begrenzen und nach Ablauf der Aufbewahrungsfrist löschen (DSGVO, DSG NRW).",
    },
    {
      q: "Kann eine solche Maßnahme rechtlich angefochten werden?",
      a: "Ja, belastende Verwaltungsakte sind widerspruchs- und klagefähig. Deshalb sind Form, Anhörung, Begründung und Verhältnismäßigkeit strikt einzuhalten.",
    },
    {
      q: `Wie unterscheidet sich der Fall von „${t.includes("wiederholung") ? "einer erstmaligen Situation" : "einer wiederholten Situation"}“?`,
      a: "Bei Wiederholung steigt die Anforderung an Dokumentation, Anhörung und Einbindung weiterer Stellen. Eine erstmalige Situation kann in der Regel pädagogisch gelöst werden.",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Entscheidungsbaum                                                  */
/* ------------------------------------------------------------------ */

export interface TreeStep {
  question: string;
  options: { label: string; next?: string; recommendation?: "A" | "B" | "C" }[];
}

export function getDecisionTree(c: CaseData): { steps: Record<string, TreeStep>; start: string } {
  const sub = c.subcategory || c.category;
  return {
    start: "q1",
    steps: {
      q1: {
        question: `Ist der reguläre Unterrichtsablauf durch „${sub}“ akut gestört?`,
        options: [
          { label: "Ja – deutliche Störung", next: "q2" },
          { label: "Nein – Situation ist beobachtbar, aber nicht störend", next: "q3" },
        ],
      },
      q2: {
        question: "Hat die Schüler:in Ihre erste pädagogische Aufforderung befolgt?",
        options: [
          { label: "Ja – Situation ist beruhigt", recommendation: "A" },
          { label: "Nein – Verhalten setzt sich fort", next: "q4" },
        ],
      },
      q3: {
        question: "Handelt es sich um einen Wiederholungsfall bei derselben Person?",
        options: [
          { label: "Nein – erstmaliges Vorkommen", recommendation: "A" },
          { label: "Ja – bereits mehrfach beobachtet", recommendation: "B" },
        ],
      },
      q4: {
        question:
          c.ampel === "rot"
            ? "Besteht eine unmittelbare Gefahr für Personen oder für einen geschützten Rechtsgüterbereich?"
            : "Sind Dritte (weitere Schüler:innen, Zeug:innen) unmittelbar mitbetroffen?",
        options: [
          { label: "Ja", recommendation: "C" },
          { label: "Nein", recommendation: "B" },
        ],
      },
    },
  };
}

export function getRecommendationByPath(c: CaseData, key: "A" | "B" | "C") {
  if (key === "A") {
    return {
      title: "Empfehlung A · Pädagogisch eigenständig lösen",
      color: "gruen" as const,
      steps: [
        "Situation ruhig annehmen und kurz einordnen.",
        "Sachliches Kurzgespräch mit der Schüler:in.",
        "Verhalten und getroffene Vereinbarung im Klassenbuch notieren.",
        "Beobachten, ob sich die Situation nachhaltig entspannt.",
        "Kein weiterer Handlungsbedarf – keine förmliche Doku nötig.",
      ],
    };
  }
  if (key === "B") {
    return {
      title: "Empfehlung B · Sorgfalt und Dokumentation",
      color: "gelb" as const,
      steps: [
        "Sofortmaßnahme ergreifen und sachlich begründen.",
        "Aktennotiz mit Beobachtung (ohne Wertung) anlegen.",
        "Klassenleitung / Bildungsgangleitung informieren.",
        "Anhörung der Betroffenen dokumentieren (§ 28 VwVfG NRW).",
        "Eltern / Ausbildungsbetrieb schriftlich informieren.",
      ],
    };
  }
  return {
    title: "Empfehlung C · Sofort Schulleitung einbeziehen",
    color: "rot" as const,
    steps: [
      "Unmittelbare Gefährdung abwenden, Situation deeskalieren.",
      "Schulleitung sofort mündlich informieren.",
      "Vorfallprotokoll unverzüglich erstellen.",
      "Betroffene und Zeug:innen namentlich sichern.",
      "Weitere Schritte (Anhörung, Meldung) ausschließlich in Abstimmung mit der Schulleitung.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Verwandte Fälle (mindestens 8)                                     */
/* ------------------------------------------------------------------ */

export function getRelatedCases(c: CaseData, min = 8): CaseData[] {
  const seen = new Set<string>();
  const out: CaseData[] = [];
  for (const id of c.relatedCases) {
    const r = CASES.find((x) => x.id === id);
    if (r && !seen.has(r.id) && r.id !== c.id) {
      seen.add(r.id);
      out.push(r);
    }
  }
  if (out.length < min) {
    for (const r of CASES) {
      if (out.length >= min) break;
      if (r.id === c.id || seen.has(r.id)) continue;
      if (r.category === c.category) {
        seen.add(r.id);
        out.push(r);
      }
    }
  }
  if (out.length < min) {
    for (const r of CASES) {
      if (out.length >= min) break;
      if (r.id === c.id || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out.slice(0, min);
}

/* ------------------------------------------------------------------ */
/* Rechtsgrundlagen als Karten                                        */
/* ------------------------------------------------------------------ */

export interface LawCard {
  gesetz: string;
  paragraph: string;
  kurz: string;
  status: "aktiv" | "prüfen";
}

const LAW_INFO: Record<string, { gesetz: string; kurz: string }> = {
  "§ 53 SchulG NRW": {
    gesetz: "Schulgesetz NRW",
    kurz: "Regelung erzieherischer Einwirkungen und Ordnungsmaßnahmen an Schulen.",
  },
  "§ 42 SchulG NRW": {
    gesetz: "Schulgesetz NRW",
    kurz: "Rechte und Pflichten von Schüler:innen im Schulverhältnis.",
  },
  "§ 28 VwVfG NRW": {
    gesetz: "Verwaltungsverfahrensgesetz NRW",
    kurz: "Anhörungspflicht vor Erlass belastender Verwaltungsakte.",
  },
  "APO-BK": {
    gesetz: "Ausbildungs- und Prüfungsordnung Berufskolleg",
    kurz: "Ordnungsrahmen für alle Bildungsgänge am Berufskolleg.",
  },
  "Hausordnung BKO": {
    gesetz: "Hausordnung Berufskolleg Olsberg",
    kurz: "Verbindliche Regeln zum Verhalten und Umgang am BKO.",
  },
  "DSGVO": {
    gesetz: "Datenschutz-Grundverordnung",
    kurz: "Rechtmäßigkeit der Verarbeitung personenbezogener Daten.",
  },
  "DSG NRW": {
    gesetz: "Datenschutzgesetz Nordrhein-Westfalen",
    kurz: "Landesspezifische Datenschutzvorgaben für Schulen.",
  },
  "§ 8a SGB VIII": {
    gesetz: "Sozialgesetzbuch VIII",
    kurz: "Schutzauftrag bei Kindeswohlgefährdung.",
  },
  "§ 4 KKG": {
    gesetz: "Bundeskinderschutzgesetz",
    kurz: "Beratungsanspruch bei Verdacht auf Kindeswohlgefährdung.",
  },
};

export function getLawCards(c: CaseData): LawCard[] {
  return c.legalBasis.map((raw) => {
    const info = LAW_INFO[raw];
    const paragraph = raw.startsWith("§") ? raw.split(" ")[0] + " " + (raw.split(" ")[1] ?? "") : raw;
    return {
      paragraph,
      gesetz: info?.gesetz ?? raw,
      kurz:
        info?.kurz ??
        "Einschlägige Rechtsgrundlage – im Einzelfall genauer Wortlaut und aktuelle Fassung prüfen.",
      status: info ? "aktiv" : "prüfen",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Favoriten                                                          */
/* ------------------------------------------------------------------ */

const FAV_KEY = "rk_favorites_v1";

function readFavs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function useFavorite(id: string) {
  const [fav, setFav] = useState(false);
  useEffect(() => {
    setFav(readFavs().includes(id));
    const handler = () => setFav(readFavs().includes(id));
    window.addEventListener("rk-fav-changed", handler);
    return () => window.removeEventListener("rk-fav-changed", handler);
  }, [id]);
  const toggle = () => {
    const cur = readFavs();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("rk-fav-changed"));
    setFav(next.includes(id));
  };
  return { fav, toggle };
}

/* ------------------------------------------------------------------ */
/* Abschluss                                                          */
/* ------------------------------------------------------------------ */

const DONE_KEY = "rk_done_v1";

export function useCaseDone(id: string) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DONE_KEY);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      setDone(arr.includes(id));
    } catch {
      /* noop */
    }
  }, [id]);
  const mark = (v: boolean) => {
    try {
      const raw = localStorage.getItem(DONE_KEY);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      const next = v ? Array.from(new Set([...arr, id])) : arr.filter((x) => x !== id);
      localStorage.setItem(DONE_KEY, JSON.stringify(next));
      setDone(v);
    } catch {
      /* noop */
    }
  };
  return { done, mark };
}
