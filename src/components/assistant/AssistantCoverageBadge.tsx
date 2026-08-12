/**
 * Sprint 4.6F – Abdeckungsgrad der Trefferlage als verständliche Kennzeichnung.
 */
import { ASSISTANT_COVERAGE_LABELS, type AssistantCoverage } from "@/services/assistant";

const STYLE: Record<string, string> = {
  high: "border-success/50 bg-success/10 text-foreground",
  medium: "border-warning/50 bg-warning/10 text-foreground",
  low: "border-border bg-muted text-muted-foreground",
  none: "border-danger/40 bg-danger/10 text-foreground",
};

export interface AssistantCoverageBadgeProps {
  coverage: AssistantCoverage;
  showScore?: boolean;
}

export function AssistantCoverageBadge({ coverage, showScore = false }: AssistantCoverageBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STYLE[coverage.level]}`}
    >
      {ASSISTANT_COVERAGE_LABELS[coverage.level]}
      {showScore && <span className="text-muted-foreground">· {coverage.score}/100</span>}
    </span>
  );
}
