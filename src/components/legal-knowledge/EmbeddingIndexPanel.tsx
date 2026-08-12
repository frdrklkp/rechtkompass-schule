// Wissensindex-Panel (Sprint 4.1D). Zeigt Abdeckung, Modell und Job-Aktionen.
import { useState } from "react";
import type { LegalSourceDomain } from "@/services/legal-knowledge";
import {
  useLegalEmbeddingOverview,
  useLegalEmbeddingModels,
  usePreviewLegalEmbeddingJob,
  useStartLegalEmbeddingJob,
  useCancelLegalEmbeddingJob,
  useRetryLegalEmbeddingItems,
  useValidateLegalEmbeddings,
} from "@/hooks/legal-knowledge/useLegalEmbeddings";

type EmbeddingJob = {
  id: string;
  status: string;
  modelId: string;
  modelVersion: string;
  totals: {
    total: number;
    pending: number;
    processed: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  tokens: { estimated: number; actual: number };
  cost: { estimated: number; actual: number; source: string };
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorSummary: Record<string, number>;
};

type Overview = {
  totals: { chunks: number; embedded: number; outdated: number; failed: number; missing: number };
  coverageRatio: number;
  activeModel: { modelId: string; modelVersion: string; providerId: string } | null;
  lastSuccessfulRunAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  ampel: "green" | "yellow" | "red" | "grey";
};

const AMPEL_COLOR: Record<Overview["ampel"], string> = {
  green: "bg-green-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  grey: "bg-muted-foreground/40",
};

export function EmbeddingIndexPanel({ source }: { source: LegalSourceDomain }) {
  const { data, isLoading, error, refetch } = useLegalEmbeddingOverview(source.id);
  const models = useLegalEmbeddingModels();
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const preview = usePreviewLegalEmbeddingJob();
  const start = useStartLegalEmbeddingJob();
  const cancel = useCancelLegalEmbeddingJob();
  const retry = useRetryLegalEmbeddingItems();
  const validate = useValidateLegalEmbeddings();
  const [expert, setExpert] = useState(false);
  const [previewData, setPreviewData] = useState<null | {
    totals: { chunks: number; upToDate: number; toEmbed: number; outdated: number; failed: number };
    estimatedTokens: number;
    estimatedCostUsd: number;
    modelId: string;
    dimensions: number;
  }>(null);

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Wissensindex wird geladen …</p>;
  if (error) return <p className="text-sm text-red-600">Fehler: {(error as Error).message}</p>;

  const setup = (data as { setup?: { schemaMigrated: boolean } } | undefined)?.setup;
  if (setup && !setup.schemaMigrated) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-medium">Datenbank-Schema noch nicht aktualisiert.</p>
        <p className="mt-1 text-muted-foreground">
          Führe die Migration{" "}
          <code className="rounded bg-white px-1">db/2026-07-29_legal_embeddings.sql</code> aus und
          anschließend{" "}
          <code className="rounded bg-white px-1">
            bun run schema:update &amp;&amp; bun run schema:check
          </code>
          .
        </p>
      </div>
    );
  }

  const overview = (data as { overview: Overview | null } | undefined)?.overview;
  const jobs = ((data as { jobs?: EmbeddingJob[] } | undefined)?.jobs ?? []) as EmbeddingJob[];
  const activeModelId =
    overview?.activeModel?.modelId ?? models.data?.find((m) => m.isDefault)?.modelId;

  async function handlePreview() {
    const res = await preview.mutateAsync({
      sourceId: source.id,
      modelId: selectedModel ?? activeModelId,
    });
    const p = (res as { preview: typeof previewData }).preview!;
    setPreviewData(p);
  }
  async function handleStart() {
    await start.mutateAsync({ sourceId: source.id, modelId: selectedModel ?? activeModelId });
    setPreviewData(null);
    refetch();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Chunks gesamt" value={overview?.totals.chunks ?? 0} />
        <StatCard
          label="Aktuell eingebettet"
          value={overview?.totals.embedded ?? 0}
          accent="text-green-700"
        />
        <StatCard
          label="Fehlend / Veraltet"
          value={(overview?.totals.missing ?? 0) + (overview?.totals.outdated ?? 0)}
          accent="text-amber-700"
        />
        <StatCard
          label="Fehlgeschlagen"
          value={overview?.totals.failed ?? 0}
          accent="text-red-700"
        />
        <StatCard
          label="Abdeckung"
          value={`${Math.round((overview?.coverageRatio ?? 0) * 100)} %`}
        />
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Aktualität
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block h-3 w-3 rounded-full ${AMPEL_COLOR[overview?.ampel ?? "grey"]}`}
            />
            <span className="text-sm">
              {overview?.lastSuccessfulRunAt
                ? new Date(overview.lastSuccessfulRunAt).toLocaleString()
                : "Noch kein Lauf"}
            </span>
          </div>
          {overview?.lastErrorMessage && (
            <p className="mt-2 truncate text-xs text-red-600" title={overview.lastErrorMessage}>
              Fehler: {overview.lastErrorMessage}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Wissensindex neu aufbauen</h3>
          <button
            onClick={() => setExpert((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {expert ? "Expertenmodus ausblenden" : "Expertenmodus"}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Modell</span>
            <select
              value={selectedModel ?? activeModelId ?? ""}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="min-w-64 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              {(models.data ?? []).map((m) => (
                <option key={m.modelId} value={m.modelId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handlePreview}
            disabled={preview.isPending}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent"
          >
            {preview.isPending ? "Prüfe …" : "Prüfen"}
          </button>
          <button
            onClick={handleStart}
            disabled={start.isPending || !previewData}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            {start.isPending ? "Läuft …" : "Neu aufbauen"}
          </button>
          <button
            onClick={() =>
              validate.mutate({ sourceId: source.id, modelId: selectedModel ?? activeModelId })
            }
            disabled={validate.isPending}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:border-accent"
          >
            Prüfbericht
          </button>
        </div>

        {previewData && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <p className="font-medium">Vorschau</p>
            <ul className="mt-1 space-y-0.5">
              <li>Chunks gesamt: {previewData.totals.chunks}</li>
              <li>Bereits aktuell: {previewData.totals.upToDate}</li>
              <li>Neu zu verarbeiten: {previewData.totals.toEmbed}</li>
              <li>Geschätzte Tokens: {previewData.estimatedTokens.toLocaleString()}</li>
              <li>Geschätzte Kosten: ~{previewData.estimatedCostUsd.toFixed(4)} USD</li>
            </ul>
          </div>
        )}

        {expert && (
          <div className="mt-2 rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
            <p>Provider: {overview?.activeModel?.providerId ?? "—"}</p>
            <p>Modell-ID: {overview?.activeModel?.modelId ?? "—"}</p>
            <p>Modellversion: {overview?.activeModel?.modelVersion ?? "—"}</p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Läufe</h3>
        {jobs.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Läufe.</p>}
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-md border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">
                    {j.modelId} · {j.status}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Erfolgreich {j.totals.successful} · Übersprungen {j.totals.skipped} · Fehler{" "}
                    {j.totals.failed} · Offen {j.totals.pending}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Tokens: {j.tokens.actual.toLocaleString()} · Kosten (~):{" "}
                    {j.cost.actual.toFixed(4)} USD ({j.cost.source})
                  </p>
                </div>
                <div className="flex gap-2">
                  {j.status === "running" || j.status === "queued" || j.status === "preparing" ? (
                    <button
                      onClick={() => cancel.mutate({ jobId: j.id, sourceId: source.id })}
                      className="rounded-md border border-border px-2 py-1 text-[11px]"
                    >
                      Abbrechen
                    </button>
                  ) : null}
                  {j.totals.failed > 0 && (
                    <button
                      onClick={() => retry.mutate({ jobId: j.id, sourceId: source.id })}
                      className="rounded-md border border-border px-2 py-1 text-[11px]"
                    >
                      Fehler wiederholen
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}
