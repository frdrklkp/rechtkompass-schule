// Workflow-Fortschrittsanzeige. Zeigt Zustand, steuert ihn nicht.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowStatus } from "@/services/editorial";

const STEPS: { key: WorkflowStatus; label: string }[] = [
  { key: "draft", label: "Entwurf" },
  { key: "in_review", label: "In Prüfung" },
  { key: "approved", label: "Genehmigt" },
  { key: "published", label: "Veröffentlicht" },
  { key: "archived", label: "Archiviert" },
];

const ORDER: Record<WorkflowStatus, number> = {
  draft: 0,
  in_review: 1,
  approved: 2,
  published: 3,
  archived: 4,
};

export function WorkflowProgress({
  status,
  lastReviewDecision,
}: {
  status: WorkflowStatus;
  lastReviewDecision?: "changes_requested" | "rejected" | null;
}) {
  const currentIdx = ORDER[status];
  const bounceBack =
    status === "draft" &&
    (lastReviewDecision === "changes_requested" ||
      lastReviewDecision === "rejected");

  return (
    <div className="w-full">
      <ol className="flex items-center gap-1" role="list">
        {STEPS.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          const isArchived = step.key === "archived";
          const dim =
            status !== "archived" && isArchived
              ? "opacity-40"
              : "";
          return (
            <li key={step.key} className={cn("flex flex-1 items-center gap-1", dim)}>
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                  done && "border-emerald-500 bg-emerald-500 text-white",
                  active && "border-primary bg-primary text-primary-foreground",
                  !done && !active && "border-border bg-card text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="h-3 w-3" /> : idx + 1}
              </div>
              <span
                className={cn(
                  "hidden text-xs sm:inline",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1",
                    done ? "bg-emerald-500/50" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      {bounceBack && (
        <p className="mt-2 text-xs text-orange-600 dark:text-orange-400">
          Nach Reviewentscheidung „{lastReviewDecision === "rejected" ? "abgelehnt" : "Änderungen angefordert"}“ zurück im Entwurf.
        </p>
      )}
    </div>
  );
}
