/**
 * Sprint 4.6E – Ableitung eines Matching-Profils aus einem Praxisfall.
 *
 * Kein Fall ist fest verdrahtet: Merkmale werden ausschließlich aus den
 * vorhandenen Falldaten (Kategorie, Schlagwörter, Texte, Verknüpfungen)
 * oder aus dem redaktionell gepflegten Profil gelesen.
 */
import {
  MATCHING_PROFILE_VERSION,
  isMatchSignal,
  type MatchLocationType,
  type MatchRole,
  type MatchSignal,
  type MatchingProfile,
  type PracticeCaseSource,
} from "./types";
import { normalizeTerm, tokenize, unique } from "./normalize";

/** Deterministische Rollenerkennung über feste Begriffslisten. */
const ROLE_TERMS: Array<{ role: MatchRole; terms: string[] }> = [
  { role: "student", terms: ["schueler", "schuelerin", "auszubildende", "lernende", "klasse", "jugendliche"] },
  { role: "teacher", terms: ["lehrkraft", "lehrer", "lehrerin", "klassenleitung", "fachlehrkraft", "kollegium"] },
  { role: "schoolLeadership", terms: ["schulleitung", "schulleiter", "abteilungsleitung", "bildungsgangleitung"] },
  { role: "parent", terms: ["eltern", "elternteil", "mutter", "vater", "elterngespraech"] },
  { role: "guardian", terms: ["erziehungsberechtigt", "sorgeberechtigt", "vormund"] },
  { role: "schoolStaff", terms: ["sekretariat", "hausmeister", "sozialarbeit", "schulsozialarbeit", "verwaltung", "beratungslehrkraft"] },
  { role: "externalPerson", terms: ["jugendamt", "polizei", "ausbildungsbetrieb", "betrieb", "schulaufsicht", "gesundheitsamt", "extern"] },
];

/** Deterministische Ortserkennung über feste Begriffslisten. */
const LOCATION_TERMS: Array<{ location: MatchLocationType; terms: string[] }> = [
  { location: "classroom", terms: ["unterricht", "klassenraum", "klassenzimmer", "stunde", "pruefung", "klausur"] },
  { location: "schoolyard", terms: ["schulhof", "pause", "pausenaufsicht"] },
  { location: "hallway", terms: ["flur", "treppenhaus", "gang"] },
  { location: "gym", terms: ["sporthalle", "sportunterricht", "turnhalle", "schwimm"] },
  { location: "schoolTrip", terms: ["klassenfahrt", "exkursion", "wandertag", "schulfahrt", "ausflug"] },
  { location: "online", terms: ["chat", "messenger", "whatsapp", "instagram", "digital", "online", "internet", "video", "aufnahme", "social"] },
  { location: "outsideSchool", terms: ["schulweg", "ausserhalb", "freizeit", "betriebsprakt"] },
];

/** Signalerkennung aus Falltexten. Nur eindeutige Fachbegriffe. */
const SIGNAL_TERMS: Array<{ signal: MatchSignal; terms: string[] }> = [
  { signal: "akuteGefahr", terms: ["gefahr", "gefaehrdung", "notfall", "suizid", "verletzung", "gewalt", "waffe", "kindeswohl"] },
  { signal: "notdienstBeteiligt", terms: ["rettungsdienst", "notarzt", "feuerwehr", "polizei", "notruf"] },
  { signal: "wiederholung", terms: ["wiederholt", "mehrfach", "erneut", "dauerhaft"] },
  { signal: "beschuldigtePerson", terms: ["verursach", "beschuldig", "taeter", "vorwurf"] },
  { signal: "betroffenePerson", terms: ["betroffen", "opfer", "geschaedigt"] },
  { signal: "zeugenVorhanden", terms: ["zeuge", "zeugin", "beobachtet"] },
  { signal: "nachweiseVorhanden", terms: ["nachweis", "beweis", "screenshot", "foto", "protokoll", "aufnahme"] },
  { signal: "minderjaehrigBeteiligt", terms: ["minderjaehrig", "unter 18", "sorgeberechtigt"] },
  { signal: "volljaehrigBeteiligt", terms: ["volljaehrig", "erwachsene"] },
  { signal: "dokumentationFehlt", terms: ["keine dokumentation", "nicht dokumentiert", "fehlende dokumentation"] },
  { signal: "dokumentationVorhanden", terms: ["dokumentation", "aktenvermerk", "vermerk", "protokoll"] },
  { signal: "schulleitungInformiert", terms: ["schulleitung informieren", "schulleitung einbinden", "meldung an die schulleitung"] },
  { signal: "elternkontaktDokumentiert", terms: ["elterngespraech", "eltern informieren", "elternkontakt"] },
  { signal: "massnahmenErgriffen", terms: ["ordnungsmassnahme", "erzieherische einwirkung", "massnahme"] },
];

export function emptyProfile(): MatchingProfile {
  return {
    profileVersion: MATCHING_PROFILE_VERSION,
    status: "derived",
    origin: "derived",
    categories: [],
    subcategories: [],
    keywords: [],
    synonyms: [],
    roles: [],
    locationTypes: [],
    expectedSignals: [],
    requiredSignals: [],
    excludedSignals: [],
    legalSectionIds: [],
    ampel: null,
    notes: "",
    updatedAt: null,
    updatedBy: null,
  };
}

function caseText(source: PracticeCaseSource): string {
  return [
    source.title,
    source.category ?? "",
    source.subcategory ?? "",
    source.shortDescription ?? "",
    source.shortAnswer ?? "",
    source.recommendation ?? "",
    source.responsibilities ?? "",
    source.legalExplanation ?? "",
    ...source.checklist,
    ...source.documentation,
    ...source.keywords,
  ].join(" ");
}

function containsTerm(normalized: string, term: string): boolean {
  return normalized.includes(normalizeTerm(term));
}

/** Redaktionelle 1–5-Skala (Priorität/Spezifität) sicher übernehmen. */
function clampScale(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1, Math.min(5, Math.round(n)));
}


export class PracticeCaseMatchProfileMapper {
  /** Rein aus Falldaten abgeleitetes Profil (Grundlage für Bestandsmigration). */
  derive(source: PracticeCaseSource): MatchingProfile {
    const normalized = normalizeTerm(caseText(source));
    const roles = ROLE_TERMS.filter((entry) => entry.terms.some((t) => containsTerm(normalized, t))).map((e) => e.role);
    const locations = LOCATION_TERMS.filter((entry) => entry.terms.some((t) => containsTerm(normalized, t))).map((e) => e.location);
    const signals = SIGNAL_TERMS.filter((entry) => entry.terms.some((t) => containsTerm(normalized, t))).map((e) => e.signal);

    const profile = emptyProfile();
    profile.categories = source.category ? [source.category.trim()] : [];
    profile.subcategories = source.subcategory ? [source.subcategory.trim()] : [];
    profile.keywords = unique(source.keywords.map((k) => k.trim()).filter(Boolean));
    profile.synonyms = [];
    profile.roles = unique(roles);
    profile.locationTypes = unique(locations);
    profile.expectedSignals = unique(signals);
    profile.requiredSignals = [];
    profile.excludedSignals = [];
    profile.legalSectionIds = unique(source.legalSectionIds);
    profile.ampel = source.ampel;
    profile.status = "derived";
    profile.origin = "derived";
    profile.updatedAt = source.updatedAt;
    return profile;
  }

  /** Kuratiertes Profil normalisieren und mit dem abgeleiteten Profil auffüllen. */
  fromCurated(source: PracticeCaseSource): MatchingProfile {
    const derived = this.derive(source);
    const curated = source.curatedProfile;
    if (!curated) return derived;

    const strings = (value: unknown, fallback: string[]): string[] =>
      Array.isArray(value)
        ? unique(value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()))
        : fallback;
    const signals = (value: unknown, fallback: MatchSignal[]): MatchSignal[] =>
      Array.isArray(value) ? unique(value.filter(isMatchSignal)) : fallback;

    const status = ["derived", "draft", "review", "approved"].includes(String(curated.status))
      ? (curated.status as MatchingProfile["status"])
      : "draft";

    return {
      profileVersion: MATCHING_PROFILE_VERSION,
      status,
      origin: "curated",
      categories: strings(curated.categories, derived.categories),
      subcategories: strings(curated.subcategories, derived.subcategories),
      keywords: strings(curated.keywords, derived.keywords),
      synonyms: strings(curated.synonyms, []),
      roles: strings(curated.roles, derived.roles),
      locationTypes: strings(curated.locationTypes, derived.locationTypes),
      expectedSignals: signals(curated.expectedSignals, derived.expectedSignals),
      requiredSignals: signals(curated.requiredSignals, []),
      excludedSignals: signals(curated.excludedSignals, []),
      legalSectionIds: strings(curated.legalSectionIds, derived.legalSectionIds),
      ampel: curated.ampel ?? derived.ampel,
      notes: typeof curated.notes === "string" ? curated.notes : "",
      matchingEnabled: curated.matchingEnabled !== false,
      priority: clampScale(curated.priority),
      specificity: clampScale(curated.specificity),
      updatedAt: typeof curated.updatedAt === "string" ? curated.updatedAt : derived.updatedAt,
      updatedBy: typeof curated.updatedBy === "string" ? curated.updatedBy : null,
    };

  }

  /** Effektives Profil: kuratiert, wenn vorhanden, sonst abgeleitet. */
  resolve(source: PracticeCaseSource): MatchingProfile {
    return source.curatedProfile ? this.fromCurated(source) : this.derive(source);
  }

  /** Suchtokens des Falls (Titel, Kategorien, Schlagwörter, Synonyme). */
  tokensFor(source: PracticeCaseSource, profile: MatchingProfile): string[] {
    return unique([
      ...tokenize(source.title),
      ...profile.categories.flatMap(tokenize),
      ...profile.subcategories.flatMap(tokenize),
      ...profile.keywords.flatMap(tokenize),
      ...profile.synonyms.flatMap(tokenize),
    ]);
  }
}

export const defaultProfileMapper = new PracticeCaseMatchProfileMapper();
