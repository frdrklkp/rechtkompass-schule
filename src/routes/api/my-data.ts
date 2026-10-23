/**
 * GET    /api/my-data  – Datenauskunft als JSON-Download (Art. 15/20 DSGVO)
 * DELETE /api/my-data  – Konto und zugeordnete Daten löschen (Art. 17 DSGVO)
 *                        Body: { confirm: "<eigene E-Mail-Adresse>" }
 *
 * Beide nur für das Konto hinter dem Bearer-Token (requireApiAuth); die
 * Service-Rolle wird erst danach und nur mit dieser Nutzer-ID benutzt.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";
import { createServiceSupabase } from "@/lib/searchEmbeddings.supabase.server";
import { checkSelfDeletion, collectMyData, deleteMyAccount } from "@/lib/server/myData";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/my-data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const data = await collectMyData(createServiceSupabase(), auth.userId);
          const stamp = new Date().toISOString().slice(0, 10);
          return new Response(JSON.stringify(data, null, 2), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Disposition": `attachment; filename="rechtkompass-meine-daten-${stamp}.json"`,
              "Cache-Control": "no-store",
            },
          });
        } catch (e) {
          console.error("[my-data] Export fehlgeschlagen:", e instanceof Error ? e.message : e);
          return json({ error: "Export derzeit nicht möglich. Bitte später erneut versuchen." }, 500);
        }
      },
      DELETE: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;
        let body: { confirm?: string } = {};
        try { body = await request.json(); } catch { /* leer */ }
        const db = createServiceSupabase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: prof } = await (db as any).from("user_profiles").select("role").eq("id", auth.userId).maybeSingle();
        const { data: u } = await db.auth.admin.getUserById(auth.userId);
        const email = u?.user?.email ?? undefined;
        const check = checkSelfDeletion(prof?.role, body.confirm, email);
        if (!check.ok) return json({ error: check.reason }, 400);
        try {
          const counts = await deleteMyAccount(db, auth.userId, email);
          console.log("[my-data] Konto gelöscht:", JSON.stringify(counts));
          return json({ ok: true });
        } catch (e) {
          console.error("[my-data] Löschung fehlgeschlagen:", e instanceof Error ? e.message : e);
          return json({ error: "Löschung nicht vollständig. Bitte an die Datenschutz-Kontaktadresse wenden." }, 500);
        }
      },
    },
  },
});
