/**
 * Sprint 4.6C – Deterministische Aggregation der Regelergebnisse zu Ampel und Schweregrad.
 */
import type { RuleEvaluation } from "./AssessmentRuleEvaluator";
import type { AssessmentConflict, AssessmentSeverity, TrafficLight } from "./types";

const SEVERITY_ORDER: AssessmentSeverity[] = ["none", "low", "moderate", "high", "critical"];

export interface AggregationInput {
  matched: RuleEvaluation[];
  conflicts: AssessmentConflict[];
  /** Vollständigkeit der Erfassung in Prozent. */
  dataCompleteness: number;
  /** Schwelle, ab der eine grüne Einstufung zulässig ist. */
  minimumCompletenessForGreen?: number;
}

export interface AggregationOutput {
  trafficLight: TrafficLight;
  severity: AssessmentSeverity;
  /** Nachvollziehbare Begründung der Aggregationsentscheidung. */
  explanation: string;
}

/** Regeln mit `metadata.affectsTrafficLight === false` verändern die Ampel nicht. */
export function affectsTrafficLight(evaluation: RuleEvaluation): boolean {
  return evaluation.rule.metadata?.affectsTrafficLight !== false;
}

export class AssessmentResultAggregator {
  aggregate(input: AggregationInput): AggregationOutput {
    const minGreen = input.minimumCompletenessForGreen ?? 60;
    const relevant = input.matched.filter(affectsTrafficLight);

    const reds = relevant.filter((e) => e.rule.result.trafficLightContribution === "red");
    const yellows = relevant.filter((e) => e.rule.result.trafficLightContribution === "yellow");
    const greens = relevant.filter((e) => e.rule.result.trafficLightContribution === "green");
    const unknowns = relevant.filter((e) => e.rule.result.trafficLightContribution === "unknown");

    const blockingConflict = input.conflicts.some((c) => c.blocksAssessment);

    if (reds.length > 0) {
      // Kritische Merkmale überstimmen positive Regeln immer.
      return {
        trafficLight: "red",
        severity: this.maxSeverity(reds.map((e) => e.rule.result.severityContribution)),
        explanation:
          "Mindestens ein als kritisch definiertes Merkmal wurde erfasst. Positive Merkmale heben diese Einstufung nicht auf.",
      };
    }

    if (blockingConflict) {
      return {
        trafficLight: "unknown",
        severity: "unknown",
        explanation:
          "Die erfassten Angaben oder Regelergebnisse widersprechen sich; eine eindeutige Einstufung ist nicht möglich.",
      };
    }

    if (yellows.length > 0) {
      return {
        trafficLight: "yellow",
        severity: this.maxSeverity(yellows.map((e) => e.rule.result.severityContribution)),
        explanation:
          "Es wurden Merkmale erfasst, die weitere Klärung oder erhöhte Aufmerksamkeit erfordern.",
      };
    }

    if (unknowns.length > 0) {
      return {
        trafficLight: "unknown",
        severity: "unknown",
        explanation:
          "Entscheidungsrelevante Angaben fehlen oder wurden ausdrücklich als unbekannt markiert.",
      };
    }

    if (greens.length > 0 && input.dataCompleteness >= minGreen) {
      return {
        trafficLight: "green",
        severity: "none",
        explanation:
          "Es wurden ausschließlich unkritische Merkmale erfasst und die Datengrundlage ist ausreichend.",
      };
    }

    if (greens.length > 0) {
      return {
        trafficLight: "unknown",
        severity: "unknown",
        explanation: `Die Erfassung ist mit ${Math.round(input.dataCompleteness)} % noch nicht ausreichend vollständig für eine grüne Einstufung.`,
      };
    }

    return {
      trafficLight: "unknown",
      severity: "unknown",
      explanation: "Keine registrierte Regel hat auf die erfassten Angaben zugetroffen.",
    };
  }

  maxSeverity(values: AssessmentSeverity[]): AssessmentSeverity {
    let best = -1;
    for (const value of values) {
      const index = SEVERITY_ORDER.indexOf(value);
      if (index > best) best = index;
    }
    return best < 0 ? "unknown" : SEVERITY_ORDER[best];
  }
}
