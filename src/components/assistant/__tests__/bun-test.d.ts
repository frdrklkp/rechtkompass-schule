/**
 * Minimale Typdeklaration für den Bun-Testrunner.
 *
 * Die Tests laufen unter `bun test`; das vollständige bun-types-Paket wird
 * bewusst nicht eingebunden, weil seine globalen Typen (z. B. Bun-fetch) mit
 * den DOM-Typen des Projekts kollidieren.
 */
declare module "bun:test" {
  export const mock: {
    module(specifier: string, factory: () => Record<string, unknown>): void;
  };
}
