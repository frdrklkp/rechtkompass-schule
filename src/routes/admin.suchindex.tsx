import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/admin/suchindex")({
  component: SearchIndexAdmin,
});

type StatusResp = {
  publishedCount: number;
  embeddingCount: number;
  lastIndexedAt: string | null;
  error?: string;
  env?: {
    hasUrl: boolean;
    hasPublishableKey: boolean;
    hasServiceRoleKey: boolean;
    hasAiGatewayKey: boolean;
  };
};

type ReindexRow = {
  caseId: string;
  status: string;
  error?: string;
  oldHashPrefix?: string;
  newHashPrefix?: string;
  documentLength?: number;
  embeddingFingerprint?: string;
};

type ReindexResult = {
  mode: string;
  searchDocumentVersion?: string;
  embeddingModel?: string;
  processed: number;
  total: number;
  results: ReindexRow[];
  error?: string;
};


async function fetchStatus(): Promise<StatusResp> {
  const res = await fetch("/api/search-embeddings-status");
  return (await res.json()) as StatusResp;
}

async function runReindex(mode: "missing" | "stale" | "all", maxBatch = 25): Promise<ReindexResult> {
  const res = await fetch("/api/search-embeddings-reindex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, maxBatch }),
  });
  return (await res.json()) as ReindexResult;
}

function SearchIndexAdmin() {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<ReindexResult | null>(null);

  const reload = useCallback(async () => {
    try {
      setStatus(await fetchStatus());
    } catch (e) {
      setStatus({
        publishedCount: 0,
        embeddingCount: 0,
        lastIndexedAt: null,
        error: e instanceof Error ? e.message : "Fehler beim Laden",
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const missing = Math.max(0, (status?.publishedCount ?? 0) - (status?.embeddingCount ?? 0));

  const start = async (mode: "missing" | "stale" | "all") => {
    setRunning(true);
    setLastResult(null);
    try {
      const r = await runReindex(mode, mode === "all" ? 50 : 25);
      setLastResult(r);
      await reload();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Suchindex aktualisieren</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verwaltet die semantischen Embeddings der veröffentlichten Praxisfälle.
          Nur veröffentlichte Fälle werden indexiert. Fehler pro Fall werden isoliert.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Veröffentlicht</div>
          <div className="text-xl font-semibold">{status?.publishedCount ?? "–"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Mit Embedding</div>
          <div className="text-xl font-semibold">{status?.embeddingCount ?? "–"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Fehlend</div>
          <div className="text-xl font-semibold">{missing}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Letzte Indexierung</div>
          <div className="text-xs">
            {status?.lastIndexedAt
              ? new Date(status.lastIndexedAt).toLocaleString("de-DE")
              : "–"}
          </div>
        </div>
      </div>

      {status?.env && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs">
          <div className="mb-1 font-semibold">Server-Konfiguration</div>
          <ul className="grid grid-cols-2 gap-1 text-muted-foreground">
            <li>Supabase-URL: {status.env.hasUrl ? "✓ vorhanden" : "✗ fehlt"}</li>
            <li>Publishable Key: {status.env.hasPublishableKey ? "✓ vorhanden" : "✗ fehlt"}</li>
            <li>
              Service-Role-Key:{" "}
              {status.env.hasServiceRoleKey ? "✓ vorhanden" : "✗ fehlt (EXTERNAL_SUPABASE_SERVICE_ROLE_KEY)"}
            </li>
            <li>KI-Gateway: {status.env.hasAiGatewayKey ? "✓ vorhanden" : "✗ fehlt (LOVABLE_API_KEY)"}</li>
          </ul>
        </div>
      )}

      {status?.error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          Statusabfrage-Fehler: {status.error}
          <div className="mt-1 text-muted-foreground">
            Hinweis: SQL-Migration <code>db/2026-07-14_practice_case_search_embeddings.sql</code>{" "}
            im externen Supabase ausführen.
          </div>
        </div>
      )}

      {(() => {
        const canReindex = !!status?.env?.hasServiceRoleKey && !!status?.env?.hasAiGatewayKey;
        return (
          <>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => start("missing")} disabled={running || !canReindex}>
                <PlayCircle className="mr-2 h-4 w-4" />
                Fehlende erzeugen
              </Button>
              <Button
                variant="outline"
                onClick={() => start("stale")}
                disabled={running || !canReindex}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Geänderte aktualisieren
              </Button>
              <Button
                variant="outline"
                onClick={() => start("all")}
                disabled={running || !canReindex}
              >
                Vollständig neu aufbauen
              </Button>
              <Button variant="ghost" onClick={reload} disabled={running}>
                Status neu laden
              </Button>
            </div>
            {!canReindex && (
              <div className="text-xs text-muted-foreground">
                Reindex deaktiviert:
                {!status?.env?.hasServiceRoleKey &&
                  " SUPABASE_SERVICE_ROLE_KEY fehlt (Secret EXTERNAL_SUPABASE_SERVICE_ROLE_KEY setzen)."}
                {!status?.env?.hasAiGatewayKey && " KI-Gateway (LOVABLE_API_KEY) fehlt."}
              </div>
            )}
          </>
        );
      })()}

      {running && (
        <div className="text-xs text-muted-foreground">Läuft … Batchgröße 25–50.</div>
      )}

      {lastResult && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold">
            Ergebnis: {lastResult.mode} · verarbeitet {lastResult.processed} / gesamt{" "}
            {lastResult.total}
          </div>
          {(lastResult.searchDocumentVersion || lastResult.embeddingModel) && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              SearchDoc v{lastResult.searchDocumentVersion ?? "?"} · Modell{" "}
              {lastResult.embeddingModel ?? "?"}
            </div>
          )}
          {lastResult.error && (
            <div className="mt-2 text-xs text-danger">Fehler: {lastResult.error}</div>
          )}
          <ul className="mt-3 max-h-80 space-y-1 overflow-auto text-xs">
            {lastResult.results.map((r) => (
              <li
                key={r.caseId}
                className={`rounded border border-border px-2 py-1 ${
                  r.status === "error" ? "border-danger/40 bg-danger/5" : ""
                }`}
              >
                <div>
                  <span className="font-mono">{r.caseId.slice(0, 8)}</span> · {r.status}
                  {r.error ? ` — ${r.error}` : ""}
                </div>
                {(r.oldHashPrefix || r.newHashPrefix || r.documentLength) && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    hash {r.oldHashPrefix ?? "—"} → {r.newHashPrefix ?? "—"}
                    {r.documentLength != null ? ` · doc ${r.documentLength} zeichen` : ""}
                    {r.embeddingFingerprint ? ` · ${r.embeddingFingerprint}` : ""}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
