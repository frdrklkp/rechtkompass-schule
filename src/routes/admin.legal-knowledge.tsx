import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BookMarked, Upload, ListChecks, Archive, Layers, LayoutDashboard, History, GitBranch, Globe } from "lucide-react";

export const Route = createFileRoute("/admin/legal-knowledge")({
  component: LegalKnowledgeLayout,
});

const TABS = [
  { to: "/admin/legal-knowledge", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/legal-knowledge/sources", label: "Quellen", icon: BookMarked, exact: false },
  { to: "/admin/legal-knowledge/import", label: "Import", icon: Upload },
  { to: "/admin/legal-knowledge/quellen-connector", label: "Offizielle Quellen", icon: Globe },
  { to: "/admin/legal-knowledge/history", label: "Importhistorie", icon: History },
  { to: "/admin/legal-knowledge/versions", label: "Versionen", icon: GitBranch },
  { to: "/admin/legal-knowledge/pruefbedarf", label: "Prüfbedarf", icon: ListChecks },
  { to: "/admin/legal-knowledge/veraltet", label: "Veraltet", icon: Archive },
];

function LegalKnowledgeLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Rechtswissen</h1>
            <p className="text-xs text-muted-foreground">
              Quellenregister, redaktioneller Import und Statusverwaltung offizieller Rechtsgrundlagen.
              Keine automatischen Verknüpfungen, keine Freigabe ohne redaktionelle Prüfung.
            </p>
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = pathname === t.to || (t.exact === false && pathname.startsWith(t.to));
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-card text-muted-foreground hover:border-accent/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
