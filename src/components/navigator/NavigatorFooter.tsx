/** Sprint 4.6A – Fußbereich des Decision Navigators. */
import type { ReactNode } from "react";

export interface NavigatorFooterProps {
  hint?: string;
  error?: string | null;
  children?: ReactNode;
}

export function NavigatorFooter({ hint, error, children }: NavigatorFooterProps) {
  return (
    <footer className="space-y-3 border-t border-border pt-4">
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
