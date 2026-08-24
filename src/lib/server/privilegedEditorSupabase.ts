/**
 * Sprint 4.6K/4.6L – Frischer, redaktionell privilegierter Supabase-Client
 * für serverseitige Hintergrund-Jobs (automatische Fallgenerierung).
 *
 * Erzeugt PRO AUFRUF eine eigene Client-Instanz (kein geteilter Zustand
 * zwischen gleichzeitigen Requests) und meldet sie per Passwort auf den
 * bestehenden Redaktions-Service-Account an (admin@rechtkompass.local,
 * Rolle "admin" – erfüllt public.is_editor() und damit auch
 * submit_case_for_review).
 *
 * Ursprünglich per Magic-Link (generateLink + verifyOtp, wie in
 * scripts/_create-and-publish-case.ts) - beim ersten Mehrfach-Batch-Test
 * (mehrere Fallgenerierungen kurz nacheinander/gleichzeitig) trat aber eine
 * Race Condition auf: ein neu erzeugter Magic-Link invalidiert offenbar
 * jeden vorherigen, noch nicht eingelösten Link derselben E-Mail-Adresse,
 * sodass gleichzeitige Anfragen mit "Email link is invalid or has expired"
 * fehlschlugen. Passwort-Anmeldung hat dieses Problem nicht (verifiziert:
 * zwei gleichzeitige signInWithPassword-Aufrufe liefern beide einen
 * gültigen, unabhängigen Token) - relevant, weil mehrere Lehrkräfte
 * durchaus gleichzeitig eine Fallgenerierung anstoßen können.
 *
 * Liegt bewusst unter src/lib/server/ (Vite-importProtection verhindert den
 * versehentlichen Import aus dem Client-Bundle).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SERVICE_ACCOUNT_EMAIL =
  process.env.CASE_GENERATION_SERVICE_EMAIL ?? "admin@rechtkompass.local";

function readUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
}

function readPublishableKey(): string | undefined {
  return process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
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

export async function createPrivilegedEditorSupabase(): Promise<SupabaseClient<Database>> {
  const url = readUrl();
  const publishableKey = readPublishableKey();
  const password = process.env.CASE_GENERATION_SERVICE_PASSWORD;
  if (!url) throw new Error("Fallgenerierung nicht möglich: Supabase-URL fehlt");
  if (!publishableKey)
    throw new Error("Fallgenerierung nicht möglich: SUPABASE_PUBLISHABLE_KEY fehlt");
  if (!password)
    throw new Error(
      "Fallgenerierung nicht möglich: CASE_GENERATION_SERVICE_PASSWORD fehlt (Secret setzen).",
    );

  const client = createClient<Database>(url, publishableKey, {
    global: { fetch: makeFetch(publishableKey) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: SERVICE_ACCOUNT_EMAIL,
    password,
  });
  if (error) {
    throw new Error(`Privilegierte Sitzung konnte nicht erzeugt werden: ${error.message}`);
  }
  return client;
}
