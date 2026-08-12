/**
 * Sprint 4.6G – Erklärungen zu Herkunft und Aktualität der Rechtsgrundlagen.
 *
 * Alle Texte werden ausschließlich aus vorhandenen Daten erzeugt
 * (Verknüpfung, Relevanz, redaktionelle Begründung, Aktualitätsstatus).
 * Es werden keine Rechtsnormen, Inhalte oder Bewertungen ergänzt.
 */
import type {
  LegalContextSource,
  LegalFreshnessStatus,
  ResolvedLegalReference,
} from "./types";

const RELEVANCE_SENTENCE: Record<string, string> = {
  high: "Die Redaktion stuft sie als zentrale Rechtsgrundlage für diesen Fall ein.",
  medium: "Die Redaktion stuft sie als ergänzende Rechtsgrundlage ein.",
  low: "Die Redaktion stuft sie als weiterführenden Hinweis ein.",
};

const FRESHNESS_SENTENCE: Record<LegalFreshnessStatus, string> = {
  current: "Die Quelle gilt nach den hinterlegten Angaben als aktuell.",
  aging: "Hinweis: Die letzte fachliche Prüfung liegt länger zurück.",
  outdated: "Warnung: Diese Quelle ist möglicherweise nicht mehr aktuell.",
  unknown: "Zur Aktualität dieser Quelle liegen keine Angaben vor.",
};

export class LegalContextExplainer {
  /** Begründet nachvollziehbar, warum eine Rechtsgrundlage angezeigt wird. */
  explainReference(
    ref: ResolvedLegalReference,
    caseTitle: string,
    freshness: LegalFreshnessStatus,
    freshnessReasons: string[],
  ): string {
    const parts: string[] = [
      `Diese Rechtsgrundlage ist redaktionell mit dem Praxisfall „${caseTitle}“ verknüpft.`,
    ];
    if (ref.relevance) parts.push(RELEVANCE_SENTENCE[ref.relevance]);
    if (ref.linkExplanation) {
      parts.push(`Begründung der Redaktion: ${ref.linkExplanation}`);
    }
    parts.push(FRESHNESS_SENTENCE[freshness]);
    if (freshness === "outdated" || freshness === "aging") {
      parts.push(...freshnessReasons);
    }
    return parts.join(" ");
  }

  /** Herkunftshinweis für den gesamten Rechtskontext. */
  explainProvenance(source: LegalContextSource): string {
    if (source.kind === "none") {
      return (
        "Allgemeine Bearbeitung ohne bestätigten Praxisfall. " +
        "Es werden keine fallspezifischen Rechtsgrundlagen angezeigt."
      );
    }
    const stand = source.caseVersion
      ? new Date(source.caseVersion).toLocaleDateString("de-DE")
      : "unbekannt";
    return (
      `Alle Rechtsgrundlagen stammen aus der kuratierten Verknüpfung des Praxisfalls ` +
      `„${source.caseTitle}“ (Stand: ${stand}). Es wurden keine weiteren Rechtsgrundlagen ergänzt.`
    );
  }
}
