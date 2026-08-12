import { createFileRoute, Link } from "@tanstack/react-router";
import { useLegalSources } from "@/hooks/legal-knowledge/useLegalKnowledge";
import { LEGAL_SOURCE_LIFECYCLE_LABELS, LEGAL_SOURCE_TYPE_LABELS } from "@/services/legal-knowledge";

export const Route = createFileRoute("/admin/legal-knowledge/pruefbedarf")({
  component: PruefbedarfPage,
});

function PruefbedarfPage() {
  const imp = useLegalSources({ lifecycle: "imported" });
  const rev = useLegalSources({ lifecycle: "needs_review" });
  const rows = [...(imp.data ?? []), ...(rev.data ?? [])];

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Prüfbedarf</h2>
      <p className="text-xs text-muted-foreground">
        Quellen mit Status „Importiert" oder „Prüfung erforderlich" – erwarten redaktionelle Bearbeitung.
      </p>
      <ul className="mt-4 space-y-2">
        {rows.map((s) => (
          <li key={s.id} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{s.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {LEGAL_SOURCE_TYPE_LABELS[s.sourceType]} · {LEGAL_SOURCE_LIFECYCLE_LABELS[s.lifecycleStatus]}
                </div>
              </div>
              <Link
                to="/admin/legal-knowledge/sources/$id"
                params={{ id: s.id }}
                className="text-xs font-medium text-accent hover:underline"
              >Prüfen</Link>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-xs text-muted-foreground">Kein offener Prüfbedarf.</li>
        )}
      </ul>
    </section>
  );
}
