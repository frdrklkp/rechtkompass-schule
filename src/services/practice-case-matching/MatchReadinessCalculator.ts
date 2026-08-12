/**
 * Sprint 4.6E – Reifegrad eines Praxisfalls für die Aufnahme in den Matching-Index.
 * Rein deterministisch, prüft ausschließlich strukturelle Vollständigkeit.
 */
import { MATCH_READINESS_THRESHOLDS } from "./weights";
import type {
  MatchReadinessCheck,
  MatchReadinessResult,
  MatchingProfile,
  PracticeCaseSource,
} from "./types";

export class MatchReadinessCalculator {
  calculate(source: PracticeCaseSource, profile: MatchingProfile): MatchReadinessResult {
    const checks: MatchReadinessCheck[] = [
      {
        id: "status_published",
        label: "Fall ist veröffentlicht",
        required: true,
        passed: source.status === "published",
        hint: "Nur veröffentlichte Fälle werden in den Matching-Index übernommen.",
      },
      {
        id: "has_title",
        label: "Titel vorhanden",
        required: true,
        passed: source.title.trim().length > 0,
        hint: "Der Titel liefert Suchtokens für das Matching.",
      },
      {
        id: "has_category",
        label: "Kategorie im Profil",
        required: true,
        passed: profile.categories.length > 0,
        hint: "Ohne Kategorie ist keine fachliche Zuordnung möglich.",
      },
      {
        id: "has_keywords",
        label: "Mindestens drei Schlagwörter",
        required: true,
        passed: profile.keywords.length >= 3,
        hint: "Schlagwörter tragen den größten Anteil der Begriffsübereinstimmung.",
      },
      {
        id: "has_short_description",
        label: "Kurzbeschreibung vorhanden",
        required: true,
        passed: (source.shortDescription ?? "").trim().length > 0,
        hint: "Die Kurzbeschreibung wird für Merkmalsableitung und Anzeige benötigt.",
      },
      {
        id: "has_subcategory",
        label: "Unterkategorie im Profil",
        required: false,
        passed: profile.subcategories.length > 0,
        hint: "Erhöht die Trennschärfe innerhalb einer Kategorie.",
      },
      {
        id: "has_roles",
        label: "Rollen hinterlegt",
        required: false,
        passed: profile.roles.length > 0,
        hint: "Rollen verbessern die Zuordnung zu Beteiligten des Sachverhalts.",
      },
      {
        id: "has_signals",
        label: "Situationsmerkmale hinterlegt",
        required: false,
        passed: profile.expectedSignals.length > 0,
        hint: "Merkmale wie Wiederholung oder Gefährdung schärfen das Matching.",
      },
      {
        id: "has_legal",
        label: "Rechtsgrundlage verknüpft",
        required: false,
        passed: profile.legalSectionIds.length > 0,
        hint: "Belegt die fachliche Tragfähigkeit des Falls.",
      },
      {
        id: "curated",
        label: "Profil redaktionell geprüft",
        required: false,
        passed: profile.status === "approved",
        hint: "Abgeleitete Profile sind nutzbar, aber redaktionell nicht bestätigt.",
      },
    ];

    const requiredChecks = checks.filter((c) => c.required);
    const optionalChecks = checks.filter((c) => !c.required);
    const requiredPassed = requiredChecks.filter((c) => c.passed).length;
    const optionalPassed = optionalChecks.filter((c) => c.passed).length;

    const requiredShare = requiredChecks.length === 0 ? 1 : requiredPassed / requiredChecks.length;
    const optionalShare = optionalChecks.length === 0 ? 1 : optionalPassed / optionalChecks.length;
    const score = Math.round(requiredShare * 70 + optionalShare * 30);

    const missingRequired = requiredChecks.filter((c) => !c.passed).map((c) => c.id);
    const indexable = missingRequired.length === 0;
    const level: MatchReadinessResult["level"] = !indexable
      ? "notReady"
      : score >= MATCH_READINESS_THRESHOLDS.READY_MIN
        ? "ready"
        : score >= MATCH_READINESS_THRESHOLDS.PARTIAL_MIN
          ? "partial"
          : "notReady";

    return { caseId: source.id, level, score, checks, missingRequired, indexable };
  }
}

export const defaultReadinessCalculator = new MatchReadinessCalculator();
