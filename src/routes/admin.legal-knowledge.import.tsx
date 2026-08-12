import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  ChevronDown,
  FileText,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import {
  LegalImportService,
  LegalImportError,
  normalizeDocument,
  validateDocument,
  computeDelta,
  buildSnapshot,
  preparedParsers,
  legalImportTelemetry,
} from "@/services/legal-knowledge/import";
import type {
  LegalImportInput,
  LegalImportParser,
  LegalImportValidationResult,
  LegalImportDelta,
  NormalizedLegalDocument,
  LegalNode,
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
  type ImportPreviewModel,
  type DeltaGroup,
  type VersionComparison,
  type ImportReport,
} from "@/services/legal-knowledge/import-experience";
import { ImportPreviewPanel } from "@/components/legal-knowledge/ImportPreviewPanel";
import { DeltaExplorer } from "@/components/legal-knowledge/DeltaExplorer";
import { VersionCompareDialog } from "@/components/legal-knowledge/VersionCompareDialog";
import { ImportProgressStepper } from "@/components/legal-knowledge/ImportProgressStepper";
import { ImportReportPanel } from "@/components/legal-knowledge/ImportReportPanel";
import { ImportErrorNotice } from "@/components/legal-knowledge/ImportErrorNotice";

export const Route = createFileRoute("/admin/legal-knowledge/import")({
  component: LegalImportWizardPage,
});

type Step = "input" | "preview" | "delta" | "done";

interface PreviewResult {
  document: NormalizedLegalDocument;
  validation: LegalImportValidationResult;
  delta: LegalImportDelta;
  parser: LegalImportParser;
  model: ImportPreviewModel;
  groups: DeltaGroup[];
  comparison: VersionComparison;
  durationMs: number;
}

function sanitizeHtml(html: string): string {
  // Sehr defensive Umwandlung: Skript/Style/Handler entfernen und Tags stripen.
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "");
  const text = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractText(raw: string, kind: "text" | "html" | "json" | "auto"): string {
  const trimmed = raw.trimStart();
  if (kind === "html" || (kind === "auto" && /<[a-z][\s\S]*>/i.test(trimmed))) {
    return sanitizeHtml(raw);
  }
  if (
    kind === "json" ||
    (kind === "auto" && (trimmed.startsWith("{") || trimmed.startsWith("[")))
  ) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        "raw" in parsed &&
        typeof (parsed as { raw: unknown }).raw === "string"
      ) {
        return (parsed as { raw: string }).raw;
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
  return raw;
}

function LegalImportWizardPage() {
  const [step, setStep] = useState<Step>("input");
  const [parserId, setParserId] = useState<string>("auto");
  const [inputKind, setInputKind] = useState<"text" | "html" | "json" | "auto">("auto");
  const [raw, setRaw] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<PreviewResult | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const service = useMemo(
    () =>
      new LegalImportService({
        parsers: preparedParsers,
        repository: browserLegalImportRepository,
      }),
    [],
  );

  async function runPreview() {
    setError(null);
    setBusy(true);
    const startedAt = performance.now();
    try {
      const cleaned = extractText(raw, inputKind);
      const input: LegalImportInput = {
        raw: cleaned,
        hint: { officialUrl: officialUrl.trim() || null },
      };
      const parser = service.resolveParser(input, parserId === "auto" ? undefined : parserId);
      const parsed = parser.parse(input);
      const doc = normalizeDocument(parsed);
      const previous = await browserLegalImportRepository.loadSnapshot(doc.source.key);
      const validation = validateDocument(doc, previous);
      const delta = computeDelta(doc, previous);
      const previousIndex = getSectionIndex(doc.source.key);
      const durationMs = performance.now() - startedAt;
      setResult({
        document: doc,
        validation,
        delta,
        parser,
        durationMs,
        model: buildImportPreviewModel({
          document: doc,
          delta,
          validation,
          parser,
          durationMs,
          previousIndex,
        }),
        groups: buildDeltaExplorer(doc, delta, previousIndex),
        comparison: buildVersionComparison(doc, delta, previousIndex, {
          installedVersion: previous?.versionLabel ?? null,
        }),
      });
      setStep("preview");
    } catch (err) {
      const msg =
        err instanceof LegalImportError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unbekannter Fehler";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      if (!result.validation.ok) throw new Error("Validierung fehlgeschlagen. Import blockiert.");
      const hasConflict = result.validation.issues.some(
        (i) => i.code === "version_conflict" && i.severity === "error",
      );
      if (hasConflict) throw new Error("Versionskonflikt – bitte Versionslabel prüfen.");
      const previous = await browserLegalImportRepository.loadSnapshot(result.document.source.key);
      await browserLegalImportRepository.applyDelta({
        document: result.document,
        delta: result.delta,
        previous,
      });
      await browserLegalImportRepository.saveSnapshot(buildSnapshot(result.document));

      const total = result.delta.added + result.delta.updated + result.delta.removed;
      const status = total === 0 ? "no_change" : "completed";
      appendImportHistory({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        parserId: result.parser.id,
        parserLabel: result.parser.label,
        sourceKey: result.document.source.key,
        sourceTitle: result.document.source.title,
        versionLabel: result.document.version.label,
        status,
        added: result.delta.added,
        updated: result.delta.updated,
        removed: result.delta.removed,
        unchanged: result.delta.unchanged,
        user: null,
        message: null,
      });
      legalImportTelemetry.emit({
        event: "legal_import_finished",
        parserId: result.parser.id,
        sourceKey: result.document.source.key,
        versionLabel: result.document.version.label,
        detail: { status, ui: "wizard" },
      });
      const generated = buildImportReport({
        document: result.document,
        delta: result.delta,
        validation: result.validation,
        parser: result.parser,
        durationMs: result.durationMs,
        mode: "wizard",
      });
      registerImportReport(generated);
      const overview = buildDocumentOverview(result.document);
      saveSourceMetrics({
        sourceKey: result.document.source.key,
        sourceTitle: result.document.source.title,
        versionLabel: result.document.version.label,
        documents: overview.documents,
        paragraphs: overview.paragraphs,
        attachments: overview.attachments,
        changed: total,
        sizeBytes: raw.length,
        contentHash: generated.contentHash,
        lastImportedAt: generated.importedAt,
      });
      saveSectionIndex(result.document.source.key, buildSectionIndex(result.document));
      setReport(generated);
      setApplied(result);
      setStep("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import fehlgeschlagen";
      setError(msg);
      appendImportHistory({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        parserId: result.parser.id,
        parserLabel: result.parser.label,
        sourceKey: result.document.source.key,
        sourceTitle: result.document.source.title,
        versionLabel: result.document.version.label,
        status: "failed",
        added: 0,
        updated: 0,
        removed: 0,
        unchanged: 0,
        user: null,
        message: msg,
      });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("input");
    setResult(null);
    setApplied(null);
    setRaw("");
    setError(null);
    setReport(null);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <StepIndicator step={step} />

      {error && <ImportErrorNotice error={error} />}

      {busy && (
        <ImportProgressStepper
          currentStep={step === "delta" ? "version" : "parse"}
          message={step === "delta" ? "Änderungen werden übernommen…" : "Quelle wird analysiert…"}
        />
      )}

      {step === "input" && (
        <StepInput
          raw={raw}
          setRaw={setRaw}
          officialUrl={officialUrl}
          setOfficialUrl={setOfficialUrl}
          parserId={parserId}
          setParserId={setParserId}
          inputKind={inputKind}
          setInputKind={setInputKind}
          onNext={runPreview}
          busy={busy}
        />
      )}

      {step === "preview" && result && (
        <StepPreview
          result={result}
          onBack={() => setStep("input")}
          onNext={() => setStep("delta")}
          onCompare={() => setShowCompare(true)}
        />
      )}

      {step === "delta" && result && (
        <StepDelta
          result={result}
          onBack={() => setStep("preview")}
          onConfirm={apply}
          busy={busy}
          onCompare={() => setShowCompare(true)}
        />
      )}

      {step === "done" && applied && (
        <>
          <StepDone applied={applied} onNew={reset} />
          {report && <ImportReportPanel report={report} />}
        </>
      )}

      {showCompare && result && (
        <VersionCompareDialog
          comparison={result.comparison}
          onClose={() => setShowCompare(false)}
        />
      )}
    </section>
  );
}

/* ---------- Step 1: Input ---------- */

function StepInput({
  raw,
  setRaw,
  officialUrl,
  setOfficialUrl,
  parserId,
  setParserId,
  inputKind,
  setInputKind,
  onNext,
  busy,
}: {
  raw: string;
  setRaw: (v: string) => void;
  officialUrl: string;
  setOfficialUrl: (v: string) => void;
  parserId: string;
  setParserId: (v: string) => void;
  inputKind: "text" | "html" | "json" | "auto";
  setInputKind: (v: "text" | "html" | "json" | "auto") => void;
  onNext: () => void;
  busy: boolean;
}) {
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result ?? ""));
    reader.readAsText(f);
  }
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Upload className="h-4 w-4" />
        1. Quelle einlesen
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Parser</span>
          <select
            value={parserId}
            onChange={(e) => setParserId(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="auto">Automatisch erkennen</option>
            {preparedParsers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Eingabeformat</span>
          <select
            value={inputKind}
            onChange={(e) => setInputKind(e.target.value as typeof inputKind)}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="auto">Automatisch</option>
            <option value="text">Text / TXT</option>
            <option value="html">HTML (wird sanitiert)</option>
            <option value="json">JSON</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Offizielle URL (optional)</span>
        <input
          value={officialUrl}
          onChange={(e) => setOfficialUrl(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          placeholder="https://recht.nrw.de/…"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Datei (Text / HTML / JSON)
        </span>
        <input
          type="file"
          accept=".txt,.html,.htm,.json,.md,text/plain"
          onChange={onFile}
          className="mt-1 block text-xs"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Rohinhalt</span>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="mt-1 min-h-[240px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
          placeholder="Text der Rechtsquelle einfügen oder Datei laden…"
        />
      </label>
      <div className="flex justify-end">
        <button
          disabled={!raw.trim() || busy}
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {busy ? (
            "Analysiere…"
          ) : (
            <>
              Vorschau erstellen <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 2: Preview ---------- */

function StepPreview({
  result,
  onBack,
  onNext,
  onCompare,
}: {
  result: PreviewResult;
  onBack: () => void;
  onNext: () => void;
  onCompare: () => void;
}) {
  const errors = result.validation.issues.filter((i) => i.severity === "error");
  const warnings = result.validation.issues.filter((i) => i.severity === "warning");
  const versionConflict = result.validation.issues.some(
    (i) => i.code === "version_conflict" && i.severity === "error",
  );
  const blocked = !result.validation.ok || versionConflict;
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-4 w-4" />
        2. Importvorschau
      </h2>

      <ImportPreviewPanel model={result.model} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-3 text-xs">
          <div className="text-muted-foreground">Dokument</div>
          <div className="text-sm font-semibold">{result.document.source.title}</div>
          <dl className="mt-2 grid grid-cols-[100px_1fr] gap-y-1">
            <dt className="text-muted-foreground">Quelle</dt>
            <dd className="font-mono">{result.document.source.key}</dd>
            <dt className="text-muted-foreground">Kurzname</dt>
            <dd>{result.document.source.shortName ?? "—"}</dd>
            <dt className="text-muted-foreground">Herausgeber</dt>
            <dd>{result.document.source.authority ?? "—"}</dd>
            <dt className="text-muted-foreground">Zuständigkeit</dt>
            <dd>{result.document.source.jurisdiction ?? "—"}</dd>
            <dt className="text-muted-foreground">Parser</dt>
            <dd>{result.parser.label}</dd>
            <dt className="text-muted-foreground">Fassung</dt>
            <dd>{result.document.version.label}</dd>
            {result.document.version.citation && (
              <>
                <dt className="text-muted-foreground">Fundstelle</dt>
                <dd>{result.document.version.citation}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="rounded-md border border-border bg-background p-3 text-xs">
          <div className="mb-2 font-medium">Validierung</div>
          {errors.length === 0 && warnings.length === 0 ? (
            <div className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Alle Prüfungen bestanden.
            </div>
          ) : (
            <ul className="space-y-1">
              {errors.map((i, idx) => (
                <li key={"e" + idx} className="text-rose-700">
                  ✗ [{i.code}] {i.message}
                </li>
              ))}
              {warnings.map((i, idx) => (
                <li key={"w" + idx} className="text-amber-700">
                  ⚠ [{i.code}] {i.message}
                </li>
              ))}
            </ul>
          )}
          {versionConflict && (
            <div className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-2 text-rose-800">
              Versionskonflikt – Import ist blockiert. Bitte Versionslabel korrigieren.
            </div>
          )}
          {result.comparison.changedCount > 0 && (
            <button
              onClick={onCompare}
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:border-accent"
            >
              Version vergleichen
            </button>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border bg-background p-3">
        <div className="mb-1 text-xs font-medium">Struktur</div>
        <TreeView node={result.document.root} depth={0} defaultOpen />
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück
        </button>
        <button
          disabled={blocked}
          onClick={onNext}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          Delta anzeigen <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function TreeView({
  node,
  depth,
  defaultOpen = false,
}: {
  node: LegalNode;
  depth: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || depth < 2);
  const hasChildren = node.children.length > 0;
  const label = [node.number, node.heading].filter(Boolean).join(" – ") || node.kind;
  return (
    <div style={{ marginLeft: depth * 12 }} className="text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
        disabled={!hasChildren}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )
        ) : (
          <span className="inline-block w-3" />
        )}
        <span className="rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
          {node.kind}
        </span>
        <span className="font-medium">{label}</span>
      </button>
      {open && hasChildren && (
        <div className="mt-0.5">
          {node.children.slice(0, 200).map((c) => (
            <TreeView key={c.localId} node={c} depth={depth + 1} />
          ))}
          {node.children.length > 200 && (
            <div className="pl-4 text-[10px] text-muted-foreground">
              … {node.children.length - 200} weitere
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Step 3: Delta ---------- */

function StepDelta({
  result,
  onBack,
  onConfirm,
  busy,
  onCompare,
}: {
  result: PreviewResult;
  onBack: () => void;
  onConfirm: () => void;
  busy: boolean;
  onCompare: () => void;
}) {
  const { delta } = result;
  const [confirmed, setConfirmed] = useState(false);
  const versionConflict = result.validation.issues.some(
    (i) => i.code === "version_conflict" && i.severity === "error",
  );
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <RefreshCw className="h-4 w-4" />
        3. Delta bestätigen
      </h2>

      <div className="grid gap-3 sm:grid-cols-4">
        <DeltaCard tone="emerald" label="Neu" value={delta.added} />
        <DeltaCard tone="amber" label="Geändert" value={delta.updated} />
        <DeltaCard tone="rose" label="Entfernt" value={delta.removed} />
        <DeltaCard tone="muted" label="Unverändert" value={delta.unchanged} />
      </div>

      {versionConflict && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-800">
          Versionskonflikt erkannt – dieser Import kann nicht angewendet werden.
        </div>
      )}

      <DeltaExplorer groups={result.groups} onCompare={onCompare} />

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Ich habe die Änderungen geprüft und bestätige die Übernahme von{" "}
            <strong>
              +{delta.added} / ~{delta.updated} / −{delta.removed}
            </strong>{" "}
            Einträgen in die installierte Fassung.
          </span>
        </label>
        <div className="flex justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zurück
          </button>
          <button
            disabled={busy || versionConflict || !confirmed}
            onClick={onConfirm}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Persistiere…" : "Import bestätigen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeltaCard({
  tone,
  label,
  value,
}: {
  tone: "emerald" | "amber" | "rose" | "muted";
  label: string;
  value: number;
}) {
  const map: Record<string, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/5 text-emerald-800",
    amber: "border-amber-500/40 bg-amber-500/5 text-amber-800",
    rose: "border-rose-500/40 bg-rose-500/5 text-rose-800",
    muted: "border-border bg-background text-muted-foreground",
  };
  return (
    <div className={`rounded-md border p-3 text-xs ${map[tone]}`}>
      <div>{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/* ---------- Step 4: Done ---------- */

function StepDone({ applied, onNew }: { applied: PreviewResult; onNew: () => void }) {
  return (
    <div className="space-y-3 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-700">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h2 className="text-sm font-semibold">Import erfolgreich</h2>
      <p className="text-xs text-muted-foreground">
        {applied.document.source.title} — {applied.document.version.label}
        <br />+{applied.delta.added} · ~{applied.delta.updated} · −{applied.delta.removed}
      </p>
      <div className="flex justify-center gap-2">
        <button
          onClick={onNew}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground"
        >
          Weiteren Import starten
        </button>
      </div>
    </div>
  );
}

/* ---------- Step indicator ---------- */

function StepIndicator({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "input", label: "Quelle" },
    { id: "preview", label: "Vorschau" },
    { id: "delta", label: "Delta" },
    { id: "done", label: "Bestätigt" },
  ];
  const activeIdx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2 text-[11px]">
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
                active
                  ? "bg-accent text-accent-foreground"
                  : done
                    ? "bg-emerald-500/20 text-emerald-800"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </li>
        );
      })}
    </ol>
  );
}
