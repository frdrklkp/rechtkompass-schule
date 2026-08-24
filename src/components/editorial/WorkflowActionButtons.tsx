// Zentrale, rollen- und statusabhängige Workflow-Aktionsleiste.
// Keine direkte DB-Änderung – alle Aktionen laufen über die Dialoge,
// die den EditorialWorkflowService via Hooks ansprechen.

import { useState } from "react";
import {
  ArchiveRestore,
  ArchiveX,
  CheckCircle2,
  Pencil,
  Send,
  Undo2,
  Upload,
  XCircle,
  MessageSquareWarning,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorialRole } from "@/hooks/editorial/useEditorialRole";
import type {
  EditorialCaseRow,
  CaseReviewRow,
  ReviewDecision,
} from "@/services/editorial";
import {
  ArchiveDialog,
  ReactivateDialog,
  RevertToDraftDialog,
  ReviewDecisionDialog,
  SubmitForReviewDialog,
} from "./dialogs";
import { PublishReadinessDialog } from "./quality/PublishReadinessDialog";

export function WorkflowActionButtons({
  caseRow,
  pendingReview,
  onEdit,
}: {
  caseRow: EditorialCaseRow;
  pendingReview?: CaseReviewRow | null;
  onEdit?: () => void;
}) {
  const role = useEditorialRole();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);

  const status = caseRow.workflow_status;
  const isReviewerForThis =
    !!pendingReview &&
    (role.isAdmin ||
      (role.canReview &&
        (pendingReview.assigned_to === null ||
          pendingReview.assigned_to === role.userId)));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && role.canEdit && (
        <>
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </Button>
          )}
          <Button size="sm" onClick={() => setSubmitOpen(true)}>
            <Send className="h-4 w-4" />
            Zur Prüfung einreichen
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setArchiveOpen(true)}
          >
            <ArchiveX className="h-4 w-4" />
            Entwurf archivieren
          </Button>
        </>
      )}

      {status === "in_review" && (
        isReviewerForThis && pendingReview ? (
          <>
            <Button
              size="sm"
              onClick={() => setDecision("approved")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              Genehmigen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDecision("changes_requested")}
            >
              <MessageSquareWarning className="h-4 w-4" />
              Änderungen anfordern
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDecision("rejected")}
            >
              <XCircle className="h-4 w-4" />
              Ablehnen
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDecision("cancelled")}
            >
              <Ban className="h-4 w-4" />
              Abbrechen
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Fall ist in Prüfung. Keine Aktionen für Ihre Rolle.
          </span>
        )
      )}

      {status === "approved" && role.canPublish && (
        <Button size="sm" onClick={() => setPublishOpen(true)}>
          <Upload className="h-4 w-4" />
          Veröffentlichen
        </Button>
      )}

      {status === "approved" && role.canRevertToDraft && (
        <Button variant="outline" size="sm" onClick={() => setRevertOpen(true)}>
          <Undo2 className="h-4 w-4" />
          Genehmigung zurückziehen
        </Button>
      )}

      {status === "published" && role.canArchivePublished && (
        <Button variant="destructive" size="sm" onClick={() => setArchiveOpen(true)}>
          <ArchiveX className="h-4 w-4" />
          Archivieren
        </Button>
      )}

      {status === "archived" && role.canReactivate && (
        <Button size="sm" onClick={() => setReactivateOpen(true)}>
          <ArchiveRestore className="h-4 w-4" />
          Reaktivieren
        </Button>
      )}

      {status === "draft" && role.canEdit && (
        <SubmitForReviewDialog
          caseId={caseRow.id}
          open={submitOpen}
          onOpenChange={setSubmitOpen}
        />
      )}
      <PublishReadinessDialog
        caseId={caseRow.id}
        open={publishOpen}
        onOpenChange={setPublishOpen}
      />
      <ArchiveDialog
        caseId={caseRow.id}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        fromPublished={status === "published"}
      />
      <ReactivateDialog
        caseId={caseRow.id}
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
      />
      <RevertToDraftDialog
        caseId={caseRow.id}
        open={revertOpen}
        onOpenChange={setRevertOpen}
      />
      {pendingReview && decision && (
        <ReviewDecisionDialog
          reviewId={pendingReview.id}
          caseId={caseRow.id}
          decision={decision}
          open={!!decision}
          onOpenChange={(v) => !v && setDecision(null)}
        />
      )}
    </div>
  );
}
