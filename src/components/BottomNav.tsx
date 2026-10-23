import { Link, useRouterState } from "@tanstack/react-router";
import { Search, Compass, FolderOpen, FileText, User } from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Frage", desktopLabel: "Frage stellen", icon: Search, exact: true },
  { to: "/faelle", label: "Themen", desktopLabel: "Themen & Fälle", icon: Compass, exact: false },
  { to: "/vorgaenge", label: "Vorgänge", desktopLabel: "Meine Vorgänge", icon: FolderOpen, exact: false },
  { to: "/dokumente", label: "Dokumente", desktopLabel: "Dokumente", icon: FileText, exact: false },
  { to: "/einstellungen", label: "Profil", desktopLabel: "Profil", icon: User, exact: false },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/admin")) return null;
  return (
    <nav
      aria-label="Hauptnavigation (mobil)"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-between px-2">
        {NAV_ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.to} className="flex-1">
              <Link
                to={it.to}
                activeOptions={{ exact: it.exact }}
                activeProps={{ "data-active": "true" } as never}
                className="group relative flex min-h-14 flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors data-[active=true]:text-accent before:absolute before:inset-x-6 before:top-0 before:h-0.5 before:rounded-full before:bg-accent before:opacity-0 data-[active=true]:before:opacity-100"
              >
                <Icon className="h-5 w-5 transition-transform group-data-[active=true]:scale-110" strokeWidth={2} />
                <span className="leading-none">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
