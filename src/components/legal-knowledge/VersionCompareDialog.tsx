/** Sprint 4.5H – Abschnittsweiser Versionsvergleich (installiert vs. neu). */
import { X } from "lucide-react";
import type {
  CompareStatus,
  VersionComparison,
} from "@/services/legal-knowledge/import-experience";

const STATUS_LABEL: Record<CompareStatus, string> = {
  added: "Neu",
  updated: "Geändert",
  removed: "Entfernt",
  unchanged: "Unverändert",
};

const STATUS_TONE: Record<CompareStatus, string> = {
  added: "border-emerald-500/40 bg-emerald-500/5",
  updated: "border-amber-500/40 bg-amber-500/5",
  removed: "border-rose-500/40 bg-rose-500/5",
  unchanged: "border-border bg-background",
};

export function VersionCompareDialog({
  comparison,
  onClose,
}: {
  comparison: VersionComparison;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">Versionsvergleich</h2>
            <p className="text-[11px] text-muted-foreground">
              {comparison.installedVersion ?? "Keine installierte Fassung"} →{" "}
              {comparison.incomingVersion} · {comparison.changedCount} geänderte Abschnitte
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-md border border-border p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <div>Installierte Version</div>
          <div>Neue Version</div>
        </div>

        <div className="space-y-2 overflow-auto p-4">
          {comparison.sections.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Keine vergleichbaren Abschnitte.
            </p>
          )}
          {comparison.sections.slice(0, 200).map((s) => (
            <div key={s.localId} className={`rounded-lg border p-2 ${STATUS_TONE[s.status]}`}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium">{s.title}</span>
                <span className="rounded-full bg-background px-2 py-0.5 text-[10px]">
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                <div className="whitespace-pre-wrap rounded-md bg-background/70 p-2 text-muted-foreground">
                  {s.previousText || "— kein Inhalt in der installierten Fassung —"}
                </div>
                <div className="whitespace-pre-wrap rounded-md bg-background p-2">
                  {s.nextText || "— in der neuen Fassung nicht mehr enthalten —"}
                </div>
              </div>
            </div>
          ))}
          {comparison.sections.length > 200 && (
            <p className="text-center text-[10px] text-muted-foreground">
              … {comparison.sections.length - 200} weitere Abschnitte
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
