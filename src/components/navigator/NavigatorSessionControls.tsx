/**
 * Sprint 4.6B.1 – Sichtbare Session-Steuerung des Decision Navigators.
 * Nutzt ausschließlich die vorhandene Engine-Session.
 */
import { LogOut, Pause, Play, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface NavigatorSessionControlsProps {
  status: string;
  isDemo: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRestart: () => void;
  onLeave: () => void;
  onResetDemo: () => void;
}

type PendingAction = null | "cancel" | "restart" | "resetDemo";

const DIALOG_TEXT: Record<Exclude<PendingAction, null>, { title: string; description: string; confirm: string }> = {
  cancel: {
    title: "Bearbeitung abbrechen?",
    description:
      "Die Bearbeitung wird als abgebrochen markiert. Ihre bisherigen Angaben bleiben gespeichert, bis Sie sie ausdrücklich zurücksetzen.",
    confirm: "Bearbeitung abbrechen",
  },
  restart: {
    title: "Bearbeitung neu starten?",
    description:
      "Der Ablauf beginnt wieder bei der ersten Phase. Bereits erfasste Angaben im Kontext bleiben erhalten.",
    confirm: "Neu starten",
  },
  resetDemo: {
    title: "Demo-Bearbeitung zurücksetzen?",
    description:
      "Die gespeicherte Demo-Session wird gelöscht. Echte Bearbeitungen sind davon nicht betroffen.",
    confirm: "Demo zurücksetzen",
  },
};

export function NavigatorSessionControls({
  status,
  isDemo,
  onPause,
  onResume,
  onCancel,
  onRestart,
  onLeave,
  onResetDemo,
}: NavigatorSessionControlsProps) {
  const [pending, setPending] = useState<PendingAction>(null);
  const text = pending ? DIALOG_TEXT[pending] : null;

  const confirm = () => {
    if (pending === "cancel") onCancel();
    if (pending === "restart") onRestart();
    if (pending === "resetDemo") onResetDemo();
    setPending(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 p-2.5">
      {status === "paused" ? (
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onResume}>
          <Play className="h-3.5 w-3.5" aria-hidden="true" /> Fortsetzen
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={onPause}
          disabled={status !== "running"}
        >
          <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pausieren
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onLeave}>
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Navigator verlassen
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5"
        onClick={() => setPending("restart")}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Neu starten
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5 text-muted-foreground"
        onClick={() => setPending("cancel")}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" /> Abbrechen
      </Button>
      {isDemo && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setPending("resetDemo")}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Demo zurücksetzen
        </Button>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text?.title}</AlertDialogTitle>
            <AlertDialogDescription>{text?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zurück</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>{text?.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
