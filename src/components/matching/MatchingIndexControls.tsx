/**
 * Sprint 4.6E – Indexsteuerung mit Vorschau und Bestätigung.
 * Nutzt ausschließlich previewIndex / applyStaleOnly aus der Matching-Grundlage.
 */
import { useState } from "react";
import { Database, Download, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildAuditReport, type PracticeCaseIndexPreview } from "@/services/practice-case-matching";
import type { MatchingDashboardState } from "@/hooks/matching/usePracticeCaseMatching";

export function IndexControls({ dashboard }: { dashboard: MatchingDashboardState }) {
  const [preview, setPreview] = useState<PracticeCaseIndexPreview | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const verification = dashboard.verification;

  const apply = (mode: "full" | "staleOnly") => {
    if (!preview) return;
    dashboard.applyPreview(preview, mode);
    setPreview(null);
    toast.success(
      mode === "full" ? "Index vollständig neu aufgebaut." : "Veraltete Einträge aktualisiert.",
    );
  };

  const exportReport = () => {
    const report = buildAuditReport({
      generatedAt: new Date().toISOString(),
      inventory: dashboard.inventory,
      verification,
      rows: dashboard.rows.map((r) => ({
        caseId: r.caseId,
        title: r.title,
        status: r.status,
        profileStatus: r.profile.status,
        readiness: r.readiness.level,
        indexState: r.indexState,
        contentHash: r.contentHash,
      })),
    });
    const blob = new Blob([report], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `praxisfall-matching-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => setPreview(dashboard.buildPreview())}>
          <Database className="h-4 w-4" /> Indexvorschau berechnen
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={dashboard.refresh}>
          <RotateCcw className="h-4 w-4" /> Bestand neu laden
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={exportReport}>
          <Download className="h-4 w-4" /> Auditbericht exportieren
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setResetOpen(true)}>
          <Trash2 className="h-4 w-4" /> Index zurücksetzen
        </Button>
      </div>

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs">
        <div className="font-medium">
          {verification.ok
            ? "Index entspricht dem Quellbestand."
            : "Index weicht vom Quellbestand ab."}
        </div>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {verification.issues.slice(0, 6).map((i) => (
            <li key={i}>• {i}</li>
          ))}
          {verification.issues.length > 6 && (
            <li>… und {verification.issues.length - 6} weitere Hinweise</li>
          )}
        </ul>
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          erwartet {verification.expectedHash || "—"} · gespeichert {verification.actualHash || "—"}
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Indexvorschau</DialogTitle>
            <DialogDescription>
              Die Vorschau verändert den gespeicherten Index nicht. Erst nach Bestätigung wird
              geschrieben.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Neu", value: preview.added.length },
                  { label: "Geändert", value: preview.changed.length },
                  { label: "Unverändert", value: preview.unchanged.length },
                  { label: "Entfernt", value: preview.removed.length },
                ].map((c) => (
                  <div key={c.label} className="rounded-md border border-border p-2">
                    <div className="text-[11px] text-muted-foreground">{c.label}</div>
                    <div className="text-lg font-semibold tabular-nums">{c.value}</div>
                  </div>
                ))}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                Hash vorher {preview.delta.indexHashBefore ?? "—"} · nachher{" "}
                {preview.delta.indexHashAfter}
              </div>
              {preview.errors.length > 0 && (
                <ul className="space-y-0.5 text-rose-700">
                  {preview.errors.slice(0, 8).map((e) => (
                    <li key={e}>• {e}</li>
                  ))}
                </ul>
              )}
              {preview.warnings.length > 0 && (
                <details className="rounded-md border border-border p-2">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground">
                    {preview.warnings.length} übersprungene Fälle
                  </summary>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground">
                    {preview.warnings.map((w) => (
                      <li key={w}>• {w}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
              Abbrechen
            </Button>
            <Button type="button" variant="outline" onClick={() => apply("staleOnly")}>
              Nur veraltete übernehmen
            </Button>
            <Button type="button" onClick={() => apply("full")}>
              Index vollständig übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Index zurücksetzen</DialogTitle>
            <DialogDescription>
              Der gespeicherte Matching-Index wird gelöscht. Praxisfälle und Profile bleiben
              unverändert.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setResetOpen(false)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                dashboard.resetIndex();
                setResetOpen(false);
                toast.success("Index zurückgesetzt.");
              }}
            >
              Zurücksetzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
