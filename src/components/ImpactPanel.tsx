import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import type { KnowledgeIndex } from "@/lib/knowledgeIndex";

/**
 * Impact-Analyse: zeigt, wo ein Inhalt (Rechtsgrundlage, Vorlage, Schlagwort)
 * verwendet wird. Ändert der Redakteur den Inhalt, weiß er sofort,
 * welche Praxisfälle betroffen sind.
 */
export function ImpactPanel({
  index,
  entityKind,
  entityId,
  editing = false,
}: {
  index: KnowledgeIndex;
  entityKind: "section" | "template" | "keyword";
  entityId: string;
  editing?: boolean;
}) {
  const impact =
    entityKind === "section"
      ? index.impactForSection(entityId)
      : entityKind === "template"
        ? index.impactForTemplate(entityId)
        : index.impactForKeyword(entityId);

  const cases = impact.cases;
  const extra =
    entityKind === "section"
      ? { docs: (impact as any).docs, faqs: (impact as any).faqs, checks: (impact as any).checks }
      : null;

  if (cases.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Noch nicht verwendet — dieser Inhalt ist verwaist.
      </div>
    );
  }

  return (
    <div
      className={
        editing
          ? "rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs"
          : "rounded-lg border border-border bg-card p-3 text-xs"
      }
    >
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
        {editing && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
        {editing
          ? `Diese Änderung betrifft ${cases.length} Praxisfall/-fälle`
          : `Verwendet in ${cases.length} Praxisfall/-fällen`}
      </div>
      {extra && (
        <p className="mb-2 text-muted-foreground">
          {extra.docs} Dokument{extra.docs === 1 ? "" : "e"} · {extra.faqs} FAQ · {extra.checks}{" "}
          Checklisten-Einträge in betroffenen Fällen
        </p>
      )}
      <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
        {cases.slice(0, 30).map((c: any) => (
          <li key={c.id}>
            <Link
              to="/admin/faelle/$id"
              params={{ id: c.id }}
              className="text-primary hover:underline"
            >
              {c.title ?? "(ohne Titel)"}
            </Link>
            {c.category && <span className="text-muted-foreground"> · {c.category}</span>}
          </li>
        ))}
        {cases.length > 30 && (
          <li className="text-muted-foreground">… +{cases.length - 30} weitere</li>
        )}
      </ul>
    </div>
  );
}
