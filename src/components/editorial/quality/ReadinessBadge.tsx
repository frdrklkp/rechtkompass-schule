// Readiness-Badge – Status wird zusätzlich zur Farbe durch Icon und Label
// dargestellt (Accessibility: nicht nur Farbe).

import { CheckCircle2, AlertTriangle, Ban, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  READINESS_LABEL,
  type PublishReadinessStatus,
} from "@/services/editorial/quality";

const TONE: Record<PublishReadinessStatus, string> = {
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ready_with_warnings:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  blocked: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  not_assessable: "border-border bg-muted text-muted-foreground",
};

const ICON: Record<
  PublishReadinessStatus,
  React.ComponentType<{ className?: string }>
> = {
  ready: CheckCircle2,
  ready_with_warnings: AlertTriangle,
  blocked: Ban,
  not_assessable: HelpCircle,
};

export function ReadinessBadge({
  status,
  compact = false,
}: {
  status: PublishReadinessStatus;
  compact?: boolean;
}) {
  const Icon = ICON[status];
  return (
    <span
      role="status"
      aria-label={`Veröffentlichungs-Status: ${READINESS_LABEL[status]}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE[status],
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {compact ? shortLabel(status) : READINESS_LABEL[status]}
    </span>
  );
}

function shortLabel(s: PublishReadinessStatus) {
  switch (s) {
    case "ready":
      return "Bereit";
    case "ready_with_warnings":
      return "Bereit (Warnungen)";
    case "blocked":
      return "Blockiert";
    case "not_assessable":
      return "N/A";
  }
}
