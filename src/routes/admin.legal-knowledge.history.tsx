import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, History, Trash2 } from "lucide-react";
import {
  clearImportHistory,
  listImportHistory,
  type LegalImportHistoryEntry,
} from "@/services/legal-knowledge/import/browserRepository";

export const Route = createFileRoute("/admin/legal-knowledge/history")({
  component: LegalImportHistoryPage,
});

function LegalImportHistoryPage() {
  const [history, setHistory] = useState<LegalImportHistoryEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "completed" | "no_change" | "failed">("all");
  const [selected, setSelected] = useState<LegalImportHistoryEntry | null>(null);

  useEffect(() => { setHistory(listImportHistory()); }, []);

  const filtered = useMemo(
    () => (filter === "all" ? history : history.filter((h) => h.status === filter)),
    [history, filter],
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />Importhistorie</h2>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="all">Alle Status</option>
            <option value="completed">Erfolgreich</option>
            <option value="no_change">Keine Änderung</option>
            <option value="failed">Fehler</option>
          </select>
          <button
            onClick={() => { if (confirm("Lokale Importhistorie leeren?")) { clearImportHistory(); setHistory([]); } }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:border-rose-400 hover:text-rose-700"
          >
            <Trash2 className="h-3 w-3" />Leeren
          </button>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background p-6 text-center text-xs text-muted-foreground">
          Keine Einträge vorhanden. Führen Sie einen Import über den Import-Wizard aus.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Zeitpunkt</th>
                <th className="p-2 text-left">Quelle</th>
                <th className="p-2 text-left">Parser</th>
                <th className="p-2 text-left">Version</th>
                <th className="p-2 text-right">Δ</th>
                <th className="p-2 text-left">Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr
                  key={h.id}
                  onClick={() => setSelected(h)}
                  className="cursor-pointer border-t border-border hover:bg-muted/30"
                >
                  <td className="p-2">{new Date(h.timestamp).toLocaleString("de-DE")}</td>
                  <td className="p-2">
                    <div className="font-medium">{h.sourceTitle}</div>
                    <div className="text-[10px] text-muted-foreground">{h.sourceKey}</div>
                  </td>
                  <td className="p-2">{h.parserLabel ?? h.parserId}</td>
                  <td className="p-2">{h.versionLabel}</td>
                  <td className="p-2 text-right tabular-nums">+{h.added} / ~{h.updated} / −{h.removed}</td>
                  <td className="p-2">
                    {h.status === "failed" ? (
                      <span className="inline-flex items-center gap-1 text-rose-700"><XCircle className="h-3 w-3" />Fehler</span>
                    ) : h.status === "no_change" ? (
                      <span className="text-muted-foreground">unverändert</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" />ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="mt-4 rounded-md border border-border bg-background p-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Details · {selected.sourceTitle}</h3>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">Schließen</button>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Parser</dt><dd>{selected.parserLabel ?? selected.parserId}</dd>
            <dt className="text-muted-foreground">Quellen-Key</dt><dd className="font-mono">{selected.sourceKey}</dd>
            <dt className="text-muted-foreground">Version</dt><dd>{selected.versionLabel}</dd>
            <dt className="text-muted-foreground">Status</dt><dd>{selected.status}</dd>
            <dt className="text-muted-foreground">Neu</dt><dd>{selected.added}</dd>
            <dt className="text-muted-foreground">Geändert</dt><dd>{selected.updated}</dd>
            <dt className="text-muted-foreground">Entfernt</dt><dd>{selected.removed}</dd>
            <dt className="text-muted-foreground">Unverändert</dt><dd>{selected.unchanged}</dd>
            <dt className="text-muted-foreground">Benutzer</dt><dd>{selected.user ?? "—"}</dd>
          </dl>
          {selected.message && (
            <p className="mt-2 rounded-md border border-border bg-card p-2 text-muted-foreground">{selected.message}</p>
          )}
        </div>
      )}
    </section>
  );
}
