import type { CopilotConfidence } from "./types";

const BASE =
  "Diese Auskunft ersetzt keine Rechtsberatung. Sie basiert ausschließlich auf den gefundenen Rechtsgrundlagen. Für den Einzelfall ist eine juristische Prüfung erforderlich.";

export const DisclaimerBuilder = {
  build(confidence: CopilotConfidence): string {
    if (confidence.level === "low") {
      return `Hinweis: Die Konfidenz ist gering (${(confidence.overall * 100).toFixed(0)} %). ${BASE}`;
    }
    if (confidence.level === "medium") {
      return `Hinweis: Die Antwort basiert auf begrenzten Quellen. ${BASE}`;
    }
    return BASE;
  },
};
