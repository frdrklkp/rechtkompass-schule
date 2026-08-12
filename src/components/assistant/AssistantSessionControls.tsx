/**
 * Sprint 4.6F – Sitzungssteuerung des Assistenten.
 * Pausieren, Fortsetzen, Abbrechen und Zurücksetzen mit Bestätigung.
 */
import { useState } from "react";
import { Pause, Play, RotateCcw, XCircle } from "lucide-react";
import type { AssistantStatus } from "@/services/assistant";

export interface AssistantSessionControlsProps {
  status: AssistantStatus;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onReset: () => void;
}

export function AssistantSessionControls({
  status,
  onPause,
  onResume,
  onCancel,
  onReset,
}: AssistantSessionControlsProps) {
  const [confirm, setConfirm] = useState<"cancel" | "reset" | null>(null);
  const base =
    "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:border-accent";

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        {status === "running" && (
          <button type="button" className={base} onClick={onPause}>
            <Pause className="h-3.5 w-3.5" /> Pausieren
          </button>
        )}
        {status === "paused" && (
          <button type="button" className={base} onClick={onResume}>
            <Play className="h-3.5 w-3.5" /> Fortsetzen
          </button>
        )}
        {(status === "running" || status === "paused") && (
          <button type="button" className={base} onClick={() => setConfirm("cancel")}>
            <XCircle className="h-3.5 w-3.5" /> Abbrechen
          </button>
        )}
        <button type="button" className={base} onClick={() => setConfirm("reset")}>
          <RotateCcw className="h-3.5 w-3.5" /> Zurücksetzen
        </button>
      </div>

      {confirm && (
        <div className="mt-3 rounded-xl border border-warning/50 bg-warning/10 p-3 text-xs">
          <p className="font-medium text-foreground">
            {confirm === "cancel"
              ? "Bearbeitung abbrechen? Die Angaben bleiben gespeichert und nachvollziehbar."
              : "Alle Angaben dieser Bearbeitung endgültig verwerfen?"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (confirm === "cancel") onCancel();
                else onReset();
                setConfirm(null);
              }}
              className="rounded-xl bg-accent px-3 py-1.5 font-semibold text-accent-foreground"
            >
              Ja, {confirm === "cancel" ? "abbrechen" : "zurücksetzen"}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="rounded-xl border border-border bg-background px-3 py-1.5"
            >
              Weiter bearbeiten
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
