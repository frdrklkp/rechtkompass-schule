/**
 * fetch()-Wrapper für admin-only /api/*-Routen, die requireApiAuth()
 * (apiAuthGuard.ts) verlangen. Hängt automatisch den Bearer-Token der
 * aktuellen Supabase-Session an - ohne das würde jeder Admin-Aufruf mit
 * 401 fehlschlagen, sobald die Route serverseitig abgesichert ist (Fund:
 * Code-Audit 12.08.2026, Umsetzung 2026-08-13).
 *
 * Nur für Routen verwenden, die requireApiAuth() nutzen (Admin-/
 * Backoffice-Routen). Öffentliche Routen (Copilot, Decision Navigator,
 * öffentliche Suche) rufen weiterhin normal `fetch()` auf.
 */
import { supabase } from "@/integrations/supabase/client";

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
