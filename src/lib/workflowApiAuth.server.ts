/**
 * Sprint 4.3B – Auth-Helfer für Workflow-API-Routen.
 * Validiert den Bearer-Token, liefert einen user-scoped Supabase-Client und die userId.
 * Serverrouten haben keine createServerFn-Middleware; deshalb inline.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function isNewApiKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}
function createSbFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNewApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export class WorkflowApiAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) { super(message); this.status = status; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function authenticateWorkflowRequest(request: Request): Promise<{ supabase: SupabaseClient<any, any, any>; userId: string }> {
  // Fund 2026-09-02 (lokal 500 "Supabase-Konfiguration fehlt"): gleiche
  // Env-Krankheit wie apiAuthGuard/searchEmbeddings - rohe SUPABASE_*-Namen
  // existieren nur, wenn sie als eigene Bindings gesetzt sind. Zentrale
  // Fallback-Kette aus supabaseEnv.ts verwenden (VITE_-Namen, import.meta.env).
  const { readSupabaseUrl, readSupabasePublishableKey } = await import("@/lib/server/supabaseEnv");
  const url = readSupabaseUrl();
  const key = readSupabasePublishableKey();
  if (!url || !key) throw new WorkflowApiAuthError("Supabase-Konfiguration fehlt.", 500);

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new WorkflowApiAuthError("Unauthorized: Bearer-Token fehlt.");
  }
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token.split(".").length !== 3) throw new WorkflowApiAuthError("Unauthorized: Ungültiger Token.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient<any>(url, key, {
    global: { fetch: createSbFetch(key), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new WorkflowApiAuthError("Unauthorized: Token nicht verifizierbar.");
  return { supabase, userId: data.claims.sub as string };
}
