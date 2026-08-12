/**
 * Sprint 4.5H – Lokale Persistenz der Import-Experience-Schicht.
 *
 * Speichert (a) den Abschnittsindex der zuletzt übernommenen Fassung für den
 * Versionsvergleich, (b) erzeugte Importberichte und (c) Kennzahlen je Quelle
 * für Dashboard und Quellenübersicht. Das Importframework bleibt unberührt.
 */
import type { PreviousSectionIndex } from "./previewModel";
import type { ImportReport } from "./types";

const SECTION_KEY = "lk.import.sections.v1";
const REPORT_KEY = "lk.import.reports.v1";
const METRIC_KEY = "lk.import.metrics.v1";

export interface SourceImportMetrics {
  sourceKey: string;
  sourceTitle: string;
  versionLabel: string;
  documents: number;
  paragraphs: number;
  attachments: number;
  changed: number;
  sizeBytes: number;
  contentHash: string;
  lastImportedAt: string;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Quota – bewusst ignorieren */
  }
}

/* ---------- Abschnittsindex ---------- */

export function getSectionIndex(sourceKey: string): PreviousSectionIndex {
  const map = read<Record<string, PreviousSectionIndex>>(SECTION_KEY, {});
  return map[sourceKey] ?? {};
}

export function saveSectionIndex(sourceKey: string, index: PreviousSectionIndex): void {
  const map = read<Record<string, PreviousSectionIndex>>(SECTION_KEY, {});
  map[sourceKey] = index;
  write(SECTION_KEY, map);
}

/* ---------- Importberichte (Dokumentenregistrierung) ---------- */

export function listImportReports(): ImportReport[] {
  return read<ImportReport[]>(REPORT_KEY, []);
}

export function registerImportReport(report: ImportReport): void {
  const list = listImportReports().filter((r) => r.id !== report.id);
  list.unshift(report);
  write(REPORT_KEY, list.slice(0, 100));
}

export function getImportReport(id: string): ImportReport | null {
  return listImportReports().find((r) => r.id === id) ?? null;
}

/* ---------- Kennzahlen je Quelle ---------- */

export function listSourceMetrics(): SourceImportMetrics[] {
  return read<SourceImportMetrics[]>(METRIC_KEY, []);
}

export function saveSourceMetrics(metrics: SourceImportMetrics): void {
  const list = listSourceMetrics().filter((m) => m.sourceKey !== metrics.sourceKey);
  list.unshift(metrics);
  write(METRIC_KEY, list.slice(0, 200));
}

export function getSourceMetrics(sourceKey: string): SourceImportMetrics | null {
  return listSourceMetrics().find((m) => m.sourceKey === sourceKey) ?? null;
}

export function aggregateSourceMetrics(list: SourceImportMetrics[] = listSourceMetrics()): {
  documents: number;
  paragraphs: number;
  attachments: number;
  changed: number;
  lastImportedAt: string | null;
} {
  return list.reduce(
    (acc, m) => ({
      documents: acc.documents + m.documents,
      paragraphs: acc.paragraphs + m.paragraphs,
      attachments: acc.attachments + m.attachments,
      changed: acc.changed + m.changed,
      lastImportedAt:
        !acc.lastImportedAt || m.lastImportedAt > acc.lastImportedAt
          ? m.lastImportedAt
          : acc.lastImportedAt,
    }),
    {
      documents: 0,
      paragraphs: 0,
      attachments: 0,
      changed: 0,
      lastImportedAt: null as string | null,
    },
  );
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
