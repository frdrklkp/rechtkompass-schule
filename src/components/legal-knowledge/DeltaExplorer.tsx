/** Sprint 4.5H – Delta Explorer: aufklappbare Änderungsübersicht. */
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil, Minus, GitCompare } from "lucide-react";
import type { DeltaGroup, DeltaGroupKind } from "@/services/legal-knowledge/import-experience";

const TONE: Record<DeltaGroupKind, { chip: string; border: string; icon: React.ReactNode }> = {
  added: {
    chip: "bg-emerald-500/10 text-emerald-800",
    border: "border-emerald-500/40",
    icon: <Plus className="h-3.5 w-3.5" />,
  },
  updated: {
    chip: "bg-amber-500/10 text-amber-800",
    border: "border-amber-500/40",
    icon: <Pencil className="h-3.5 w-3.5" />,
  },
  removed: {
    chip: "bg-rose-500/10 text-rose-800",
    border: "border-rose-500/40",
    icon: <Minus className="h-3.5 w-3.5" />,
  },
};

export function DeltaExplorer({
  groups,
  onCompare,
}: {
  groups: DeltaGroup[];
  onCompare?: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ updated: true });
  const empty = groups.every((g) => g.total === 0);

  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Keine Änderungen gegenüber der installierten Fassung.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const tone = TONE[group.kind];
        const isOpen = open[group.kind] ?? false;
        return (
          <div key={group.kind} className={`rounded-lg border ${tone.border} bg-background`}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [group.kind]: !isOpen }))}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium"
            >
              <span className="inline-flex items-center gap-2">
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {tone.icon}
                {group.label}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${tone.chip}`}>
                {group.total}
              </span>
            </button>
            {isOpen && group.total > 0 && (
              <div className="space-y-2 border-t border-border/60 p-3">
                {group.sections.map((section) => (
                  <div key={section.category}>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.label} ({section.entries.length})
                    </div>
                    <ul className="space-y-1">
                      {section.entries.slice(0, 100).map((entry) => (
                        <li
                          key={entry.localId}
                          className="rounded-md border border-border/60 p-2 text-xs"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium">{entry.title}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {entry.identifier}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Fassung: {entry.version} · {entry.reason}
                          </div>
                        </li>
                      ))}
                      {section.entries.length > 100 && (
                        <li className="text-[10px] text-muted-foreground">
                          … {section.entries.length - 100} weitere Einträge
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
                {group.kind === "updated" && onCompare && (
                  <button
                    type="button"
                    onClick={onCompare}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent"
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    Version vergleichen
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
