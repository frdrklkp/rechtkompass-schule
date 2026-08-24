/** Tier 3 – Maßnahmen-Schritt (optionale Zusatzfolge): wrappt den bestehenden Editor. */
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SituationMeasureEditor } from "@/components/navigator/situation/SituationMeasureEditor";
import type { NewMeasure, SituationMeasure } from "@/services/situation-analyzer";
import type { TileSequenceStep } from "@/services/assistant/tile-intake";
import { TileStepFrame } from "./TileStepFrame";

export interface TileIntakeMeasureStepProps {
  step: TileSequenceStep;
  progress: { index: number; total: number };
  measures: SituationMeasure[];
  onAdd: (input: NewMeasure) => void;
  onRemove: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  canGoBack: boolean;
}

export function TileIntakeMeasureStep({
  step,
  progress,
  measures,
  onAdd,
  onRemove,
  onConfirm,
  onBack,
  canGoBack,
}: TileIntakeMeasureStepProps) {
  return (
    <TileStepFrame title={step.title} help={step.help} progress={progress} onBack={onBack} canGoBack={canGoBack}>
      <SituationMeasureEditor measures={measures} onAdd={onAdd} onRemove={onRemove} />
      <Button type="button" onClick={onConfirm} className="gap-2">
        Weiter <ArrowRight className="h-4 w-4" />
      </Button>
    </TileStepFrame>
  );
}
