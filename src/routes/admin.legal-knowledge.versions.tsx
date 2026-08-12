import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import {
  listImportHistory,
  listSnapshots,
  type LegalImportHistoryEntry,
} from "@/services/legal-knowledge/import/browserRepository";
import type { LegalImportSnapshot } from "@/services/legal-knowledge/import";

export const Route = createFileRoute("/admin/legal-knowledge/versions")({
  component: LegalKnowledgeVersionsPage,
});

interface VersionRow {
  sourceKey: string;
  versionLabel: string;
  status: "aktiv" | "vorherige" | "fehlgeschlagen";
  date: string;
  sourceTitle: string;
}

function LegalKnowledgeVersionsPage() {
  const [snapshots, setSnapshots] = useState<LegalImportSnapshot[]>([]);
  const [history, setHistory] = useState<LegalImportHistoryEntry[]>([]);

  useEffect(() => {
    setSnapshots(listSnapshots());
    setHistory(listImportHistory());
  }, []);

  const grouped = new Map<string, VersionRow[]>();
  for (const snap of snapshots) {
    const entry = history.find((h) => h.sourceKey === snap.sourceKey && h.versionLabel === snap.versionLabel);
    const rows = grouped.get(snap.sourceKey) ?? [];
    rows.push({
      sourceKey: snap.sourceKey,
      versionLabel: snap.versionLabel,
      status: "aktiv",
      date: entry?.timestamp ?? "",
      sourceTitle: entry?.sourceTitle ?? snap.sourceKey,
    });
    grouped.set(snap.sourceKey, rows);
  }
  for (const h of history) {
    if (h.status === "failed") {
      const rows = grouped.get(h.sourceKey) ?? [];
      if (!rows.some((r) => r.versionLabel === h.versionLabel)) {
        rows.push({
          sourceKey: h.sourceKey,
          versionLabel: h.versionLabel,
          status: "fehlgeschlagen",
          date: h.timestamp,
          sourceTitle: h.sourceTitle,
        });
        grouped.set(h.sourceKey, rows);
      }
    }
  }

  const entries = [...grouped.entries()];

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <header className="flex items-center gap-2">
        <GitBranch className="h-4 w-4" />
        <h2 className="text-sm font-semibold">Versionen</h2>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background p-6 text-center text-xs text-muted-foreground">
          Noch keine Snapshots. Erst nach einem erfolgreichen Import werden Versionen dargestellt.
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(([sourceKey, rows]) => (
            <div key={sourceKey} className="rounded-md border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{rows[0]?.sourceTitle ?? sourceKey}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{sourceKey}</div>
                </div>
                <span className="text-[10px] text-muted-foreground">{rows.length} Version(en)</span>
              </div>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-1 text-left">Version</th>
                    <th className="p-1 text-left">Datum</th>
                    <th className="p-1 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-1 font-medium">{r.versionLabel}</td>
                      <td className="p-1">{r.date ? new Date(r.date).toLocaleString("de-DE") : "—"}</td>
                      <td className="p-1">
                        {r.status === "aktiv" ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">aktiv</span>
                        ) : r.status === "fehlgeschlagen" ? (
                          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700">fehlgeschlagen</span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">vorherige</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Diff-Ansicht folgt in einem späteren Sprint. Aktuell werden nur Metadaten und Import-Zeitpunkte dargestellt.
      </p>
    </section>
  );
}
