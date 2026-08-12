import type { ExplanationMode } from "./types";

export const EXPLANATION_MODES: ExplanationMode[] = [
  "kurz", "standard", "ausfuehrlich", "juristisch", "einfach",
];

const LABELS: Record<ExplanationMode, string> = {
  kurz: "Kurz",
  standard: "Standard",
  ausfuehrlich: "Ausführlich",
  juristisch: "Juristisch",
  einfach: "Einfach erklärt",
};

const INSTRUCTIONS: Record<ExplanationMode, string> = {
  kurz: "Maximal 2 kurze Sätze pro Abschnitt. Ohne Fachjargon.",
  standard: "Klar, präzise, keine Wiederholungen. Fachbegriffe kurz erklären.",
  ausfuehrlich: "Ausführlich mit Kontext und Beispielen, aber ohne Spekulation.",
  juristisch: "Präzise juristische Sprache, exakte Fundstellen, keine Vereinfachung.",
  einfach: "Einfache Sprache, kurze Sätze, keine Fremdwörter.",
};

export const ExplanationModeSpec = {
  normalize(mode: string | undefined | null): ExplanationMode {
    const m = (mode ?? "").toString().toLowerCase();
    return (EXPLANATION_MODES as string[]).includes(m) ? (m as ExplanationMode) : "standard";
  },
  label(mode: ExplanationMode): string { return LABELS[mode]; },
  instruction(mode: ExplanationMode): string { return INSTRUCTIONS[mode]; },
};
