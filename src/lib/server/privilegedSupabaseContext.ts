/**
 * Sprint 4.6K – Kontextgebundene Supabase-Injektion für Server-Jobs.
 *
 * Hintergrund: Die zentrale Fall-Pipeline (coreBuilder, casePipeline.completion,
 * legalMatching.engine, qualityEngine, templateMatching, EditorialWorkflowService)
 * importiert überall denselben Browser-Singleton-Client und prüft Schreibrechte
 * über den (ausschließlich browserseitig gepflegten) Auth-Snapshot in adminAuth.ts.
 *
 * Für serverseitige Hintergrund-Jobs (z. B. automatische Fallgenerierung) darf
 * NICHT der Prozess-globale Singleton umauthentifiziert werden – das würde bei
 * gleichzeitigen Requests auf demselben Serverprozess zu Race Conditions führen.
 *
 * Diese Datei stellt stattdessen einen AsyncLocalStorage-Kontext bereit: Innerhalb
 * von runWithPrivilegedSupabase(client, fn) liefert getPrivilegedSupabase() den
 * übergebenen Client, außerhalb (jeder normale Request/Browser-Aufruf) bleibt es
 * unverändert bei "kein Override". So können bestehende Funktionen unverändert
 * weiterlaufen, ohne dass ihre Signaturen angepasst werden müssen.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const als = new AsyncLocalStorage<SupabaseClient<Database>>();

export function runWithPrivilegedSupabase<T>(
  client: SupabaseClient<Database>,
  fn: () => Promise<T>,
): Promise<T> {
  return als.run(client, fn);
}

export function getPrivilegedSupabase(): SupabaseClient<Database> | undefined {
  return als.getStore();
}
