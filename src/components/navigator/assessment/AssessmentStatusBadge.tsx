/** Sprint 4.6C – Statusanzeige der Bewertung. */
import type { AssessmentStatus } from "@/services/assessment-engine";

const STATUS_LABEL: Record<AssessmentStatus, string> = {
  notStarted: "Noch nicht bewertet",
  inProgress: "Bewertung läuft",
  completed: "Ausgewertet",
  incomplete: "Unvollständige Datengrundlage",
  conflicted: "Widersprüchliche Angaben",
  failed: "Bewertung fehlgeschlagen",
};

export function AssessmentStatusBadge({ status }: { status: AssessmentStatus }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-foreground">
      Status: {STATUS_LABEL[status]}
    </span>
  );
}
