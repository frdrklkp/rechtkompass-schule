/** Sprint 4.6A – Kopfbereich des Decision Navigators. */
import { Compass } from "lucide-react";

export interface NavigatorHeaderProps {
  title: string;
  subtitle?: string;
  statusLabel?: string;
}

export function NavigatorHeader({ title, subtitle, statusLabel }: NavigatorHeaderProps) {
  return (
    <header className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
        <Compass className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {statusLabel && (
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {statusLabel}
        </span>
      )}
    </header>
  );
}
