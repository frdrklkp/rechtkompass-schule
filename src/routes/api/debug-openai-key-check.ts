import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/debug-openai-key-check")({
  server: {
    handlers: {
      GET: async () => {
        const processEnv = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
        const key = processEnv?.OPENAI_API_KEY ?? "";
        return new Response(
          JSON.stringify({
            present: !!key,
            length: key.length,
            prefix: key.slice(0, 8),
            suffix: key.slice(-6),
            hasWhitespace: /\s/.test(key),
            hasNewline: /[\r\n]/.test(key),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
