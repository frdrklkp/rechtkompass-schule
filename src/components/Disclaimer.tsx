import { Info } from "lucide-react";

export function Disclaimer() {
  return (
    <div className="mt-8 flex items-start gap-3 rounded-xl border border-border bg-muted/60 p-4 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p>
        Diese Informationen dienen der Orientierung und ersetzen keine
        individuelle Rechtsberatung.
      </p>
    </div>
  );
}
