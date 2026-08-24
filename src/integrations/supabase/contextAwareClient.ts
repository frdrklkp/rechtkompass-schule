/**
 * Sprint 4.6K – Kontextsensitiver Supabase-Client für die Fall-Pipeline.
 *
 * Verhält sich für jeden normalen (Browser-)Aufruf exakt wie der Singleton aus
 * "./client". Diese Datei wird auch im Client-Bundle ausgeliefert und darf
 * daher NICHT direkt aus src/lib/server/** importieren (Vite-importProtection
 * in vite.config.ts blockt das mit einem Build-Fehler).
 *
 * Serverseitige Hintergrund-Jobs registrieren stattdessen einmalig einen
 * Override-Getter (siehe src/lib/server/wirePrivilegedWriteOverride.ts), der
 * innerhalb eines AsyncLocalStorage-Kontexts den passenden, bereits
 * authentifizierten Client liefert. Ohne Registrierung (jeder Browser-Kontext)
 * bleibt es beim normalen Singleton.
 */
import { supabase as browserSupabase } from "./client";

type SupabaseLike = typeof browserSupabase;

let overrideGetter: (() => SupabaseLike | undefined) | null = null;

export function __setSupabaseOverride(getter: (() => SupabaseLike | undefined) | null): void {
  overrideGetter = getter;
}

export const supabase = new Proxy({} as SupabaseLike, {
  get(_, prop, receiver) {
    const target = overrideGetter?.() ?? browserSupabase;
    return Reflect.get(target, prop, receiver);
  },
});
