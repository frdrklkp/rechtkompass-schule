// Aging-Badge: rein redaktionelle Alterung, KEINE rechtliche Aussage.

import { Clock, CalendarClock, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGING_LABEL } from "@/services/editorial/quality";

export type AgingLevel = "current" | "review_recommended" | "outdated";

const TONE: Record<AgingLevel, string> = {
  current:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  review_recommended:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  outdated:
    "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const ICON: Record<AgingLevel, React.ComponentType<{ className?: string }>> = {
  current: Clock,
  review_recommended: CalendarClock,
  outdated: CalendarX,
};

export function AgingBadge({
  level,
  compact = false,
}: {
  level: AgingLevel;
  compact?: boolean;
}) {
  const Icon = ICON[level];
  return (
    <span
      role="status"
      aria-label={`Redaktionelle Alterung: ${AGING_LABEL[level]}`}
      title="Redaktionelle Alterung – kein rechtlicher Hinweis"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE[level],
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {compact ? shortLabel(level) : AGING_LABEL[level]}
    </span>
  );
}

function shortLabel(l: AgingLevel) {
  switch (l) {
    case "current":
      return "Aktuell";
    case "review_recommended":
      return "Prüfung";
    case "outdated":
      return "Überfällig";
  }
}
