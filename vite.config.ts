// Eigene, vollständig einsehbare Vite-Konfiguration — bewusst ohne
// @lovable.dev/vite-tanstack-config. Der Wrapper bündelte dieselben
// Bausteine, dazu einige Funktionen, die ausschließlich in Lovables
// eigener Cloud-Sandbox greifen (Vorschau-Proxy, HMR-Gate, Sandbox-
// Fehlerdiagnose) und hier nie ausgeführt wurden. Diese Datei bindet
// nur das ein, was für die eigenständige Entwicklung tatsächlich
// gebraucht wird.
import { defineConfig, loadEnv, type UserConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  // VITE_*-Variablen aus .env auch als import.meta.env.VITE_* verfügbar
  // machen (Vite tut das clientseitig automatisch, hier zusätzlich für
  // die serverseitige Umgebung während SSR).
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const config: UserConfig = {
    define,
    resolve: {
      alias: { "@": new URL("./src", import.meta.url).pathname },
      // Verhindert doppelte React-/TanStack-Query-Instanzen bei mehreren
      // installierten Kopien derselben Abhängigkeit.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
      ignoreOutdatedRequests: true,
    },
    server: {
      host: "::",
      port: 8080,
      // Vermeidet doppelt ausgelöstes HMR, wenn ein Editor eine Datei in
      // mehreren schnellen Schreibvorgängen speichert.
      watch: { awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 } },
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Blockiert das versehentliche Einbetten von serverseitigem Code
        // (z. B. Dateien mit Secrets) in das Client-Bundle.
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // Server-Einstiegspunkt auf src/server.ts (unser SSR-Fehler-Wrapper).
        server: { entry: "server" },
      }),
      viteReact(),
      ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
    ],
  };

  return config;
});
