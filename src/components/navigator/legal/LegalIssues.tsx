/**
 * Sprint 4.6G – Sichtbare Hinweise auf fehlende oder problematische
 * Rechtsverknüpfungen. Keine stillen Fehler: jeder Resolver-Issue wird
 * angezeigt; die übrige Bearbeitung bleibt nutzbar.
 */
import { AlertTriangle } from "lucide-react";
import type { LegalContextIssue } from "@/services/legal-context";

export function LegalIssues({ issues }: { issues: LegalContextIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <section
      role="alert"
      aria-label="Hinweise zu Rechtsverknüpfungen"
      className="rounded-2xl border border-warning/50 bg-warning/10 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
        Hinweise zu einzelnen Verknüpfungen ({issues.length})
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/85">
        {issues.map((issue, index) => (
          <li key={`${issue.type}-${issue.sectionId ?? index}`}>{issue.message}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Diese Hinweise betreffen nur die genannten Verknüpfungen. Die übrige Bearbeitung ist
        davon nicht betroffen.
      </p>
    </section>
  );
}
