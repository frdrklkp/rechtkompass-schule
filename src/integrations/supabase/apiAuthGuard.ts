/**
 * Auth-Guard für die datei-basierten `/api/*`-Routen (`createFileRoute` mit
 * `server.handlers`). `requireSupabaseAuth` in `auth-middleware.ts` ist
 * automatisch generiert für TanStack Server Functions
 * (`createServerFn().middleware([...])`) - ein anderer Mechanismus, der sich
 * nicht direkt in `server.handlers.POST`-Routen einziehen lässt.
 *
 * Gleiche Prüflogik wie dort: echtes Supabase-Bearer-Token validieren
 * (`supabase.auth.getClaims`), keine eigene Rollenlogik. Für rollenspezifische
 * Sperren (z.B. nur Editoren) zusätzlich serverseitig `is_editor()` per RPC
 * prüfen - hier bewusst nicht eingebaut, um den Explosionsradius dieser
 * ersten Härtungsrunde klein zu halten (Fund: Code-Audit 12.08.2026).
 *
 * Fund 2026-08-25 (Suchindex-Admin-Seite lieferte "Serverkonfiguration
 * unvollständig" in Produktion): `process.env.VITE_SUPABASE_URL`/
 * `VITE_SUPABASE_PUBLISHABLE_KEY` sind nur gesetzt, wenn diese VITE_-Namen
 * zusätzlich als eigene Cloudflare-Worker-Bindings existieren - normalerweise
 * werden sie nur zur Build-Zeit von Vite gebraucht. `import.meta.env.VITE_*`
 * wird dagegen von Vite bereits beim Build fest in den Server-Bundle-Code
 * eingesetzt und ist daher unabhängig von Worker-Runtime-Bindings immer
 * verfügbar - selbe Fallback-Kette wie in `searchEmbeddings.supabase.server.ts`.
 *
 * Verwendung als erste Zeile im Handler:
 *   const auth = await requireApiAuth(request);
 *   if (auth instanceof Response) return auth;
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type ApiAuthContext = { userId: string; claims: Record<string, unknown> };

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requireApiAuth(request: Request): Promise<ApiAuthContext | Response> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return unauthorized("Unauthorized: No authorization header provided");
  if (!authHeader.startsWith("Bearer ")) return unauthorized("Unauthorized: Only Bearer tokens are supported");

  const token = authHeader.slice("Bearer ".length);
  if (!token || token.split(".").length !== 3) return unauthorized("Unauthorized: Invalid token");

  const SUPABASE_URL =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error("[apiAuthGuard] Missing SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY (auch VITE_-Fallbacks geprüft)");
    return new Response(JSON.stringify({ error: "Serverkonfiguration unvollständig" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return unauthorized("Unauthorized: Invalid token");

  return { userId: String(data.claims.sub), claims: data.claims as Record<string, unknown> };
}
