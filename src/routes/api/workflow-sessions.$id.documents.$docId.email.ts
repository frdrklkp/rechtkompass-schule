/**
 * E-Mail-Versand eines Vorgangs-Dokuments (2026-09-02).
 * POST /api/workflow-sessions/:id/documents/:docId/email
 * Body: { recipient_email, subject?, message? }
 *
 * Rendert das gespeicherte Markdown deterministisch als PDF (gleicher
 * Adapter wie der Export-Download, keine erneute KI) und versendet es als
 * Anhang über Resend. Authentifiziert + Ownership-Check wie die
 * Export-Route; zusätzlich Rate-Begrenzung, damit das Resend-Kontingent
 * nicht als Spam-Relais missbraucht werden kann.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withWorkflowApiRaw } from "@/lib/workflowApi.server";
import { buildDocGenBundle, loadRuntimeForSession } from "@/lib/documentGeneration.server";
import { WorkflowError } from "@/services/legal-workflows";
import { docGenTelemetry } from "@/services/document-generation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_LEN = 200;
const MAX_MESSAGE_LEN = 2000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Base64 ohne Node-Buffer - im Cloudflare Worker ist Buffer nicht garantiert. */
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/workflow-sessions/$id/documents/$docId/email")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withWorkflowApiRaw(request, "POST /api/workflow-sessions/:id/documents/:docId/email", async (ctx) => {
          const ip = getClientIp(request);
          if (!checkRateLimit(`workflow-document-email:${ctx.userId ?? ip}`, { max: 10, windowMs: 60 * 60 * 1000 })) {
            return jsonResponse({ error: "Zu viele E-Mail-Versendungen. Bitte später erneut versuchen." }, 429);
          }

          let body: { recipient_email?: string; subject?: string; message?: string };
          try {
            body = await request.json();
          } catch {
            throw new WorkflowError("invalid_input", "Ungültiges JSON");
          }
          const to = body.recipient_email?.trim();
          if (!to || !EMAIL_RE.test(to)) {
            throw new WorkflowError("invalid_input", "Ungültige Empfängeradresse");
          }
          if (body.subject && body.subject.length > MAX_SUBJECT_LEN) {
            throw new WorkflowError("invalid_input", `Betreff zu lang (max. ${MAX_SUBJECT_LEN} Zeichen)`);
          }
          if (body.message && body.message.length > MAX_MESSAGE_LEN) {
            throw new WorkflowError("invalid_input", `Nachricht zu lang (max. ${MAX_MESSAGE_LEN} Zeichen)`);
          }

          const supabase = (ctx.templates as unknown as { db: unknown }).db as never;
          const bundle = buildDocGenBundle(supabase);

          await loadRuntimeForSession({
            sessionId: params.id, userId: ctx.userId,
            sessions: ctx.sessions, templateRepo: ctx.templates,
          });
          const document = await bundle.documents.getById(params.docId);
          if (!document || document.sessionId !== params.id) {
            throw new WorkflowError("not_found", "Dokument nicht gefunden.");
          }

          const { PdfExportAdapter } = await import("@/services/document-generation/export/PdfExportAdapter");
          const pdf = await new PdfExportAdapter().export(document);
          const base64 = toBase64(pdf.bytes);

          // Bewusst NACH Ownership-Check und PDF-Rendern: so liefert die
          // Route auch ohne konfigurierten Versand korrekte 404s und der
          // Render-Pfad bleibt lokal testbar.
          if (!process.env.RESEND_API_KEY) {
            return jsonResponse(
              { error: "Der E-Mail-Versand ist noch nicht konfiguriert (RESEND_API_KEY fehlt)." },
              503,
            );
          }

          const subject = body.subject?.trim() || `Dokumentation: ${document.title}`;
          const message = body.message?.trim();
          const html = [
            `<p style="margin:0 0 12px 0;">Guten Tag,</p>`,
            `<p style="margin:0 0 12px 0;">im Anhang finden Sie das Dokument <strong>${escapeHtml(document.title)}</strong> aus dem RechtKompass Schule.</p>`,
            message ? `<p style="margin:0 0 12px 0;white-space:pre-wrap;">${escapeHtml(message)}</p>` : "",
            `<p style="margin:16px 0 0 0;font-size:12px;color:#666;">Dieses Dokument wurde mit RechtKompass Schule erstellt. Es ersetzt keine Rechtsberatung; im Zweifel Schulleitung bzw. Schulaufsicht einbeziehen.</p>`,
          ].filter(Boolean).join("\n");

          const { sendEmail } = await import("@/lib/mail/resend.server");
          try {
            const result = await sendEmail({
              to,
              subject,
              html,
              attachments: [{ filename: pdf.filename, content: base64 }],
            });
            docGenTelemetry.emit({
              event: "document_downloaded",
              sessionId: document.sessionId,
              documentId: document.id,
              templateSlug: document.templateSlug,
              detail: { format: "pdf-email", bytes: pdf.bytes.byteLength, mailId: result.id ?? null },
            });
            return jsonResponse({ ok: true, id: result.id ?? null });
          } catch (err) {
            const messageText = err instanceof Error ? err.message : "unbekannter Fehler";
            console.error("[workflow-document-email] Versand fehlgeschlagen:", messageText);
            docGenTelemetry.emit({
              event: "document_export_failed",
              sessionId: document.sessionId,
              documentId: document.id,
              templateSlug: document.templateSlug,
              detail: { format: "pdf-email", message: messageText },
            });
            return jsonResponse({ error: "Die E-Mail konnte nicht versendet werden. Bitte versuchen Sie es später erneut." }, 502);
          }
        }),
    },
  },
});
