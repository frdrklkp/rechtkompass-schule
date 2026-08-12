/**
 * Sprint 4.5B – Export-Route.
 * GET /api/workflow-sessions/:id/documents/:docId/export?format=md|docx|pdf
 * Rendert das gespeicherte Markdown deterministisch. Keine erneute KI.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withWorkflowApiRaw } from "@/lib/workflowApi.server";
import { buildDocGenBundle, loadRuntimeForSession } from "@/lib/documentGeneration.server";
import { WorkflowError } from "@/services/legal-workflows";
import { docGenTelemetry } from "@/services/document-generation";

type ExportFormat = "md" | "docx" | "pdf";

function isExportFormat(x: unknown): x is ExportFormat {
  return x === "md" || x === "docx" || x === "pdf";
}

async function getExportAdapter(format: ExportFormat) {
  switch (format) {
    case "md": {
      const { MarkdownExportAdapter } = await import("@/services/document-generation/export/MarkdownExportAdapter");
      return new MarkdownExportAdapter();
    }
    case "docx": {
      const { DocxExportAdapter } = await import("@/services/document-generation/export/DocxExportAdapter");
      return new DocxExportAdapter();
    }
    case "pdf": {
      const { PdfExportAdapter } = await import("@/services/document-generation/export/PdfExportAdapter");
      return new PdfExportAdapter();
    }
    default:
      throw new Error(`Unbekanntes Exportformat: ${format satisfies never}`);
  }
}

export const Route = createFileRoute("/api/workflow-sessions/$id/documents/$docId/export")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withWorkflowApiRaw(request, "GET /api/workflow-sessions/:id/documents/:docId/export", async (ctx) => {
          const url = new URL(request.url);
          const format = url.searchParams.get("format") ?? "md";
          if (!isExportFormat(format)) {
            throw new WorkflowError("invalid_input", `Unbekanntes Format: ${format}`);
          }
          const supabase = (ctx.templates as unknown as { db: unknown }).db as never;
          const bundle = buildDocGenBundle(supabase);

          // Ownership-Check
          await loadRuntimeForSession({
            sessionId: params.id, userId: ctx.userId,
            sessions: ctx.sessions, templateRepo: ctx.templates,
          });
          const document = await bundle.documents.getById(params.docId);
          if (!document || document.sessionId !== params.id) {
            throw new WorkflowError("not_found", "Dokument nicht gefunden.");
          }

          try {
            const adapter = await getExportAdapter(format);
            const result = await adapter.export(document);
            docGenTelemetry.emit({
              event: "document_downloaded",
              sessionId: document.sessionId,
              documentId: document.id,
              templateSlug: document.templateSlug,
              detail: { format, bytes: result.bytes.byteLength },
            });
            const arrayBuf = result.bytes.buffer.slice(
              result.bytes.byteOffset,
              result.bytes.byteOffset + result.bytes.byteLength,
            ) as ArrayBuffer;
            return new Response(arrayBuf, {
              status: 200,
              headers: {
                "Content-Type": result.contentType,
                "Content-Disposition": `attachment; filename="${result.filename}"`,
                "Cache-Control": "no-store",
              },
            });
          } catch (err) {
            docGenTelemetry.emit({
              event: "document_export_failed",
              sessionId: document.sessionId,
              documentId: document.id,
              templateSlug: document.templateSlug,
              detail: { format, message: (err as Error)?.message },
            });
            throw err;
          }
        }),
    },
  },
});
