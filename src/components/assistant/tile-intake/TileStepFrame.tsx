/**
 * Tier 3 – gemeinsames Chrome für Kachel-Fragen und eingebettete Editoren:
 * Fortschrittsbalken, Zähler, Zurück. Stil angelehnt an QuestionView im
 * Kurz-Check (src/components/DecisionAssistant.tsx), dort nur als Vorlage
 * gelesen.
 */
import { ArrowLeft } from "lucide-react";

export interface TileStepFrameProps {
  eyebrow?: string;
  title: string;
  help?: string;
  progress: { index: number; total: number };
  onBack?: () => void;
  canGoBack?: boolean;
  children: React.ReactNode;
}

export function TileStepFrame({
  eyebrow,
  title,
  help,
  progress,
  onBack,
  canGoBack = true,
  children,
}: TileStepFrameProps) {
  const pct =
    progress.total === 0 ? 0 : Math.min(100, Math.round(((progress.index + 1) / progress.total) * 100));

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow ?? `Frage ${Math.min(progress.index + 1, progress.total)} von ${progress.total}`}
          </p>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              disabled={!canGoBack}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-accent disabled:opacity-40"
            >
              <ArrowLeft className="h-3 w-3" /> Zurück
            </button>
          )}
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <h3 className="text-base font-semibold leading-snug text-foreground">{title}</h3>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {children}
    </div>
  );
}
