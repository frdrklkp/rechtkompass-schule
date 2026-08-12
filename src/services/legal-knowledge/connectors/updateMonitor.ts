/**
 * Sprint 4.5G – Legal Update Monitor.
 *
 * Speichert je offizieller Quelle den Aktualisierungsstatus (lokal, wie die
 * übrige Legal-Knowledge-Persistenz aus Sprint 4.5F). Keine Hintergrundjobs,
 * keine Scheduler – Prüfungen werden ausschließlich manuell ausgelöst.
 * Die Schnittstelle ist so gehalten, dass ein Scheduler später nur
 * `checkSource` aufrufen müsste.
 */
import type { ConnectorPreview } from "./OfficialSourceConnectorService";

const KEY = "lk.connector.updatestatus.v1";

export type UpdateStatus = "current" | "updates_available" | "import_required" | "unknown";

export interface SourceUpdateState {
  sourceId: string;
  label: string;
  url: string;
  status: UpdateStatus;
  lastCheckedAt: string | null;
  lastImportedAt: string | null;
  installedVersion: string | null;
  onlineVersion: string | null;
  publishedAt: string | null;
  changedAt: string | null;
  newDocuments: number;
  changedDocuments: number;
  removedDocuments: number;
  versionConflict: boolean;
  lastError: string | null;
}

function read(): Record<string, SourceUpdateState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, SourceUpdateState>) : {};
  } catch {
    return {};
  }
}

function write(map: Record<string, SourceUpdateState>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* Quota – ignorieren */
  }
}

export function listUpdateStates(): SourceUpdateState[] {
  return Object.values(read()).sort((a, b) => a.label.localeCompare(b.label));
}

export function getUpdateState(sourceId: string): SourceUpdateState | null {
  return read()[sourceId] ?? null;
}

export function saveUpdateState(state: SourceUpdateState): void {
  const map = read();
  map[state.sourceId] = state;
  write(map);
}

export function clearUpdateStates(): void {
  write({});
}

/** Leitet den Ampelstatus deterministisch aus dem Delta ab. */
export function deriveStatus(input: {
  added: number;
  updated: number;
  removed: number;
  versionConflict: boolean;
  installedVersion: string | null;
  onlineVersion: string | null;
}): UpdateStatus {
  if (input.versionConflict) return "import_required";
  const changes = input.added + input.updated + input.removed;
  if (changes === 0) return "current";
  if (!input.installedVersion) return "import_required";
  if (input.onlineVersion && input.installedVersion && input.onlineVersion !== input.installedVersion) {
    return "import_required";
  }
  return "updates_available";
}

export const UPDATE_STATUS_LABEL: Record<UpdateStatus, string> = {
  current: "Aktuell",
  updates_available: "Änderungen verfügbar",
  import_required: "Import erforderlich",
  unknown: "Nicht geprüft",
};

export const UPDATE_STATUS_TONE: Record<UpdateStatus, "emerald" | "amber" | "rose" | "muted"> = {
  current: "emerald",
  updates_available: "amber",
  import_required: "rose",
  unknown: "muted",
};

/** Baut den Zustand aus einer Connector-Vorschau (Prüfung ohne Import). */
export function stateFromPreview(
  preview: ConnectorPreview,
  previous: SourceUpdateState | null,
  nowIso = new Date().toISOString(),
): SourceUpdateState {
  const installedVersion = previous?.installedVersion ?? null;
  const onlineVersion = preview.document.version.label;
  return {
    sourceId: preview.definition.id,
    label: preview.definition.label,
    url: preview.startUrl,
    status: deriveStatus({
      added: preview.delta.added,
      updated: preview.delta.updated,
      removed: preview.delta.removed,
      versionConflict: preview.versionConflict,
      installedVersion,
      onlineVersion,
    }),
    lastCheckedAt: nowIso,
    lastImportedAt: previous?.lastImportedAt ?? null,
    installedVersion,
    onlineVersion,
    publishedAt: preview.document.version.publishedAt ?? null,
    changedAt: preview.document.version.validFrom ?? null,
    newDocuments: preview.delta.added,
    changedDocuments: preview.delta.updated,
    removedDocuments: preview.delta.removed,
    versionConflict: preview.versionConflict,
    lastError: null,
  };
}

/** Nach erfolgreichem Import: installierte Version fortschreiben. */
export function markImported(
  preview: ConnectorPreview,
  nowIso = new Date().toISOString(),
): SourceUpdateState {
  const previous = getUpdateState(preview.definition.id);
  const state: SourceUpdateState = {
    ...(previous ?? {
      sourceId: preview.definition.id,
      label: preview.definition.label,
      url: preview.startUrl,
      publishedAt: null,
      changedAt: null,
      lastError: null,
    } as SourceUpdateState),
    sourceId: preview.definition.id,
    label: preview.definition.label,
    url: preview.startUrl,
    status: "current",
    lastCheckedAt: nowIso,
    lastImportedAt: nowIso,
    installedVersion: preview.document.version.label,
    onlineVersion: preview.document.version.label,
    publishedAt: preview.document.version.publishedAt ?? null,
    changedAt: preview.document.version.validFrom ?? null,
    newDocuments: 0,
    changedDocuments: 0,
    removedDocuments: 0,
    versionConflict: false,
    lastError: null,
  };
  saveUpdateState(state);
  return state;
}

export function markCheckFailed(
  sourceId: string,
  label: string,
  url: string,
  message: string,
  nowIso = new Date().toISOString(),
): SourceUpdateState {
  const previous = getUpdateState(sourceId);
  const state: SourceUpdateState = {
    sourceId,
    label,
    url,
    status: previous?.status ?? "unknown",
    lastCheckedAt: nowIso,
    lastImportedAt: previous?.lastImportedAt ?? null,
    installedVersion: previous?.installedVersion ?? null,
    onlineVersion: previous?.onlineVersion ?? null,
    publishedAt: previous?.publishedAt ?? null,
    changedAt: previous?.changedAt ?? null,
    newDocuments: previous?.newDocuments ?? 0,
    changedDocuments: previous?.changedDocuments ?? 0,
    removedDocuments: previous?.removedDocuments ?? 0,
    versionConflict: previous?.versionConflict ?? false,
    lastError: message,
  };
  saveUpdateState(state);
  return state;
}
