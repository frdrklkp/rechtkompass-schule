/**
 * Sprint 4.6A – Standardablauf des Decision Navigators.
 * Universelle Phasenfolge ohne fachliche Inhalte.
 */
import type { NavigatorFlowDefinition } from "./types";

export const STANDARD_FLOW_ID = "standard-navigator-v1";

export function buildStandardFlow(): NavigatorFlowDefinition {
  return {
    id: STANDARD_FLOW_ID,
    title: "Decision Navigator",
    description:
      "Universeller Ablauf für die schrittweise Bearbeitung eines Falls – von der Situation bis zum Abschluss.",
    steps: [
      {
        id: "start",
        title: "Start",
        description: "Einstieg in die Fallbearbeitung. Der Ablauf führt Sie Schritt für Schritt.",
        type: "information",
      },
      {
        id: "situation",
        title: "Situation",
        description: "Erfassung der Ausgangssituation.",
        type: "frage",
      },
      {
        id: "analyse",
        title: "Analyse",
        description: "Sammlung der für die Einordnung notwendigen Angaben.",
        type: "analyse",
      },
      {
        id: "bewertung",
        title: "Bewertung",
        description: "Zusammenführung der Angaben zu einer Einschätzung.",
        type: "entscheidung",
      },
      {
        id: "sofortmassnahmen",
        title: "Sofortmaßnahmen",
        description: "Priorisierte Handlungsschritte.",
        type: "entscheidung",
      },
      {
        id: "dokumentation",
        title: "Dokumentation",
        description: "Festhalten des Vorgangs.",
        type: "dokumentation",
        optional: true,
      },
      {
        id: "rechtsgrundlagen",
        title: "Rechtsgrundlagen",
        description: "Anzeige der tragenden Quellen.",
        type: "rechtsgrundlage",
        optional: true,
      },
      {
        id: "vorlagen",
        title: "Vorlagen",
        description: "Passende Schriftstücke und Formulare.",
        type: "vorlage",
        optional: true,
      },
      {
        id: "abschluss",
        title: "Abschluss",
        description: "Zusammenfassung und Abschluss des Vorgangs.",
        type: "abschluss",
      },
    ],
  };
}
