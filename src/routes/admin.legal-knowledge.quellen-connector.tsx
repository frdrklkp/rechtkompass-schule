import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Globe, RefreshCw, Download, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  ACTIVE_OFFICIAL_SOURCES,
  OFFICIAL_SOURCES,
  OfficialSourceConnectorService,
  validateOfficialUrl,
  listUpdateStates,
  saveUpdateState,
  stateFromPreview,
  markImported,
  markCheckFailed,
  getUpdateState,
  UPDATE_STATUS_LABEL,
  UPDATE_STATUS_TONE,
  type ConnectorPreview,
  type CrawlResult,
  type SourceUpdateState,
} from "@/services/legal-knowledge/connectors";
import {
  buildSnapshot,
  preparedParsers,
  schulgesetzNrwParser,
} from "@/services/legal-knowledge/import";
import {
  browserLegalImportRepository,
  appendImportHistory,
} from "@/services/legal-knowledge/import/browserRepository";
import {
  buildImportPreviewModel,
  buildDeltaExplorer,
  buildVersionComparison,
  buildSectionIndex,
  buildDocumentOverview,
  buildImportReport,
  registerImportReport,
  saveSourceMetrics,
  saveSectionIndex,
  getSectionIndex,
  stepIdForPhase,
  type ImportStepId,
  type ImportReport,
  type PreviousSectionIndex,
} from "@/services/legal-knowledge/import-experience";
import { ImportPreviewPanel } from "@/components/legal-knowledge/ImportPreviewPanel";
import { DeltaExplorer } from "@/components/legal-knowledge/DeltaExplorer";
import { VersionCompareDialog } from "@/components/legal-knowledge/VersionCompareDialog";
import { ImportProgressStepper } from "@/components/legal-knowledge/ImportProgressStepper";
import { ImportReportPanel } from "@/components/legal-knowledge/ImportReportPanel";
import { ImportErrorNotice } from "@/components/legal-knowledge/ImportErrorNotice";

export const Route = createFileRoute("/admin/legal-knowledge/quellen-connector")({
  component: OfficialSourceConnectorPage,
  head: () => ({
    meta: [
      { title: "Offizielle Rechtsquellen automatisch importieren | RechtsKompass" },
      {
        name: "description",
        content:
          "Offizielle Rechtsquellen (BASS NRW, Recht.NRW, Schulministerium NRW) automatisch laden, prüfen und mit Delta-Vorschau importieren.",
      },
      { property: "og:title", content: "Official Source Connector – RechtsKompass" },
      {
        property: "og:description",
        content:
          "Automatischer Import offizieller Rechtsquellen mit Delta-Vorschau und Update-Monitor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PARSERS = [schulgesetzNrwParser, ...preparedParsers];

type Phase = "idle" | "loading" | "preview" | "done" | "error";

function OfficialSourceConnectorPage() {
  const [sourceId, setSourceId] = useState(ACTIVE_OFFICIAL_SOURCES[0]?.id ?? "");
  const [url, setUrl] = useState(ACTIVE_OFFICIAL_SOURCES[0]?.defaultUrl ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<ConnectorPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<SourceUpdateState[]>([]);
  const [step, setStep] = useState<ImportStepId>("fetch");
  const [confirmed, setConfirmed] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [previousIndex, setPreviousIndex] = useState<PreviousSectionIndex>({});

  useEffect(() => {
    setStates(listUpdateStates());
  }, []);

  const previewModel = useMemo(
    () =>
      preview
        ? buildImportPreviewModel({
            document: preview.document,
            delta: preview.delta,
            validation: preview.validation,
            parser: preview.parser,
            durationMs: preview.stats.durationMs,
            previousIndex,
          })
        : null,
    [preview, previousIndex],
  );

  const deltaGroups = useMemo(
    () => (preview ? buildDeltaExplorer(preview.document, preview.delta, previousIndex) : []),
    [preview, previousIndex],
  );

  const comparison = useMemo(
    () =>
      preview
        ? buildVersionComparison(preview.document, preview.delta, previousIndex, {
            installedVersion: getUpdateState(sourceId)?.installedVersion ?? null,
          })
        : null,
    [preview, previousIndex, sourceId],
  );

  const service = useMemo(
    () =>
      new OfficialSourceConnectorService({
        parsers: PARSERS,
        repository: browserLegalImportRepository,
      }),
    [],
  );

  const definition = OFFICIAL_SOURCES.find((s) => s.id === sourceId) ?? null;
  const urlCheck = definition ? validateOfficialUrl(url, definition.hosts) : null;

  function selectSource(id: string) {
    setSourceId(id);
    const def = OFFICIAL_SOURCES.find((s) => s.id === id);
    if (def) setUrl(def.defaultUrl);
    setPreview(null);
    setPhase("idle");
    setError(null);
    setReport(null);
    setConfirmed(false);
    setStep("fetch");
    setPreviousIndex({});
  }

  async function load(targetId = sourceId, targetUrl = url) {
    const def = OFFICIAL_SOURCES.find((s) => s.id === targetId);
    if (!def) return;
    setPhase("loading");
    setError(null);
    setPreview(null);
    setProgress(0.05);
    setStep("fetch");
    setConfirmed(false);
    setReport(null);
    setMessage("Amtliche Startseite wird abgerufen…");
    try {
      const res = await fetch("/api/legal-source-crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: targetId, url: targetUrl }),
      });
      const data = (await res.json()) as CrawlResult & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setProgress(0.5);
      setStep("documents");
      setMessage(`${data.documents.length} Dokumente geladen – Analyse läuft…`);

      const result = await service.preview({
        sourceId: targetId,
        url: targetUrl,
        crawl: data,
        onProgress: (p) => {
          setStep(stepIdForPhase(p.phase));
          setMessage(
            p.phase === "parsing"
              ? "Parser wird angewendet…"
              : p.phase === "validating"
                ? "Validierung läuft…"
                : p.phase === "delta"
                  ? "Delta wird berechnet…"
                  : "Importvorschau wird erstellt…",
          );
          setProgress(p.phase === "ready" ? 1 : 0.7);
        },
      });
      setPreview(result);
      setPreviousIndex(getSectionIndex(result.document.source.key));
      setStep("done");
      setPhase("preview");
      const state = stateFromPreview(result, getUpdateState(targetId));
      saveUpdateState(state);
      setStates(listUpdateStates());
    } catch (err) {
      const msg = (err as Error)?.message ?? "Abruf fehlgeschlagen";
      setError(msg);
      setPhase("error");
      const d = OFFICIAL_SOURCES.find((s) => s.id === targetId);
      markCheckFailed(targetId, d?.label ?? targetId, targetUrl, msg);
      setStates(listUpdateStates());
    }
  }

  async function checkAll() {
    for (const src of ACTIVE_OFFICIAL_SOURCES) {
      await load(src.id, src.defaultUrl).catch(() => undefined);
    }
  }

  async function applyImport() {
    if (!preview) return;
    if (!preview.validation.ok || preview.versionConflict) {
      setError("Import blockiert: Validierungsfehler oder Versionskonflikt.");
      return;
    }
    setStep("version");
    setMessage("Fassung wird übernommen und versioniert…");
    try {
      const previous = await browserLegalImportRepository.loadSnapshot(preview.document.source.key);
      await browserLegalImportRepository.applyDelta({
        document: preview.document,
        delta: preview.delta,
        previous,
      });
      await browserLegalImportRepository.saveSnapshot(buildSnapshot(preview.document));
      const total = preview.delta.added + preview.delta.updated + preview.delta.removed;
      appendImportHistory({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        parserId: preview.parser.id,
        parserLabel: preview.parser.label,
        sourceKey: preview.document.source.key,
        sourceTitle: preview.document.source.title,
        versionLabel: preview.document.version.label,
        status: total === 0 ? "no_change" : "completed",
        added: preview.delta.added,
        updated: preview.delta.updated,
        removed: preview.delta.removed,
        unchanged: preview.delta.unchanged,
        user: null,
        message: `Official Source Connector · ${preview.stats.documents} Dokumente · ${Math.round(preview.stats.durationMs)} ms`,
      });

      const generated = buildImportReport({
        document: preview.document,
        delta: preview.delta,
        validation: preview.validation,
        parser: preview.parser,
        durationMs: preview.stats.durationMs,
        mode: "connector",
      });
      registerImportReport(generated);
      const overview = buildDocumentOverview(preview.document);
      saveSourceMetrics({
        sourceKey: preview.document.source.key,
        sourceTitle: preview.document.source.title,
        versionLabel: preview.document.version.label,
        documents: overview.documents,
        paragraphs: overview.paragraphs,
        attachments: overview.attachments,
        changed: total,
        sizeBytes: 0,
        contentHash: generated.contentHash,
        lastImportedAt: generated.importedAt,
      });
      saveSectionIndex(preview.document.source.key, buildSectionIndex(preview.document));
      setPreviousIndex(buildSectionIndex(preview.document));
      setReport(generated);

      markImported(preview);
      setStates(listUpdateStates());
      setPhase("done");
      setStep("done");
      setMessage("Import abgeschlossen.");
    } catch (err) {
      setError((err as Error)?.message ?? "Import fehlgeschlagen");
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Globe className="h-4 w-4" />
            Offizielle Quelle laden
          </h2>
          <button
            onClick={checkAll}
            disabled={phase === "loading"}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Nach Aktualisierungen suchen
          </button>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Quelle</span>
            <select
              value={sourceId}
              onChange={(e) => selectSource(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              {ACTIVE_OFFICIAL_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
              {OFFICIAL_SOURCES.filter((s) => s.planned).map((s) => (
                <option key={s.id} value={s.id} disabled>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Start-URL (nur Whitelist-Domains, HTTPS)
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono"
            />
          </label>
        </div>

        {urlCheck && !urlCheck.ok && <p className="text-xs text-rose-700">{urlCheck.message}</p>}
        {definition && (
          <p className="text-[11px] text-muted-foreground">
            Erlaubte Domains: {definition.hosts.join(", ") || "—"} · Parser: {definition.parserId}
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => load()}
            disabled={phase === "loading" || !urlCheck?.ok}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {phase === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Laden
          </button>
        </div>

        {(phase === "loading" || phase === "preview" || phase === "done") && (
          <ImportProgressStepper currentStep={step} message={message || undefined} />
        )}

        {phase === "error" && (
          <ImportProgressStepper currentStep={step} failed message={message || undefined} />
        )}

        {error && <ImportErrorNotice error={error} />}
      </section>

      {preview && previewModel && (phase === "preview" || phase === "done") && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Importvorschau</h2>
          <ImportPreviewPanel model={previewModel} />

          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <MiniStat label="Dubletten entfernt" value={String(preview.stats.duplicates)} />
            <MiniStat label="Abruffehler" value={String(preview.stats.errors)} />
            <MiniStat label="Versionskonflikt" value={preview.versionConflict ? "ja" : "nein"} />
          </div>

          {preview.validation.issues.length > 0 && (
            <ul className="space-y-0.5 text-xs">
              {preview.validation.issues.slice(0, 20).map((i, idx) => (
                <li
                  key={idx}
                  className={i.severity === "error" ? "text-rose-700" : "text-amber-700"}
                >
                  [{i.code}] {i.message}
                </li>
              ))}
            </ul>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold">Delta Explorer</h3>
            <DeltaExplorer groups={deltaGroups} onCompare={() => setShowCompare(true)} />
          </div>

          {phase === "done" ? (
            <p className="inline-flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Änderungen übernommen und versioniert.
            </p>
          ) : (
            <div className="space-y-2 rounded-md border border-border bg-background p-3">
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Ich habe die Vorschau und den Delta Explorer geprüft und bestätige die Übernahme
                  von{" "}
                  <strong>
                    +{preview.delta.added} / ~{preview.delta.updated} / −{preview.delta.removed}
                  </strong>{" "}
                  Änderungen in die installierte Fassung.
                </span>
              </label>
              <div className="flex justify-end">
                <button
                  onClick={applyImport}
                  disabled={!preview.validation.ok || preview.versionConflict || !confirmed}
                  className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Änderungen übernehmen
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {report && <ImportReportPanel report={report} />}

      {showCompare && comparison && (
        <VersionCompareDialog comparison={comparison} onClose={() => setShowCompare(false)} />
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Update-Monitor</h2>
        {states.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Noch keine Prüfung durchgeführt. Starten Sie „Nach Aktualisierungen suchen“.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Quelle</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Installiert</th>
                  <th className="p-2 text-left">Online</th>
                  <th className="p-2 text-left">Letzte Prüfung</th>
                  <th className="p-2 text-right">Δ</th>
                  <th className="p-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {states.map((s) => (
                  <tr key={s.sourceId} className="border-t border-border">
                    <td className="p-2 font-medium">{s.label}</td>
                    <td className="p-2">
                      <StatusPill state={s} />
                    </td>
                    <td className="p-2">{s.installedVersion ?? "—"}</td>
                    <td className="p-2">{s.onlineVersion ?? "—"}</td>
                    <td className="p-2">
                      {s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleString("de-DE") : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      +{s.newDocuments} · ~{s.changedDocuments} · −{s.removedDocuments}
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => {
                          selectSource(s.sourceId);
                          void load(s.sourceId, s.url);
                        }}
                        className="rounded border border-border px-2 py-1 hover:border-accent"
                      >
                        Prüfen / Aktualisieren
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/60 py-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function StatusPill({ state }: { state: SourceUpdateState }) {
  const tone = UPDATE_STATUS_TONE[state.status];
  const map: Record<string, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-800",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-800",
    muted: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${map[tone]}`}
    >
      {UPDATE_STATUS_LABEL[state.status]}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
