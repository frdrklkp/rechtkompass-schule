/** Tier 3 – Nachweise-Schritt: wrappt den bestehenden Editor. */
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SituationEvidenceEditor } from "@/components/navigator/situation/SituationEvidenceEditor";
import type { NewEvidence, SituationEvidence } from "@/services/situation-analyzer";
import type { TileSequenceStep } from "@/services/assistant/tile-intake";
import { TileStepFrame } from "./TileStepFrame";

export interface TileIntakeEvidenceStepProps {
  step: TileSequenceStep;
  progress: { index: number; total: number };
  evidence: SituationEvidence[];
  onAdd: (input: NewEvidence) => void;
  onRemove: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  canGoBack: boolean;
}

export function TileIntakeEvidenceStep({
  step,
  progress,
  evidence,
  onAdd,
  onRemove,
  onConfirm,
  onBack,
  canGoBack,
}: TileIntakeEvidenceStepProps) {
  return (
    <TileStepFrame title={step.title} help={step.help} progress={progress} onBack={onBack} canGoBack={canGoBack}>
      <SituationEvidenceEditor evidence={evidence} onAdd={onAdd} onRemove={onRemove} />
      <Button type="button" onClick={onConfirm} className="gap-2">
        Weiter <ArrowRight className="h-4 w-4" />
      </Button>
    </TileStepFrame>
  );
}
