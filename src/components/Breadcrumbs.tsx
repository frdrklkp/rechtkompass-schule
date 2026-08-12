import { Link } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import type { ReactNode } from "react";

export interface Crumb {
  label: ReactNode;
  to?: "/" | "/faelle";
  search?: Record<string, string>;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 overflow-x-auto text-[11px] text-muted-foreground">
      <Link to="/" className="flex items-center gap-1 hover:text-accent">
        <Home className="h-3 w-3" /> Start
      </Link>
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 opacity-50" />
          {c.to ? (
            <Link to={c.to} search={c.search} className="whitespace-nowrap hover:text-accent">
              {c.label}
            </Link>
          ) : (
            <span className="truncate whitespace-nowrap text-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
