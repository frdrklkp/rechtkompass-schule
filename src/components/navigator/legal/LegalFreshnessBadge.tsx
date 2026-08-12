/**
 * Sprint 4.6G – Aktualitätsanzeige einer Rechtsgrundlage.
 * Der Status wird immer als Text mit Icon dargestellt, niemals nur über Farbe.
 */
import { AlertTriangle, CheckCircle2, Clock, HelpCircle } from "lucide-react";
import type { LegalFreshnessStatus } from "@/services/legal-context";
import { FRESHNESS_LABEL } from "./legalPresentation";

const FRESHNESS_STYLE: Record<LegalFreshnessStatus, string> = {
  current: "border-success/50 bg-success/10 text-success",
  aging: "border-warning/50 bg-warning/10 text-warning",
  outdated: "border-destructive/50 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

const FRESHNESS_ICON: Record<LegalFreshnessStatus, typeof CheckCircle2> = {
  current: CheckCircle2,
  aging: Clock,
  outdated: AlertTriangle,
  unknown: HelpCircle,
};

export interface LegalFreshnessBadgeProps {
  status: LegalFreshnessStatus;
  /** Optionaler Grund (z. B. bei aging/outdated), wird als title ausgegeben. */
  reason?: string | null;
}

export function LegalFreshnessBadge({ status, reason }: LegalFreshnessBadgeProps) {
  const Icon = FRESHNESS_ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${FRESHNESS_STYLE[status]}`}
      title={reason ?? undefined}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {FRESHNESS_LABEL[status]}
    </span>
  );
}
