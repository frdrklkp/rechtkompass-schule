import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";

export const Route = createFileRoute("/api/_debug-ai-provider")({
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
            processEnvKeyCount: processEnv ? Object.keys(processEnv).length : 0,
            hasAnthropicKeyViaProcessEnv: !!processEnv?.ANTHROPIC_API_KEY,
            hasCfEnvGlobal: !!cfEnv,
            cfEnvKeyCount: cfEnv ? Object.keys(cfEnv).length : 0,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
