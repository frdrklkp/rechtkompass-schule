import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";

// Trigger für frischen Build nach Deploy-Command-Änderung (wrangler secret put
// pro Secret nach dem eigentlichen Deploy) - siehe Worker Settings → Build.

export const Route = createFileRoute("/api/debug-ai-provider-check")({
  server: {
    handlers: {
      GET: async () => {
        const provider = AIProviderFactory.get("anthropic-native");
        const processEnv = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
        const cfEnv = (globalThis as { __env__?: Record<string, unknown> }).__env__;
        return new Response(
          JSON.stringify({
            resolvedProviderId: provider.id,
            hasProcessEnv: !!processEnv,
            processEnvKeys: processEnv ? Object.keys(processEnv) : [],
            hasAnthropicKeyViaProcessEnv: !!processEnv?.ANTHROPIC_API_KEY,
            hasCfEnvGlobal: !!cfEnv,
            cfEnvKeys: cfEnv ? Object.keys(cfEnv) : [],
            globalThisKeysContainingEnv: Object.keys(globalThis as object).filter((k) =>
              /env/i.test(k),
            ),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
