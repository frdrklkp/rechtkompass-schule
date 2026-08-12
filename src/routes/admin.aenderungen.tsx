import { createFileRoute } from "@tanstack/react-router";
import { CASES } from "@/data/cases";

const ACTIONS = ["Erstellt", "Bearbeitet", "Veröffentlicht", "Rechtsgrundlage verknüpft", "Vorlage zugeordnet"];
const USERS = ["A. Weber", "M. Schulz", "K. Braun", "T. Neumann"];

export const Route = createFileRoute("/admin/aenderungen")({
  component: () => {
    const feed = CASES.slice(0, 30).map((c, i) => ({
      id: c.id + i,
      title: c.title,
      action: ACTIONS[i % ACTIONS.length],
      user: USERS[i % USERS.length],
      when: `vor ${i + 1} Std.`,
    }));

    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Protokoll</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Änderungen</h1>
          <p className="mt-1 text-sm text-muted-foreground">Alle Bearbeitungen im Redaktionsbereich.</p>
        </header>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {feed.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.action} · {e.user}
                  </div>
                </div>
                <span className="ml-4 text-xs text-muted-foreground">{e.when}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
});
