// Gruppierte Regel-Liste mit Filtern nach Status und Severity.

import { useMemo, useState } from "react";
import { AlertTriangle, Ban, Check, ChevronDown, ChevronRight, Info } from "lucide-react";
import {
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  type CaseQualityAssessment,
  type QualityRuleCategory,
  type QualityRuleResult,
  type QualityRuleSeverity,
} from "@/services/editorial/quality";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "failed" | "passed";
type SeverityFilter = "all" | QualityRuleSeverity;

const CATEGORY_ORDER: QualityRuleCategory[] = [
  "content",
  "legal",
  "review",
  "workflow",
  "metadata",
  "documentation",
  "publication",
];

export function QualityRuleList({
  assessment,
}: {
  assessment: CaseQualityAssessment;
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [expandAll, setExpandAll] = useState(false);

  const filtered = useMemo(() => {
    return assessment.rules.filter((r) => {
      if (status === "failed" && r.passed) return false;
      if (status === "passed" && !r.passed) return false;
      if (severity !== "all" && r.severity !== severity) return false;
      return true;
    });
  }, [assessment.rules, status, severity]);

  const grouped = useMemo(() => {
    const map = new Map<QualityRuleCategory, QualityRuleResult[]>();
    for (const r of filtered) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      rules: map.get(c)!,
    }));
  }, [filtered]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2 text-xs">
        <FilterGroup
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { v: "all", l: "Alle" },
            { v: "failed", l: "Nicht erfüllt" },
            { v: "passed", l: "Erfüllt" },
          ]}
        />
        <FilterGroup
          label="Schweregrad"
          value={severity}
          onChange={(v) => setSeverity(v as SeverityFilter)}
          options={[
            { v: "all", l: "Alle" },
            { v: "blocker", l: SEVERITY_LABEL.blocker },
            { v: "warning", l: SEVERITY_LABEL.warning },
            { v: "info", l: SEVERITY_LABEL.info },
          ]}
        />
        <button
          className="ml-auto rounded-md border border-border px-2 py-1 hover:bg-muted"
          onClick={() => setExpandAll((v) => !v)}
        >
          {expandAll ? "Alle einklappen" : "Alle aufklappen"}
        </button>
      </div>

      {grouped.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Keine Regeln entsprechen den aktuellen Filtern.
        </p>
      ) : (
        grouped.map((g) => (
          <section
            key={g.category}
            className="rounded-md border border-border bg-card"
          >
            <h3 className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[g.category]}
            </h3>
            <ul className="divide-y divide-border">
              {g.rules.map((r) => (
                <RuleRow key={r.ruleId} rule={r} openDefault={expandAll} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-md border px-2 py-0.5",
            value === o.v
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-transparent text-muted-foreground hover:bg-muted",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function RuleRow({
  rule,
  openDefault,
}: {
  rule: QualityRuleResult;
  openDefault: boolean;
}) {
  const [open, setOpen] = useState(openDefault);
  const Icon = rule.passed ? Check : rule.severity === "blocker" ? Ban : rule.severity === "warning" ? AlertTriangle : Info;
  const tone = rule.passed
    ? "text-emerald-600"
    : rule.severity === "blocker"
      ? "text-rose-600"
      : rule.severity === "warning"
        ? "text-amber-600"
        : "text-muted-foreground";
  return (
    <li className="px-3 py-2">
      <button
        className="flex w-full items-start gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="mt-1 h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-1 h-3 w-3 text-muted-foreground" />
        )}
        <Icon className={cn("mt-0.5 h-4 w-4", tone)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{rule.title}</span>
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[10px]",
                rule.passed
                  ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                  : rule.severity === "blocker"
                    ? "border-rose-500/30 text-rose-700 dark:text-rose-300"
                    : rule.severity === "warning"
                      ? "border-amber-500/30 text-amber-700 dark:text-amber-300"
                      : "border-border text-muted-foreground",
              )}
            >
              {rule.passed ? "erfüllt" : SEVERITY_LABEL[rule.severity]}
            </span>
            {rule.severity !== "info" && (
              <span className="text-[11px] text-muted-foreground">
                {rule.passed ? "+" : ""}
                {rule.passed ? rule.scoreImpact : 0} Pkt.
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{rule.description}</p>
        </div>
      </button>
      {open && (
        <div className="ml-6 mt-2 space-y-1.5 rounded-md border border-border bg-muted/20 p-2 text-xs">
          {!rule.passed && (
            <p>
              <strong className="text-foreground">Verbesserung:</strong>{" "}
              {rule.remediation}
            </p>
          )}
          {rule.relatedRoute && (
            <a
              href={rule.relatedRoute}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted"
            >
              Zur passenden Bearbeitungsstelle →
            </a>
          )}
        </div>
      )}
    </li>
  );
}
