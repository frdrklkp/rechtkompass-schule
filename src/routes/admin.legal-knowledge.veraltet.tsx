import { createFileRoute, Link } from "@tanstack/react-router";
import { useLegalSources } from "@/hooks/legal-knowledge/useLegalKnowledge";
import { LEGAL_SOURCE_TYPE_LABELS } from "@/services/legal-knowledge";

export const Route = createFileRoute("/admin/legal-knowledge/veraltet")({
  component: VeraltetPage,
});

function VeraltetPage() {
  const { data } = useLegalSources({ lifecycle: "outdated" });
  const rows = data ?? [];
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Veraltete Quellen</h2>
      <p className="text-xs text-muted-foreground">
        Wurden durch neue Fassungen ersetzt oder als überholt markiert. Können archiviert oder reaktiviert werden.
      </p>
      <ul className="mt-4 space-y-2">
        {rows.map((s) => (
          <li key={s.id} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{s.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {LEGAL_SOURCE_TYPE_LABELS[s.sourceType]}
                  {s.versionLabel ? ` · Fassung: ${s.versionLabel}` : ""}
                </div>
              </div>
              <Link
                to="/admin/legal-knowledge/sources/$id"
                params={{ id: s.id }}
                className="text-xs font-medium text-accent hover:underline"
              >Öffnen</Link>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-xs text-muted-foreground">Keine veralteten Quellen.</li>
        )}
      </ul>
    </section>
  );
}
