import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Scale,
  FileText,
  GitBranch,
  FolderTree,
  Tags,
  Upload,
  History,
  Settings,
  Lock,
  LogOut,
  ShieldCheck,
  Link2,
  Network,
  Sparkles,
  Radar,
  ListChecks,
  Flag,
  Users,
} from "lucide-react";
import { signIn, signOut, useAdminAuth, ADMIN_WRITE_ENABLED, ADMIN_WRITE_NOTICE } from "@/lib/adminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/pilot", label: "Pilotphase · Zugang", icon: Users },
  { to: "/admin/editorial", label: "Editorial · Dashboard", icon: ShieldCheck, exact: true },
  { to: "/admin/editorial/faelle", label: "Editorial · Fälle", icon: BookOpen },
  { to: "/admin/editorial/reviews", label: "Editorial · Reviews", icon: Flag },
  { to: "/admin/editorial/qualitaet", label: "Editorial · Quality Center", icon: Sparkles },
  { to: "/admin/editorial/publishing", label: "Editorial · Publishing", icon: Upload },
  { to: "/admin/editorial/legal-quality", label: "Editorial · Legal Quality", icon: Scale },
  { to: "/admin/faelle", label: "Praxisfälle", icon: BookOpen },
  { to: "/admin/praxisfall-matching", label: "Praxisfall-Matching", icon: Radar },
  { to: "/admin/rechtsgrundlagen", label: "Rechtsgrundlagen", icon: Scale },
  { to: "/admin/legal-knowledge", label: "Rechtswissen (neu)", icon: BookOpen },
  { to: "/admin/verknuepfungen", label: "Verknüpfungen", icon: Link2 },
  { to: "/admin/knowledge-graph", label: "Knowledge Graph", icon: Network },
  { to: "/admin/qualitaet", label: "Qualitätsübersicht", icon: Sparkles },
  { to: "/admin/qualitaetsmanager", label: "Qualitätsmanager", icon: Sparkles },
  { to: "/admin/fallmanager", label: "Fallmanager", icon: Flag },
  { to: "/admin/legal-testmatrix", label: "Legal-Testmatrix", icon: ListChecks },
  { to: "/admin/suchindex", label: "Suchindex", icon: Radar },
  { to: "/admin/suchtest", label: "Suchtest", icon: ListChecks },
  { to: "/admin/ki-entwurfsmaschine", label: "KI-Entwurfsmaschine", icon: Sparkles },
  { to: "/admin/entscheidungsassistenten-batch", label: "Assistenten-Batch", icon: GitBranch },
  { to: "/admin/quellenwaechter", label: "Quellenwächter", icon: Radar },
  { to: "/admin/vorlagen", label: "Dokumentationsvorlagen", icon: FileText },
  { to: "/admin/entscheidungsbaeume", label: "Entscheidungsbäume", icon: GitBranch },
  { to: "/admin/kategorien", label: "Kategorien", icon: FolderTree },
  { to: "/admin/schlagwoerter", label: "Schlagwörter", icon: Tags },
  { to: "/admin/import", label: "Import-Center", icon: Upload },
  { to: "/admin/import-uebersicht", label: "Import-Übersicht", icon: ListChecks },
  { to: "/admin/import-protokoll", label: "Import-Protokoll", icon: History },
  { to: "/admin/aenderungen", label: "Änderungen", icon: History },
  { to: "/admin/einstellungen", label: "Einstellungen", icon: Settings },
];

function LoginGate() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Core Builder</h1>
            <p className="text-xs text-muted-foreground">Geschützter Redaktionsbereich</p>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            setBusy(true);
            const res = await signIn(email, pw);
            setBusy(false);
            if (!res.ok) setErr(res.error ?? "Anmeldung fehlgeschlagen.");
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">E-Mail</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErr(null);
              }}
              placeholder="name@schule.de"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Passwort</label>
            <Input
              type="password"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setErr(null);
              }}
              placeholder="••••••••"
              required
            />
            {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            <Lock className="h-4 w-4" />
            {busy ? "Anmelden…" : "Anmelden"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Zugang nur für berechtigte Redaktions- und Adminkonten.
          </p>
        </form>
      </div>
    </div>
  );
}


function AdminLayout() {
  const { authed, ready } = useAdminAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!ready) return null;
  if (!authed) return <LoginGate />;

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Core Builder</div>
            <div className="truncate text-[11px] text-muted-foreground">RechtKompass · BKO</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.map((it) => {
            const Icon = it.icon;
            const active = it.exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Link
            to="/"
            className="mb-1 block rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ← zur App
          </Link>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Abmelden
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-2.5 md:hidden">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Core Builder</span>
        </div>
        <button onClick={signOut} className="text-xs text-muted-foreground">
          Abmelden
        </button>
      </div>

      <main className="flex-1 pt-14 md:pt-0">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Core Builder
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                Interne Verwaltungsoberfläche für RechtKompass Schule
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Interner Bereich – nur für Redaktion und Administration.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 self-start rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ← zur Lehrer-App
            </Link>
          </div>
          {!ADMIN_WRITE_ENABLED && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="font-medium text-rose-700 dark:text-rose-400">Nur-Lese-Modus aktiv</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{ADMIN_WRITE_NOTICE}</p>
              </div>
            </div>
          )}
          <Outlet />
        </div>
        {/* Mobile nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-border bg-card px-2 py-1 md:hidden">
          {NAV.map((it) => {
            const Icon = it.icon;
            const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex min-w-[64px] flex-col items-center gap-0.5 rounded px-2 py-1.5 text-[10px] ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{it.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
