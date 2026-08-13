import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { Sparkles, Download, X, Loader2, ExternalLink, AlertTriangle, BookOpen, RotateCcw, ListChecks } from "lucide-react";
import {
  listSources,
  listSections,
  createSource,
  bulkImportSections,
  type ImportSectionDraft,
} from "@/lib/coreBuilder";
import {
  startImportJob,
  finishImportJob,
  updateJobCounters,
  recordJobItem,
  rollbackImportJob,
} from "@/lib/importJobs";
import {
  upsertCrawlResults,
  markManifestImported,
  listManifestPages,
  type ImportManifestRow,
} from "@/lib/importManifest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/DataStates";
import { apiFetch } from "@/lib/apiFetch";


type ParsedSection = {
  section_number: string;
  title: string;
  full_text: string;
  official_url: string;
  source_hash: string;
};

type PreviewResponse = {
  url: string;
  fetched_at: string;
  char_count: number;
  sections: ParsedSection[];
  debug?: {
    parser_mode: "dom" | "regex" | "fallback";
    marker_count: number;
    section_count: number;
    first_sections: Array<{ number: string; title: string }>;
    warning: string | null;
  };
};

type SectionState = ParsedSection & {
  selected: boolean;
  status: "new" | "unchanged" | "changed";
  existingId?: string;
  existingHasEditorial?: boolean;
  enriching?: boolean;
  enrichError?: string;
  enriched?: {
    summary?: string;
    practice_relevance?: string;
    recommendation?: string;
    common_mistakes?: string;
  };
};

type BatchProgress = { current: number; total: number };
type BatchSummary = {
  succeeded: number;
  skipped: number;
  failed: Array<{ section_number: string; title: string; error: string }>;
};

const KNOWN_SOURCES = [
  { label: "BASS NRW", url: "https://bass.schul-welt.de/" },
  { label: "recht.nrw.de", url: "https://recht.nrw.de/" },
  { label: "Gesetze im Internet", url: "https://www.gesetze-im-internet.de/" },
  { label: "EUR-Lex", url: "https://eur-lex.europa.eu/" },
];

export function LegalImportWizard({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sourcesQ = useQuery({ queryKey: ["admin", "sources"], queryFn: listSources });
  const sectionsQ = useQuery({ queryKey: ["admin", "sections"], queryFn: listSections });


  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 – Quelle
  const [sourceMode, setSourceMode] = useState<"existing" | "new">("existing");
  const [sourceId, setSourceId] = useState<string>("");
  const [newSource, setNewSource] = useState({
    name: "",
    legal_area: "",
    scope: "Nordrhein-Westfalen",
    description: "",
  });

  // Step 2 – URL & Vorschau
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [sectionsState, setSectionsState] = useState<SectionState[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [importResult, setImportResult] = useState<{ ids: string[]; inserted: number; updated: number; skipped: number; jobId: string; errors: Array<{ section_number: string; error: string }> } | null>(null);
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);

  // --- Crawler-Modus (BASS NRW Komplettimport) --------------------------
  type CrawledPage = {
    url: string;
    title: string;
    bass_number: string | null;
    marker_count: number;
    section_count: number;
    char_count: number;
    parser_mode: "dom" | "regex" | "fallback";
    status: "candidate" | "empty" | "error";
    error?: string;
  };
  type CrawlResponse = {
    start_url: string;
    allowed_host: string;
    fetched: number;
    max_pages: number;
    max_depth: number;
    candidates: number;
    errors: number;
    duration_ms: number;
    pages: CrawledPage[];
    warning: string | null;
  };
  const [importMode, setImportMode] = useState<"single" | "crawler">("single");
  const [crawlMaxPages, setCrawlMaxPages] = useState(50);
  const [crawlMaxDepth, setCrawlMaxDepth] = useState(3);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [crawlResult, setCrawlResult] = useState<CrawlResponse | null>(null);
  const [crawlSelected, setCrawlSelected] = useState<Set<string>>(new Set());
  const [crawlImportProgress, setCrawlImportProgress] = useState<
    { current: number; total: number; label: string } | null
  >(null);
  // url → legal_import_pages.id, damit Abschnitte auf die Manifest-Zeile referenzieren.
  const [manifestByUrl, setManifestByUrl] = useState<Record<string, string>>({});



  const existingSectionsForSource = useMemo(() => {
    if (!sourceId) return new Map<string, any>();
    const map = new Map<string, any>();
    for (const s of (sectionsQ.data ?? []) as any[]) {
      if (s.source_id === sourceId) map.set(String(s.section_number || "").trim(), s);
    }
    return map;
  }, [sectionsQ.data, sourceId]);

  const createSourceMut = useMutation({
    mutationFn: () => createSource(newSource),
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["admin", "sources"] });
      setSourceMode("existing");
      setSourceId(row.id);
    },
  });

  async function handleFetch() {
    setFetchError(null);
    setIsFetching(true);
    setPreview(null);
    try {
      const res = await apiFetch("/api/import-legal-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const contentType = res.headers.get("content-type") || "";
      const raw = await res.text();
      // Vollständiges Response-Log zur Diagnose
      // eslint-disable-next-line no-console
      console.info("[import-legal-source] response", {
        requestUrl: url,
        status: res.status,
        contentType,
        bodyPreview: raw.slice(0, 500),
      });
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(
          `Antwort ist kein JSON (Content-Type: ${contentType || "unbekannt"}).`,
        );
      }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (data?.error) throw new Error(String(data.error));

      const safeSections: ParsedSection[] = Array.isArray(data?.sections)
        ? data.sections
        : [];
      const p: PreviewResponse = {
        url: data?.url ?? url,
        fetched_at: data?.fetched_at ?? new Date().toISOString(),
        char_count: Number(data?.char_count ?? 0),
        sections: safeSections,
        debug: data?.debug,
      };
      setPreview(p);
      const mapped: SectionState[] = safeSections.map((s) => {
        const key = String(s.section_number ?? "").trim();
        const existing = existingSectionsForSource.get(key);
        let status: SectionState["status"] = "new";
        if (existing) {
          const same =
            existing.source_hash && existing.source_hash === s.source_hash
              ? true
              : (existing.full_text || "").trim() === (s.full_text || "").trim();
          status = same ? "unchanged" : "changed";
        }
        return {
          ...s,
          selected: status !== "unchanged",
          status,
          existingId: existing?.id,
          existingHasEditorial: Boolean(
            existing &&
              (existing.summary ||
                existing.practice_relevance ||
                existing.recommendation ||
                existing.common_mistakes),
          ),
        };
      });
      setSectionsState(mapped);
      setStep(3);
    } catch (err) {
      setFetchError((err as Error).message || "Abruf fehlgeschlagen");
    } finally {
      setIsFetching(false);
    }
  }

  async function enrichOne(index: number, opts?: { silent?: boolean }): Promise<{ ok: boolean; error?: string }> {
    const sec = sectionsState[index];
    if (!sec || sec.enriching) return { ok: false, error: "bereits in Arbeit" };
    setSectionsState((prev) =>
      prev.map((s, i) => (i === index ? { ...s, enriching: true, enrichError: undefined } : s)),
    );
    try {
      const source = (sourcesQ.data ?? []).find((s: any) => s.id === sourceId);
      const res = await apiFetch("/api/enrich-legal-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_number: sec.section_number,
          title: sec.title,
          full_text: sec.full_text,
          source_name: source?.name || newSource.name || "",
          source_area: source?.legal_area || newSource.legal_area || "",
        }),
      });
      const raw = await res.text();
      let data: any = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { /* keep null */ }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSectionsState((prev) =>
        prev.map((s, i) =>
          i === index ? { ...s, enriched: data?.draft, enriching: false, enrichError: undefined } : s,
        ),
      );
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message || "KI-Anreicherung fehlgeschlagen";
      if (!opts?.silent) alert(msg);
      setSectionsState((prev) =>
        prev.map((s, i) => (i === index ? { ...s, enriching: false, enrichError: msg } : s)),
      );
      return { ok: false, error: msg };
    }
  }

  async function enrichAllSelected() {
    const indexes: number[] = [];
    sectionsState.forEach((s, i) => {
      if (s.selected && s.status !== "unchanged" && !s.enriched && !s.existingHasEditorial) {
        indexes.push(i);
      }
    });
    if (indexes.length === 0) {
      setBatchSummary({ succeeded: 0, skipped: 0, failed: [] });
      return;
    }
    const skipped = sectionsState.filter(
      (s) => s.selected && s.status !== "unchanged" && s.existingHasEditorial,
    ).length;
    setBatchSummary(null);
    setBatchProgress({ current: 0, total: indexes.length });
    let succeeded = 0;
    const failed: BatchSummary["failed"] = [];
    for (let k = 0; k < indexes.length; k++) {
      const i = indexes[k];
      const sec = sectionsState[i];
      const result = await enrichOne(i, { silent: true });
      if (result.ok) succeeded++;
      else failed.push({
        section_number: sec.section_number,
        title: sec.title,
        error: result.error || "Unbekannter Fehler",
      });
      setBatchProgress({ current: k + 1, total: indexes.length });
    }
    setBatchProgress(null);
    setBatchSummary({ succeeded, skipped, failed });
  }


  async function refreshManifestMap() {
    if (!sourceId) return;
    try {
      const rows = await listManifestPages(sourceId);
      const map: Record<string, string> = {};
      for (const r of rows) map[r.url] = r.id;
      setManifestByUrl(map);
    } catch (err) {
      console.warn("[manifest] refresh", (err as Error).message);
    }
  }

  async function handleCrawl() {
    setCrawlError(null);
    setIsCrawling(true);
    setCrawlResult(null);
    setCrawlSelected(new Set());
    try {
      const res = await apiFetch("/api/crawl-legal-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_url: url,
          max_pages: crawlMaxPages,
          max_depth: crawlMaxDepth,
        }),
      });
      const raw = await res.text();
      let data: any = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { throw new Error("Antwort ist kein JSON."); }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (data?.error) throw new Error(String(data.error));
      const r = data as CrawlResponse;
      setCrawlResult(r);

      // Manifest fortschreiben (nur wenn eine Rechtsquelle gewählt ist)
      try {
        if (sourceId) {
          await upsertCrawlResults(
            sourceId,
            r.pages.map((p) => ({
              url: p.url,
              title: p.title,
              bass_number: p.bass_number,
              section_count: p.section_count,
              status: p.status,
              error: p.error ?? null,
            })),
          );
          await refreshManifestMap();
        }
      } catch (err) {
        // Manifest-Fehler nicht blockierend – nur loggen
        console.warn("[manifest] upsertCrawlResults", (err as Error).message);
      }

      // Standardauswahl: alle Kandidaten mit erkannten Abschnitten
      const pre = new Set<string>();
      for (const p of r.pages) {
        if (p.status === "candidate" && p.section_count > 0) pre.add(p.url);
      }
      setCrawlSelected(pre);
      setStep(3);
    } catch (err) {
      setCrawlError((err as Error).message || "Crawler fehlgeschlagen");
    } finally {
      setIsCrawling(false);
    }
  }

  const crawlerImportMut = useMutation({
    mutationFn: async () => {
      if (!crawlResult) throw new Error("Kein Crawler-Ergebnis geladen.");
      const selectedPages = crawlResult.pages.filter((p) => crawlSelected.has(p.url));
      if (!selectedPages.length) throw new Error("Bitte mindestens eine Seite auswählen.");
      const detected = selectedPages.reduce((a, p) => a + (p.section_count || 0), 0);
      const job = await startImportJob({
        source_id: sourceId,
        source_url: crawlResult.start_url,
        detected_count: detected,
        notes: `BASS-Komplettimport · ${selectedPages.length} Seiten · Host ${crawlResult.allowed_host}`,
      });

      const errors: Array<{ section_number: string; error: string }> = [];
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const insertedIds: string[] = [];

      try {
        for (let idx = 0; idx < selectedPages.length; idx++) {
          const page = selectedPages[idx];
          setCrawlImportProgress({
            current: idx,
            total: selectedPages.length,
            label: page.title || page.url,
          });
          const manifestId = manifestByUrl[page.url] ?? null;
          // Seite parsen
          let drafts: ImportSectionDraft[] = [];
          try {
            const res = await apiFetch("/api/import-legal-source", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: page.url }),
            });
            const raw = await res.text();
            const data = raw ? JSON.parse(raw) : {};
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            const secs: ParsedSection[] = Array.isArray(data?.sections) ? data.sections : [];
            drafts = secs.map((s) => ({
              section_number: s.section_number,
              title: s.title,
              full_text: s.full_text,
              official_url: s.official_url || page.url,
              source_hash: s.source_hash,
            }));
          } catch (err) {
            errors.push({ section_number: page.url, error: (err as Error).message });
            await recordJobItem({
              job_id: job.id,
              section_number: null,
              title: page.title || page.url,
              action: "failed",
              error: (err as Error).message,
            });
            if (manifestId) {
              try {
                await markManifestImported({
                  manifestId,
                  importJobId: job.id,
                  status: "error",
                  error_message: (err as Error).message,
                });
              } catch { /* ignore */ }
            }
            continue;
          }
          if (!drafts.length) {
            await recordJobItem({
              job_id: job.id,
              section_number: null,
              title: page.title || page.url,
              action: "skipped",
              error: "keine Abschnitte erkannt",
            });
            if (manifestId) {
              try {
                await markManifestImported({
                  manifestId,
                  importJobId: job.id,
                  status: "skipped",
                  section_count: 0,
                  imported_section_count: 0,
                  error_message: "keine Abschnitte erkannt",
                });
              } catch { /* ignore */ }
            }
            continue;
          }
          try {
            const r = await bulkImportSections(sourceId, drafts, page.url, job.id, manifestId);
            inserted += r.inserted;
            updated += r.updated;
            skipped += r.skipped;
            insertedIds.push(...(r.ids ?? []));
            for (const it of r.items) {
              try {
                await recordJobItem({
                  job_id: job.id,
                  section_number: it.section_number,
                  title: it.title,
                  section_id: it.section_id,
                  action: it.action,
                  source_hash: it.source_hash,
                });
              } catch (err) {
                errors.push({ section_number: it.section_number, error: (err as Error).message });
              }
            }
            if (manifestId) {
              try {
                await markManifestImported({
                  manifestId,
                  importJobId: job.id,
                  status: "imported",
                  section_count: drafts.length,
                  imported_section_count: r.inserted + r.updated,
                });
              } catch { /* ignore */ }
            }
          } catch (err) {
            errors.push({ section_number: page.url, error: (err as Error).message });
            await recordJobItem({
              job_id: job.id,
              section_number: null,
              title: page.title || page.url,
              action: "failed",
              error: (err as Error).message,
            });
            if (manifestId) {
              try {
                await markManifestImported({
                  manifestId,
                  importJobId: job.id,
                  status: "error",
                  error_message: (err as Error).message,
                });
              } catch { /* ignore */ }
            }
          }
        }
        setCrawlImportProgress({
          current: selectedPages.length,
          total: selectedPages.length,
          label: "abgeschlossen",
        });
        await updateJobCounters(job.id, {
          imported_count: inserted,
          updated_count: updated,
          skipped_count: skipped,
          error_count: errors.length,
        });
        await finishImportJob(job.id, errors.length && !inserted && !updated ? "failed" : "succeeded");
        return { ids: insertedIds, inserted, updated, skipped, jobId: job.id, errors };
      } catch (err) {
        await updateJobCounters(job.id, { error_count: errors.length + 1 });
        await finishImportJob(job.id, "failed", { notes: (err as Error).message ?? "Import fehlgeschlagen" });
        throw err;
      } finally {
        setCrawlImportProgress(null);
      }
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "sections"] });
      qc.invalidateQueries({ queryKey: ["admin", "section-usage"] });
      qc.invalidateQueries({ queryKey: ["admin", "import-jobs"] });
      setImportResult(r);
    },
  });

  const importMut = useMutation({

    mutationFn: async () => {
      if (!preview) throw new Error("Kein Import-Vorschau geladen.");
      const drafts: ImportSectionDraft[] = sectionsState
        .filter((s) => s.selected && s.status !== "unchanged")
        .map((s) => ({
          section_number: s.section_number,
          title: s.title,
          full_text: s.full_text,
          official_url: s.official_url,
          source_hash: s.source_hash,
          summary: s.enriched?.summary ?? null,
          practice_relevance: s.enriched?.practice_relevance ?? null,
          recommendation: s.enriched?.recommendation ?? null,
          common_mistakes: s.enriched?.common_mistakes ?? null,
        }));

      // 1. Job anlegen
      const job = await startImportJob({
        source_id: sourceId,
        source_url: preview.url,
        detected_count: preview.sections.length,
      });

      const errors: Array<{ section_number: string; error: string }> = [];
      try {
        const r = await bulkImportSections(sourceId, drafts, preview.url, job.id);
        // 2. Protokoll pro Abschnitt
        for (const it of r.items) {
          try {
            await recordJobItem({
              job_id: job.id,
              section_number: it.section_number,
              title: it.title,
              section_id: it.section_id,
              action: it.action,
              source_hash: it.source_hash,
            });
          } catch (err) {
            errors.push({ section_number: it.section_number, error: (err as Error).message });
          }
        }
        await updateJobCounters(job.id, {
          imported_count: r.inserted,
          updated_count: r.updated,
          skipped_count: r.skipped,
          error_count: errors.length,
        });
        await finishImportJob(job.id, "succeeded");
        return { ...r, jobId: job.id, errors };
      } catch (err) {
        await updateJobCounters(job.id, { error_count: 1 });
        await finishImportJob(job.id, "failed", {
          notes: (err as Error).message ?? "Import fehlgeschlagen",
        });
        throw err;
      }
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "sections"] });
      qc.invalidateQueries({ queryKey: ["admin", "section-usage"] });
      qc.invalidateQueries({ queryKey: ["admin", "import-jobs"] });
      setImportResult({
        ids: r.ids ?? [],
        inserted: r.inserted,
        updated: r.updated,
        skipped: r.skipped,
        jobId: r.jobId,
        errors: r.errors,
      });
    },
  });

  async function handleRollback() {
    if (!importResult) return;
    if (!confirm("Diesen Import wirklich zurücksetzen? Nur importierte Entwürfe ohne Verknüpfungen werden gelöscht.")) return;
    setRollbackBusy(true);
    try {
      const r = await rollbackImportJob(importResult.jobId);
      qc.invalidateQueries({ queryKey: ["admin", "sections"] });
      qc.invalidateQueries({ queryKey: ["admin", "section-usage"] });
      qc.invalidateQueries({ queryKey: ["admin", "import-jobs"] });
      alert(`Rollback abgeschlossen: ${r.deleted} gelöscht, ${r.skipped.length} übersprungen.`);
      setImportResult(null);
      setSectionsState((prev) => prev.map((s) => ({ ...s, existingId: undefined, status: "new" as const })));
    } catch (err) {
      alert((err as Error).message || "Rollback fehlgeschlagen");
    } finally {
      setRollbackBusy(false);
    }
  }

  async function openSection(index: number) {
    const sec = sectionsState[index];
    if (!sec) return;
    // 1. Bereits vorhanden → direkt navigieren
    if (sec.existingId) {
      onClose();
      navigate({ to: "/admin/rechtsgrundlagen/$id", params: { id: sec.existingId } });
      return;
    }
    // 2. Noch nicht importiert → als Entwurf anlegen, dann öffnen
    setOpeningIndex(index);
    try {
      const draft: ImportSectionDraft = {
        section_number: sec.section_number,
        title: sec.title,
        full_text: sec.full_text,
        official_url: sec.official_url,
        source_hash: sec.source_hash,
        summary: sec.enriched?.summary ?? null,
        practice_relevance: sec.enriched?.practice_relevance ?? null,
        recommendation: sec.enriched?.recommendation ?? null,
        common_mistakes: sec.enriched?.common_mistakes ?? null,
      };
      const res = await bulkImportSections(sourceId, [draft], preview!.url);
      qc.invalidateQueries({ queryKey: ["admin", "sections"] });
      qc.invalidateQueries({ queryKey: ["admin", "section-usage"] });
      const newId = res.ids?.[0];
      if (!newId) throw new Error("Neue Wissenskarte konnte nicht angelegt werden.");
      setSectionsState((prev) =>
        prev.map((s, i) => (i === index ? { ...s, existingId: newId, status: "unchanged" } : s)),
      );
      onClose();
      navigate({ to: "/admin/rechtsgrundlagen/$id", params: { id: newId } });
    } catch (err) {
      alert((err as Error).message || "Wissenskarte konnte nicht geöffnet werden.");
    } finally {
      setOpeningIndex(null);
    }
  }


  const selectedCount = sectionsState.filter((s) => s.selected && s.status !== "unchanged").length;
  const canFetch = Boolean(sourceId && /^https?:\/\//i.test(url));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Werkzeug
            </p>
            <h2 className="text-lg font-semibold">Offizielle Quelle importieren</h2>
            <p className="text-xs text-muted-foreground">
              Schritt {step} von 3 · Import bleibt Entwurf bis zur redaktionellen Freigabe.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
                Rechtsquelle wählen oder neu anlegen. Alle importierten Abschnitte werden dieser
                Quelle zugeordnet.
              </div>
              <div className="flex gap-2">
                <Button
                  variant={sourceMode === "existing" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSourceMode("existing")}
                >
                  Bestehende Quelle
                </Button>
                <Button
                  variant={sourceMode === "new" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSourceMode("new")}
                >
                  Neue Quelle
                </Button>
              </div>

              {sourceMode === "existing" ? (
                <div>
                  <Label className="mb-1.5 block text-xs">Rechtsquelle</Label>
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">— wählen —</option>
                    {((sourcesQ.data ?? []) as any[]).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.short_name || s.name}
                        {s.legal_area ? ` · ${s.legal_area}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 block text-xs">Kurzname *</Label>
                    <Input
                      value={newSource.name}
                      onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                      placeholder="z. B. SchulG NRW"
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Rechtsgebiet</Label>
                    <Input
                      value={newSource.legal_area}
                      onChange={(e) =>
                        setNewSource({ ...newSource, legal_area: e.target.value })
                      }
                      placeholder="z. B. Schulrecht"
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Geltungsbereich</Label>
                    <Input
                      value={newSource.scope}
                      onChange={(e) => setNewSource({ ...newSource, scope: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="mb-1.5 block text-xs">Beschreibung</Label>
                    <Textarea
                      rows={2}
                      value={newSource.description}
                      onChange={(e) =>
                        setNewSource({ ...newSource, description: e.target.value })
                      }
                    />
                  </div>
                  {createSourceMut.error ? (
                    <div className="md:col-span-2">
                      <ErrorState error={createSourceMut.error} />
                    </div>
                  ) : null}
                  <div className="md:col-span-2 flex justify-end">
                    <Button
                      size="sm"
                      disabled={!newSource.name || createSourceMut.isPending}
                      onClick={() => createSourceMut.mutate()}
                    >
                      Rechtsquelle anlegen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Importmethode wählen</h3>
                <p className="text-xs text-muted-foreground">
                  Wähle, ob eine einzelne offizielle Seite importiert oder eine ganze
                  Rechtsquelle (z.&nbsp;B. BASS NRW) automatisch durchsucht werden soll.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setImportMode("single")}
                  className={`rounded-lg border p-4 text-left transition ${
                    importMode === "single"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="mb-1 text-base">📄 <span className="font-semibold">Einzelquelle importieren</span></div>
                  <p className="text-xs text-muted-foreground">
                    Eine einzelne offizielle HTML-Seite abrufen und abschnittsweise importieren.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode("crawler")}
                  className={`rounded-lg border p-4 text-left transition ${
                    importMode === "crawler"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="mb-1 text-base">🕸 <span className="font-semibold">BASS NRW Komplettimport</span></div>
                  <p className="text-xs text-muted-foreground">
                    Eine Startseite automatisch durchsuchen, interne Vorschriftenseiten erkennen
                    und abschnittsweise importieren.
                  </p>
                </button>
              </div>

              <div>
                <Label className="mb-1.5 block text-xs">
                  {importMode === "crawler" ? "Start-URL der Rechtsquelle *" : "Offizielle URL *"}
                </Label>
                <Input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={importMode === "crawler" ? "https://bass.schule.nrw/" : "https://recht.nrw.de/…"}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {KNOWN_SOURCES.map((k) => (
                    <button
                      key={k.label}
                      type="button"
                      onClick={() => setUrl(k.url)}
                      className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              {importMode === "crawler" && (
                <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 md:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 block text-xs">Maximale Seitenzahl</Label>
                    <select
                      value={crawlMaxPages}
                      onChange={(e) => setCrawlMaxPages(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value={25}>25 Seiten (Test)</option>
                      <option value={50}>50 Seiten (Standard)</option>
                      <option value={100}>100 Seiten</option>
                      <option value={200}>200 Seiten</option>
                      <option value={500}>500 Seiten (maximal)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Maximale Linktiefe</Label>
                    <select
                      value={crawlMaxDepth}
                      onChange={(e) => setCrawlMaxDepth(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value={1}>1 Ebene</option>
                      <option value={2}>2 Ebenen</option>
                      <option value={3}>3 Ebenen (Standard)</option>
                      <option value={4}>4 Ebenen</option>
                      <option value={6}>6 Ebenen (tief)</option>
                    </select>
                  </div>
                  <p className="md:col-span-2 text-[11px] text-muted-foreground">
                    Der Crawler folgt ausschließlich Links auf derselben Domain. Externe Seiten,
                    Downloads, Login- und Serviceseiten werden ignoriert.
                  </p>
                </div>
              )}

              <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] italic text-amber-800 dark:text-amber-300">
                Es wird nur der öffentlich abrufbare Inhalt importiert. Der offizielle
                Wortlaut wird nicht verändert. Maßgeblich bleibt die offizielle Quelle.
              </p>
              {fetchError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" /> Abruf fehlgeschlagen
                  </div>
                  <p className="mt-1">{fetchError}</p>
                </div>
              )}
              {crawlError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" /> Crawler fehlgeschlagen
                  </div>
                  <p className="mt-1">{crawlError}</p>
                </div>
              )}
            </div>
          )}


          {step === 3 && importMode === "crawler" && crawlResult && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 truncate">
                    <span className="font-medium">Start:</span>{" "}
                    <a
                      href={crawlResult.start_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      {crawlResult.start_url} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="text-muted-foreground">
                    {crawlResult.fetched} von max. {crawlResult.max_pages} Seiten analysiert ·{" "}
                    {crawlResult.candidates} Kandidaten · {crawlResult.errors} Fehler ·{" "}
                    {Math.round(crawlResult.duration_ms / 100) / 10}s
                  </div>
                </div>
                {crawlResult.warning && (
                  <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-amber-800 dark:text-amber-300">
                    {crawlResult.warning}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCrawlSelected(
                      new Set(
                        crawlResult.pages
                          .filter((p) => p.status === "candidate" && p.section_count > 0)
                          .map((p) => p.url),
                      ),
                    )
                  }
                >
                  Alle Kandidaten
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCrawlSelected(new Set())}>
                  Nichts auswählen
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {crawlSelected.size} ausgewählt · voraussichtlich{" "}
                  {crawlResult.pages
                    .filter((p) => crawlSelected.has(p.url))
                    .reduce((a, p) => a + (p.section_count || 0), 0)}{" "}
                  Abschnitte
                </span>
              </div>

              {crawlImportProgress && (
                <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="min-w-0 truncate">Importiere: {crawlImportProgress.label}</span>
                    <span>
                      {crawlImportProgress.current} / {crawlImportProgress.total}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{
                        width: `${Math.round((crawlImportProgress.current / Math.max(1, crawlImportProgress.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {importResult && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Abschlussbericht (Komplettimport)
                  </p>
                  <ul className="mt-1 space-y-0.5 text-emerald-800/90 dark:text-emerald-300/90">
                    <li>✓ {importResult.inserted} Abschnitte neu importiert</li>
                    <li>↻ {importResult.updated} aktualisiert</li>
                    <li>· {importResult.skipped} unverändert übersprungen</li>
                    <li>
                      {importResult.errors.length === 0
                        ? "✓ 0 Fehler"
                        : `⚠ ${importResult.errors.length} Fehler`}
                    </li>
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to="/admin/import-protokoll/$id"
                      params={{ id: importResult.jobId }}
                      onClick={onClose}
                    >
                      <Button size="sm" variant="default">
                        <ListChecks className="h-3.5 w-3.5" /> Import-Protokoll öffnen
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                      Schließen
                    </Button>
                  </div>
                </div>
              )}

              <ul className="space-y-1.5">
                {crawlResult.pages.map((p) => {
                  const selected = crawlSelected.has(p.url);
                  const disabled = p.status !== "candidate";
                  return (
                    <li
                      key={p.url}
                      className={`rounded-lg border p-2 text-xs ${
                        p.status === "error"
                          ? "border-destructive/30 bg-destructive/5"
                          : p.status === "empty"
                            ? "border-border bg-muted/20"
                            : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={(e) => {
                            setCrawlSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(p.url);
                              else next.delete(p.url);
                              return next;
                            });
                          }}
                          className="mt-1 h-4 w-4"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">
                              {p.title || p.url.split("/").pop() || p.url}
                            </span>
                            {p.bass_number && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {p.bass_number}
                              </span>
                            )}
                            {p.status === "candidate" && (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                {p.section_count} Abschnitt(e)
                              </span>
                            )}
                            {p.status === "empty" && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                keine Abschnitte
                              </span>
                            )}
                            {p.status === "error" && (
                              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                                Fehler
                              </span>
                            )}
                          </div>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-accent"
                          >
                            {p.url} <ExternalLink className="h-3 w-3" />
                          </a>
                          {p.error && (
                            <p className="mt-1 text-[11px] text-destructive">{p.error}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {crawlerImportMut.error ? <ErrorState error={crawlerImportMut.error} /> : null}
            </div>
          )}

          {step === 3 && importMode === "single" && preview && (

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
                <div className="min-w-0 truncate">
                  <span className="font-medium">Quelle:</span>{" "}
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    {preview.url} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="text-muted-foreground">
                  {(preview.sections?.length ?? 0)} Abschnitt(e) erkannt · {selectedCount} zum Import
                </div>
              </div>

              {preview.debug && (
                <div className={`rounded-md border p-2 text-[11px] ${preview.debug.warning ? "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300" : "border-border bg-muted/20 text-muted-foreground"}`}>
                  <div>
                    Parser: <span className="font-medium">{preview.debug.parser_mode}</span> ·
                    {" "}{preview.char_count.toLocaleString("de-DE")} Zeichen ·
                    {" "}{preview.debug.marker_count} Marker ·
                    {" "}{preview.debug.section_count} Abschnitte
                  </div>
                  {preview.debug.first_sections?.length > 0 && (
                    <div className="mt-1 truncate">
                      Erste: {preview.debug.first_sections.map((s) => `${s.number}${s.title ? " " + s.title : ""}`).join(" · ")}
                    </div>
                  )}
                  {preview.debug.warning && <div className="mt-1 font-medium">{preview.debug.warning}</div>}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(batchProgress)}
                  onClick={() =>
                    setSectionsState((prev) =>
                      prev.map((s) => ({ ...s, selected: s.status !== "unchanged" })),
                    )
                  }
                >
                  Alle auswählen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(batchProgress)}
                  onClick={() =>
                    setSectionsState((prev) => prev.map((s) => ({ ...s, selected: false })))
                  }
                >
                  Nichts auswählen
                </Button>
              </div>

              {/* KI-Batch-Aktion – prominent auf eigener Zeile, damit sie nicht umbricht */}
              <div className="rounded-lg border border-accent/40 bg-accent/5 p-3">
                <Button
                  size="default"
                  variant="default"
                  className="w-full sm:w-auto"
                  disabled={Boolean(batchProgress) || selectedCount === 0}
                  onClick={enrichAllSelected}
                >
                  {batchProgress ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  KI-Wissenskarten für alle ausgewählten Abschnitte erstellen
                  {selectedCount > 0 && ` (${selectedCount})`}
                </Button>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Wählen Sie mindestens einen Abschnitt aus, um den Button zu aktivieren.
                </p>
              </div>


              {batchProgress && (
                <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span>KI-Wissenskarten werden vorbereitet …</span>
                    <span>
                      {batchProgress.current} von {batchProgress.total} Wissenskarten erstellt
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{
                        width: `${Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {batchSummary && !batchProgress && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                  <p className="font-medium">
                    ✓ {batchSummary.succeeded} erfolgreich erstellt
                    {batchSummary.skipped > 0 && ` · ${batchSummary.skipped} übersprungen (bereits redaktionell befüllt)`}
                    {batchSummary.failed.length > 0 && ` · ⚠ ${batchSummary.failed.length} Fehler`}
                  </p>
                  {batchSummary.failed.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {batchSummary.failed.map((f, i) => (
                        <li key={i} className="text-destructive">
                          <span className="font-medium">{f.section_number}</span>
                          {f.title ? ` — ${f.title}` : ""}: {f.error}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 italic text-muted-foreground">
                    Alle Inhalte bleiben Entwurf. Der offizielle Volltext wurde nicht verändert.
                  </p>
                </div>
              )}

              {importResult && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Abschlussbericht
                  </p>
                  <ul className="mt-1 space-y-0.5 text-emerald-800/90 dark:text-emerald-300/90">
                    <li>✓ {importResult.inserted} Rechtsabschnitte neu importiert</li>
                    <li>↻ {importResult.updated} aktualisiert</li>
                    <li>· {importResult.skipped} unverändert übersprungen</li>
                    <li>
                      {importResult.errors.length === 0
                        ? "✓ 0 Fehler"
                        : `⚠ ${importResult.errors.length} Fehler`}
                    </li>
                  </ul>
                  {importResult.errors.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {importResult.errors.map((e, i) => (
                        <li key={i} className="text-destructive">
                          <span className="font-medium">{e.section_number}</span>: {e.error}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        onClose();
                        navigate({ to: "/admin/rechtsgrundlagen" });
                      }}
                    >
                      Zur Rechtsgrundlage
                    </Button>
                    <Link
                      to="/admin/import-protokoll/$id"
                      params={{ id: importResult.jobId }}
                      onClick={onClose}
                    >
                      <Button size="sm" variant="outline">
                        <ListChecks className="h-3.5 w-3.5" /> Import-Protokoll öffnen
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rollbackBusy}
                      onClick={handleRollback}
                    >
                      {rollbackBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Diesen Import zurücksetzen
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                      Schließen
                    </Button>
                  </div>
                </div>
              )}


              {sectionsState.length === 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
                  Es konnten keine Paragraphen erkannt werden. Bitte prüfen Sie die URL oder
                  importieren Sie den Text manuell.
                </div>
              )}
              <ul className="space-y-2">
                {sectionsState.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={s.selected}
                        disabled={s.status === "unchanged"}
                        onChange={(e) =>
                          setSectionsState((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, selected: e.target.checked } : x,
                            ),
                          )
                        }
                        className="mt-1 h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{s.section_number}</span>
                          {s.title && (
                            <span className="text-sm text-muted-foreground">— {s.title}</span>
                          )}
                          <StatusBadge status={s.status} />
                        </div>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] text-muted-foreground">
                          {s.full_text}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={s.enriching}
                            onClick={() => enrichOne(i)}
                          >
                            {s.enriching ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                            {s.enriched ? "KI erneut ausführen" : "KI-Wissenskarte vorbereiten"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={openingIndex === i}
                            onClick={() => openSection(i)}
                            title={
                              s.existingId
                                ? "Wissenskarte öffnen"
                                : "Als Entwurf anlegen und Wissenskarte öffnen"
                            }
                          >
                            {openingIndex === i ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <BookOpen className="h-3.5 w-3.5" />
                            )}
                            {s.existingId ? "Wissenskarte öffnen" : "Anlegen & öffnen"}
                          </Button>
                          {s.existingHasEditorial && (
                            <span className="text-[10px] italic text-muted-foreground">
                              Redaktionelle Inhalte vorhanden – KI-Batch überspringt diesen Abschnitt.
                            </span>
                          )}
                        </div>


                        {s.enrichError && (
                          <p className="mt-1 text-[11px] text-destructive">
                            KI-Fehler: {s.enrichError}
                          </p>
                        )}

                        {s.enriched && (
                          <div className="mt-2 space-y-1.5 rounded-md border border-accent/30 bg-accent/5 p-2 text-[11px]">
                            {s.enriched.summary && (
                              <p>
                                <span className="font-medium">Kurzbeschreibung: </span>
                                {s.enriched.summary}
                              </p>
                            )}
                            {s.enriched.practice_relevance && (
                              <p>
                                <span className="font-medium">Praxisbedeutung: </span>
                                {s.enriched.practice_relevance}
                              </p>
                            )}
                            {s.enriched.recommendation && (
                              <p>
                                <span className="font-medium">Handlungsempfehlung: </span>
                                {s.enriched.recommendation}
                              </p>
                            )}
                            {s.enriched.common_mistakes && (
                              <p className="whitespace-pre-wrap">
                                <span className="font-medium">Typische Fehler: </span>
                                {s.enriched.common_mistakes}
                              </p>
                            )}
                            <p className="italic text-muted-foreground">
                              KI-Entwurf – redaktionell zu prüfen. Der offizielle Volltext bleibt
                              unverändert.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {importMut.error ? <ErrorState error={importMut.error} /> : null}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border p-4">
          <div className="text-[11px] text-muted-foreground">
            Kein Inhalt wird automatisch veröffentlicht. Alle Importe bleiben Entwürfe.
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep((step - 1) as 1 | 2 | 3)}>
                Zurück
              </Button>
            )}
            {step === 1 && (
              <Button disabled={!sourceId} onClick={() => setStep(2)}>
                Weiter
              </Button>
            )}
            {step === 2 && importMode === "single" && (
              <Button disabled={!canFetch || isFetching} onClick={handleFetch}>
                {isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Quelle abrufen
              </Button>
            )}
            {step === 2 && importMode === "crawler" && (
              <Button disabled={!canFetch || isCrawling} onClick={handleCrawl}>
                {isCrawling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Crawler starten
              </Button>
            )}
            {step === 3 && importMode === "single" && (
              <Button
                disabled={selectedCount === 0 || importMut.isPending}
                onClick={() => importMut.mutate()}
              >
                {importMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {selectedCount} als Entwurf importieren
              </Button>
            )}
            {step === 3 && importMode === "crawler" && (
              <Button
                disabled={crawlSelected.size === 0 || crawlerImportMut.isPending}
                onClick={() => crawlerImportMut.mutate()}
              >
                {crawlerImportMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {crawlSelected.size} Seite(n) importieren
              </Button>
            )}

          </div>
        </footer>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SectionState["status"] }) {
  if (status === "new") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
        Neu
      </span>
    );
  }
  if (status === "changed") {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
        Aktualisierung
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Bereits vorhanden
    </span>
  );
}
