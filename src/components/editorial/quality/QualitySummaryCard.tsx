// Wiederverwendbare Zusammenfassungs-Karte für die Qualitätsbewertung.

import { AlertTriangle, Ban, CheckCircle2, Info } from "lucide-react";
import { ReadinessBadge } from "./ReadinessBadge";
import {
  GRADE_LABEL,
  type CaseQualityAssessment,
} from "@/services/editorial/quality";

export function QualitySummaryCard({
  assessment,
  compact = false,
}: {
  assessment: CaseQualityAssessment;
  compact?: boolean;
}) {
  const a = assessment;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Qualitätsbewertung
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-3xl font-semibold">{a.percentage}%</span>
            <span className="text-xs text-muted-foreground">
              {a.score} / {a.maxScore} Punkte
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium"
            aria-label={`Qualitätsnote: ${GRADE_LABEL[a.grade]}`}
          >
            Note {a.grade === "ungraded" ? "—" : a.grade}
          </span>
          <ReadinessBadge status={a.readinessStatus} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Kpi
          icon={Ban}
          tone="rose"
          count={a.blockers.length}
          label="Blocker"
        />
        <Kpi
          icon={AlertTriangle}
          tone="amber"
          count={a.warnings.length}
          label="Warnungen"
        />
        <Kpi
          icon={CheckCircle2}
          tone="emerald"
          count={a.passedRules.filter((r) => r.severity !== "info").length}
          label="Erfüllt"
        />
      </div>

      {!compact && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Deterministische regelbasierte Bewertung. Bewertet am{" "}
            {new Date(a.assessedAt).toLocaleString("de-DE")}.
          </span>
        </p>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  tone,
  count,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "rose" | "amber" | "emerald";
  count: number;
  label: string;
}) {
  const toneCls =
    tone === "rose"
      ? "text-rose-700 dark:text-rose-300"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : "text-emerald-700 dark:text-emerald-300";
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className={`flex items-center gap-1 ${toneCls}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-sm font-semibold">{count}</span>
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
