/**
 * Sprint 4.6F – Container des Entscheidungsassistenten.
 * Orchestriert ausschließlich die Anzeige; die Fachlogik liegt im Service.
 */
import { useState } from "react";
import type { DecisionAssistantController } from "@/hooks/assistant/useDecisionAssistant";
import { AssistantConfirmation } from "./AssistantConfirmation";
import { AssistantConversation } from "./AssistantConversation";
import { AssistantErrorState } from "./AssistantErrorState";
import { AssistantHandoff } from "./AssistantHandoff";
import { AssistantInput } from "./AssistantInput";
import { AssistantMatchSummary } from "./AssistantMatchSummary";
import { AssistantQuestionCard } from "./AssistantQuestionCard";
import { AssistantSessionControls } from "./AssistantSessionControls";
import { AssistantSituationSummary } from "./AssistantSituationSummary";
import { AssistantStatus } from "./AssistantStatus";

export interface DecisionAssistantProps {
  controller: DecisionAssistantController;
}

export function DecisionAssistant({ controller }: DecisionAssistantProps) {
  const [editing, setEditing] = useState(false);
  const session = controller.session;

  if (!controller.hydrated) {
    return (
      <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Bearbeitung wird geladen …
      </p>
    );
  }

  const showInput = editing || !session || session.status === "cancelled";

  return (
    <div className="space-y-4">
      {session && (
        <AssistantStatus
          phase={session.phase}
          status={session.status}
          caseCount={controller.caseCount}
        />
      )}

      {controller.error && (
        <AssistantErrorState
          message={controller.error}
          actionLabel="Abgleich erneut versuchen"
          onAction={controller.runMatching}
        />
      )}

      {controller.sourcesError && (
        <AssistantErrorState message="Der Fallbestand konnte nicht geladen werden. Bitte die Seite neu laden." />
      )}

      {showInput && (
        <AssistantInput
          initialValue={session?.description ?? ""}
          busy={controller.sourcesLoading}
          onSubmit={(text) => {
            if (controller.structureAndMatch(text)) setEditing(false);
          }}
        />
      )}

      {session?.status === "handedOff" && (
        <AssistantHandoff session={session} onReset={controller.reset} />
      )}

      {session && session.status !== "handedOff" && !showInput && (
        <>
          {session.analysis && (
            <AssistantSituationSummary
              description={session.description}
              analysis={session.analysis}
              situation={session.situation}
              onEditDescription={() => setEditing(true)}
              onConfirm={session.matchResult ? undefined : controller.runMatching}
            />
          )}

          {session.matchResult && (
            <AssistantMatchSummary
              result={session.matchResult}
              coverage={session.coverage}
              sources={controller.sources}
              selectedCaseId={session.selectedCaseId}
              stale={controller.stale}
              onSelect={(id) =>
                controller.selectCase(session.selectedCaseId === id ? null : id)
              }
              onRematch={controller.runMatching}
              onContinueWithout={() => controller.selectCase(null)}
            />
          )}

          {controller.questions.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Rückfragen</h2>
              <p className="text-xs text-muted-foreground">
                Diese Angaben fehlen und begrenzen die Trefferlage. Antworten fließen unmittelbar in
                den Sachverhalt ein.
              </p>
              {controller.questions.slice(0, 3).map((q) => (
                <AssistantQuestionCard
                  key={q.questionId}
                  question={q}
                  onAnswer={(value) => controller.answer(q.questionId, value)}
                  onUnknown={() => controller.markUnknown(q.questionId)}
                />
              ))}
            </section>
          )}

          {session.matchResult && (
            <AssistantConfirmation
              session={session}
              selectedSource={controller.selectedSource}
              legalPreview={controller.legalPreview ?? null}
              documentationPreview={controller.documentationPreview ?? null}
              openQuestionCount={controller.questions.length}
              onHandoff={() => controller.handOffToNavigator()}
              onBackToQuestions={() => {
                document
                  .querySelector("main")
                  ?.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}

          <AssistantConversation session={session} />
          <AssistantSessionControls
            status={session.status}
            onPause={controller.pause}
            onResume={controller.resumeSession}
            onCancel={controller.cancel}
            onReset={controller.reset}
          />
        </>
      )}
    </div>
  );
}
