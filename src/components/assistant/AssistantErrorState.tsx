/**
 * Sprint 4.6F – Verständliche Fehlermeldung mit Handlungsoption.
 * Es werden keine technischen Details angezeigt.
 */
import { AlertTriangle } from "lucide-react";

export interface AssistantErrorStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function AssistantErrorState({ message, actionLabel, onAction }: AssistantErrorStateProps) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
      <p className="text-sm font-semibold text-foreground">
        <AlertTriangle className="mr-1 inline h-4 w-4 text-danger" aria-hidden="true" />
        Das hat nicht funktioniert
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-accent"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
