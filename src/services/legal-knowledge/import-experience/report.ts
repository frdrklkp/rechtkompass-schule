/**
 * Sprint 4.5H – Importbericht: Aufbau, Markdown-Rendering und Prüfsumme.
 * Nutzt ausschließlich Ergebnisse des bestehenden Importframeworks.
 */
import { flatten, hashNode } from "../import";
import { buildDocumentOverview } from "./previewModel";
import type { ImportReport, ImportReportInput } from "./types";

function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Stabile Prüfsumme über alle Knotenhashes des Dokuments. */
export function documentContentHash(input: ImportReportInput["document"]): string {
  const parts = flatten(input.root).map((n) => `${n.localId}:${hashNode(n)}`);
  return djb2(`${input.source.key}|${input.version.label}|${parts.join(",")}`);
}

export function buildImportReport(input: ImportReportInput): ImportReport {
  const overview = buildDocumentOverview(input.document);
  const versionConflicts = input.validation.issues.filter(
    (i) => i.code === "version_conflict",
  ).length;
  const errors = [
    ...input.validation.issues
      .filter((i) => i.severity === "error")
      .map((i) => `[${i.code}] ${i.message}`),
    ...(input.errors ?? []),
  ];
  return {
    id:
      input.id ??
      `rep-${djb2(`${input.document.source.key}${input.importedAt ?? ""}${input.durationMs}`)}`,
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    sourceKey: input.document.source.key,
    sourceTitle: input.document.source.title,
    versionLabel: input.document.version.label,
    importedAt: input.importedAt ?? new Date().toISOString(),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    parserId: input.parser.id,
    parserLabel: input.parser.label,
    documents: overview.documents,
    paragraphs: overview.paragraphs,
    attachments: overview.attachments,
    delta: {
      added: input.delta.added,
      updated: input.delta.updated,
      removed: input.delta.removed,
      unchanged: input.delta.unchanged,
    },
    versionConflicts,
    errors,
    contentHash: documentContentHash(input.document),
  };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("de-DE");
}

export function renderImportReportMarkdown(report: ImportReport): string {
  const lines: string[] = [
    `# Importbericht – ${report.sourceTitle}`,
    "",
    `- **Quelle:** ${report.sourceTitle} (\`${report.sourceKey}\`)`,
    `- **Version:** ${report.versionLabel}`,
    `- **Importdatum:** ${fmtDate(report.importedAt)}`,
    `- **Importdauer:** ${report.durationMs} ms`,
    `- **Parser:** ${report.parserLabel} (\`${report.parserId}\`)`,
    `- **Modus:** ${report.mode === "connector" ? "Official Source Connector" : "Import-Wizard"}`,
    "",
    "## Umfang",
    "",
    `| Kennzahl | Wert |`,
    `| --- | ---: |`,
    `| Dokumente | ${report.documents} |`,
    `| Paragraphen | ${report.paragraphs} |`,
    `| Anlagen | ${report.attachments} |`,
    "",
    "## Delta",
    "",
    `| Änderung | Anzahl |`,
    `| --- | ---: |`,
    `| Neu | ${report.delta.added} |`,
    `| Geändert | ${report.delta.updated} |`,
    `| Entfernt | ${report.delta.removed} |`,
    `| Unverändert | ${report.delta.unchanged} |`,
    "",
    "## Qualität",
    "",
    `- **Versionskonflikte:** ${report.versionConflicts}`,
    `- **Fehler:** ${report.errors.length === 0 ? "keine" : report.errors.length}`,
  ];
  for (const err of report.errors) lines.push(`  - ${err}`);
  lines.push(
    "",
    `- **Hash:** \`${report.contentHash}\``,
    "",
    `_Erzeugt am ${fmtDate(report.generatedAt)} · RechtsKompass Legal Knowledge_`,
  );
  return lines.join("\n");
}

export function importReportFileName(report: ImportReport, ext: "md" | "pdf"): string {
  const slug = report.sourceKey.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const date = report.importedAt.slice(0, 10);
  return `importbericht-${slug}-${date}.${ext}`;
}
