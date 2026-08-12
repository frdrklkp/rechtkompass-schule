import { createFileRoute } from "@tanstack/react-router";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function contentToHtml(content: string): string {
  // Absätze aus Leerzeilen, Zeilenumbrüche als <br>.
  return content
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px 0;">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/send-case-document-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          case_document_id?: string;
          recipient_email?: string;
          subject?: string;
          message?: string;
        };
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "Ungültiges JSON");
        }

        const docId = body.case_document_id?.trim();
        const to = body.recipient_email?.trim();
        if (!docId) return jsonError(400, "case_document_id fehlt");
        if (!to || !EMAIL_RE.test(to)) return jsonError(400, "Ungültige Empfängeradresse");

        if (!process.env.RESEND_API_KEY) {
          return jsonError(
            500,
            "Resend ist nicht konfiguriert. Bitte RESEND_API_KEY hinterlegen.",
          );
        }

        let supabase;
        try {
          const { createPublicSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          supabase = createPublicSupabase();
        } catch (err) {
          const message = err instanceof Error ? err.message : "unbekannter Fehler";
          console.error("[send-case-document-email] Supabase-Client-Init fehlgeschlagen:", message);
          return jsonError(503, "Der E-Mail-Versand ist derzeit nicht möglich. Bitte versuchen Sie es später erneut.");
        }

        let sendEmail: typeof import("@/lib/mail/resend.server").sendEmail;
        try {
          ({ sendEmail } = await import("@/lib/mail/resend.server"));
        } catch (err) {
          const message = err instanceof Error ? err.message : "unbekannter Fehler";
          console.error("[send-case-document-email] Resend-Modul konnte nicht geladen werden:", message);
          return jsonError(503, "Die E-Mail konnte derzeit nicht versendet werden. Bitte versuchen Sie es später erneut.");
        }

        const { data: doc, error: docErr } = await (supabase as any)
          .from("case_documents")
          .select("*")
          .eq("id", docId)
          .maybeSingle();
        if (docErr || !doc) {
          return jsonError(404, docErr?.message ?? "Dokument nicht gefunden");
        }
        const content = (doc.content ?? "").trim();
        if (!content) {
          return jsonError(400, "Dokumentinhalt ist leer – Versand blockiert.");
        }

        const { data: caseRow } = await supabase
          .from("practice_cases")
          .select("id, title, category, subcategory")
          .eq("id", doc.case_id)
          .maybeSingle();

        const caseTitle = (caseRow?.title as string) ?? "Praxisfall";
        const docTitle = (doc.title as string) ?? "Dokument";

        // Rechtsgrundlagen aus used_sources ziehen (nicht neu laden, damit gespeicherter Stand gilt).
        const usedSources = (doc.used_sources ?? {}) as {
          legal_sections?: Array<{ label?: string; official_url?: string | null }>;
        };
        const legal = Array.isArray(usedSources.legal_sections) ? usedSources.legal_sections : [];

        const createdAt = doc.created_at
          ? new Date(doc.created_at as string).toLocaleString("de-DE")
          : "";

        const subject =
          (body.subject && body.subject.trim()) ||
          `RechtKompass Schule: ${docTitle} – ${caseTitle}`;

        const introMessage = body.message?.trim();

        const legalHtml =
          legal.length > 0
            ? `<h3 style="margin:24px 0 8px 0;font-size:14px;">Zugeordnete Rechtsgrundlagen</h3>
               <ul style="padding-left:18px;margin:0 0 12px 0;">
                 ${legal
                   .map((l) => {
                     const label = escapeHtml(l.label ?? "");
                     return l.official_url
                       ? `<li>${label} – <a href="${escapeHtml(l.official_url)}">Quelle</a></li>`
                       : `<li>${label}</li>`;
                   })
                   .join("")}
               </ul>`
            : "";

        const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:720px;margin:0 auto;padding:16px;">
  <div style="font-size:12px;color:#64748b;">RechtKompass Schule</div>
  <h1 style="font-size:20px;margin:4px 0 0 0;">${escapeHtml(docTitle)}</h1>
  <div style="font-size:13px;color:#475569;margin-bottom:16px;">
    Praxisfall: <strong>${escapeHtml(caseTitle)}</strong>${createdAt ? ` · erstellt ${escapeHtml(createdAt)}` : ""}
  </div>
  ${introMessage ? `<div style="background:#f1f5f9;border-radius:6px;padding:10px 12px;font-size:14px;margin-bottom:16px;">${escapeHtml(introMessage).replace(/\n/g, "<br/>")}</div>` : ""}
  <div style="font-size:14px;line-height:1.55;">
    ${contentToHtml(content)}
  </div>
  ${legalHtml}
  <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;"/>
  <div style="font-size:12px;color:#64748b;">
    Diese Dokumentation wurde aus RechtKompass Schule erzeugt. Bitte vor Verwendung fachlich prüfen.
  </div>
</body></html>`;

        const legalText =
          legal.length > 0
            ? `\n\nZugeordnete Rechtsgrundlagen:\n${legal
                .map((l) => `- ${l.label ?? ""}${l.official_url ? ` (${l.official_url})` : ""}`)
                .join("\n")}`
            : "";

        const text =
          `${docTitle}\nPraxisfall: ${caseTitle}${createdAt ? ` · erstellt ${createdAt}` : ""}\n\n` +
          (introMessage ? `${introMessage}\n\n` : "") +
          content +
          legalText +
          `\n\n—\nDiese Dokumentation wurde aus RechtKompass Schule erzeugt. Bitte vor Verwendung fachlich prüfen.`;

        try {
          const result = await sendEmail({ to, subject, html, text });
          return new Response(
            JSON.stringify({ ok: true, id: result.id ?? null }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return jsonError(502, msg);
        }
      },
    },
  },
});
