/**
 * Sprint 4.6B – Container des Situation Analyzers.
 * Reine Darstellung; jede Zustandsänderung läuft über den Service-Hook.
 */
import { RotateCcw } from "lucide-react";
import { SituationCompleteness } from "./SituationCompleteness";
import { SituationEvidenceEditor } from "./SituationEvidenceEditor";
import { SituationMeasureEditor } from "./SituationMeasureEditor";
import { SituationParticipantEditor } from "./SituationParticipantEditor";
import { SituationQuestion } from "./SituationQuestion";
import { SituationReview } from "./SituationReview";
import { SituationSection } from "./SituationSection";
import { SituationValidationSummary } from "./SituationValidationSummary";
import { SituationWitnessEditor } from "./SituationWitnessEditor";
import { Button } from "@/components/ui/button";
import type { SituationAnalyzerController } from "@/hooks/navigator/useSituationAnalyzer";
import type { SituationQuestionDefinition } from "@/services/situation-analyzer";

export interface SituationAnalyzerProps {
  controller: SituationAnalyzerController;
}

export function SituationAnalyzer({ controller }: SituationAnalyzerProps) {
  if (controller.dataError) {
    return (
      <div role="alert" className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
        <p className="text-sm font-medium text-foreground">
          Die gespeicherten Angaben konnten nicht geladen werden.
        </p>
        <p className="text-sm text-foreground/85">{controller.dataError}</p>
        <p className="text-xs text-muted-foreground">
          Ihre bisherigen Angaben wurden nicht gelöscht. Sie können die Situationserfassung
          kontrolliert neu beginnen.
        </p>
        <Button type="button" onClick={controller.restart} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Situationserfassung neu beginnen
        </Button>
      </div>
    );
  }

  const situationCase = controller.situationCase;
  if (!controller.ready || !situationCase) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Situationserfassung wird vorbereitet …
      </div>
    );
  }

  const resolved = controller.resolver.resolve(situationCase.answers);
  const sections = controller.resolver.sectionsInOrder();
  const errorFor = (questionId: string) =>
    controller.showValidation
      ? controller.validation.issues.find((i) => i.questionId === questionId)?.message
      : undefined;

  const renderEditor = (question: SituationQuestionDefinition) => {
    if (question.type === "participants") {
      return (
        <SituationParticipantEditor
          participants={situationCase.participants}
          onAdd={(input) => {
            controller.addParticipant(input);
            controller.answer(question.id, "erfasst");
          }}
          onUpdate={controller.updateParticipant}
          onRemove={controller.removeParticipant}
        />
      );
    }
    if (question.metadata?.editor === "witnesses") {
      return (
        <SituationWitnessEditor
          witnesses={situationCase.witnesses}
          participants={situationCase.participants}
          onAdd={(input) => {
            controller.addWitness(input);
            controller.answer(question.id, "erfasst");
          }}
          onRemove={controller.removeWitness}
        />
      );
    }
    if (question.type === "evidence") {
      return (
        <SituationEvidenceEditor
          evidence={situationCase.evidence}
          onAdd={(input) => {
            controller.addEvidence(input);
            controller.answer(question.id, "erfasst");
          }}
          onRemove={controller.removeEvidence}
        />
      );
    }
    if (question.type === "measures") {
      return (
        <SituationMeasureEditor
          measures={situationCase.measuresTaken}
          onAdd={(input) => {
            controller.addMeasure(input);
            controller.answer(question.id, "erfasst");
          }}
          onRemove={controller.removeMeasure}
        />
      );
    }
    return undefined;
  };

  return (
    <div className="space-y-4">
      <SituationCompleteness completeness={situationCase.completeness} />
      {controller.showValidation && (
        <SituationValidationSummary issues={controller.validation.issues} />
      )}

      {sections.map((section, index) => {
        const questions = resolved.filter((q) => q.visible && q.definition.section === section.id);
        if (questions.length === 0) return null;
        return (
          <SituationSection
            key={section.id}
            section={section}
            index={index}
            total={sections.length}
          >
            {questions.map(({ definition, required }) => (
              <SituationQuestion
                key={definition.id}
                question={definition}
                required={required}
                answer={situationCase.answers[definition.id]}
                errorMessage={errorFor(definition.id)}
                onAnswer={(value) => controller.answer(definition.id, value)}
                onUnknown={() => controller.markUnknown(definition.id)}
                onNotApplicable={() => controller.markNotApplicable(definition.id)}
              >
                {renderEditor(definition)}
              </SituationQuestion>
            ))}
          </SituationSection>
        );
      })}

      <SituationReview situationCase={situationCase} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={controller.complete}>
          Angaben prüfen und Situation abschließen
        </Button>
        <Button type="button" variant="ghost" onClick={controller.restart} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Zurücksetzen
        </Button>
        <span className="text-xs text-muted-foreground">
          {situationCase.status === "complete"
            ? "Situation vollständig erfasst. Sie können mit „Weiter“ fortfahren."
            : "Der nächste Schritt wird erst nach vollständiger Erfassung freigegeben."}
        </span>
      </div>
    </div>
  );
}
