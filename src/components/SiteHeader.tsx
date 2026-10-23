import { Link, useRouterState } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { NAV_ITEMS } from "./BottomNav";
import { useProfile } from "../lib/profile";

/**
 * Kopfzeile (Redesign 23.10.2026): auf allen Größen Marke und Profil, ab md
 * zusätzlich die Hauptnavigation. Die BottomNav bleibt die Navigation auf
 * dem Smartphone.
 */
export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile } = useProfile();
  if (pathname.startsWith("/admin")) return null;
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="RechtKompass Schule – Startseite" className="shrink-0 rounded-lg">
          <BrandMark />
        </Link>
        <nav aria-label="Hauptnavigation" className="hidden flex-1 md:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.filter((it) => it.to !== "/einstellungen").map((it) => (
              <li key={it.to}>
                <Link
                  to={it.to}
                  activeOptions={{ exact: it.exact }}
                  activeProps={{ "data-active": "true" } as never}
                  className="relative inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:text-foreground after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity data-[active=true]:after:opacity-100"
                >
                  <it.icon className="h-4 w-4" aria-hidden />
                  {it.desktopLabel}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("rk-open-onboarding"))}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <UserCog className="h-4 w-4" aria-hidden />
            <span className="max-w-[9rem] truncate">{profile ? profile.funktion : "Profil"}</span>
          </button>
          <Link
            to="/einstellungen"
            className="hidden h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex"
          >
            Einstellungen
          </Link>
        </div>
      </div>
    </header>
  );
}
