/**
 * Sprint 4.6C – Generisches Standardregelset.
 * Bewusst neutral: keine schulrechtlichen Falllösungen, keine Handlungsempfehlungen.
 */
import type { AssessmentRule } from "./types";

function rule(input: AssessmentRule): AssessmentRule {
  return input;
}

export const STANDARD_ASSESSMENT_RULES: AssessmentRule[] = [
  rule({
    id: "acute-danger-reported",
    version: 1,
    title: "Akute Gefahr gemeldet",
    description:
      "Es wurde ausdrücklich angegeben, dass eine akute Gefahr gemeldet wurde. Diese Angabe ist als kritisches Merkmal definiert.",
    category: "danger",
    priority: "critical",
    enabled: true,
    conditions: [
      {
        field: "dangerInformation.acuteDangerReported",
        operator: "isTrue",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
    ],
    result: {
      trafficLightContribution: "red",
      severityContribution: "critical",
      confidenceImpact: 10,
      reason: "Akute Gefahr wurde ausdrücklich gemeldet.",
      flag: "acuteDanger",
    },
    reasonTemplate: "Es wurde angegeben, dass eine akute Gefahr gemeldet wurde.",
    requiredFields: ["dangerInformation.acuteDangerReported"],
    stopProcessing: false,
  }),
  rule({
    id: "emergency-services-involved",
    version: 1,
    title: "Externe Notfallstellen beteiligt",
    description:
      "Es wurde angegeben, dass Rettungsdienst, Polizei oder eine vergleichbare Stelle beteiligt war.",
    category: "danger",
    priority: "critical",
    enabled: true,
    conditions: [
      {
        field: "dangerInformation.emergencyServicesInvolved",
        operator: "isTrue",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
    ],
    result: {
      trafficLightContribution: "red",
      severityContribution: "critical",
      confidenceImpact: 5,
      reason: "Beteiligung externer Notfallstellen wurde angegeben.",
      flag: "emergencyServices",
    },
    reasonTemplate:
      "Es wurde angegeben, dass externe Notfallstellen (z. B. Rettungsdienst oder Polizei) beteiligt waren.",
    requiredFields: ["dangerInformation.emergencyServicesInvolved"],
    stopProcessing: false,
  }),
  rule({
    id: "danger-ongoing",
    version: 1,
    title: "Gefahr dauert an",
    description: "Es wurde angegeben, dass die gemeldete Gefahr weiterhin andauert.",
    category: "danger",
    priority: "critical",
    enabled: true,
    conditions: [
      {
        field: "dangerInformation.ongoing",
        operator: "isTrue",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
    ],
    result: {
      trafficLightContribution: "red",
      severityContribution: "critical",
      confidenceImpact: 5,
      reason: "Die gemeldete Gefahr dauert nach den Angaben weiterhin an.",
      flag: "dangerOngoing",
    },
    reasonTemplate: "Es wurde angegeben, dass die gemeldete Gefahr weiterhin andauert.",
    requiredFields: ["dangerInformation.ongoing"],
    stopProcessing: false,
  }),
  rule({
    id: "affected-persons-reported",
    version: 1,
    title: "Unmittelbar betroffene Personen angegeben",
    description:
      "Es wurden Personen erfasst, die unmittelbar von der Situation betroffen sind.",
    category: "danger",
    priority: "high",
    enabled: true,
    conditions: [
      {
        field: "dangerInformation.affectedPersons",
        operator: "countGreaterThan",
        value: 0,
        valueType: "number",
        operatorGroup: "collection",
      },
    ],
    result: {
      trafficLightContribution: "yellow",
      severityContribution: "moderate",
      confidenceImpact: 5,
      reason: "Es wurden unmittelbar betroffene Personen angegeben.",
    },
    reasonTemplate: "Es wurden Personen erfasst, die unmittelbar betroffen sind.",
    requiredFields: [],
    stopProcessing: false,
  }),
  rule({
    id: "incident-ongoing",
    version: 1,
    title: "Situation dauert an",
    description:
      "Die Situation wurde ausdrücklich als andauernd erfasst. Eine andauernde Situation kann sich verändern und wird deshalb als Merkmal mit erhöhter Aufmerksamkeit bewertet. Sie wird nur dann rot eingestuft, wenn zusätzlich ein Gefahrenmerkmal erfasst ist – für sich genommen bleibt sie gelb.",
    category: "continuity",
    priority: "high",
    enabled: true,
    conditions: [
      {
        field: "incident.isOngoing",
        operator: "isTrue",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
    ],
    result: {
      trafficLightContribution: "yellow",
      severityContribution: "high",
      confidenceImpact: 5,
      reason: "Die Situation dauert nach den Angaben weiterhin an.",
      flag: "ongoing",
    },
    reasonTemplate: "Es wurde angegeben, dass die Situation weiterhin andauert.",
    requiredFields: ["incident.isOngoing"],
    stopProcessing: false,
  }),
  rule({
    id: "incident-repeated",
    version: 1,
    title: "Wiederholtes Geschehen",
    description: "Es wurde angegeben, dass sich das Geschehen wiederholt hat.",
    category: "repetition",
    priority: "normal",
    enabled: true,
    conditions: [
      {
        field: "incident.wasRepeated",
        operator: "isTrue",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
    ],
    result: {
      trafficLightContribution: "yellow",
      severityContribution: "moderate",
      confidenceImpact: 5,
      reason: "Ein wiederholtes Geschehen wurde angegeben.",
    },
    reasonTemplate: "Es wurde angegeben, dass sich das Geschehen wiederholt hat.",
    requiredFields: ["incident.wasRepeated"],
    stopProcessing: false,
  }),
  rule({
    id: "danger-question-unknown",
    version: 1,
    title: "Angabe zur Gefahrenlage ausdrücklich unbekannt",
    description:
      "Die Angabe zur akuten Gefahr wurde ausdrücklich als unbekannt markiert oder nicht beantwortet.",
    category: "completeness",
    priority: "high",
    enabled: true,
    conditions: [
      {
        field: "dangerInformation.acuteDangerReported",
        operator: "equals",
        value: "unknown",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
    ],
    result: {
      trafficLightContribution: "unknown",
      severityContribution: "unknown",
      confidenceImpact: -25,
      reason: "Ob eine akute Gefahr besteht, ist nach den Angaben nicht bekannt.",
      missingInformation: [
        {
          field: "dangerInformation.acuteDangerReported",
          label: "Meldung einer akuten Gefahr",
          reason: "Es ist noch nicht bekannt, ob eine akute Gefahr gemeldet wurde.",
          requiredFor: "Einstufung der Ampel",
          answerStatus: "unknown",
          severity: "critical",
        },
      ],
      limitation: "Ohne Angabe zur Gefahrenlage ist keine belastbare Einstufung möglich.",
    },
    reasonTemplate: "Es ist nicht bekannt, ob eine akute Gefahr gemeldet wurde.",
    requiredFields: [],
    stopProcessing: false,
  }),
  rule({
    id: "ongoing-question-unanswered",
    version: 1,
    title: "Angabe zum Andauern fehlt",
    description: "Es wurde nicht beantwortet, ob die Situation weiterhin andauert.",
    category: "completeness",
    priority: "high",
    enabled: true,
    conditions: [
      {
        field: "incident.isOngoing",
        operator: "equals",
        value: "notAnswered",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
    ],
    result: {
      trafficLightContribution: "unknown",
      severityContribution: "unknown",
      confidenceImpact: -20,
      reason: "Es ist nicht bekannt, ob die Situation weiterhin andauert.",
      missingInformation: [
        {
          field: "incident.isOngoing",
          label: "Andauern der Situation",
          reason: "Es ist noch nicht bekannt, ob die Situation weiterhin andauert.",
          requiredFor: "Einstufung der Ampel",
          answerStatus: "notAnswered",
          severity: "critical",
        },
      ],
      limitation:
        "Ohne Angabe zum Andauern der Situation ist keine belastbare Einstufung möglich.",
    },
    reasonTemplate: "Die Frage, ob die Situation weiterhin andauert, wurde nicht beantwortet.",
    requiredFields: [],
    stopProcessing: false,
  }),
  rule({
    id: "incident-time-unknown",
    version: 1,
    title: "Zeitpunkt des Vorfalls nicht erfasst",
    description: "Der Zeitpunkt des Vorfalls wurde nicht beantwortet oder ist unbekannt.",
    category: "completeness",
    priority: "normal",
    enabled: true,
    conditions: [
      {
        field: "incident.occurredAt",
        operator: "notExists",
        valueType: "none",
        operatorGroup: "existence",
      },
    ],
    result: {
      trafficLightContribution: "unknown",
      severityContribution: "unknown",
      confidenceImpact: -10,
      reason: "Der Zeitpunkt des Vorfalls wurde nicht erfasst.",
      missingInformation: [
        {
          field: "incident.occurredAt",
          label: "Zeitpunkt des Vorfalls",
          reason: "Der Zeitpunkt des Vorfalls wurde nicht beantwortet.",
          requiredFor: "Einordnung der zeitlichen Dringlichkeit",
          answerStatus: "notAnswered",
          severity: "relevant",
        },
      ],
    },
    reasonTemplate: "Der Zeitpunkt des Vorfalls wurde nicht erfasst.",
    requiredFields: [],
    stopProcessing: false,
  }),
  rule({
    id: "no-critical-features",
    version: 1,
    title: "Keine akute Gefahr gemeldet und Situation beendet",
    description:
      "Es wurde ausdrücklich angegeben, dass keine akute Gefahr gemeldet wurde und dass die Situation nicht mehr andauert.",
    category: "danger",
    priority: "normal",
    enabled: true,
    conditions: [
      {
        field: "dangerInformation.acuteDangerReported",
        operator: "isFalse",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
      {
        field: "incident.isOngoing",
        operator: "isFalse",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
    ],
    result: {
      trafficLightContribution: "green",
      severityContribution: "none",
      confidenceImpact: 15,
      reason: "Es wurde weder eine akute Gefahr gemeldet noch dauert die Situation an.",
    },
    reasonTemplate:
      "Es wurde angegeben, dass keine akute Gefahr gemeldet wurde und die Situation nicht mehr andauert.",
    requiredFields: ["dangerInformation.acuteDangerReported", "incident.isOngoing"],
    stopProcessing: false,
  }),
  rule({
    id: "documentation-available",
    version: 1,
    title: "Dokumentation vorhanden",
    description:
      "Es wurde angegeben, dass Notizen oder ein Vorfallsbericht vorliegen. Dies stärkt die Datengrundlage, verändert die Ampel jedoch nicht.",
    category: "documentation",
    priority: "low",
    enabled: true,
    conditions: [
      {
        field: "documentationStatus.notesAvailable",
        operator: "isTrue",
        valueType: "knowledgeState",
        operatorGroup: "knowledge",
      },
    ],
    result: {
      trafficLightContribution: "unknown",
      severityContribution: "unknown",
      confidenceImpact: 10,
      reason: "Es liegt eine Dokumentation der Situation vor.",
    },
    reasonTemplate: "Es wurde angegeben, dass eine Dokumentation vorliegt.",
    requiredFields: [],
    stopProcessing: false,
    metadata: { affectsTrafficLight: false, qualityIndicator: true },
  }),
  rule({
    id: "evidence-available",
    version: 1,
    title: "Nachweise vorhanden",
    description:
      "Es wurden strukturierte Nachweise erfasst. Dies stärkt die Datengrundlage, verändert die Ampel jedoch nicht.",
    category: "evidence",
    priority: "low",
    enabled: true,
    conditions: [
      {
        field: "evidence",
        operator: "countGreaterThan",
        value: 0,
        valueType: "number",
        operatorGroup: "collection",
      },
    ],
    result: {
      trafficLightContribution: "unknown",
      severityContribution: "unknown",
      confidenceImpact: 10,
      reason: "Es wurden strukturierte Nachweise erfasst.",
    },
    reasonTemplate: "Es wurden Nachweise zur Situation erfasst.",
    requiredFields: [],
    stopProcessing: false,
    metadata: { affectsTrafficLight: false, qualityIndicator: true },
  }),
];

/**
 * Regeln, deren Ergebnis ausdrücklich nur die Datengrundlage beeinflusst.
 * Ihr `trafficLightContribution` wird bei der Aggregation ignoriert.
 */
export function isQualityIndicatorRule(ruleId: string): boolean {
  const found = STANDARD_ASSESSMENT_RULES.find((r) => r.id === ruleId);
  return found?.metadata?.affectsTrafficLight === false;
}
