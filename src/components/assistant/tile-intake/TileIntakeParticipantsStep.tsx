/**
 * Tier 3 – Beteiligte-Schritt: wrappt den bestehenden Editor in den
 * gemeinsamen Kachel-Rahmen. "0 erfasst" ist ein gültiger Endzustand
 * (siehe standardSituationSchema.ts, beteiligte.liste ist required:false).
 */
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SituationParticipantEditor } from "@/components/navigator/situation/SituationParticipantEditor";
import type {
  NewParticipant,
  SituationParticipant,
} from "@/services/situation-analyzer";
import type { TileSequenceStep } from "@/services/assistant/tile-intake";
import { TileStepFrame } from "./TileStepFrame";

export interface TileIntakeParticipantsStepProps {
  step: TileSequenceStep;
  progress: { index: number; total: number };
  participants: SituationParticipant[];
  onAdd: (input: NewParticipant) => void;
  onUpdate: (id: string, patch: Partial<Omit<SituationParticipant, "id">>) => void;
  onRemove: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  canGoBack: boolean;
}

export function TileIntakeParticipantsStep({
  step,
  progress,
  participants,
  onAdd,
  onUpdate,
  onRemove,
  onConfirm,
  onBack,
  canGoBack,
}: TileIntakeParticipantsStepProps) {
  return (
    <TileStepFrame title={step.title} help={step.help} progress={progress} onBack={onBack} canGoBack={canGoBack}>
      <SituationParticipantEditor
        participants={participants}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
      <Button type="button" onClick={onConfirm} className="gap-2">
        Weiter <ArrowRight className="h-4 w-4" />
      </Button>
    </TileStepFrame>
  );
}
