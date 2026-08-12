/**
 * Server-only Supabase-Clients für die Suchindex-Routen.
 * Nutzt dieselbe Fallback-Kette wie andere bestehende Server-Routen
 * (z. B. src/routes/api/generate-case-document.ts).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function readUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  );
}

function readPublishableKey(): string | undefined {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  );
}

function readServiceRoleKey(): string | undefined {
  return (
    process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getSearchIndexEnvStatus() {
  return {
    hasUrl: !!readUrl(),
    hasPublishableKey: !!readPublishableKey(),
    hasServiceRoleKey: !!readServiceRoleKey(),
    hasAiGatewayKey: !!process.env.LOVABLE_API_KEY,
  };
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function makeFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Publishable-Key-Client für serverseitige Lesezugriffe
 * (Status, Query-RPC). RLS greift als anon/authenticated.
 */
export function createPublicSupabase(): SupabaseClient<Database> {
  const url = readUrl();
  const key = readPublishableKey();
  if (!url) throw new Error("Statusabfrage nicht möglich: Supabase-URL fehlt");
  if (!key) throw new Error("Statusabfrage nicht möglich: normaler Server-Client fehlt (Publishable Key)");
  return createClient<Database>(url, key, {
    global: { fetch: makeFetch(key) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-Role-Client für serverseitige Schreibzugriffe (Embeddings upsert).
 * Wird ausschließlich in Reindex-Routen benötigt, weil die RLS-Policy
 * Writes auf service_role beschränkt.
 */
export function createServiceSupabase(): SupabaseClient<Database> {
  const url = readUrl();
  const key = readServiceRoleKey();
  if (!url) throw new Error("Reindex nicht möglich: Supabase-URL fehlt");
  if (!key)
    throw new Error(
      "Reindex nicht möglich: SUPABASE_SERVICE_ROLE_KEY fehlt (Secret EXTERNAL_SUPABASE_SERVICE_ROLE_KEY setzen).",
    );
  return createClient<Database>(url, key, {
    global: { fetch: makeFetch(key) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
