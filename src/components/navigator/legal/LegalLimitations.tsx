/**
 * Sprint 4.6G – Transparente Grenzen der Rechtsgrundlagen-Anzeige.
 */
import { Info } from "lucide-react";

export function LegalLimitations() {
  return (
    <section
      aria-label="Grenzen dieser Anzeige"
      className="rounded-2xl border border-border bg-muted/30 p-4"
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        Grenzen dieser Anzeige
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-foreground/80">
        <li>
          Es werden ausschließlich Rechtsgrundlagen angezeigt, die die Redaktion mit dem
          bestätigten Praxisfall verknüpft hat.
        </li>
        <li>
          Die Anzeige trifft keine Aussage darüber, welche Vorschrift den Fall entscheidet, und
          ersetzt keine Rechtsberatung.
        </li>
        <li>
          Nicht verknüpfte Rechtsgrundlagen werden nicht ergänzt; die Liste erhebt keinen
          Anspruch auf Vollständigkeit.
        </li>
        <li>Verbindlich ist allein die amtliche Fassung der jeweiligen Rechtsquelle.</li>
      </ul>
    </section>
  );
}
