/**
 * Sprint 4.6K – Steuert einen einzelnen Fallgenerierungs-Job
 * (/api/case-generation-jobs) vom Start bis zum Abschluss: startet den Job,
 * pollt seinen Status und liefert ein einfaches Zustandsobjekt für die UI.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

export type CaseGenerationJobState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running"; jobId: string; phase: string }
  | { status: "succeeded"; jobId: string; caseId: string }
  | { status: "failed"; jobId?: string; error: string };

export interface CaseGenerationJobController {
  state: CaseGenerationJobState;
  start: (sketch: string) => Promise<void>;
  reset: () => void;
}

const POLL_INTERVAL_MS = 3000;
// Fund 2026-08-30: als die Status-Route in Produktion dauerhaft 500 lieferte
// (Env-Problem), pollte der Hook endlos weiter und die UI zeigte einen
// ewigen Spinner statt eines Fehlers. Einzelne Fehlschläge bleiben tolerant
// (Netzwerk-Hänger), aber nach dieser Anzahl AUFEINANDERFOLGENDER
// Fehlversuche (~30 Sekunden) wird sichtbar aufgegeben.
const MAX_CONSECUTIVE_POLL_FAILURES = 10;

export function useCaseGenerationJob(): CaseGenerationJobController {
  const [state, setState] = useState<CaseGenerationJobState>({ status: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const poll = useCallback(
    (jobId: string) => {
      stopPolling();
      let consecutiveFailures = 0;
      const giveUp = () => {
        stopPolling();
        setState({
          status: "failed",
          jobId,
          error:
            "Der Status der Fallgenerierung ist derzeit nicht abrufbar. Der Auftrag läuft möglicherweise im Hintergrund weiter - bitte später erneut prüfen oder das Problem melden.",
        });
      };
      pollRef.current = setInterval(async () => {
        try {
          const res = await apiFetch(`/api/case-generation-jobs/${jobId}`);
          if (!res.ok) {
            consecutiveFailures += 1;
            if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) giveUp();
            return;
          }
          consecutiveFailures = 0;
          const data = (await res.json()) as {
            status: string;
            phase: string;
            caseId: string | null;
            error: string | null;
          };
          if (data.status === "succeeded" && data.caseId) {
            stopPolling();
            setState({ status: "succeeded", jobId, caseId: data.caseId });
          } else if (data.status === "failed") {
            stopPolling();
            setState({ status: "failed", jobId, error: data.error ?? "Unbekannter Fehler bei der Fallgenerierung." });
          } else {
            setState({ status: "running", jobId, phase: data.phase });
          }
        } catch {
          // Vorübergehender Netzwerkfehler - beim nächsten Intervall erneut
          // versuchen, aber ebenfalls gegen die Aufgabe-Schwelle zählen.
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) giveUp();
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  const start = useCallback(
    async (sketch: string) => {
      setState({ status: "starting" });
      try {
        const res = await apiFetch("/api/case-generation-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sketch }),
        });
        const data = (await res.json()) as { jobId?: string; phase?: string; error?: string };
        if (!res.ok || !data.jobId) {
          setState({ status: "failed", error: data.error ?? "Anfrage konnte nicht gestartet werden." });
          return;
        }
        setState({ status: "running", jobId: data.jobId, phase: data.phase ?? "entwurf" });
        poll(data.jobId);
      } catch {
        setState({ status: "failed", error: "Anfrage konnte nicht gestartet werden." });
      }
    },
    [poll],
  );

  const reset = useCallback(() => {
    stopPolling();
    setState({ status: "idle" });
  }, [stopPolling]);

  return { state, start, reset };
}
