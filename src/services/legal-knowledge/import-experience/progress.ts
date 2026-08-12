/**
 * Sprint 4.5H – Benutzerführung: definierte Phasen des Importvorgangs.
 * Reine Beschreibung, keine Ausführung – die Orchestrierung bleibt unverändert.
 */
import type { CrawlPhase } from "../connectors/types";

export type ImportStepId =
  | "fetch"
  | "analyze"
  | "links"
  | "documents"
  | "parse"
  | "validate"
  | "delta"
  | "version"
  | "done";

export interface ImportStep {
  id: ImportStepId;
  label: string;
  description: string;
}

export const IMPORT_STEPS: ImportStep[] = [
  {
    id: "fetch",
    label: "Quelle wird geladen",
    description: "Amtliche Startseite wird über HTTPS abgerufen.",
  },
  {
    id: "analyze",
    label: "HTML wird analysiert",
    description: "Markup wird bereinigt und Text extrahiert.",
  },
  {
    id: "links",
    label: "Links werden gefunden",
    description: "Unterseiten und Anlagen werden erkannt.",
  },
  {
    id: "documents",
    label: "Dokumente werden geladen",
    description: "Erkannte Dokumente werden nachgeladen.",
  },
  {
    id: "parse",
    label: "Parser läuft",
    description: "Struktur wird in Paragraphen und Absätze überführt.",
  },
  {
    id: "validate",
    label: "Validierung",
    description: "Pflichtangaben und Struktur werden geprüft.",
  },
  { id: "delta", label: "Delta", description: "Abgleich mit der installierten Fassung." },
  {
    id: "version",
    label: "Versionierung",
    description: "Fassung und Prüfsummen werden zugeordnet.",
  },
  {
    id: "done",
    label: "Import abgeschlossen",
    description: "Ergebnis liegt zur Bestätigung bereit.",
  },
];

export type StepState = "pending" | "active" | "done" | "failed";

const PHASE_TO_STEP: Record<CrawlPhase, ImportStepId> = {
  idle: "fetch",
  discovering: "links",
  downloading: "documents",
  extracting: "analyze",
  parsing: "parse",
  validating: "validate",
  delta: "delta",
  ready: "done",
  failed: "fetch",
};

export function stepIdForPhase(phase: CrawlPhase): ImportStepId {
  return PHASE_TO_STEP[phase] ?? "fetch";
}

export function stepStates(
  currentId: ImportStepId,
  options: { failed?: boolean } = {},
): { step: ImportStep; state: StepState }[] {
  const index = IMPORT_STEPS.findIndex((s) => s.id === currentId);
  return IMPORT_STEPS.map((step, i) => {
    if (i < index) return { step, state: "done" as StepState };
    if (i === index)
      return {
        step,
        state: (options.failed ? "failed" : currentId === "done" ? "done" : "active") as StepState,
      };
    return { step, state: "pending" as StepState };
  });
}

/** Fortschritt 0..1 für die Anzeige. */
export function progressRatio(currentId: ImportStepId): number {
  const index = IMPORT_STEPS.findIndex((s) => s.id === currentId);
  if (index < 0) return 0;
  return Number(((index + 1) / IMPORT_STEPS.length).toFixed(3));
}
