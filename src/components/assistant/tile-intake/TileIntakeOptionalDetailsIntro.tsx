/**
 * Tier 3 – Einstieg in die optionale Zusatzfolge (progressive disclosure).
 * Vollständig überspringbar - "Nein, fertig" führt direkt zum Ergebnis.
 */
import { ArrowRight, ListPlus, SkipForward } from "lucide-react";

export interface TileIntakeOptionalDetailsIntroProps {
  onStart: () => void;
  onSkip: () => void;
}

export function TileIntakeOptionalDetailsIntro({ onStart, onSkip }: TileIntakeOptionalDetailsIntroProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Weitere Details ergänzen?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Zeugen, bereits durchgeführte Maßnahmen, informierte Stellen und weitere Angaben – optional,
          nicht erforderlich für das Ergebnis.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onStart}
          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5 text-left text-sm text-foreground transition-all hover:border-accent hover:bg-accent/5"
        >
          <span className="flex items-center gap-2 font-medium">
            <ListPlus className="h-4 w-4 text-accent" /> Ja, weitere Angaben ergänzen
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5 text-left text-sm text-foreground transition-all hover:border-accent hover:bg-accent/5"
        >
          <span className="flex items-center gap-2 font-medium">
            <SkipForward className="h-4 w-4 text-muted-foreground" /> Nein, fertig
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
        </button>
      </div>
    </div>
  );
}
