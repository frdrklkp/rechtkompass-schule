/** Sprint 4.5H – Importbericht: Anzeige und Download (PDF / Markdown). */
import { useState } from "react";
import { FileDown, FileText, ShieldCheck } from "lucide-react";
import type { ImportReport } from "@/services/legal-knowledge/import-experience";
import {
  renderImportReportMarkdown,
  importReportFileName,
} from "@/services/legal-knowledge/import-experience";
import { buildImportReportPdf, downloadBlob } from "@/lib/importReportPdf";

export function ImportReportPanel({ report }: { report: ImportReport }) {
  const [busy, setBusy] = useState(false);

  function downloadMarkdown() {
    const blob = new Blob([renderImportReportMarkdown(report)], {
      type: "text/markdown;charset=utf-8",
    });
    downloadBlob(blob, importReportFileName(report, "md"));
  }

  async function downloadPdf() {
    setBusy(true);
    try {
      const blob = await buildImportReportPdf(report);
      downloadBlob(blob, importReportFileName(report, "pdf"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4" />
          Importbericht
        </h2>
        <div className="flex gap-2">
          <button
            onClick={downloadMarkdown}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent"
          >
            <FileText className="h-3.5 w-3.5" />
            Markdown
          </button>
          <button
            onClick={() => void downloadPdf()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" />
            {busy ? "Erzeuge…" : "PDF"}
          </button>
        </div>
      </header>

      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <Row label="Quelle" value={report.sourceTitle} />
        <Row label="Version" value={report.versionLabel} />
        <Row label="Importdatum" value={new Date(report.importedAt).toLocaleString("de-DE")} />
        <Row label="Importdauer" value={`${report.durationMs} ms`} />
        <Row label="Parser" value={report.parserLabel} />
        <Row label="Dokumente" value={String(report.documents)} />
        <Row label="Paragraphen" value={String(report.paragraphs)} />
        <Row label="Anlagen" value={String(report.attachments)} />
        <Row
          label="Delta"
          value={`+${report.delta.added} · ~${report.delta.updated} · −${report.delta.removed}`}
        />
        <Row label="Versionskonflikte" value={String(report.versionConflicts)} />
        <Row
          label="Fehler"
          value={report.errors.length === 0 ? "keine" : String(report.errors.length)}
        />
        <Row label="Hash" value={report.contentHash} />
      </dl>
      <p className="text-[11px] text-muted-foreground">
        Der Bericht wurde im Dokumentenbestand registriert und ist in der Importhistorie abrufbar.
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/60 py-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
