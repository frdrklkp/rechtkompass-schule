/** Sprint 4.5H – PDF-Erzeugung für Importberichte (Client, pdf-lib). */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ImportReport } from "@/services/legal-knowledge/import-experience";
import { renderImportReportMarkdown } from "@/services/legal-knowledge/import-experience";

function plainLines(report: ImportReport): string[] {
  return renderImportReportMarkdown(report)
    .split("\n")
    .map((l) =>
      l
        .replace(/[*`_|]/g, "")
        .replace(/^#+\s*/, "")
        .replace(/^-\s*/, "• ")
        .trimEnd(),
    );
}

export async function buildImportReportPdf(report: ImportReport): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;

  const draw = (text: string, size = 10, useBold = false) => {
    if (y < 60) {
      page = pdf.addPage([595, 842]);
      y = 790;
    }
    page.drawText(text.slice(0, 110), {
      x: 50,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.1, 0.12, 0.16),
    });
    y -= size + 6;
  };

  draw(`Importbericht – ${report.sourceTitle}`, 16, true);
  y -= 6;
  for (const line of plainLines(report).slice(1)) {
    if (!line.trim()) {
      y -= 6;
      continue;
    }
    draw(
      line,
      line.startsWith("Umfang") || line.startsWith("Delta") || line.startsWith("Qualität")
        ? 12
        : 10,
      /^(Umfang|Delta|Qualität)/.test(line),
    );
  }

  const bytes = await pdf.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
