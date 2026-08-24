/**
 * Sprint 4.6K – Verdrahtet den AsyncLocalStorage-Kontext (privilegedSupabaseContext)
 * mit den Override-Punkten in contextAwareClient.ts und adminAuth.ts.
 *
 * Liegt bewusst unter src/lib/server/ (Vite-importProtection blockt jeden
 * Import dieses Pfads aus dem Client-Bundle) und wird ausschließlich per
 * Seiteneffekt-Import aus serverseitigem Code geladen (API-Routen), niemals
 * aus universellem/Browser-Code. Idempotent – mehrfacher Import ist unschädlich.
 */
import { __setSupabaseOverride } from "@/integrations/supabase/contextAwareClient";
import { __setPrivilegedWriteOverride } from "@/lib/adminAuth";
import { getPrivilegedSupabase } from "./privilegedSupabaseContext";

let wired = false;

export function ensurePrivilegedWriteOverrideWired(): void {
  if (wired) return;
  wired = true;
  __setSupabaseOverride(() => getPrivilegedSupabase());
  __setPrivilegedWriteOverride(() => !!getPrivilegedSupabase());
}
