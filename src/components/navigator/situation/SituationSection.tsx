/** Sprint 4.6B – Abschnitt der Situationserfassung. */
import type { ReactNode } from "react";
import type { SituationSectionDefinition } from "@/services/situation-analyzer";

export interface SituationSectionProps {
  section: SituationSectionDefinition;
  index: number;
  total: number;
  children: ReactNode;
}

export function SituationSection({ section, index, total, children }: SituationSectionProps) {
  return (
    <section aria-labelledby={`sec-${section.id}`} className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <header>
        <p className="text-xs text-muted-foreground">
          Abschnitt {index + 1} von {total}
        </p>
        <h3 id={`sec-${section.id}`} className="text-base font-semibold text-foreground">
          {section.title}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{section.description}</p>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
