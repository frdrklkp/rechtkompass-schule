/**
 * Sprint 4.6C – Erkennung widersprüchlicher Angaben und Regelergebnisse.
 * Konflikte werden nicht verborgen, sondern ausgewiesen.
 */
import type { SituationCase } from "@/services/situation-analyzer";
import type { RuleEvaluation } from "./AssessmentRuleEvaluator";
import { affectsTrafficLight } from "./AssessmentResultAggregator";
import { labelForField } from "./fieldLabels";
import type { AssessmentConflict, RulePriority } from "./types";

const PRIORITY_ORDER: Record<RulePriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class AssessmentConflictResolver {
  detect(situation: SituationCase, matched: RuleEvaluation[]): AssessmentConflict[] {
    const conflicts: AssessmentConflict[] = [];
    const relevant = matched.filter(affectsTrafficLight);

    // 1. Gegensätzliche Ampelbeiträge
    const reds = relevant.filter((e) => e.rule.result.trafficLightContribution === "red");
    const greens = relevant.filter((e) => e.rule.result.trafficLightContribution === "green");
    if (reds.length > 0 && greens.length > 0) {
      const bestRed = Math.min(...reds.map((e) => PRIORITY_ORDER[e.rule.priority]));
      const bestGreen = Math.min(...greens.map((e) => PRIORITY_ORDER[e.rule.priority]));
      const resolvable = bestRed < bestGreen;
      conflicts.push({
        id: "conflict_traffic_light",
        type: "contradictory_traffic_lights",
        description: resolvable
          ? "Dieselbe Situation wurde gleichzeitig als kritisch und als unkritisch eingestuft. Die kritische Regel besitzt die höhere Priorität und bestimmt die Ampel."
          : "Dieselbe Situation wurde gleichzeitig als kritisch und als unkritisch eingestuft. Eine eindeutige Einstufung ist nicht möglich.",
        ruleIds: [...reds, ...greens].map((e) => e.rule.id),
        fields: [...new Set([...reds, ...greens].flatMap((e) => e.rule.conditions.map((c) => c.field)))],
        blocksAssessment: !resolvable,
      });
    }

    // 2. Widersprüchliche Angaben im SituationCase
    if (
      situation.dangerInformation.ongoing === "known" &&
      situation.incident.isOngoing === "notApplicable"
    ) {
      conflicts.push({
        id: "conflict_ongoing_state",
        type: "contradictory_input",
        description:
          "Es wurde angegeben, dass die Gefahr andauert, gleichzeitig aber, dass die Situation beendet ist.",
        ruleIds: [],
        fields: ["dangerInformation.ongoing", "incident.isOngoing"],
        blocksAssessment: true,
      });
    }

    if (
      situation.dangerInformation.emergencyServicesInvolved === "known" &&
      situation.dangerInformation.acuteDangerReported === "notApplicable"
    ) {
      conflicts.push({
        id: "conflict_emergency_without_danger",
        type: "contradictory_input",
        description:
          "Es wurde angegeben, dass externe Notfallstellen beteiligt waren, obwohl ausdrücklich keine akute Gefahr gemeldet wurde.",
        ruleIds: [],
        fields: [
          "dangerInformation.emergencyServicesInvolved",
          "dangerInformation.acuteDangerReported",
        ],
        blocksAssessment: false,
      });
    }

    // 3. Feld gleichzeitig „unbekannt“ und mit konkretem Wert
    for (const uncertainty of situation.uncertainties) {
      const answer = situation.answers[uncertainty.questionId];
      if (answer && answer.answerStatus === "answered" && answer.value !== null && answer.value !== "") {
        conflicts.push({
          id: `conflict_ambiguous_${uncertainty.questionId}`,
          type: "ambiguous_field_state",
          description: `Die Angabe „${uncertainty.title}“ ist gleichzeitig als unbekannt markiert und mit einem konkreten Wert erfasst.`,
          ruleIds: [],
          fields: [uncertainty.questionId],
          blocksAssessment: true,
        });
      }
    }

    // 4. Unvereinbare Regelvoraussetzungen (dieselbe Feldgruppe, gegensätzliche Operatoren)
    const byField = new Map<string, RuleEvaluation[]>();
    for (const evaluation of relevant) {
      for (const condition of evaluation.rule.conditions) {
        const list = byField.get(condition.field) ?? [];
        list.push(evaluation);
        byField.set(condition.field, list);
      }
    }
    for (const [field, evaluations] of byField) {
      const hasTrue = evaluations.some((e) =>
        e.rule.conditions.some((c) => c.field === field && c.operator === "isTrue"),
      );
      const hasFalse = evaluations.some((e) =>
        e.rule.conditions.some((c) => c.field === field && c.operator === "isFalse"),
      );
      if (hasTrue && hasFalse) {
        conflicts.push({
          id: `conflict_requirements_${field}`,
          type: "incompatible_requirements",
          description: `Zwei zutreffende Regeln verlangen für „${labelForField(field)}“ unvereinbare Voraussetzungen.`,
          ruleIds: evaluations.map((e) => e.rule.id),
          fields: [field],
          blocksAssessment: true,
        });
      }
    }

    return conflicts;
  }
}
