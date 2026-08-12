/**
 * Sprint 4.6G – Deterministische Aktualitätsprüfung aufgelöster Rechtsgrundlagen.
 *
 * Regeln (in dieser Reihenfolge, erste zutreffende gewinnt):
 * 1. "outdated"  – Quelle oder Abschnitt ist ausdrücklich abgelaufen,
 *    archiviert, ersetzt oder außer Kraft.
 * 2. "aging"     – die letzte Prüfung/Verifizierung liegt über der Schwelle.
 * 3. "unknown"   – es liegen keinerlei zeitliche Angaben vor.
 * 4. "current"   – zeitliche Angaben vorhanden und nichts spricht dagegen.
 */
import type { LegalFreshnessStatus, ResolvedLegalReference } from "./types";

export interface FreshnessAssessment {
  status: LegalFreshnessStatus;
  reasons: string[];
}

export interface LegalContextFreshnessOptions {
  /** Alter in Tagen, ab dem eine Prüfung als veraltend gilt. Standard: 180. */
  agingDays?: number;
  /** Uhr (injizierbar für Tests). */
  now?: () => Date;
}

const OUTDATED_LIFECYCLE = new Set(["outdated", "archived", "rejected"]);
const OUTDATED_SECTION_STATUS = new Set(["archived", "outdated", "deprecated"]);

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export class LegalContextFreshnessChecker {
  private readonly agingDays: number;
  private readonly now: () => Date;

  constructor(options: LegalContextFreshnessOptions = {}) {
    this.agingDays = options.agingDays ?? 180;
    this.now = options.now ?? (() => new Date());
  }

  assess(ref: ResolvedLegalReference): FreshnessAssessment {
    const today = this.now();
    const source = ref.source;
    const reasons: string[] = [];

    /* 1 – ausdrücklich veraltet ------------------------------------------ */
    if (source?.lifecycleStatus && OUTDATED_LIFECYCLE.has(source.lifecycleStatus)) {
      reasons.push("Die Rechtsquelle ist im Quellenregister als nicht mehr aktuell markiert.");
    }
    if (source?.replacedBySourceId) {
      reasons.push("Die Rechtsquelle wurde durch eine neuere Fassung ersetzt.");
    }
    const sourceValidTo = parseDate(source?.validTo);
    if (sourceValidTo && sourceValidTo.getTime() < today.getTime()) {
      reasons.push("Der Gültigkeitszeitraum der Rechtsquelle ist abgelaufen.");
    }
    const sectionValidTo = parseDate(ref.sectionValidTo);
    if (sectionValidTo && sectionValidTo.getTime() < today.getTime()) {
      reasons.push("Der Gültigkeitszeitraum des Abschnitts ist abgelaufen.");
    }
    if (ref.sectionStatus && OUTDATED_SECTION_STATUS.has(ref.sectionStatus)) {
      reasons.push("Der Abschnitt ist redaktionell als veraltet markiert.");
    }
    if (reasons.length > 0) return { status: "outdated", reasons };

    /* 2 – Prüfung veraltet (aging) ---------------------------------------- */
    const reviewDates = [
      parseDate(source?.lastVerifiedAt),
      parseDate(source?.lastReviewedAt),
      parseDate(ref.sectionLastReviewedAt),
    ].filter((d): d is Date => d !== null);
    if (reviewDates.length > 0) {
      const newest = new Date(Math.max(...reviewDates.map((d) => d.getTime())));
      const ageDays = Math.floor((today.getTime() - newest.getTime()) / DAY_MS);
      if (ageDays > this.agingDays) {
        return {
          status: "aging",
          reasons: [
            `Die letzte fachliche Prüfung liegt ${ageDays} Tage zurück (Schwelle: ${this.agingDays} Tage).`,
          ],
        };
      }
    }

    /* 3 – keine zeitlichen Angaben ---------------------------------------- */
    const hasTemporalData = Boolean(
      source?.validFrom ||
        source?.validTo ||
        source?.lastVerifiedAt ||
        source?.lastReviewedAt ||
        ref.sectionValidFrom ||
        ref.sectionValidTo ||
        ref.sectionLastReviewedAt,
    );
    if (!hasTemporalData) {
      return {
        status: "unknown",
        reasons: ["Zur Aktualität liegen keine Angaben vor."],
      };
    }

    return { status: "current", reasons: [] };
  }
}
