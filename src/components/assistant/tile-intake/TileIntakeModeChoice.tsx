/**
 * Tier 3 – Einstiegsbildschirm: Wahl zwischen "Schnelle Einschätzung" und
 * "Fall dokumentieren". Beide Modi stellen denselben Fragenkatalog; sie
 * unterscheiden sich nur im Ziel am Ende.
 */
import { ChevronRight, FileCheck2, Zap } from "lucide-react";
import type { TileIntakeMode } from "@/services/assistant/tile-intake";

export interface TileIntakeModeChoiceProps {
  onChoose: (mode: TileIntakeMode) => void;
}

export function TileIntakeModeChoice({ onChoose }: TileIntakeModeChoiceProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Wie möchten Sie starten?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Beide Wege stellen dieselben Fragen – nur das Ergebnis am Ende unterscheidet sich.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChoose("schnell")}
          className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-card)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
              <Zap className="h-5 w-5" />
            </div>
            <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Schnelle Einschätzung</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Passenden Praxisfall und Empfehlung ansehen. Nichts wird gespeichert.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChoose("dokumentieren")}
          className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-card)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Fall dokumentieren</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Direkt eine vollständige, gespeicherte Fallakte anlegen und weiterbearbeiten.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
