/**
 * Excel-Import für die KI-Entwurfsmaschine.
 *
 * Prinzip (Credit-Spar-Modus, Standard AN):
 * - Excel-Parsing rein client-seitig (SheetJS).
 * - Alle Validierungen, Pflichtfeldprüfungen und Duplikatprüfungen deterministisch.
 * - KI wird ausschließlich für die Ausformulierung ausgewählter, gültiger Zeilen genutzt.
 * - Exakt EIN KI-Call pro Zeile (Wiederverwendung von /api/ai-draft-case).
 * - Nach der KI-Antwort läuft die zentrale completePracticeCase-Pipeline.
 * - Optional (Phase 2): Nach erfolgreichem Fall ein zusätzlicher KI-Call für
 *   einen fallspezifischen Entscheidungsbaum als Entwurf (Standard AUS).
 * - Idempotenz über faq.meta.import_source + faq.meta.external_id.
 * - Nichts wird jemals automatisch veröffentlicht (status = draft).
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  SkipForward,
  ExternalLink,
  Play,
  Sparkles,
  History,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  createCase,
  linkCaseKeyword,
  listCases,
  listCategories,
  listKeywords,
  listSections,
  listTemplates,
  updateCase,
} from "@/lib/coreBuilder";
import { completePracticeCase } from "@/lib/casePipeline.completion";
import {
  parseCuratedTree,
  validateCuratedTree,
  type CuratedDecisionTree,
} from "@/lib/decisionTree";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin/ki-entwurfsmaschine/excel-import")({
  component: ExcelImportPage,
});

// ────────────────────────────── Konstanten ──────────────────────────────

const REQUIRED_COLUMNS = [
  "external_id",
  "falltitel",
  "kategorie",
  "kurzer_sachverhalt",
  "kernfrage",
] as const;

const OPTIONAL_COLUMNS = [
  "unterkategorie",
  "schulform",
  "beteiligte",
  "gewuenschte_rechtsgrundlagen",
  "besonderheiten",
  "dokumentvorlage",
  "prioritaet",
  "status",
] as const;

const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 100;
const MIN_SACHVERHALT_LEN = 20;
const MAX_FIELD_LEN = 4000;
const VALID_PRIO = new Set(["", "niedrig", "mittel", "hoch"]);
const VALID_STATUS_HINT = new Set(["", "draft", "review"]);

const HISTORY_KEY = "rk_excel_import_history_v1";
const HISTORY_MAX = 20;

type XlsxModule = typeof import("xlsx");
let xlsxModulePromise: Promise<XlsxModule> | null = null;

function loadXlsx(): Promise<XlsxModule> {
  xlsxModulePromise ??= import("xlsx");
  return xlsxModulePromise;
}

// ────────────────────────────── Typen ──────────────────────────────

type RowRaw = Record<string, string>;

type RowIssue = {
  level: "error" | "warning";
  message: string;
};

type RowValidation = {
  index: number; // Excel-Zeilennummer (1-basiert, inkl. Kopfzeile)
  data: RowRaw;
  issues: RowIssue[];
  duplicate?: {
    kind: "already_imported" | "title" | "kernfrage";
    ref?: { id: string; title: string };
  };
  selectable: boolean;
  selected: boolean;
};

type CaseKind =
  | "queued"
  | "generating"
  | "generated"
  | "generated_with_tasks"
  | "duplicate"
  | "skipped"
  | "error";

type TreeKind =
  | "not_requested"
  | "queued"
  | "generating"
  | "generated"
  | "generated_with_warnings"
  | "invalid"
  | "error"
  | "skipped";

type RunStatus = {
  caseKind: CaseKind;
  caseId?: string;
  title?: string;
  qualityTasks?: number;
  legalBasisCount?: number;
  templateStatus?: string;
  errorMessage?: string;
  reason?: string;
  treeKind: TreeKind;
  treeWarningCount?: number;
  treeError?: string;
  processedAt?: string;
};

type HistoryEntry = {
  id: string;
  fileName: string;
  startedAt: string;
  completedAt: string;
  totalRows: number;
  selectedRows: number;
  generatedCount: number;
  duplicateCount: number;
  skippedCount: number;
  errorCount: number;
  decisionTreeRequested: boolean;
  decisionTreeGeneratedCount: number;
  decisionTreeWarningCount: number;
  decisionTreeErrorCount: number;
  status: "completed" | "aborted";
};

// ────────────────────────────── Helpers ──────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeHeader(h: string): string {
  return norm(h).replace(/\s+/g, "_");
}

function coerceCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(norm(a).split(" ").filter((t) => t.length > 3));
  const tb = new Set(norm(b).split(" ").filter((t) => t.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

// ────────────────────────────── Historie ──────────────────────────────

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entry: HistoryEntry): HistoryEntry[] {
  const cur = loadHistory();
  const next = [entry, ...cur].slice(0, HISTORY_MAX);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
  return next;
}

// ────────────────────────────── Excel-Vorlage ──────────────────────────────

async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const header = ALL_COLUMNS as unknown as string[];
  const example = [
    "IMP-001",
    "Heimliches Filmen im Unterricht",
    "Datenschutz",
    "Bild- und Tonaufnahmen",
    "Ein Schüler filmt heimlich die Lehrkraft im Unterricht und teilt das Video anschließend in einer Klassen-Chatgruppe.",
    "Wie muss die Lehrkraft reagieren und welche Maßnahmen sind rechtlich zulässig?",
    "Berufskolleg",
    "Lehrkraft, Schüler, Klasse",
    "§ 53 SchulG NRW; KunstUrhG",
    "Video wurde bereits weiterverbreitet.",
    "Elterninformation Vorfall",
    "hoch",
    "draft",
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Praxisfaelle");
  XLSX.writeFile(wb, "rechtkompass_praxisfaelle_vorlage.xlsx");
}

// ────────────────────────────── Ergebnis-Excel ──────────────────────────────

const RESULT_COLUMNS = [
  "import_status",
  "case_id",
  "case_url",
  "pipeline_status",
  "quality_task_count",
  "legal_basis_count",
  "template_status",
  "decision_tree_status",
  "decision_tree_warning_count",
  "error_message",
  "processed_at",
] as const;

async function downloadResultExcel(
  originalFileName: string | null,
  detectedHeaders: string[],
  rows: RowValidation[],
  status: Record<number, RunStatus>,
) {
  const XLSX = await loadXlsx();
  const headers = [...detectedHeaders, ...RESULT_COLUMNS];
  const aoa: unknown[][] = [headers];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  for (const r of rows) {
    const rs = status[r.index];
    const row: unknown[] = detectedHeaders.map((h) => r.data[h] ?? "");
    row.push(rs?.caseKind ?? (r.duplicate ? "duplicate" : r.selected ? "not_run" : "not_selected"));
    row.push(rs?.caseId ?? "");
    row.push(rs?.caseId ? `${origin}/admin/faelle/${rs.caseId}` : "");
    row.push(rs?.qualityTasks != null ? (rs.qualityTasks > 0 ? "tasks_pending" : "ok") : "");
    row.push(rs?.qualityTasks ?? "");
    row.push(rs?.legalBasisCount ?? "");
    row.push(rs?.templateStatus ?? "");
    row.push(rs?.treeKind ?? "not_requested");
    row.push(rs?.treeWarningCount ?? "");
    row.push(rs?.errorMessage ?? rs?.treeError ?? "");
    row.push(rs?.processedAt ?? "");
    aoa.push(row);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ergebnis");
  const name = `${baseName(originalFileName ?? "excel_import")}_ergebnis_${todayIso()}.xlsx`;
  XLSX.writeFile(wb, name);
}

// ────────────────────────────── Seite ──────────────────────────────

function ExcelImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [usedSheet, setUsedSheet] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [missingRequired, setMissingRequired] = useState<string[]>([]);
  const [rows, setRows] = useState<RowValidation[]>([]);
  const [creditSaver] = useState(true);
  const [withDecisionTree, setWithDecisionTree] = useState(false);
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<Record<number, RunStatus>>({});
  const [currentStep, setCurrentStep] = useState<string>("");
  const [batchFinished, setBatchFinished] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const stats = useMemo(() => {
    const s = {
      total: rows.length,
      valid: 0,
      error: 0,
      warning: 0,
      duplicate: 0,
      alreadyImported: 0,
      selected: 0,
    };
    for (const r of rows) {
      const hasErr = r.issues.some((i) => i.level === "error");
      const hasWarn = r.issues.some((i) => i.level === "warning");
      if (hasErr) s.error++;
      else s.valid++;
      if (hasWarn) s.warning++;
      if (r.duplicate?.kind === "already_imported") s.alreadyImported++;
      else if (r.duplicate) s.duplicate++;
      if (r.selected) s.selected++;
    }
    return s;
  }, [rows]);

  const runSummary = useMemo(() => {
    const s = {
      generated: 0,
      tasks: 0,
      errors: 0,
      treeGenerated: 0,
      treeWarnings: 0,
      treeErrors: 0,
    };
    for (const rs of Object.values(runStatus)) {
      if (rs.caseKind === "generated" || rs.caseKind === "generated_with_tasks") s.generated++;
      if (rs.caseKind === "generated_with_tasks") s.tasks++;
      if (rs.caseKind === "error") s.errors++;
      if (rs.treeKind === "generated") s.treeGenerated++;
      if (rs.treeKind === "generated_with_warnings") {
        s.treeGenerated++;
        s.treeWarnings++;
      }
      if (rs.treeKind === "invalid" || rs.treeKind === "error") s.treeErrors++;
    }
    return s;
  }, [runStatus]);

  // ─── Upload & Parse ───────────────────────────────────────────────

  async function onFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`Datei zu groß (max. ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
      toast.error("Nur .xlsx oder .csv erlaubt.");
      return;
    }
    setFileName(file.name);
    setRunStatus({});
    setBatchFinished(false);
    try {
      const XLSX = await loadXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true, cellFormula: false, cellHTML: false });
      const names = wb.SheetNames;
      setSheetNames(names);
      const sheet = wb.Sheets[names[0]];
      setUsedSheet(names[0]);
      const aoa = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      if (aoa.length === 0) {
        setDetectedColumns([]);
        setMissingRequired([...REQUIRED_COLUMNS]);
        setRows([]);
        return;
      }
      const rawKeys = Object.keys(aoa[0] ?? {});
      const keyMap = new Map<string, string>();
      for (const k of rawKeys) keyMap.set(normalizeHeader(k), k);
      const normalized = rawKeys.map(normalizeHeader);
      setDetectedColumns(normalized);
      const missing = REQUIRED_COLUMNS.filter((c) => !keyMap.has(c));
      setMissingRequired([...missing]);

      const trimmed = aoa.slice(0, MAX_ROWS);
      if (aoa.length > MAX_ROWS) {
        toast.warning(`Nur die ersten ${MAX_ROWS} Zeilen werden verarbeitet.`);
      }
      const rawRows: RowRaw[] = trimmed.map((r) => {
        const obj: RowRaw = {};
        for (const col of ALL_COLUMNS) {
          const rawKey = keyMap.get(col);
          obj[col] = rawKey ? coerceCell(r[rawKey]) : "";
        }
        return obj;
      });

      const [existingCases, cats] = await Promise.all([listCases(), listCategories()]);
      const catNames = new Set(cats.map((c) => norm(c.name)));

      const importedExternalIds = new Map<string, { id: string; title: string }>();
      const titleIndex = new Map<string, { id: string; title: string }>();
      const kernfrageIndex = new Map<string, { id: string; title: string }>();
      for (const c of existingCases) {
        const faq = (c as unknown as { faq?: unknown }).faq as
          | { meta?: { import_source?: string; external_id?: string } }
          | undefined;
        const ext = faq?.meta?.external_id;
        if (ext && faq?.meta?.import_source === "excel") {
          importedExternalIds.set(ext.trim(), { id: c.id, title: c.title });
        }
        const nt = norm(c.title ?? "");
        if (nt) titleIndex.set(nt, { id: c.id, title: c.title });
        const sd = (c as unknown as { short_description?: string }).short_description ?? "";
        const sdn = norm(sd);
        if (sdn) kernfrageIndex.set(sdn, { id: c.id, title: c.title });
      }

      const seenExternalIds = new Set<string>();
      const seenTitles = new Set<string>();
      const validated: RowValidation[] = rawRows.map((data, i) => {
        const issues: RowIssue[] = [];
        let duplicate: RowValidation["duplicate"] | undefined;

        const allEmpty = ALL_COLUMNS.every((c) => !data[c]);
        if (allEmpty) issues.push({ level: "error", message: "Zeile ist leer." });

        for (const c of ALL_COLUMNS) {
          if (data[c] && data[c].length > MAX_FIELD_LEN) {
            issues.push({ level: "error", message: `Feld ${c} zu lang (>${MAX_FIELD_LEN}).` });
          }
        }

        if (!missing.length) {
          for (const c of REQUIRED_COLUMNS) {
            if (!data[c]) issues.push({ level: "error", message: `Pflichtfeld fehlt: ${c}.` });
          }
          if (data.kurzer_sachverhalt && data.kurzer_sachverhalt.length < MIN_SACHVERHALT_LEN) {
            issues.push({
              level: "error",
              message: `kurzer_sachverhalt zu kurz (<${MIN_SACHVERHALT_LEN}).`,
            });
          }
          if (data.kategorie && !catNames.has(norm(data.kategorie))) {
            issues.push({
              level: "warning",
              message: `Kategorie "${data.kategorie}" existiert nicht (wird angelegt oder bleibt frei).`,
            });
          }
          if (data.prioritaet && !VALID_PRIO.has(data.prioritaet.toLowerCase())) {
            issues.push({ level: "warning", message: `Ungültige Priorität: ${data.prioritaet}.` });
          }
          if (data.status && !VALID_STATUS_HINT.has(data.status.toLowerCase())) {
            issues.push({
              level: "warning",
              message: `Nur draft/review erlaubt (published wird ignoriert): ${data.status}.`,
            });
          }
        }

        const ext = data.external_id?.trim();
        if (ext) {
          if (seenExternalIds.has(ext)) {
            issues.push({ level: "error", message: `external_id "${ext}" in Datei doppelt.` });
          } else {
            seenExternalIds.add(ext);
          }
          if (importedExternalIds.has(ext)) {
            duplicate = { kind: "already_imported", ref: importedExternalIds.get(ext) };
          }
        }

        const nt = norm(data.falltitel ?? "");
        if (nt) {
          if (!duplicate && titleIndex.has(nt)) {
            duplicate = { kind: "title", ref: titleIndex.get(nt) };
          } else if (!duplicate) {
            for (const [, ref] of titleIndex) {
              if (tokenOverlap(nt, ref.title) >= 0.85) {
                duplicate = { kind: "title", ref };
                break;
              }
            }
          }
          if (seenTitles.has(nt)) {
            issues.push({ level: "warning", message: "Titel in Datei mehrfach vorhanden." });
          } else {
            seenTitles.add(nt);
          }
        }
        if (!duplicate) {
          const kf = norm(data.kernfrage ?? "");
          if (kf && kernfrageIndex.has(kf)) {
            duplicate = { kind: "kernfrage", ref: kernfrageIndex.get(kf) };
          }
        }

        const hasErr = issues.some((x) => x.level === "error");
        const selectable = !hasErr;
        const selected = selectable && !duplicate;

        return { index: i + 2, data, issues, duplicate, selectable, selected };
      });

      setRows(validated);
    } catch (e) {
      toast.error("Datei konnte nicht gelesen werden: " + (e instanceof Error ? e.message : String(e)));
      setRows([]);
      setDetectedColumns([]);
    }
  }

  // ─── Auswahl-Aktionen ────────────────────────────────────────────

  function setSel(fn: (r: RowValidation) => boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected: r.selectable && fn(r) })));
  }
  const selectAllValid = () => setSel((r) => !r.duplicate);
  const selectHighPrio = () =>
    setSel((r) => !r.duplicate && (r.data.prioritaet ?? "").toLowerCase() === "hoch");
  const clearSelection = () => setSel(() => false);
  const removeDuplicatesFromSelection = () =>
    setRows((prev) => prev.map((r) => (r.duplicate ? { ...r, selected: false } : r)));

  // ─── Batch-Run ────────────────────────────────────────────────────

  async function runBatch() {
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) {
      toast.warning("Bitte mindestens eine Zeile auswählen.");
      return;
    }
    setRunning(true);
    setBatchFinished(false);
    setCurrentStep("Lade Kataloge…");
    const startedAt = new Date().toISOString();
    const localStatus: Record<number, RunStatus> = { ...runStatus };
    try {
      const [cats, kws, tmpls, secs] = await Promise.all([
        listCategories(),
        listKeywords(),
        listTemplates(),
        listSections(),
      ]);
      const publishedSecs = (secs as Array<Record<string, unknown>>).filter(
        (s) => (s.status ?? "published") === "published" || s.status === undefined,
      );

      for (const row of selected) {
        setCurrentStep(`Verarbeite Zeile ${row.index}: ${row.data.falltitel}`);
        const initial: RunStatus = {
          caseKind: "generating",
          treeKind: withDecisionTree ? "queued" : "not_requested",
        };
        localStatus[row.index] = initial;
        setRunStatus((s) => ({ ...s, [row.index]: initial }));

        let caseId: string | undefined;
        let createdTitle: string | undefined;
        let qualityTasks = 0;

        // ─── Fall-Erzeugung ────────────────────────────────
        try {
          const description = buildDescriptionFromRow(row.data);

          const res = await fetch("/api/ai-draft-case", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description,
              categories: cats.map((c) => c.name),
              keywords: kws.map((k) => k.keyword),
              templates: tmpls.map((t) => ({ id: t.id, label: t.title })),
              sections: publishedSecs.map((s) => ({
                id: s.id as string,
                label: `${(s as { legal_sources?: { name?: string } }).legal_sources?.name ?? ""} ${(s.section_number as string) ?? ""} ${(s.title as string) ?? ""}`.trim(),
              })),
            }),
          });
          if (!res.ok) throw new Error(await res.text());
          const { draft } = (await res.json()) as { draft: Record<string, unknown> };

          const draftAny = draft as Record<string, unknown>;
          const kwByName = new Map(kws.map((k) => [k.keyword.toLowerCase(), k.id]));
          const keywordIds = new Set<string>();
          for (const id of (draftAny.keyword_ids as string[]) ?? []) {
            if (kws.some((k) => k.id === id)) keywordIds.add(id);
          }
          for (const hint of (draftAny.keyword_hints as string[]) ?? []) {
            const kid = kwByName.get(hint.toLowerCase());
            if (kid) keywordIds.add(kid);
          }

          const meta: Record<string, unknown> = {
            bildungsgang: draftAny.bildungsgang ?? row.data.schulform ?? "",
            zielgruppe: draftAny.zielgruppe ?? "",
            schwierigkeit: draftAny.schwierigkeit ?? "",
            bearbeitungsdauer: draftAny.bearbeitungsdauer ?? "",
            template_ids: [],
            risks: [],
            faq_items: draftAny.faq ?? [],
            keyword_hints: draftAny.keyword_hints ?? [],
            template_hints: row.data.dokumentvorlage ? [row.data.dokumentvorlage] : [],
            legal_hints: parseLegalHints(row.data.gewuenschte_rechtsgrundlagen),
            related_hints: draftAny.related_hints ?? [],
            import_source: "excel",
            external_id: row.data.external_id,
            imported_at: new Date().toISOString(),
            file_name: fileName,
            excel_row: row.index,
            prioritaet: row.data.prioritaet ?? "",
            besonderheiten: row.data.besonderheiten ?? "",
            beteiligte: row.data.beteiligte ?? "",
            kernfrage: row.data.kernfrage,
          };

          const payload = {
            title: row.data.falltitel,
            short_description:
              row.data.kurzer_sachverhalt || (draftAny.short_description as string) || "",
            category: row.data.kategorie,
            subcategory: row.data.unterkategorie || (draftAny.subcategory as string) || "",
            ampel: (draftAny.ampel as "gruen" | "gelb" | "rot") ?? "gelb",
            status: "draft" as const,
            short_answer: (draftAny.short_answer as string) ?? "",
            immediate_actions: (draftAny.immediate_actions as string) ?? "",
            recommendation: (draftAny.recommendation as string) ?? "",
            legal_explanation: (draftAny.legal_explanation as string) ?? "",
            responsibilities: (draftAny.responsibilities as string) ?? "",
            practice_tip: (draftAny.practice_tip as string) ?? "",
            checklist: ((draftAny.checklist as string[]) ?? []).filter(Boolean),
            documentation: ((draftAny.documentation as string[]) ?? []).filter(Boolean),
            common_mistakes: ((draftAny.common_mistakes as string[]) ?? []).filter(Boolean),
            faq: { meta } as unknown as Json,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const created = await createCase(payload as any);
          caseId = created.id;
          createdTitle = created.title;

          for (const kid of keywordIds) {
            try {
              await linkCaseKeyword(caseId, kid);
            } catch {
              /* dup */
            }
          }

          try {
            const report = await completePracticeCase(caseId, { source: "ai_case_machine" });
            const qt = (report as unknown as { qualityTasks?: unknown[] }).qualityTasks;
            qualityTasks = Array.isArray(qt) ? qt.length : 0;
          } catch (e) {
            console.warn("[excel-import] Pipeline warnte:", e);
          }

          const afterCase: RunStatus = {
            ...localStatus[row.index],
            caseKind: qualityTasks > 0 ? "generated_with_tasks" : "generated",
            caseId,
            title: createdTitle,
            qualityTasks,
            processedAt: new Date().toISOString(),
          };
          localStatus[row.index] = afterCase;
          setRunStatus((s) => ({ ...s, [row.index]: afterCase }));
        } catch (e) {
          const errStatus: RunStatus = {
            ...localStatus[row.index],
            caseKind: "error",
            errorMessage: e instanceof Error ? e.message : String(e),
            treeKind: withDecisionTree ? "skipped" : "not_requested",
            processedAt: new Date().toISOString(),
          };
          localStatus[row.index] = errStatus;
          setRunStatus((s) => ({ ...s, [row.index]: errStatus }));
          continue;
        }

        // ─── Optionaler Entscheidungsbaum ─────────────────
        if (!withDecisionTree || !caseId) continue;

        setCurrentStep(`Erzeuge Entscheidungsbaum für Zeile ${row.index}…`);
        const treeGeneratingStatus: RunStatus = {
          ...localStatus[row.index],
          treeKind: "generating",
        };
        localStatus[row.index] = treeGeneratingStatus;
        setRunStatus((s) => ({ ...s, [row.index]: treeGeneratingStatus }));

        try {
          const caseRow = {
            title: createdTitle ?? row.data.falltitel,
            category: row.data.kategorie,
            subcategory: row.data.unterkategorie,
            short_description: row.data.kurzer_sachverhalt,
            short_answer: row.data.kernfrage,
            immediate_actions: "",
            recommendation: "",
            responsibilities: "",
            practice_tip: "",
            common_mistakes: [],
            checklist: [],
            documentation: [],
            legal_explanation: "",
            faq: null,
          };
          const treeRes = await fetch("/api/ai-draft-decision-tree", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caseRow, extraContext: { legalBasis: [], knowledge: [] } }),
          });
          if (!treeRes.ok) {
            const t = await treeRes.text();
            throw new Error(`AI-Gateway ${treeRes.status}: ${t.slice(0, 200)}`);
          }
          const { tree: rawTree } = (await treeRes.json()) as { tree: unknown };
          const parsed = parseCuratedTree(rawTree);
          if (!parsed) {
            const st: RunStatus = {
              ...localStatus[row.index],
              treeKind: "invalid",
              treeError: "Antwort konnte nicht als Entscheidungsbaum gelesen werden.",
            };
            localStatus[row.index] = st;
            setRunStatus((s) => ({ ...s, [row.index]: st }));
            continue;
          }
          const report = validateCuratedTree(parsed);
          if (!report.valid) {
            const st: RunStatus = {
              ...localStatus[row.index],
              treeKind: "invalid",
              treeError: report.errors
                .map((e) => e.message)
                .slice(0, 3)
                .join("; "),
              treeWarningCount: report.warnings.length,
            };
            localStatus[row.index] = st;
            setRunStatus((s) => ({ ...s, [row.index]: st }));
            continue;
          }

          const payload: CuratedDecisionTree = {
            ...parsed,
            meta: {
              ...(parsed.meta ?? {}),
              status: "draft",
              version: parsed.meta?.version ?? 1,
              updatedAt: new Date().toISOString(),
            },
          };
          // Zusatz-Metadaten
          const metaExt = payload.meta as unknown as Record<string, unknown>;
          metaExt.source = "excel_import_ai";
          metaExt.generatedAt = new Date().toISOString();
          metaExt.externalId = row.data.external_id;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await updateCase(caseId, { decision_tree: payload as any } as any);

          const treeStatus: RunStatus = {
            ...localStatus[row.index],
            treeKind: report.warnings.length > 0 ? "generated_with_warnings" : "generated",
            treeWarningCount: report.warnings.length,
          };
          localStatus[row.index] = treeStatus;
          setRunStatus((s) => ({ ...s, [row.index]: treeStatus }));
        } catch (e) {
          const st: RunStatus = {
            ...localStatus[row.index],
            treeKind: "error",
            treeError: e instanceof Error ? e.message : String(e),
          };
          localStatus[row.index] = st;
          setRunStatus((s) => ({ ...s, [row.index]: st }));
        }
      }
      toast.success("Excel-Import abgeschlossen.");
    } finally {
      setRunning(false);
      setCurrentStep("");
      setBatchFinished(true);

      // Historie schreiben (nur Metadaten, keine Rohzeilen)
      let generated = 0;
      let errors = 0;
      let treeGen = 0;
      let treeWarn = 0;
      let treeErr = 0;
      for (const rs of Object.values(localStatus)) {
        if (rs.caseKind === "generated" || rs.caseKind === "generated_with_tasks") generated++;
        if (rs.caseKind === "error") errors++;
        if (rs.treeKind === "generated") treeGen++;
        if (rs.treeKind === "generated_with_warnings") {
          treeGen++;
          treeWarn++;
        }
        if (rs.treeKind === "invalid" || rs.treeKind === "error") treeErr++;
      }
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        fileName: fileName ?? "unbekannt",
        startedAt,
        completedAt: new Date().toISOString(),
        totalRows: rows.length,
        selectedRows: selected.length,
        generatedCount: generated,
        duplicateCount: rows.filter((r) => r.duplicate).length,
        skippedCount: rows.length - selected.length,
        errorCount: errors,
        decisionTreeRequested: withDecisionTree,
        decisionTreeGeneratedCount: treeGen,
        decisionTreeWarningCount: treeWarn,
        decisionTreeErrorCount: treeErr,
        status: "completed",
      };
      try {
        setHistory(saveHistory(entry));
      } catch (e) {
        console.warn("[excel-import] Historie konnte nicht gespeichert werden:", e);
      }
    }
  }

  const expectedCaseCalls = stats.selected;
  const expectedTreeCalls = withDecisionTree ? stats.selected : 0;
  const expectedTotalCalls = expectedCaseCalls + expectedTreeCalls;

  const qualityCaseIds = useMemo(
    () =>
      Object.values(runStatus)
        .filter((rs) => rs.caseKind === "generated_with_tasks" && rs.caseId)
        .map((rs) => rs.caseId!),
    [runStatus],
  );

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Excel-Import (Praxisfall-Entwürfe)
          </h1>
          <p className="text-xs text-muted-foreground">
            Kontrollierte Fallproduktion aus einer Excel-Liste. Exakt ein KI-Call pro ausgewählter
            Zeile. Nichts wird automatisch veröffentlicht.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            Vorlage
          </Button>
          <Link
            to="/admin/ki-entwurfsmaschine"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            ← KI-Entwurfsmaschine
          </Link>
        </div>
      </header>

      {/* Upload */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={running}
            variant="outline"
          >
            <Upload className="h-4 w-4" />
            Datei wählen (.xlsx / .csv)
          </Button>
          {fileName && (
            <span className="text-xs text-muted-foreground">
              {fileName} · Blatt: {usedSheet} ({sheetNames.length}) · {rows.length} Zeilen
            </span>
          )}
        </div>

        {detectedColumns.length > 0 && (
          <div className="text-xs">
            <div className="text-muted-foreground">
              Erkannte Spalten: {detectedColumns.join(", ") || "–"}
            </div>
            {missingRequired.length > 0 && (
              <div className="mt-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                Fehlende Pflichtspalten: {missingRequired.join(", ")} – Import blockiert.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Statistik + Aktionen */}
      {rows.length > 0 && missingRequired.length === 0 && (
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span>
              Gesamt: <strong>{stats.total}</strong>
            </span>
            <span className="text-emerald-700">Gültig: {stats.valid}</span>
            <span className="text-destructive">Fehlerhaft: {stats.error}</span>
            <span className="text-amber-700">Warnungen: {stats.warning}</span>
            <span className="text-amber-700">Duplikate: {stats.duplicate}</span>
            <span className="text-muted-foreground">Bereits importiert: {stats.alreadyImported}</span>
            <span className="ml-auto rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
              Ausgewählt: {stats.selected} · voraussichtlich {expectedTotalCalls} KI-Aufrufe
              {withDecisionTree ? ` (${expectedCaseCalls} Fall + ${expectedTreeCalls} Baum)` : ""}
            </span>
          </div>

          {/* Optionen */}
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={withDecisionTree}
                disabled={running}
                onCheckedChange={(v) => setWithDecisionTree(!!v)}
                className="mt-0.5"
              />
              <span className="flex-1">
                <span className="font-medium flex items-center gap-1">
                  <GitBranch className="h-3.5 w-3.5" />
                  Fallspezifischen Entscheidungsbaum als Entwurf erzeugen
                </span>
                <span className="text-muted-foreground">
                  Hierdurch entsteht nach der Fallerstellung ein zusätzlicher KI-Aufruf pro
                  erfolgreich erzeugtem Fall. Baum wird als Entwurf gespeichert – keine automatische
                  Freigabe.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={selectAllValid} disabled={running}>
              Alle gültigen auswählen
            </Button>
            <Button size="sm" variant="outline" onClick={selectHighPrio} disabled={running}>
              Nur Priorität „hoch"
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={removeDuplicatesFromSelection}
              disabled={running}
            >
              Duplikate aus Auswahl entfernen
            </Button>
            <Button size="sm" variant="outline" onClick={clearSelection} disabled={running}>
              Auswahl aufheben
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                Credit-Spar-Modus aktiv · genau 1 KI-Call pro Zeile
                {withDecisionTree ? " · optional +1 für Baum" : ""}
              </span>
              <Button size="sm" onClick={runBatch} disabled={running || stats.selected === 0}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Batch starten
              </Button>
            </div>
          </div>
          {running && currentStep && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> {currentStep}
            </div>
          )}
        </section>
      )}

      {/* Abschlussbereich */}
      {batchFinished && !running && Object.keys(runStatus).length > 0 && (
        <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/40 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold">Batch abgeschlossen.</span>
            <span>Erzeugt: {runSummary.generated}</span>
            <span>Mit Quality-Tasks: {runSummary.tasks}</span>
            <span className="text-destructive">Fehler: {runSummary.errors}</span>
            {withDecisionTree && (
              <>
                <span>· Bäume: {runSummary.treeGenerated}</span>
                <span className="text-amber-700">mit Hinweisen: {runSummary.treeWarnings}</span>
                <span className="text-destructive">Baum-Fehler: {runSummary.treeErrors}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void downloadResultExcel(
                  fileName,
                  detectedColumns.length ? detectedColumns : [...ALL_COLUMNS],
                  rows,
                  runStatus,
                );
              }}
            >
              <Download className="h-4 w-4" />
              Ergebnis als Excel herunterladen
            </Button>
            {qualityCaseIds.length > 0 && (
              <Link
                to="/admin/qualitaetsmanager"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Quality Manager öffnen ({qualityCaseIds.length})
              </Link>
            )}
            {withDecisionTree && runSummary.treeGenerated > 0 && (
              <Link
                to="/admin/entscheidungsassistenten-batch"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Assistenten-Batch öffnen
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Zeilentabelle */}
      {rows.length > 0 && missingRequired.length === 0 && (
        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 w-8"></th>
                <th className="p-2">#</th>
                <th className="p-2">external_id</th>
                <th className="p-2">Titel</th>
                <th className="p-2">Kategorie</th>
                <th className="p-2">Prio</th>
                <th className="p-2">Status</th>
                <th className="p-2">Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rs = runStatus[r.index];
                return (
                  <tr key={r.index} className="border-t border-border align-top">
                    <td className="p-2">
                      <Checkbox
                        checked={r.selected}
                        disabled={!r.selectable || running}
                        onCheckedChange={(v) =>
                          setRows((prev) =>
                            prev.map((x) =>
                              x.index === r.index ? { ...x, selected: !!v && x.selectable } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="p-2 text-muted-foreground">{r.index}</td>
                    <td className="p-2 font-mono">{r.data.external_id || "–"}</td>
                    <td className="p-2 max-w-[320px]">
                      <div className="font-medium">{r.data.falltitel || "(kein Titel)"}</div>
                      <div className="text-[11px] text-muted-foreground line-clamp-2">
                        {r.data.kurzer_sachverhalt}
                      </div>
                      {r.issues.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {r.issues.map((i, k) => (
                            <li
                              key={k}
                              className={
                                i.level === "error"
                                  ? "text-destructive flex items-center gap-1"
                                  : "text-amber-700 flex items-center gap-1"
                              }
                            >
                              {i.level === "error" ? (
                                <XCircle className="h-3 w-3" />
                              ) : (
                                <AlertTriangle className="h-3 w-3" />
                              )}
                              {i.message}
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.duplicate && (
                        <div className="mt-1 flex items-center gap-1 text-amber-700">
                          <SkipForward className="h-3 w-3" />
                          {r.duplicate.kind === "already_imported"
                            ? "Bereits importiert"
                            : r.duplicate.kind === "title"
                              ? "Möglicher Titel-Duplikat"
                              : "Möglicher Kernfrage-Duplikat"}
                          {r.duplicate.ref && (
                            <Link
                              to="/admin/faelle/$id"
                              params={{ id: r.duplicate.ref.id }}
                              className="underline"
                            >
                              öffnen
                            </Link>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2">{r.data.kategorie}</td>
                    <td className="p-2">{r.data.prioritaet || "–"}</td>
                    <td className="p-2">{r.data.status || "draft"}</td>
                    <td className="p-2 min-w-[200px]">
                      <ResultCell rs={rs} onOpen={(id) => navigate({ to: "/admin/faelle/$id", params: { id } })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {rows.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <Sparkles className="mx-auto mb-2 h-5 w-5" />
          Lade eine Excel-Datei (basierend auf der Vorlage) hoch, um zu starten.
        </div>
      )}

      {/* Importhistorie */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4" />
          Letzte Importe
        </h2>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Läufe vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-2">Datei</th>
                  <th className="p-2">Zeitpunkt</th>
                  <th className="p-2">Zeilen</th>
                  <th className="p-2">Erzeugt</th>
                  <th className="p-2">Dubletten</th>
                  <th className="p-2">Fehler</th>
                  <th className="p-2">Bäume</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="p-2 max-w-[240px] truncate" title={h.fileName}>
                      {h.fileName}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(h.completedAt).toLocaleString("de-DE")}
                    </td>
                    <td className="p-2">
                      {h.selectedRows}/{h.totalRows}
                    </td>
                    <td className="p-2 text-emerald-700">{h.generatedCount}</td>
                    <td className="p-2 text-amber-700">{h.duplicateCount}</td>
                    <td className="p-2 text-destructive">{h.errorCount}</td>
                    <td className="p-2">
                      {h.decisionTreeRequested
                        ? `${h.decisionTreeGeneratedCount} (⚠ ${h.decisionTreeWarningCount} · ✕ ${h.decisionTreeErrorCount})`
                        : "–"}
                    </td>
                    <td className="p-2">{h.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Historie lokal im Browser (bis zu {HISTORY_MAX} Läufe, ohne Fallinhalte). Ergebnis-Excel
              kann nur im aktuellen Lauf erneut heruntergeladen werden.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ResultCell({ rs, onOpen }: { rs: RunStatus | undefined; onOpen: (id: string) => void }) {
  if (!rs) return <span className="text-muted-foreground">–</span>;
  const caseNode = (() => {
    switch (rs.caseKind) {
      case "queued":
        return <span className="text-muted-foreground">In Warteschlange</span>;
      case "generating":
        return (
          <span className="flex items-center gap-1 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" /> KI erstellt Entwurf…
          </span>
        );
      case "generated":
      case "generated_with_tasks":
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Entwurf erstellt
              {rs.qualityTasks && rs.qualityTasks > 0 ? (
                <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                  {rs.qualityTasks} Aufgaben
                </span>
              ) : null}
            </div>
            {rs.caseId && (
              <button
                className="inline-flex items-center gap-1 text-[11px] underline"
                onClick={() => onOpen(rs.caseId!)}
              >
                <ExternalLink className="h-3 w-3" /> Fall öffnen
              </button>
            )}
          </div>
        );
      case "duplicate":
        return <span className="text-amber-700">Duplikat: {rs.reason ?? ""}</span>;
      case "skipped":
        return <span className="text-muted-foreground">Übersprungen: {rs.reason ?? ""}</span>;
      case "error":
        return (
          <span className="text-destructive flex items-center gap-1">
            <XCircle className="h-3 w-3" /> {(rs.errorMessage ?? "").slice(0, 120)}
          </span>
        );
    }
  })();

  const treeNode = (() => {
    switch (rs.treeKind) {
      case "not_requested":
        return null;
      case "queued":
        return <span className="text-muted-foreground">Baum: wartet</span>;
      case "generating":
        return (
          <span className="flex items-center gap-1 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" /> Baum wird erstellt…
          </span>
        );
      case "generated":
        return (
          <span className="flex items-center gap-1 text-emerald-700">
            <GitBranch className="h-3 w-3" /> Baum als Entwurf
          </span>
        );
      case "generated_with_warnings":
        return (
          <span className="flex items-center gap-1 text-amber-700">
            <GitBranch className="h-3 w-3" /> Baum-Entwurf ({rs.treeWarningCount ?? 0} Hinweise)
          </span>
        );
      case "invalid":
        return (
          <span className="text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Baum ungültig
          </span>
        );
      case "error":
        return (
          <span className="text-destructive flex items-center gap-1">
            <XCircle className="h-3 w-3" /> Baum-Fehler: {(rs.treeError ?? "").slice(0, 80)}
          </span>
        );
      case "skipped":
        return <span className="text-muted-foreground">Baum übersprungen</span>;
    }
  })();

  return (
    <div className="space-y-1">
      {caseNode}
      {treeNode}
    </div>
  );
}

// ────────────────────────────── Utility: Row → Prompt ──────────────────────────────

function buildDescriptionFromRow(row: RowRaw): string {
  const lines: string[] = [];
  lines.push(`Titel: ${row.falltitel}`);
  lines.push(`Kategorie: ${row.kategorie}`);
  if (row.unterkategorie) lines.push(`Unterkategorie: ${row.unterkategorie}`);
  if (row.schulform) lines.push(`Schulform: ${row.schulform}`);
  if (row.beteiligte) lines.push(`Beteiligte: ${row.beteiligte}`);
  lines.push("");
  lines.push(`Sachverhalt: ${row.kurzer_sachverhalt}`);
  lines.push("");
  lines.push(`Kernfrage: ${row.kernfrage}`);
  if (row.besonderheiten) {
    lines.push("");
    lines.push(`Besonderheiten: ${row.besonderheiten}`);
  }
  if (row.gewuenschte_rechtsgrundlagen) {
    lines.push("");
    lines.push(
      `Hinweis Rechtsgrundlagen (nur redaktioneller Vorschlag, fachliche Prüfung erforderlich): ${row.gewuenschte_rechtsgrundlagen}`,
    );
  }
  if (row.dokumentvorlage) {
    lines.push("");
    lines.push(`Hinweis Dokumentvorlage (nur Vorschlag): ${row.dokumentvorlage}`);
  }
  lines.push("");
  lines.push(
    "WICHTIG: Titel, Kategorie und Sachverhalt sind redaktionelle Vorgaben aus der Excel-Zeile und dürfen nicht verändert werden. Keine zusätzlichen Fälle, Personen, Namen oder Daten erfinden.",
  );
  return lines.join("\n");
}

function parseLegalHints(v: string): string[] {
  if (!v) return [];
  return v
    .split(/[;,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
