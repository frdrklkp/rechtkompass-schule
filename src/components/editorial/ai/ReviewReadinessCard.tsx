// Review-Readiness-Karte: zeigt Ampel + Stärken/Risiken/Verbesserungen/
// Empfehlungen aus einem review.readiness-Vorschlag. Kein Auto-Submit.

import type { AISuggestion, ReviewReadinessReport } from "@/services/editorial/ai";

interface Props {
  suggestion: AISuggestion<ReviewReadinessReport>;
}

function ampel(report: ReviewReadinessReport): "green" | "amber" | "red" {
  const risks = report.risks?.length ?? 0;
  const improvements = report.improvements?.length ?? 0;
  if (risks === 0 && improvements <= 1) return "green";
  if (risks >= 3 || improvements >= 5) return "red";
  return "amber";
}

const AMPEL_CLASSES: Record<string, string> = {
  green: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
  red: "bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/30",
};

export function ReviewReadinessCard({ suggestion }: Props) {
  const r = suggestion.suggestedContent;
  const level = ampel(r);
  return (
    <div className={`rounded-lg border p-3 text-sm ${AMPEL_CLASSES[level]}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          Review-Readiness
        </span>
        <span className="rounded-full border border-current px-2 py-0.5 text-[10px] font-semibold uppercase">
          {level === "green" ? "Bereit" : level === "amber" ? "Prüfen" : "Nicht bereit"}
        </span>
      </div>
      <ReportSection title="Stärken" items={r.positives} tone="pos" />
      <ReportSection title="Risiken" items={r.risks} tone="neg" />
      <ReportSection title="Verbesserungen" items={r.improvements} tone="neutral" />
      <ReportSection title="Empfehlungen" items={r.recommendations} tone="neutral" />
    </div>
  );
}

function ReportSection({
  title,
  items,
  tone,
}: {
  title: string;
  items?: string[];
  tone: "pos" | "neg" | "neutral";
}) {
  if (!items || items.length === 0) return null;
  const dot =
    tone === "pos"
      ? "text-emerald-600"
      : tone === "neg"
        ? "text-red-600"
        : "text-muted-foreground";
  return (
    <div className="mt-2">
      <div className="mb-0.5 text-[11px] font-semibold">{title}</div>
      <ul className="space-y-0.5 text-xs">
        {items.map((i, idx) => (
          <li key={idx} className="flex gap-1.5">
            <span className={dot}>•</span>
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
