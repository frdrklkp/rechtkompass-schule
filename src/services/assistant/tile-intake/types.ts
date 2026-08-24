/**
 * Tier 3 – Kachelbasierte Frage-für-Frage-Erfassung des Assistenten.
 * Ersetzt die frühere Freitext-Pipeline (AssistantOrchestrator) als primären
 * Einstieg unter /assistent. Keine KI, keine erfundenen Tatsachen -
 * ausschließlich strukturierte Antworten auf feste Fragen.
 */
import type { SituationCase } from "@/services/situation-analyzer";
import type { PracticeCaseMatchResult } from "@/services/practice-case-matching";

export const TILE_INTAKE_SESSION_VERSION = 1;
export const TILE_INTAKE_SESSION_STORAGE_KEY = "rk:assistant:tile-intake:v1";
export const TILE_INTAKE_NAVIGATOR_ID = "aktueller-vorgang";
export const TILE_INTAKE_WORKFLOW_ID = "assistent-kachel-uebergabe";

export type TileIntakeMode = "schnell" | "dokumentieren";

export type TileIntakeStage =
  | "modeChoice"
  | "questions"
  | "optionalDetails"
  | "quickResult"
  | "handedOff";

export interface TileIntakeSession {
  version: number;
  sessionId: string;
  navigatorId: string;
  workflowId: string;
  mode: TileIntakeMode | null;
  stage: TileIntakeStage;
  situation: SituationCase;
  /** Reihenfolge-Index in der aktiven Fragefolge (Kern- oder optionale Sequenz). */
  cursor: number;
  /** true, sobald der Nutzer die optionale Zusatzfolge aktiv betreten hat. */
  optionalDetailsStarted: boolean;
  matchResult: PracticeCaseMatchResult | null;
  selectedCaseId: string | null;
  startedAt: string;
  updatedAt: string;
}
