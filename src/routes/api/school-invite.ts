/**
 * POST /api/school-invite
 * Body: { email, schoolId?, schoolRole?, note? }
 *
 * Legt eine Einladung an (RPC create_school_invitation prüft die Berechtigung:
 * Schul-Admin nur Lehrkräfte der eigenen Schule, Betreiber-Admin alles) und
 * schickt der eingeladenen Person eine E-Mail mit dem Anmeldeweg. Die
 * Mitgliedschaft entsteht beim ersten Login (claim_school_membership).
 * Mandantenkonzept Stufe 3 (05.10.2026).
 */
import { createFileRoute } from "@tanstack/react-router";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_URL = "https://www.rechtkompass-schule.de";

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { "Content-Type": "application/json" } });
}

export const Route = createFileRoute("/api/school-invite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { email?: string; schoolId?: string | null; schoolRole?: string; note?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonError(400, "Ungültige Anfrage");
        }
        const email = (body.email ?? "").trim().toLowerCase();
        if (!EMAIL_RE.test(email)) return jsonError(400, "Ungültige E-Mail-Adresse");
        const role = body.schoolRole === "schul_admin" ? "schul_admin" : "lehrkraft";

        const { requireApiAuth } = await import("@/integrations/supabase/apiAuthGuard");
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        const { createClient } = await import("@supabase/supabase-js");
        const { readSupabaseUrl, readSupabasePublishableKey } = await import("@/lib/server/supabaseEnv");
        const url = readSupabaseUrl();
        const key = readSupabasePublishableKey();
        if (!url || !key) return jsonError(503, "Supabase-Konfiguration fehlt.");
        const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
        // Nutzergebundener Client: RLS und die Berechtigungsprüfung der RPC gelten.
        const supabase = createClient(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }) as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

        const { data, error } = await supabase.rpc("create_school_invitation", {
          _email: email,
          _school_id: body.schoolId ?? null,
          _role: role,
          _note: body.note ?? null,
        });
        if (error) return jsonError(400, error.message);
        const row = (Array.isArray(data) ? data[0] : data) as { id: string; school_id: string; school_name: string; expires_at: string } | undefined;
        if (!row) return jsonError(500, "Einladung konnte nicht angelegt werden.");

        const expires = new Date(row.expires_at).toLocaleDateString("de-DE");
        const subject = `Einladung zu RechtKompass Schule – ${row.school_name}`;
        const text = [
          `Guten Tag,`,
          ``,
          `${row.school_name} hat Sie zu RechtKompass Schule eingeladen, dem Nachschlagewerk für schulrechtliche Alltagsfragen.`,
          ``,
          `So melden Sie sich an:`,
          `1. ${APP_URL} öffnen.`,
          `2. Diese E-Mail-Adresse eingeben (${email}) und „Anmeldelink anfordern" wählen.`,
          `3. Den Link aus der Anmelde-E-Mail öffnen. Ein Passwort gibt es nicht.`,
          ``,
          `Die Einladung gilt bis ${expires}. Rückfragen beantwortet die Schulleitung bzw. die Ansprechperson Ihrer Schule.`,
          ``,
          `Hinweis zum Datenschutz: Bitte geben Sie in der Anwendung keine Namen oder andere personenbezogene Angaben zu Schülerinnen, Schülern oder Kolleginnen und Kollegen ein. Die Datenschutzerklärung finden Sie nach der Anmeldung unter Profil.`,
          ``,
          `RechtKompass Schule`,
        ].join("\n");
        const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;padding:16px;line-height:1.5">${text
          .split("\n")
          .map((l) => (l === "" ? "<br/>" : `<p style="margin:0">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`))
          .join("")}</div>`;

        let mailError: string | null = null;
        try {
          const { sendEmail } = await import("@/lib/mail/resend.server");
          await sendEmail({ to: email, subject, text, html, from: "RechtKompass Schule <anmeldung@rechtkompass-schule.de>" });
        } catch (e) {
          mailError = e instanceof Error ? e.message : String(e);
          console.error("[school-invite] E-Mail-Versand fehlgeschlagen:", mailError);
        }

        return new Response(
          JSON.stringify({ ok: true, id: row.id, expiresAt: row.expires_at, mailSent: mailError === null, mailError }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
