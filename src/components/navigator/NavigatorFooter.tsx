/**
 * Sprint 4.6A – Fußbereich des Decision Navigators.
 *
 * Fund 2026-08-19 (UX-Review, mobile Nutzung überwiegt): die Haupt-Aktion
 * ("Weiter") saß bislang immer am Seitenende und musste bei der langen
 * Situations-Erfassung erst heruntergescrollt werden. Unterhalb von `md`
 * wird der Fußbereich jetzt angeheftet - oberhalb der bestehenden globalen
 * BottomNav (56px hoch, siehe BottomNav.tsx), nicht anstelle davon.
 */
import type { ReactNode } from "react";

export interface NavigatorFooterProps {
  hint?: string;
  error?: string | null;
  children?: ReactNode;
}

export function NavigatorFooter({ hint, error, children }: NavigatorFooterProps) {
  return (
    <footer
      className="space-y-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur
        supports-[backdrop-filter]:bg-background/80
        fixed inset-x-0 z-30
        [bottom:calc(3.5rem+env(safe-area-inset-bottom))]
        md:static md:inset-auto md:z-auto md:border-t md:bg-transparent md:px-0 md:py-0
        md:pt-4 md:backdrop-blur-none"
    >
      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
          {error}
        </p>
      )}
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </footer>
  );
}
