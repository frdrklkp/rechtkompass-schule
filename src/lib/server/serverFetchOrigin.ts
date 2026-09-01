/**
 * Sprint 4.6K – Löst relative "/api/..."-fetch()-Aufrufe innerhalb der
 * Fall-Pipeline serverseitig auf.
 *
 * Fund beim Live-Test dieser Funktion: legalMatching.ts, legalMatching.engine.ts,
 * caseMatching.ts, keywordMatching.ts und templateMatching.ts rufen intern
 * fetch("/api/...") auf - relative URLs, die nur im Browser (gegen
 * window.location) funktionieren. Im Serverprozess wirft das native fetch()
 * bei einem solchen Aufruf sofort, was in casePipeline.completion.ts still
 * als "0 Rechtsgrundlagen zugeordnet" statt als echter Fehler ankam (Fund:
 * Live-Test der automatischen Fallgenerierung, zwei fehlgeschlagene Läufe
 * mit sonst eindeutig passendem Sachverhalt).
 *
 * runWithServerFetchOrigin(...) patcht globalThis.fetch EINMALIG pro Prozess,
 * schreibt aber nur innerhalb des eigenen AsyncLocalStorage-Kontexts relative
 * URLs auf eine absolute Basis um - jeder Request außerhalb dieses Kontexts
 * (der reguläre Server-Betrieb) bleibt unverändert.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<string>();
let patched = false;

function installPatchOnce(): void {
  if (patched) return;
  patched = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const origin = als.getStore();
    if (origin && typeof input === "string" && input.startsWith("/")) {
      // Fund 2026-08-30 (Produktionstest Fallgenerierung, error code 522):
      // das Umschreiben auf die eigene öffentliche Domain bedeutet auf
      // Cloudflare Workers einen Selbstaufruf über die eigene Zone, den
      // Cloudflare ablehnt. Bekannte interne API-Routen werden deshalb
      // IN-PROCESS an ihren Handler übergeben; nur unbekannte Pfade gehen
      // weiterhin über das Netz (lokaler Bun-Betrieb bleibt unverändert
      // funktionsfähig, dort schadet auch der Netzweg nicht).
      const dispatched = dispatchInternal(input, init);
      if (dispatched) return dispatched;
      return originalFetch(origin + input, init);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

/**
 * Registry der API-Routen, die aus der Server-Pipeline heraus per relativem
 * fetch("/api/...") aufgerufen werden (Bestandsaufnahme 2026-08-30:
 * legalMatching, legalMatching.engine, caseMatching, keywordMatching,
 * templateMatching, hybridSearch). Neue Pipeline-interne Routen hier
 * ergänzen - unbekannte Pfade fallen auf den Netzweg zurück.
 */
const INTERNAL_ROUTES: Record<string, () => Promise<{ Route: unknown }>> = {
  "/api/ai-match-legal-sections": () => import("@/routes/api/ai-match-legal-sections"),
  "/api/ai-reevaluate-legal-links": () => import("@/routes/api/ai-reevaluate-legal-links"),
  "/api/ai-match-keywords": () => import("@/routes/api/ai-match-keywords"),
  "/api/ai-match-templates": () => import("@/routes/api/ai-match-templates"),
  "/api/ai-match-similar-cases": () => import("@/routes/api/ai-match-similar-cases"),
  "/api/search-embeddings-query": () => import("@/routes/api/search-embeddings-query"),
};

type RouteWithHandlers = {
  options?: { server?: { handlers?: Record<string, (ctx: { request: Request; params: Record<string, never> }) => Promise<Response> | Response> } };
};

function dispatchInternal(path: string, init?: Parameters<typeof fetch>[1]): Promise<Response> | null {
  const loader = INTERNAL_ROUTES[path.split("?")[0]];
  if (!loader) return null;
  const method = (init?.method ?? "GET").toUpperCase();
  return (async () => {
    const { Route } = await loader();
    const handler = (Route as RouteWithHandlers).options?.server?.handlers?.[method];
    if (typeof handler !== "function") {
      throw new Error(`Interner API-Aufruf ${path}: ${method}-Handler nicht gefunden.`);
    }
    const request = new Request(`http://internal${path}`, init);
    return await handler({ request, params: {} });
  })();
}

export function runWithServerFetchOrigin<T>(origin: string, fn: () => Promise<T>): Promise<T> {
  installPatchOnce();
  return als.run(origin, fn);
}
