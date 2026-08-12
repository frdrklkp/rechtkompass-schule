/**
 * POST /api/copilot-track
 * Nimmt clientseitige Copilot-Interaktionen entgegen und schreibt sie
 * in die Copilot-Telemetrie (in-memory, keine PII). Wird für die neuen
 * Sprint-4.4-Events "workflow_opened" und "workflow_started_from_ai" genutzt.
 */
import { createFileRoute } from "@tanstack/react-router";
import { copilotTelemetry, type CopilotTelemetryEvent } from "@/services/legal-copilot/telemetry";

const ALLOWED: CopilotTelemetryEvent[] = ["workflow_opened", "workflow_started_from_ai"];

export const Route = createFileRoute("/api/copilot-track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { event?: string; sessionId?: string; detail?: Record<string, unknown> };
        try { body = await request.json(); } catch { return new Response("bad json", { status: 400 }); }
        const ev = body.event as CopilotTelemetryEvent | undefined;
        if (!ev || !ALLOWED.includes(ev)) return new Response("event not allowed", { status: 400 });
        copilotTelemetry.emit({ event: ev, sessionId: body.sessionId, detail: body.detail });
        return Response.json({ ok: true });
      },
    },
  },
});
