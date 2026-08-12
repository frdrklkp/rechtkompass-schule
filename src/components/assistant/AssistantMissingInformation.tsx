/**
 * Sprint 4.6F – Fehlende Angaben, die die Trefferlage begrenzen.
 * Reine Auflistung ohne Bewertung.
 */
import { HelpCircle } from "lucide-react";

export interface AssistantMissingInformationProps {
  title?: string;
  items: string[];
}

export function AssistantMissingInformation({
  title = "Fehlende Angaben",
  items,
}: AssistantMissingInformationProps) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-xs font-semibold text-foreground">
        <HelpCircle className="mr-1 inline h-3.5 w-3.5 text-accent" aria-hidden="true" />
        {title}
      </p>
      <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
        {items.slice(0, 8).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
