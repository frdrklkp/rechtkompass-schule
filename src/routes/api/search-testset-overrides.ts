/**
 * Server-Route für redaktionelle Ground-Truth-Overrides des Suchtest-Sets.
 *
 * Writes (POST/DELETE) laufen ausschließlich hier über den Service-Role-Client
 * (createServiceSupabase), damit die restriktive RLS-Policy erhalten bleibt
 * und die Browser-Session keine Schreibrechte auf public.search_testset_overrides
 * benötigt.
 *
 * Auth-Hinweis: Das Projekt besitzt (Stand Pilotphase) noch keine serverseitige
 * Admin-Rollenprüfung — die bestehenden /api/*-Admin-Routen sind ebenfalls
 * unauthentifiziert. Wir folgen diesem Muster und ergänzen einen optionalen
 * Shared-Secret-Guard: Ist ADMIN_API_TOKEN gesetzt, muss der Request den
 * Header `x-admin-token` mitschicken. Ist das Secret nicht gesetzt, verhält
 * sich der Endpunkt wie die vorhandenen Reindex-/Diagnose-Routen (offen).
 */
import { createFileRoute } from "@tanstack/react-router";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Audit =
  | "EXACT_MATCH_AVAILABLE"
  | "GOOD_ALTERNATIVE_AVAILABLE"
  | "CONTENT_GAP"
  | "AMBIGUOUS_EXPECTATION"
  | null;

const AUDITS: ReadonlyArray<Exclude<Audit, null>> = [
  "EXACT_MATCH_AVAILABLE",
  "GOOD_ALTERNATIVE_AVAILABLE",
  "CONTENT_GAP",
  "AMBIGUOUS_EXPECTATION",
];

function jsonError(status: number, message: string, details?: unknown) {
  return new Response(
    JSON.stringify({ error: message, details: details ?? null }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function checkAdmin(request: Request): Response | null {
  const required = process.env.ADMIN_API_TOKEN;
  if (!required) return null; // kein Secret gesetzt → offen (Pilotphase, wie übrige Admin-Routen)
  const provided = request.headers.get("x-admin-token");
  if (!provided || provided !== required) {
    return jsonError(401, "Nicht autorisiert.");
  }
  return null;
}

type UpsertBody = {
  testId?: unknown;
  expectedCaseIds?: unknown;
  acceptableCaseIds?: unknown;
  audit?: unknown;
  editorialNote?: unknown;
  note?: unknown;
};

function normalizeIds(v: unknown): { ok: true; ids: string[] } | { ok: false; msg: string } {
  if (!Array.isArray(v)) return { ok: false, msg: "muss ein Array sein" };
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string" || !UUID_RE.test(raw)) {
      return { ok: false, msg: `ungültige UUID: ${String(raw)}` };
    }
    if (!out.includes(raw)) out.push(raw);
  }
  return { ok: true, ids: out };
}

export const Route = createFileRoute("/api/search-testset-overrides")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFail = checkAdmin(request);
        if (authFail) return authFail;

        let body: UpsertBody;
        try {
          body = (await request.json()) as UpsertBody;
        } catch {
          return jsonError(400, "Ungültiges JSON.");
        }

        const testId = typeof body.testId === "string" ? body.testId.trim() : "";
        if (!testId || !/^[A-Za-z0-9_.-]{1,64}$/.test(testId)) {
          return jsonError(400, "testId fehlt oder ist ungültig.");
        }

        const expected = normalizeIds(body.expectedCaseIds ?? []);
        if (!expected.ok) return jsonError(400, `expectedCaseIds: ${expected.msg}`);
        const acceptable = normalizeIds(body.acceptableCaseIds ?? []);
        if (!acceptable.ok) return jsonError(400, `acceptableCaseIds: ${acceptable.msg}`);

        const overlap = expected.ids.filter((id) => acceptable.ids.includes(id));
        if (overlap.length > 0) {
          return jsonError(
            400,
            "IDs dürfen nicht gleichzeitig in expected und acceptable stehen.",
            { overlap },
          );
        }

        let audit: Audit = null;
        if (body.audit != null && body.audit !== "") {
          if (typeof body.audit !== "string" || !AUDITS.includes(body.audit as any)) {
            return jsonError(400, "audit ist ungültig.");
          }
          audit = body.audit as Audit;
        }

        if (audit === "CONTENT_GAP" && expected.ids.length > 0) {
          return jsonError(400, "CONTENT_GAP darf keine expectedCaseIds enthalten.");
        }

        const noteRaw = body.editorialNote ?? body.note;
        let note: string | null = null;
        if (noteRaw != null && noteRaw !== "") {
          if (typeof noteRaw !== "string") return jsonError(400, "note muss Text sein.");
          const trimmed = noteRaw.trim();
          if (trimmed.length > 2000) return jsonError(400, "note zu lang (max. 2000 Zeichen).");
          note = trimmed || null;
        }

        let createServiceSupabase: () => any;
        try {
          ({ createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server"));
        } catch (e) {
          return jsonError(500, "Server-Client nicht verfügbar.", String(e));
        }

        let supabaseAdmin: any;
        try {
          supabaseAdmin = createServiceSupabase();
        } catch (e: any) {
          return jsonError(
            500,
            e?.message ?? "Service-Role-Client konnte nicht initialisiert werden.",
          );
        }

        // Existenz- und Published-Check der referenzierten Fälle.
        const allIds = Array.from(new Set([...expected.ids, ...acceptable.ids]));
        if (allIds.length > 0) {
          const { data: rows, error: caseErr } = await (supabaseAdmin.from as any)("practice_cases")
            .select("id, status")
            .in("id", allIds);
          if (caseErr) return jsonError(500, `Fallprüfung fehlgeschlagen: ${caseErr.message}`);
          const foundIds = new Set((rows ?? []).map((r: any) => r.id as string));
          const missing = allIds.filter((id) => !foundIds.has(id));
          if (missing.length > 0) {
            return jsonError(400, "Referenzierte Fälle existieren nicht.", { missing });
          }
          const unpublished = (rows ?? [])
            .filter((r: any) => r.status !== "published")
            .map((r: any) => r.id as string);
          if (unpublished.length > 0) {
            return jsonError(
              400,
              "Referenzierte Fälle sind nicht veröffentlicht.",
              { unpublished },
            );
          }
        }

        const payload = {
          test_id: testId,
          expected_case_ids: expected.ids,
          acceptable_case_ids: acceptable.ids,
          audit,
          note,
        };

        const { data, error } = await (supabaseAdmin.from as any)("search_testset_overrides")
          .upsert(payload, { onConflict: "test_id" })
          .select("*")
          .single();

        if (error) return jsonError(500, `Speichern fehlgeschlagen: ${error.message}`);
        return jsonOk({ override: data });
      },

      DELETE: async ({ request }) => {
        const authFail = checkAdmin(request);
        if (authFail) return authFail;

        let body: { testId?: unknown };
        try {
          body = (await request.json()) as { testId?: unknown };
        } catch {
          return jsonError(400, "Ungültiges JSON.");
        }
        const testId = typeof body.testId === "string" ? body.testId.trim() : "";
        if (!testId) return jsonError(400, "testId fehlt.");

        let createServiceSupabase: () => any;
        try {
          ({ createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server"));
        } catch (e) {
          return jsonError(500, "Server-Client nicht verfügbar.", String(e));
        }
        let supabaseAdmin: any;
        try {
          supabaseAdmin = createServiceSupabase();
        } catch (e: any) {
          return jsonError(500, e?.message ?? "Service-Role-Client fehlt.");
        }

        const { error } = await (supabaseAdmin.from as any)("search_testset_overrides")
          .delete()
          .eq("test_id", testId);
        if (error) return jsonError(500, `Löschen fehlgeschlagen: ${error.message}`);
        return jsonOk({ ok: true });
      },
    },
  },
});
