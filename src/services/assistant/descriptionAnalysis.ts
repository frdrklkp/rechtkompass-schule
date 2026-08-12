/**
 * Sprint 4.6F – Deterministische Strukturierung einer freien Fallschilderung.
 *
 * Es wird ausschließlich ein festes, dokumentiertes Begriffsverzeichnis
 * angewendet. Nicht erkannte Angaben bleiben ausdrücklich offen und werden zu
 * Rückfragen. Es werden keine Tatsachen ergänzt, geraten oder bewertet.
 */
import type { MatchLocationType, MatchRole } from "@/services/practice-case-matching";
import type { AssistantDescriptionAnalysis, AssistantFinding } from "./types";

interface TermRule<T> {
  value: T;
  label: string;
  terms: string[];
}

const ROLE_RULES: TermRule<MatchRole>[] = [
  { value: "student", label: "Schülerin oder Schüler", terms: ["schüler", "schülerin", "schuelerin", "lerngruppe", "klasse", "jugendlicher", "kind"] },
  { value: "teacher", label: "Lehrkraft", terms: ["lehrkraft", "lehrer", "lehrerin", "kollegin", "kollege", "fachlehrer"] },
  { value: "schoolLeadership", label: "Schulleitung", terms: ["schulleitung", "schulleiter", "schulleiterin", "rektor", "rektorin", "stellvertretende leitung"] },
  { value: "parent", label: "Eltern", terms: ["eltern", "mutter", "vater", "elternteil"] },
  { value: "guardian", label: "Erziehungsberechtigte", terms: ["erziehungsberechtigt", "sorgeberechtigt", "vormund"] },
  { value: "schoolStaff", label: "Weiteres Schulpersonal", terms: ["hausmeister", "sekretariat", "schulsozialarbeit", "sozialpädagog", "sozialpaedagog", "betreuungskraft"] },
  { value: "externalPerson", label: "Externe Person", terms: ["externe person", "besucher", "fremde person", "jugendamt", "polizei"] },
];

const LOCATION_RULES: TermRule<MatchLocationType>[] = [
  { value: "classroom", label: "Klassenraum", terms: ["unterricht", "klassenraum", "klassenzimmer", "unterrichtsstunde", "fachraum", "stunde"] },
  { value: "schoolyard", label: "Schulhof", terms: ["schulhof", "pause", "pausenhof"] },
  { value: "hallway", label: "Flur oder Treppenhaus", terms: ["flur", "treppenhaus", "gang", "toilette"] },
  { value: "gym", label: "Sporthalle", terms: ["sporthalle", "turnhalle", "sportunterricht", "umkleide"] },
  { value: "schoolTrip", label: "Schulveranstaltung außerhalb", terms: ["klassenfahrt", "wandertag", "exkursion", "schulfahrt", "ausflug"] },
  { value: "online", label: "Digitaler Raum", terms: ["whatsapp", "instagram", "chat", "online", "internet", "social media", "handy", "digital", "tiktok", "messenger"] },
  { value: "outsideSchool", label: "Außerhalb der Schule", terms: ["schulweg", "bushaltestelle", "außerhalb der schule", "ausserhalb der schule", "freizeit"] },
];

const CATEGORY_RULES: TermRule<string>[] = [
  { value: "konflikt", label: "Konflikt zwischen Personen", terms: ["streit", "konflikt", "beleidigung", "mobbing", "schlägerei", "schlaegerei", "gewalt", "bedrohung", "ausgrenzung"] },
  { value: "kommunikation", label: "Kommunikation und Medien", terms: ["foto", "video", "aufnahme", "chat", "whatsapp", "instagram", "social media", "veröffentlicht", "veroeffentlicht", "daten", "datenschutz"] },
  { value: "verhalten", label: "Verhalten im Schulalltag", terms: ["störung", "stoerung", "unterrichtsstörung", "verweigerung", "unentschuldigt", "fehlt", "verspätung", "verspaetung", "rauchen", "diebstahl"] },
  { value: "organisation", label: "Organisation und Abläufe", terms: ["aufsicht", "vertretung", "zeugnis", "note", "versetzung", "prüfung", "pruefung", "anmeldung", "attest"] },
];

interface FlagRule {
  key: keyof Pick<
    AssistantDescriptionAnalysis,
    | "repeated"
    | "ongoing"
    | "dangerReported"
    | "witnessesPresent"
    | "evidencePresent"
    | "measuresTaken"
    | "leadershipInformed"
    | "parentContact"
  >;
  field: string;
  label: string;
  positive: string[];
  negative: string[];
  positiveDisplay: string;
  negativeDisplay: string;
}

const FLAG_RULES: FlagRule[] = [
  {
    key: "repeated",
    field: "incident.wasRepeated",
    label: "Wiederholung",
    positive: ["wiederholt", "mehrfach", "erneut", "immer wieder", "schon öfter", "schon oefter", "seit wochen", "regelmäßig", "regelmaessig"],
    negative: ["erstmalig", "zum ersten mal", "einmaliger vorfall"],
    positiveDisplay: "Der Vorgang hat sich wiederholt.",
    negativeDisplay: "Der Vorgang war einmalig.",
  },
  {
    key: "ongoing",
    field: "incident.isOngoing",
    label: "Fortdauer",
    positive: ["dauert an", "hält an", "haelt an", "noch nicht beendet", "aktuell weiterhin", "andauernd"],
    negative: ["abgeschlossen", "beendet", "nicht mehr"],
    positiveDisplay: "Die Situation dauert an.",
    negativeDisplay: "Die Situation ist abgeschlossen.",
  },
  {
    key: "dangerReported",
    field: "dangerInformation.acuteDangerReported",
    label: "Gefahrenangabe",
    positive: ["verletzt", "verletzung", "waffe", "messer", "suizid", "selbstverletzung", "notarzt", "rettungsdienst", "krankenhaus", "bedroht", "körperlich angegriffen", "koerperlich angegriffen"],
    negative: ["keine gefahr", "niemand verletzt", "keine verletzung"],
    positiveDisplay: "Es wurden Angaben zu einer möglichen Gefahr gemacht.",
    negativeDisplay: "Es wurden keine Gefahrenangaben gemacht.",
  },
  {
    key: "witnessesPresent",
    field: "witnesses",
    label: "Zeugen",
    positive: ["zeuge", "zeugin", "beobachtet", "haben gesehen", "mitbekommen", "andere schüler sahen"],
    negative: ["keine zeugen", "niemand hat es gesehen"],
    positiveDisplay: "Es gibt Personen, die die Situation beobachtet haben.",
    negativeDisplay: "Es gibt keine Zeugen.",
  },
  {
    key: "evidencePresent",
    field: "evidence",
    label: "Nachweise",
    positive: ["screenshot", "foto", "video", "chatverlauf", "schriftlich", "attest", "e-mail", "email", "protokoll"],
    negative: ["keine nachweise", "nichts dokumentiert", "keine unterlagen"],
    positiveDisplay: "Es liegen Nachweise vor.",
    negativeDisplay: "Es liegen keine Nachweise vor.",
  },
  {
    key: "measuresTaken",
    field: "measuresTaken",
    label: "Bereits ergriffene Maßnahmen",
    positive: ["gespräch geführt", "gespraech gefuehrt", "ermahnt", "eltern angerufen", "bereits gesprochen", "maßnahme", "massnahme", "klassenkonferenz"],
    negative: ["noch nichts unternommen", "keine maßnahmen", "keine massnahmen"],
    positiveDisplay: "Es wurden bereits Maßnahmen ergriffen.",
    negativeDisplay: "Es wurden noch keine Maßnahmen ergriffen.",
  },
  {
    key: "leadershipInformed",
    field: "documentationStatus.schoolLeadershipInformed",
    label: "Schulleitung informiert",
    positive: ["schulleitung informiert", "schulleitung weiß", "schulleitung weiss", "schulleitung eingeschaltet", "rektorin informiert"],
    negative: ["schulleitung nicht informiert", "schulleitung weiß nichts", "schulleitung weiss nichts"],
    positiveDisplay: "Die Schulleitung ist informiert.",
    negativeDisplay: "Die Schulleitung ist nicht informiert.",
  },
  {
    key: "parentContact",
    field: "documentationStatus.parentContactDocumented",
    label: "Elternkontakt",
    positive: ["eltern informiert", "eltern angerufen", "elterngespräch", "elterngespraech", "eltern kontaktiert"],
    negative: ["eltern nicht informiert", "kein elternkontakt"],
    positiveDisplay: "Es gab dokumentierten Elternkontakt.",
    negativeDisplay: "Es gab keinen Elternkontakt.",
  },
];

/** Kleinschreibung mit vereinheitlichten Leerzeichen – ohne Wortentfernung. */
export function normalizeDescription(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Liefert den Satz, in dem ein Begriff auftritt (Belegstelle). */
export function evidenceFor(text: string, term: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const found = sentences.find((s) => s.toLowerCase().includes(term));
  const source = (found ?? text).trim();
  return source.length > 180 ? `${source.slice(0, 177)}…` : source;
}

function firstMatch<T>(rules: TermRule<T>[], haystack: string): { rule: TermRule<T>; term: string } | null {
  for (const rule of rules) {
    const term = rule.terms.find((t) => haystack.includes(t));
    if (term) return { rule, term };
  }
  return null;
}

export class AssistantDescriptionAnalyzer {
  analyze(description: string): AssistantDescriptionAnalysis {
    const raw = description.trim();
    const haystack = normalizeDescription(raw);
    const findings: AssistantFinding[] = [];
    const openAspects: string[] = [];

    /* Rollen: alle zutreffenden Begriffe */
    const roles: MatchRole[] = [];
    for (const rule of ROLE_RULES) {
      const term = rule.terms.find((t) => haystack.includes(t));
      if (!term) continue;
      roles.push(rule.value);
      findings.push({
        field: "participants",
        label: "Beteiligte Rolle",
        display: rule.label,
        evidence: evidenceFor(raw, term),
      });
    }
    if (roles.length === 0) openAspects.push("Beteiligte Personen");

    /* Ort: erste Übereinstimmung in fester Reihenfolge */
    const location = firstMatch(LOCATION_RULES, haystack);
    if (location) {
      findings.push({
        field: "incident.locationType",
        label: "Art des Ortes",
        display: location.rule.label,
        evidence: evidenceFor(raw, location.term),
      });
    } else {
      openAspects.push("Ort des Vorgangs");
    }

    /* Grobe Einordnung */
    const category = firstMatch(CATEGORY_RULES, haystack);
    if (category) {
      findings.push({
        field: "category",
        label: "Grobe Einordnung",
        display: category.rule.label,
        evidence: evidenceFor(raw, category.term),
      });
    } else {
      openAspects.push("Grobe Einordnung");
    }

    /* Merkmale mit ausdrücklicher Ja-/Nein-Erkennung */
    const flags: Record<string, boolean | null> = {};
    for (const rule of FLAG_RULES) {
      const negative = rule.negative.find((t) => haystack.includes(t));
      const positive = rule.positive.find((t) => haystack.includes(t));
      if (negative) {
        flags[rule.key] = false;
        findings.push({
          field: rule.field,
          label: rule.label,
          display: rule.negativeDisplay,
          evidence: evidenceFor(raw, negative),
        });
      } else if (positive) {
        flags[rule.key] = true;
        findings.push({
          field: rule.field,
          label: rule.label,
          display: rule.positiveDisplay,
          evidence: evidenceFor(raw, positive),
        });
      } else {
        flags[rule.key] = null;
        openAspects.push(rule.label);
      }
    }

    return {
      wordCount: raw.length === 0 ? 0 : raw.split(/\s+/).length,
      category: category?.rule.value ?? null,
      locationType: location?.rule.value ?? null,
      roles,
      repeated: flags.repeated ?? null,
      ongoing: flags.ongoing ?? null,
      dangerReported: flags.dangerReported ?? null,
      witnessesPresent: flags.witnessesPresent ?? null,
      evidencePresent: flags.evidencePresent ?? null,
      measuresTaken: flags.measuresTaken ?? null,
      leadershipInformed: flags.leadershipInformed ?? null,
      parentContact: flags.parentContact ?? null,
      findings,
      openAspects,
    };
  }
}

export const defaultDescriptionAnalyzer = new AssistantDescriptionAnalyzer();

/** Anzeigetext einer Rolle (nur Darstellung). */
export function roleLabel(role: MatchRole): string {
  return ROLE_RULES.find((r) => r.value === role)?.label ?? String(role);
}

/** Anzeigetext eines Ortstyps (nur Darstellung). */
export function locationLabel(location: MatchLocationType): string {
  return LOCATION_RULES.find((r) => r.value === location)?.label ?? String(location);
}
