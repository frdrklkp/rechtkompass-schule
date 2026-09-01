/**
 * Zentrale, Cloudflare-feste Auflösung der Supabase-Verbindungsdaten für
 * SERVER-Code.
 *
 * Fund-Historie (2026-08-26 apiAuthGuard, 2026-08-30 Fallgenerierung):
 * `process.env.VITE_SUPABASE_URL` ist im deployten Worker LEER, weil die
 * VITE_*-Variablen in Cloudflare nur als Build-Variablen existieren und
 * nicht als Runtime-Bindings (nodejs_compat_populate_process_env befüllt
 * process.env nur aus gebundenen Runtime-Variablen). `import.meta.env.VITE_*`
 * wird dagegen von Vite zur BUILD-Zeit fest in das Server-Bundle
 * eingesetzt und funktioniert deshalb überall. Jeder Server-Codepfad, der
 * die Kette hier NICHT nutzt und stattdessen roh process.env.VITE_* liest,
 * bricht ausschließlich in Produktion - lokal (Bun lädt .env) fällt das
 * nie auf. Genau so sind die "unendlich ladende Fallgenerierung" und davor
 * der Suchindex-Fehler entstanden.
 */

export function readSupabaseUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  );
}

export function readSupabasePublishableKey(): string | undefined {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  );
}
