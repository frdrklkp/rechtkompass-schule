/** Tier 3 – Zeugen-Schritt (optionale Zusatzfolge): wrappt den bestehenden Editor. */
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SituationWitnessEditor } from "@/components/navigator/situation/SituationWitnessEditor";
import type { NewWitness, SituationParticipant, SituationWitness } from "@/services/situation-analyzer";
import type { TileSequenceStep } from "@/services/assistant/tile-intake";
import { TileStepFrame } from "./TileStepFrame";

export interface TileIntakeWitnessStepProps {
  step: TileSequenceStep;
  progress: { index: number; total: number };
  witnesses: SituationWitness[];
  participants: SituationParticipant[];
  onAdd: (input: NewWitness) => void;
  onRemove: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  canGoBack: boolean;
}

export function TileIntakeWitnessStep({
  step,
  progress,
  witnesses,
  participants,
  onAdd,
  onRemove,
  onConfirm,
  onBack,
  canGoBack,
}: TileIntakeWitnessStepProps) {
  return (
    <TileStepFrame title={step.title} help={step.help} progress={progress} onBack={onBack} canGoBack={canGoBack}>
      <SituationWitnessEditor witnesses={witnesses} participants={participants} onAdd={onAdd} onRemove={onRemove} />
      <Button type="button" onClick={onConfirm} className="gap-2">
        Weiter <ArrowRight className="h-4 w-4" />
      </Button>
    </TileStepFrame>
  );
}
