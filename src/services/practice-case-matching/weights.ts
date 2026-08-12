/**
 * Sprint 4.6E – Zentrale Gewichtungen und Schwellen des Matchings.
 * EINZIGE Definitionsstelle. Wird von Scorer, Engine, UI und Tests genutzt.
 */
import type { MatchDimension, MatchLevel, MatchSignal } from "./types";

export const MATCH_WEIGHTS: Record<MatchDimension, number> = {
  category: 30,
  subcategory: 10,
  keywords: 25,
  roles: 12,
  signals: 15,
  location: 8,
};

export const MATCH_THRESHOLDS = {
  /** Ab hier gilt ein Fall als starker Treffer. */
  STRONG_MIN: 70,
  /** Ab hier plausibel, aber redaktionell zu prüfen. */
  MODERATE_MIN: 45,
  /** Unterhalb dieses Werts wird der Fall nicht angeboten. */
  WEAK_MIN: 25,
  /** Höchstzahl ausgelieferter Treffer. */
  MAX_RESULTS: 10,
  /** Konfidenzabzug je unklarem Aspekt. */
  CONFIDENCE_PENALTY_PER_UNKNOWN: 4,
  /** Mindestkonfidenz, die nach Abzügen verbleibt. */
  CONFIDENCE_FLOOR: 20,
} as const;

export const MATCH_READINESS_THRESHOLDS = {
  READY_MIN: 80,
  PARTIAL_MIN: 50,
} as const;

export function matchLevelForScore(score: number): MatchLevel {
  if (score >= MATCH_THRESHOLDS.STRONG_MIN) return "strong";
  if (score >= MATCH_THRESHOLDS.MODERATE_MIN) return "moderate";
  if (score >= MATCH_THRESHOLDS.WEAK_MIN) return "weak";
  return "none";
}

/** Lesbare Bezeichnungen der Signale für die redaktionelle Oberfläche. */
export const MATCH_SIGNAL_LABELS: Record<MatchSignal, string> = {
  akuteGefahr: "Akute Gefährdung gemeldet",
  gefahrAnhaltend: "Gefährdung hält an",
  notdienstBeteiligt: "Notdienste beteiligt",
  wiederholung: "Wiederholter Vorgang",
  andauernderVorgang: "Vorgang dauert an",
  betroffenePerson: "Betroffene Person vorhanden",
  beschuldigtePerson: "Beschuldigte Person vorhanden",
  zeugenVorhanden: "Zeugen vorhanden",
  nachweiseVorhanden: "Nachweise vorhanden",
  nachweiseGesichert: "Nachweise gesichert",
  minderjaehrigBeteiligt: "Minderjährige beteiligt",
  volljaehrigBeteiligt: "Volljährige beteiligt",
  schuelerBeteiligt: "Schülerin oder Schüler beteiligt",
  lehrkraftBeteiligt: "Lehrkraft beteiligt",
  elternBeteiligt: "Eltern oder Erziehungsberechtigte beteiligt",
  schulleitungBeteiligt: "Schulleitung beteiligt",
  externeBeteiligt: "Externe Personen beteiligt",
  ortUnterricht: "Ort: Unterricht",
  ortSchulgelaende: "Ort: Schulgelände",
  ortOnline: "Ort: digitaler Raum",
  ortAusserhalbSchule: "Ort: außerhalb der Schule",
  ortSchulfahrt: "Ort: Schulfahrt",
  dokumentationVorhanden: "Dokumentation vorhanden",
  dokumentationFehlt: "Dokumentation fehlt",
  schulleitungInformiert: "Schulleitung informiert",
  elternkontaktDokumentiert: "Elternkontakt dokumentiert",
  massnahmenErgriffen: "Maßnahmen bereits ergriffen",
  keineMassnahmen: "Noch keine Maßnahmen",
  zeitpunktUnbekannt: "Zeitpunkt unbekannt",
};

export const MATCH_ROLE_LABELS: Record<string, string> = {
  student: "Schülerin / Schüler",
  teacher: "Lehrkraft",
  schoolLeadership: "Schulleitung",
  parent: "Eltern",
  guardian: "Erziehungsberechtigte",
  schoolStaff: "Schulpersonal",
  externalPerson: "Externe Person",
};

export const MATCH_LOCATION_LABELS: Record<string, string> = {
  classroom: "Unterrichtsraum",
  schoolyard: "Schulhof",
  hallway: "Flur",
  gym: "Sporthalle",
  schoolTrip: "Schulfahrt",
  online: "Digitaler Raum",
  outsideSchool: "Außerhalb der Schule",
};

export const MATCH_DIMENSION_LABELS: Record<MatchDimension, string> = {
  category: "Kategorie",
  subcategory: "Unterkategorie",
  keywords: "Schlagwörter",
  roles: "Rollen",
  signals: "Situationsmerkmale",
  location: "Ort",
};
