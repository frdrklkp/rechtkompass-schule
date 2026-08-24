// Zentrale Workflow-Dialoge: Einreichen, Publish, Archivieren,
// Reaktivieren und Reviewentscheidung. Alle Aktionen laufen ausschließlich
// über den EditorialWorkflowService (via Hooks).

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PublicationTier, ReviewDecision } from "@/services/editorial";
import {
  useArchive,
  usePublish,
  useReactivate,
  useRevertToDraft,
  useSubmitForReview,
  useDecideReview,
} from "@/hooks/editorial/useWorkflowActions";

// -------- Submit For Review --------

export function SubmitForReviewDialog({
  caseId,
  open,
  onOpenChange,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [comment, setComment] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const submit = useSubmitForReview();

  async function handle() {
    await submit
      .mutateAsync({
        caseId,
        comment: comment.trim() || null,
        assignedTo: assignedTo.trim() || null,
      })
      .then(() => onOpenChange(false))
      .catch(() => {
        /* Fehler-Toast im Hook */
      });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fall zur Prüfung einreichen</DialogTitle>
          <DialogDescription>
            Nach dem Einreichen ist der Fall nicht mehr direkt bearbeitbar,
            bis eine Reviewentscheidung erfolgt ist.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="assignedTo">Reviewer:in (optional)</Label>
            <Input
              id="assignedTo"
              placeholder="User-ID"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comment">Kommentar (optional)</Label>
            <Textarea
              id="comment"
              placeholder="Hinweise für die Prüfung"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handle} disabled={submit.isPending}>
            {submit.isPending ? "Einreichen…" : "Einreichen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Publish --------

export function PublishDialog({
  caseId,
  open,
  onOpenChange,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tier, setTier] = useState<PublicationTier>("public");
  const publish = usePublish();

  async function handle() {
    await publish
      .mutateAsync({ caseId, publicationTier: tier })
      .then(() => onOpenChange(false))
      .catch(() => {
        /* Toast im Hook */
      });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fall veröffentlichen</DialogTitle>
          <DialogDescription>
            Wählen Sie die Sichtbarkeitsstufe. Diese Aktion ist bestätigt
            unmittelbar wirksam.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Sichtbarkeit</Label>
            <Select
              value={tier}
              onValueChange={(v) => setTier(v as PublicationTier)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Intern</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
                <SelectItem value="public">Öffentlich</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ul className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <li><strong>Öffentlich:</strong> Frei sichtbar für alle Nutzer.</li>
            <li><strong>Intern:</strong> Nur intern sichtbar.</li>
            <li><strong>Beta/Premium:</strong> Sichtbarkeit gemäß aktuellem Rollenmodell (RLS entscheidet).</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handle} disabled={publish.isPending}>
            {publish.isPending ? "Veröffentliche…" : "Veröffentlichen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Archive --------

export function ArchiveDialog({
  caseId,
  open,
  onOpenChange,
  fromPublished = false,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromPublished?: boolean;
}) {
  const [reason, setReason] = useState("");
  const archive = useArchive();

  async function handle() {
    await archive
      .mutateAsync({ caseId, reason: reason.trim() || null })
      .then(() => onOpenChange(false))
      .catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fall archivieren</DialogTitle>
          <DialogDescription>
            {fromPublished
              ? "Der Fall ist nach der Archivierung nicht mehr öffentlich sichtbar."
              : "Der Entwurf wird archiviert und ist nicht mehr in der aktiven Redaktionsliste."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reason">Grund (optional)</Label>
          <Textarea
            id="reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={handle} disabled={archive.isPending}>
            {archive.isPending ? "Archiviere…" : "Archivieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Reactivate --------

export function ReactivateDialog({
  caseId,
  open,
  onOpenChange,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const reactivate = useReactivate();
  async function handle() {
    await reactivate
      .mutateAsync({ caseId })
      .then(() => onOpenChange(false))
      .catch(() => {});
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fall reaktivieren</DialogTitle>
          <DialogDescription>
            Der Fall wird als Entwurf reaktiviert. Eine erneute redaktionelle
            Prüfung kann notwendig sein. Historische Zeitstempel bleiben im
            Backend erhalten.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handle} disabled={reactivate.isPending}>
            {reactivate.isPending ? "Reaktiviere…" : "Reaktivieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Revert to Draft --------

export function RevertToDraftDialog({
  caseId,
  open,
  onOpenChange,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const revert = useRevertToDraft();
  async function handle() {
    await revert
      .mutateAsync({ caseId })
      .then(() => onOpenChange(false))
      .catch(() => {});
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Genehmigung zurückziehen</DialogTitle>
          <DialogDescription>
            Der Fall wird auf Entwurf zurückgesetzt und muss erneut zur
            Prüfung eingereicht werden, bevor er veröffentlicht werden kann.
            Der Zeitpunkt der bisherigen Genehmigung bleibt im Verlauf
            erhalten.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={handle} disabled={revert.isPending}>
            {revert.isPending ? "Setze zurück…" : "Auf Entwurf zurücksetzen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Review Decision --------

const DECISION_META: Record<
  ReviewDecision,
  { title: string; label: string; commentRequired: boolean; destructive?: boolean }
> = {
  approved: { title: "Review genehmigen", label: "Genehmigen", commentRequired: false },
  changes_requested: {
    title: "Änderungen anfordern",
    label: "Änderungen anfordern",
    commentRequired: true,
  },
  rejected: {
    title: "Review ablehnen",
    label: "Ablehnen",
    commentRequired: true,
    destructive: true,
  },
  cancelled: { title: "Review abbrechen", label: "Abbrechen", commentRequired: false },
};

export function ReviewDecisionDialog({
  reviewId,
  caseId,
  decision,
  open,
  onOpenChange,
}: {
  reviewId: string;
  caseId: string | null;
  decision: ReviewDecision;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const meta = DECISION_META[decision];
  const [comment, setComment] = useState("");
  const decide = useDecideReview(caseId);
  const invalid = meta.commentRequired && !comment.trim();

  async function handle() {
    if (invalid) return;
    await decide
      .mutateAsync({ reviewId, decision, comment: comment.trim() || null })
      .then(() => {
        setComment("");
        onOpenChange(false);
      })
      .catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>
            {meta.commentRequired
              ? "Bitte begründen Sie Ihre Entscheidung."
              : "Kommentar optional."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="review-comment">Kommentar</Label>
          <Textarea
            id="review-comment"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-invalid={invalid}
            aria-required={meta.commentRequired}
          />
          {invalid && (
            <p className="text-xs text-destructive">
              Für diese Entscheidung ist ein Kommentar erforderlich.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            variant={meta.destructive ? "destructive" : "default"}
            onClick={handle}
            disabled={decide.isPending || invalid}
          >
            {decide.isPending ? "Speichere…" : meta.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
