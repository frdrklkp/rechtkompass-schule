/** Sprint 4.6A – Navigationsschaltflächen des Decision Navigators. */
import { ArrowLeft, ArrowRight, RotateCcw, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface NavigationButtonsProps {
  canGoBack: boolean;
  canGoNext: boolean;
  canSkip: boolean;
  finished: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onCancel: () => void;
  onRestart: () => void;
}

export function NavigationButtons({
  canGoBack,
  canGoNext,
  canSkip,
  finished,
  onBack,
  onNext,
  onSkip,
  onCancel,
  onRestart,
}: NavigationButtonsProps) {
  if (finished) {
    return (
      <Button onClick={onRestart} className="gap-2">
        <RotateCcw className="h-4 w-4" /> Neu starten
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={onBack} disabled={!canGoBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Zurück
      </Button>
      <Button onClick={onNext} disabled={!canGoNext} className="gap-2">
        Weiter <ArrowRight className="h-4 w-4" />
      </Button>
      {canSkip && (
        <Button variant="ghost" onClick={onSkip} className="gap-2">
          <SkipForward className="h-4 w-4" /> Überspringen
        </Button>
      )}
      <Button variant="ghost" onClick={onCancel} className="ml-auto gap-2 text-muted-foreground">
        <X className="h-4 w-4" /> Abbrechen
      </Button>
    </div>
  );
}
