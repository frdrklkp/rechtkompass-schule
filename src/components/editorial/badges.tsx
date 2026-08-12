// Zentrale Status- und Anzeige-Badges für Editorial-UI.
// Alle Editorial-Ansichten verwenden ausschließlich diese Komponenten.

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PublicationTier,
  ReviewStatus,
  WorkflowStatus,
} from "@/services/editorial";

const WORKFLOW_LABEL: Record<WorkflowStatus, string> = {
  draft: "Entwurf",
  in_review: "In Prüfung",
  approved: "Genehmigt",
  published: "Veröffentlicht",
  archived: "Archiviert",
};

const WORKFLOW_TONE: Record<WorkflowStatus, string> = {
  draft: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  in_review: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  approved: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  published: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  archived: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
};

export function WorkflowBadge({ status }: { status: WorkflowStatus | null | undefined }) {
  const s = status ?? "draft";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        WORKFLOW_TONE[s],
      )}
      aria-label={`Workflow-Status: ${WORKFLOW_LABEL[s]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {WORKFLOW_LABEL[s]}
    </span>
  );
}

const TIER_LABEL: Record<PublicationTier, string> = {
  internal: "Intern",
  beta: "Beta",
  public: "Öffentlich",
  premium: "Premium",
};

const TIER_TONE: Record<PublicationTier, string> = {
  internal: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20",
  beta: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  public: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  premium: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

export function PublicationBadge({
  tier,
}: {
  tier: PublicationTier | null | undefined;
}) {
  if (!tier) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TIER_TONE[tier],
      )}
      aria-label={`Sichtbarkeit: ${TIER_LABEL[tier]}`}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pending: "Offen",
  approved: "Genehmigt",
  changes_requested: "Änderungen angefordert",
  rejected: "Abgelehnt",
  cancelled: "Abgebrochen",
};

const REVIEW_TONE: Record<ReviewStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  changes_requested: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  cancelled: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        REVIEW_TONE[status],
      )}
    >
      {REVIEW_LABEL[status]}
    </span>
  );
}

export function QualityBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    status === "good" || status === "high"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
      : status === "medium" || status === "warn"
        ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
        : status === "low" || status === "bad"
          ? "bg-rose-500/10 text-rose-700 border-rose-500/30"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone,
      )}
    >
      {status}
    </span>
  );
}

export function LegalUpdateBadge({ active }: { active: boolean | null | undefined }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
      <AlertTriangle className="h-3 w-3" />
      Rechts-Update
    </span>
  );
}
