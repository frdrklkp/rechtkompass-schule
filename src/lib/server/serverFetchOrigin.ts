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
      return originalFetch(origin + input, init);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

export function runWithServerFetchOrigin<T>(origin: string, fn: () => Promise<T>): Promise<T> {
  installPatchOnce();
  return als.run(origin, fn);
}
