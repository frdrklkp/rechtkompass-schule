import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Plus,
  Save,
  Trash2,
  AlertCircle,
  Sparkles,
  BookOpen,
} from "lucide-react";
import {
  getCase,
  createCase,
  updateCase,
  deleteCase,
  listCases,
  listCategories,
  listKeywords,
  listCaseKeywords,
  linkCaseKeyword,
  unlinkCaseKeyword,
  listCaseLegalLinks,
  listSections,
  listSources,
  listTemplates,
  createLegalLink,
  deleteLegalLink,
  STATUS_LABELS,
} from "@/lib/coreBuilder";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState } from "@/components/DataStates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AiReviewDialog } from "@/components/AiReviewDialog";
import { SuggestionPanel } from "@/components/SuggestionPanel";
import { LegalMatchSuggestions } from "@/components/LegalMatchSuggestions";
import { LegalAssignmentDialog } from "@/components/LegalAssignmentDialog";
import { KeywordAssignmentDialog } from "@/components/KeywordAssignmentDialog";
import { CaseNetworkingDialog } from "@/components/CaseNetworkingDialog";
import { TemplateAssignmentDialog } from "@/components/TemplateAssignmentDialog";
import { CaseDocumentsPanel } from "@/components/CaseDocumentsPanel";
import { DecisionTreeAdminEditor } from "@/components/DecisionTreeAdminEditor";
import { MatchingProfilePanel } from "@/components/matching/MatchingProfilePanel";
import { mapDbCase } from "@/lib/casesFromDb";

import { useKnowledgeIndex } from "@/lib/knowledgeIndex";
import { countBullets } from "@/lib/caseCompleteness";

export const Route = createFileRoute("/admin/faelle/$id")({
  component: PracticeCaseWizard,
});

type FaqItem = { q: string; a: string };

type DbErrorDetails = {
  table?: string;
  filter?: Record<string, unknown>;
  message: string;
  code?: string | null;
  rows?: number;
};

type SaveDiag = {
  op: "insert" | "update";
  id: string | null;
  status: string;
  error?: string | null;
  count?: number | null;
  at: Date;
};

export type SectionEditStatus =
  | "empty"
  | "ai_suggested"
  | "editorial"
  | "reviewed"
  | "published";

export const SECTION_STATUS_LABELS: Record<SectionEditStatus, string> = {
  empty: "Leer",
  ai_suggested: "KI vorgeschlagen",
  editorial: "Redaktion bearbeitet",
  reviewed: "Fachlich geprüft",
  published: "Veröffentlicht",
};

export const SECTION_STATUS_TONE: Record<SectionEditStatus, string> = {
  empty: "bg-muted text-muted-foreground border-border",
  ai_suggested: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/40",
  editorial: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/40",
  reviewed: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40",
  published: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
};

export type AiMetadata = {
  used?: boolean;
  model?: string;
  prompt_version?: string;
  created_at?: string;
  last_assist_at?: string;
  reviewed_by?: string;
  released_at?: string;
};

type Meta = {
  bildungsgang?: string;
  zielgruppe?: string;
  schwierigkeit?: "leicht" | "mittel" | "komplex" | "";
  bearbeitungsdauer?: string;
  template_ids?: string[];
  risks?: string[];
  faq_items?: FaqItem[];
  keyword_hints?: string[];
  template_hints?: string[];
  legal_hints?: string[];
  related_hints?: string[];
  section_status?: Partial<Record<string, SectionEditStatus>>;
  ai?: AiMetadata;
};


type FormState = {
  title: string;
  short_description: string;
  category: string;
  subcategory: string;
  ampel: "gruen" | "gelb" | "rot";
  status: "draft" | "review" | "published" | "archived";
  short_answer: string;
  immediate_actions: string;
  recommendation: string;
  legal_explanation: string;
  responsibilities: string;
  practice_tip: string;
  checklist: string[];
  documentation: string[];
  common_mistakes: string[];
  meta: Meta;
};

const empty: FormState = {
  title: "",
  short_description: "",
  category: "",
  subcategory: "",
  ampel: "gruen",
  status: "draft",
  short_answer: "",
  immediate_actions: "",
  recommendation: "",
  legal_explanation: "",
  responsibilities: "",
  practice_tip: "",
  checklist: [],
  documentation: [],
  common_mistakes: [],
  meta: {
    bildungsgang: "",
    zielgruppe: "",
    schwierigkeit: "",
    bearbeitungsdauer: "",
    template_ids: [],
    risks: [],
    faq_items: [],
    keyword_hints: [],
    template_hints: [],
    legal_hints: [],
    related_hints: [],
    section_status: {},
    ai: { used: false },
  },
};

const SAMPLE_CASE: FormState = {
  title: "Schüler filmt Lehrkraft",
  short_description:
    "Ein Schüler filmt während des Unterrichts heimlich die Lehrkraft mit dem Smartphone. Die Aufnahme wird kurz darauf in einer Klassen-Chatgruppe geteilt.",
  category: "Digitale Medien",
  subcategory: "Bild- und Tonaufnahmen im Unterricht",
  ampel: "gelb",
  status: "draft",
  short_answer:
    "Aufnahme sofort unterbinden, Gerät nicht eigenmächtig durchsuchen, Vorfall sachlich dokumentieren und die Schulleitung sowie – bei Minderjährigen – die Eltern zeitnah informieren.",
  immediate_actions:
    "1. Ruhig und sachlich intervenieren, die Aufnahme sofort beenden lassen.\n2. Gerät ausschließlich zur Beweissicherung einziehen (Sichtverwahrung), nicht durchsuchen, nicht entsperren.\n3. Löschung der Aufnahme nur in Anwesenheit der Schüler:in bzw. nach Rücksprache mit der Schulleitung fordern.\n4. Kurznotiz zum Vorfall noch in derselben Stunde anfertigen (Zeit, Ort, Beteiligte, Zeug:innen).\n5. Klassenleitung informieren, bei Verbreitung im Chat unverzüglich Schulleitung einbinden.",
  recommendation:
    "Der Fall ist regelmäßig ein Verstoß gegen das Recht am eigenen Bild (§ 22 KunstUrhG) und ggf. gegen § 201a StGB. Handeln Sie in vier Stufen: (1) Deeskalation und Sicherung, (2) Anhörung der Schüler:in nach § 28 VwVfG NRW, (3) Prüfung erzieherischer Einwirkungen bzw. Ordnungsmaßnahmen nach § 53 SchulG NRW, (4) bei Verbreitung Prüfung einer Strafanzeige durch die Schulleitung. Eltern bzw. Ausbildungsbetrieb sind schriftlich zu informieren. Der Vorfall wird ausschließlich über dienstliche Kanäle kommuniziert.",
  legal_explanation:
    "Aufnahmen von Personen ohne deren Einwilligung greifen in das allgemeine Persönlichkeitsrecht (Art. 2 Abs. 1 i. V. m. Art. 1 Abs. 1 GG) und in das Recht am eigenen Bild ein. Erfolgt die Aufnahme in einem geschützten Raum wie dem Klassenzimmer, kommt § 201a StGB in Betracht. Die Verbreitung – insbesondere in Chatgruppen – erhöht Eingriffstiefe und Sanktionsrelevanz erheblich. Schulische Reaktionen bewegen sich im Rahmen von § 53 SchulG NRW; datenschutzrechtlich gelten DSGVO und DSG NRW.",
  responsibilities:
    "Lehrkraft (Sofortreaktion & Dokumentation) · Klassenleitung (Information & Elterngespräch) · Schulleitung (Ordnungsmaßnahmen, ggf. Strafanzeige, externe Kommunikation) · Datenschutzbeauftragte:r (bei Verbreitung personenbezogener Daten)",
  practice_tip:
    "Sprechen Sie das Thema Bild- und Tonaufnahmen einmal pro Halbjahr aktiv in der Klasse an und lassen Sie die Regelung zur Handynutzung im Klassenbuch dokumentieren. Das erleichtert spätere Anhörungen und stärkt die Verhältnismäßigkeit jeder Maßnahme.",
  checklist: [
    "Aufnahme sofort beenden lassen",
    "Gerät zur Sichtverwahrung einziehen (nicht durchsuchen)",
    "Zeug:innen namentlich notieren",
    "Aktennotiz mit Zeit, Ort, Beteiligten anlegen",
    "Anhörung der Schüler:in nach § 28 VwVfG NRW",
    "Klassenleitung und Schulleitung informieren",
    "Eltern / Ausbildungsbetrieb schriftlich informieren",
    "Verbreitung im Chat prüfen – ggf. Anzeige über Schulleitung",
    "Löschung der Aufnahme dokumentieren",
  ],
  documentation: [
    "Aktennotiz mit Datum, Uhrzeit, Ort und beteiligten Personen",
    "Anhörungsprotokoll der betroffenen Schüler:in (§ 28 VwVfG NRW)",
    "Gesprächsnotiz mit Erziehungsberechtigten bzw. Ausbildungsbetrieb",
    "Meldung an die Schulleitung (bei Verbreitung zwingend schriftlich)",
    "Vermerk über Rückgabe des Geräts und dokumentierte Löschung",
  ],
  common_mistakes: [
    "Gerät eigenmächtig entsperren oder Inhalte sichten",
    "Aufnahme selbst löschen, ohne Beweissicherung",
    "Kommunikation über private WhatsApp- oder Mail-Accounts",
    "Wertende Formulierungen („frech“, „provokant“) in der Aktennotiz",
    "Verzicht auf Anhörung vor belastenden Maßnahmen",
    "Eltern / Ausbildungsbetrieb erst nach Tagen informieren",
    "Screenshots aus dem Chat ohne Rechtsgrundlage weiterverbreiten",
  ],
  meta: {
    bildungsgang: "Berufsschule / Berufskolleg",
    zielgruppe: "Lehrkräfte, Klassenleitungen, Schulleitung",
    schwierigkeit: "mittel",
    bearbeitungsdauer: "10–15 Minuten",
    template_ids: [],
    risks: [
      "Persönlichkeitsrechtsverletzung der Lehrkraft und Dritter",
      "Strafrechtliche Relevanz nach § 201a StGB bei Aufnahme im geschützten Raum",
      "Datenschutzverstoß bei Verbreitung (DSGVO, DSG NRW)",
      "Reputationsschaden für Schule und Betroffene",
      "Rechtswidrige Beweiserhebung, wenn Gerät ohne Rechtsgrundlage durchsucht wird",
      "Eskalation im Klassenchat bei zu spätem Eingreifen",
    ],
    faq_items: [
      { q: "Darf ich das Smartphone der Schüler:in einziehen?", a: "Ja, zur kurzfristigen Sichtverwahrung als Ordnungsmaßnahme nach § 53 SchulG NRW. Das Gerät darf jedoch nicht entsperrt, durchsucht oder inhaltlich ausgewertet werden." },
      { q: "Darf ich die Aufnahme sofort löschen lassen?", a: "Nur in Anwesenheit der Schüler:in und – bei Verbreitung – nach Rücksprache mit der Schulleitung. Eine eigenmächtige Löschung durch die Lehrkraft ist rechtlich problematisch." },
      { q: "Muss ich die Eltern informieren?", a: "Bei minderjährigen Schüler:innen ist die Information der Erziehungsberechtigten die Regel. Bei volljährigen Auszubildenden erfolgt die Information des Betriebs nur, wenn die Ausbildung berührt ist." },
      { q: "Wann ist eine Strafanzeige sinnvoll?", a: "Bei Verbreitung der Aufnahme oder Verdacht auf § 201a StGB. Die Entscheidung trifft grundsätzlich die Schulleitung; die Lehrkraft dokumentiert und meldet." },
      { q: "Welche Rechtsgrundlage schützt die Lehrkraft?", a: "Insbesondere das allgemeine Persönlichkeitsrecht (Art. 2 Abs. 1 i. V. m. Art. 1 Abs. 1 GG), § 22 KunstUrhG und § 201a StGB." },
      { q: "Muss ich vor einer Ordnungsmaßnahme eine Anhörung durchführen?", a: "Ja. Vor jeder belastenden Maßnahme ist der/die Betroffene nach § 28 VwVfG NRW anzuhören und die Anhörung ist zu dokumentieren." },
      { q: "Darf ich Screenshots aus dem Klassenchat als Beweis nutzen?", a: "Nur eingeschränkt. Screenshots sollten ausschließlich zur internen Dokumentation dienen und nicht weiterverbreitet werden. Datenschutzrechtliche Vorgaben sind zu beachten." },
      { q: "Wie dokumentiere ich rechtssicher?", a: "Sachlich, chronologisch, ohne Wertung. Zeit, Ort, Beteiligte, Beobachtung, ergriffene Maßnahme und Begründung der Verhältnismäßigkeit gehören in jede Aktennotiz." },
      { q: "Wer entscheidet über weitergehende Ordnungsmaßnahmen?", a: "Über Ordnungsmaßnahmen nach § 53 Abs. 3 SchulG NRW entscheidet die Klassenkonferenz bzw. die Schulleitung – nicht die einzelne Lehrkraft." },
      { q: "Wie verhalte ich mich, wenn die Schüler:in die Herausgabe verweigert?", a: "Kein körperlicher Zugriff. Vorfall dokumentieren, Schulleitung sofort informieren, ggf. Erziehungsberechtigte hinzuziehen. Bei akuter Gefahr Polizei über die Schulleitung." },
      { q: "Darf ich in der Klasse öffentlich über den Fall sprechen?", a: "Nein. Personenbezogene Details bleiben vertraulich. Eine allgemeine Regelklärung ohne Namen ist möglich und pädagogisch sinnvoll." },
      { q: "Wie lange sind die Unterlagen aufzubewahren?", a: "Gemäß den Aufbewahrungsfristen für Schulunterlagen (Verwaltungsvorschriften NRW). Nach Fristablauf sind personenbezogene Daten datenschutzkonform zu löschen." },
    ],
    keyword_hints: [
      "Handynutzung", "Bildrechte", "Persönlichkeitsrecht", "Cybermobbing",
      "Datenschutz", "Ordnungsmaßnahme", "Anhörung", "Klassenchat",
    ],
    template_hints: [
      "Aktennotiz",
      "Anhörungsprotokoll § 28 VwVfG NRW",
      "Elternbrief / Betriebsinformation",
      "Meldung an die Schulleitung",
    ],
    legal_hints: [
      "§ 22 KunstUrhG – Recht am eigenen Bild",
      "§ 201a StGB – Verletzung des höchstpersönlichen Lebensbereichs durch Bildaufnahmen",
      "Art. 2 Abs. 1 i. V. m. Art. 1 Abs. 1 GG – Allgemeines Persönlichkeitsrecht",
      "§ 53 SchulG NRW – Erzieherische Einwirkungen und Ordnungsmaßnahmen",
      "§ 28 VwVfG NRW – Anhörung Beteiligter",
      "DSGVO / DSG NRW – Verarbeitung personenbezogener Daten",
    ],
    related_hints: [
      "Beleidigung im Klassenchat",
      "Cybermobbing unter Schüler:innen",
      "Weitergabe von Prüfungsunterlagen per Messenger",
      "Heimliche Tonaufnahme im Lehrerzimmer",
      "Deepfake / manipulierte Aufnahmen von Lehrkräften",
    ],
  },
};

const STEPS = [
  { key: "stamm", label: "Stammdaten" },
  { key: "situation", label: "Situationsbeschreibung" },
  { key: "sofort", label: "Sofortentscheidung" },
  { key: "handlung", label: "Handlungsempfehlung" },
  { key: "doku", label: "Dokumentation" },
  { key: "recht", label: "Rechtsgrundlagen" },
  { key: "vorlagen", label: "Dokumentvorlagen" },
  { key: "schlag", label: "Schlagwörter" },
  { key: "matching", label: "Matching-Profil" },
  { key: "qs", label: "Qualitätsprüfung" },
  { key: "publish", label: "Veröffentlichen" },
] as const;

function ListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={v}
            placeholder={placeholder}
            onChange={(e) => {
              const next = values.slice();
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ""])}>
        <Plus className="h-4 w-4" /> Eintrag
      </Button>
    </div>
  );
}

function extractMeta(faq: unknown): Meta {
  if (faq && typeof faq === "object" && !Array.isArray(faq)) {
    const m = (faq as { meta?: Meta }).meta;
    if (m && typeof m === "object") return { ...empty.meta, ...m };
  }
  return { ...empty.meta };
}

function toPayload(form: FormState) {
  const { meta, ...rest } = form;
  return {
    ...rest,
    faq: { meta } as unknown as import("@/integrations/supabase/types").Json,
  };
}

function toDbErrorDetails(error: unknown): DbErrorDetails {
  const e = error as Partial<DbErrorDetails> & { message?: string };
  return {
    table: e.table,
    filter: e.filter,
    message: e.message ?? "Unbekannter Supabase-Fehler",
    code: e.code,
    rows: e.rows,
  };
}

function DbErrorNotice({ error }: { error: DbErrorDetails | null }) {
  if (!error) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <AlertCircle className="h-3.5 w-3.5" /> Supabase-Speicherfehler
      </div>
      <dl className="grid gap-1 text-[11px] sm:grid-cols-[130px_1fr]">
        <dt className="font-medium text-foreground">Tabelle</dt>
        <dd>{error.table ?? "—"}</dd>
        <dt className="font-medium text-foreground">Filter</dt>
        <dd className="break-all font-mono">{error.filter ? JSON.stringify(error.filter) : "—"}</dd>
        <dt className="font-medium text-foreground">Fehler</dt>
        <dd>{error.message}</dd>
        <dt className="font-medium text-foreground">Code</dt>
        <dd>{error.code ?? "—"}</dd>
        {typeof error.rows === "number" && (
          <>
            <dt className="font-medium text-foreground">Datensätze</dt>
            <dd>{error.rows}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export function PracticeCaseWizard({ forcedId }: { forcedId?: string } = {}) {
  const params = useParams({ strict: false }) as { id?: string };
  const id = forcedId ?? params.id ?? "neu";
  const isNew = id === "neu";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ki = useKnowledgeIndex();

  const caseQ = useQuery({
    queryKey: ["admin", "case", id],
    queryFn: () => getCase(id),
    enabled: !isNew,
  });
  const catsQ = useQuery({ queryKey: ["admin", "categories"], queryFn: listCategories });
  const keywordsQ = useQuery({ queryKey: ["admin", "keywords"], queryFn: listKeywords });
  const templatesQ = useQuery({ queryKey: ["admin", "templates"], queryFn: listTemplates });
  const caseKwQ = useQuery({
    queryKey: ["admin", "case-keywords", id],
    queryFn: () => listCaseKeywords(id),
    enabled: !isNew,
  });
  const sectionsQ = useQuery({ queryKey: ["admin", "sections"], queryFn: listSections });
  const sourcesQ = useQuery({ queryKey: ["admin", "sources"], queryFn: listSources });
  const linksQ = useQuery({
    queryKey: ["admin", "case-links", id],
    queryFn: () => listCaseLegalLinks(id),
    enabled: !isNew,
  });

  const [form, setForm] = useState<FormState>(empty);
  const [step, setStep] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<DbErrorDetails | null>(null);
  const [saveDiag, setSaveDiag] = useState<SaveDiag | null>(null);
  const [saving, setSaving] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!isNew && caseQ.data && !hydrated.current) {
      hydrated.current = true;
      setForm({
        title: caseQ.data.title ?? "",
        short_description: caseQ.data.short_description ?? "",
        category: caseQ.data.category ?? "",
        subcategory: caseQ.data.subcategory ?? "",
        ampel: caseQ.data.ampel,
        status: caseQ.data.status,
        short_answer: caseQ.data.short_answer ?? "",
        immediate_actions: caseQ.data.immediate_actions ?? "",
        recommendation: caseQ.data.recommendation ?? "",
        legal_explanation: caseQ.data.legal_explanation ?? "",
        responsibilities: caseQ.data.responsibilities ?? "",
        practice_tip: caseQ.data.practice_tip ?? "",
        checklist: caseQ.data.checklist ?? [],
        documentation: caseQ.data.documentation ?? [],
        common_mistakes: caseQ.data.common_mistakes ?? [],
        meta: extractMeta(caseQ.data.faq),
      });
    }
  }, [isNew, caseQ.data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Auto-save with debounce
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = async (overrides?: Partial<FormState>): Promise<string | null> => {
    const effective: FormState = { ...form, ...(overrides ?? {}) };
    if (overrides) setForm(effective);
    if (!effective.title.trim()) return null;
    setSaving(true);
    setSaveError(null);
    try {
      let savedId: string | null = null;
      let op: "insert" | "update";
      if (isNew) {
        op = "insert";
        const row = await createCase(toPayload(effective));
        savedId = row?.id ?? null;
        if (savedId) setSavedId(savedId);
      } else {
        op = "update";
        await updateCase(id, toPayload(effective));
        savedId = id;
        setSavedId(id);
      }
      setSavedAt(new Date());
      qc.invalidateQueries({ queryKey: ["admin", "cases"] });
      qc.invalidateQueries({ queryKey: ["admin", "case", savedId] });
      // Lehrer-App-Caches ebenfalls invalidieren, damit Do's / Don'ts
      // (practice_tip / common_mistakes) sofort neu geladen werden.
      qc.invalidateQueries({ queryKey: ["published-cases"] });
      qc.invalidateQueries({ queryKey: ["case-full", savedId] });

      // Post-save diagnostic: count rows
      let count: number | null = null;
      try {
        const rows = await listCases();
        count = rows.length;
      } catch { /* ignore */ }
      setSaveDiag({ op, id: savedId, status: effective.status, count, at: new Date() });
      setSaving(false);
      if (isNew && savedId) {
        navigate({ to: "/admin/faelle/$id", params: { id: savedId }, replace: true });
      }
      return savedId;
    } catch (e) {
      setSaving(false);
      const details = toDbErrorDetails(e);
      setSaveError(details);
      setSaveDiag({
        op: isNew ? "insert" : "update",
        id: isNew ? null : id,
        status: effective.status,
        error: details.message,
        at: new Date(),
      });
      return null;
    }
  };

  // Debounced autosave on form change (only for existing rows)
  useEffect(() => {
    if (isNew) return;
    if (!hydrated.current) return;
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist();
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const [savedId, setSavedId] = useState<string | null>(isNew ? null : id);
  const [deleteDiag, setDeleteDiag] = useState<{ id: string; ok: boolean; error?: string; at: Date } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deletableId = savedId ?? (isNew ? null : id);
  const deleteDisabledReason = !deletableId
    ? "Noch nicht gespeichert – ID fehlt"
    : null;
  const deleteMut = useMutation({
    mutationFn: (targetId: string) => deleteCase(targetId),
    onSuccess: (_data, targetId) => {
      setDeleteDiag({ id: targetId, ok: true, at: new Date() });
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Praxisfall gelöscht.");
      navigate({ to: "/admin/faelle" });
    },
    onError: (error, targetId) => {
      const details = toDbErrorDetails(error);
      setDeleteDiag({ id: targetId, ok: false, error: details.message, at: new Date() });
      toast.error("Löschen fehlgeschlagen: " + details.message);
    },
  });

  const addKwMut = useMutation({
    mutationFn: (kwId: string) => linkCaseKeyword(id, kwId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "case-keywords", id] }),
    onError: (error) => setSaveError(toDbErrorDetails(error)),
  });
  const removeKwMut = useMutation({
    mutationFn: (kwId: string) => unlinkCaseKeyword(id, kwId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "case-keywords", id] }),
    onError: (error) => setSaveError(toDbErrorDetails(error)),
  });

  const [newLinkSection, setNewLinkSection] = useState("");
  const [newLinkNote, setNewLinkNote] = useState("");
  const [legalDialogOpen, setLegalDialogOpen] = useState(false);
  const [keywordDialogOpen, setKeywordDialogOpen] = useState(false);
  const [networkDialogOpen, setNetworkDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const addLinkMut = useMutation({
    mutationFn: () => createLegalLink(id, newLinkSection, newLinkNote),
    onSuccess: () => {
      setNewLinkSection("");
      setNewLinkNote("");
      qc.invalidateQueries({ queryKey: ["admin", "case-links", id] });
    },
    onError: (error) => setSaveError(toDbErrorDetails(error)),
  });
  const removeLinkMut = useMutation({
    mutationFn: (linkId: string) => deleteLegalLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "case-links", id] }),
    onError: (error) => setSaveError(toDbErrorDetails(error)),
  });

  const canGoNext = useMemo(() => {
    if (step === 0) return form.title.trim().length > 0;
    return true;
  }, [step, form.title]);

  const goNext = async () => {
    // On step 0, ensure draft exists
    if (isNew && step === 0) {
      const newId = await persist();
      if (!newId) return;
      // After navigation the component will remount; step preserved via query? Simplest: keep in memory won't survive. Rely on landing on the newly created id and starting from step 1 via URL?
      // We'll rely on component remount; user is now editing the created case starting again at step 0. Instead, before navigating, we set a session flag.
      sessionStorage.setItem(`wizard-step-${newId}`, "1");
      return;
    }
    // For existing rows, force flush save first
    if (!isNew) await persist();
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  // Restore wizard step from session after creation
  useEffect(() => {
    if (isNew) return;
    const key = `wizard-step-${id}`;
    const v = sessionStorage.getItem(key);
    if (v) {
      setStep(parseInt(v, 10) || 0);
      sessionStorage.removeItem(key);
    }
  }, [id, isNew]);

  if (!isNew && caseQ.isLoading) return <LoadingState />;
  if (!isNew && caseQ.error) return <ErrorState error={caseQ.error} />;
  if (!isNew && !caseQ.data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Praxisfall nicht gefunden.</p>
        <Link
          to="/admin/faelle"
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          ← zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const linksCount = (linksQ.data ?? []).length;
  const kwCount = (caseKwQ.data ?? []).length;
  const tmplCount = form.meta.template_ids?.length ?? 0;
  const queryError = [
    caseQ.error,
    catsQ.error,
    keywordsQ.error,
    templatesQ.error,
    caseKwQ.error,
    sectionsQ.error,
    sourcesQ.error,
    linksQ.error,
  ].find(Boolean);
  const visibleDbError = saveError ?? (queryError ? toDbErrorDetails(queryError) : null);

  const doCount = countBullets(form.practice_tip);
  const qsChecks = [
    { label: "Titel vorhanden", ok: !!form.title.trim(), step: 0 },
    { label: "Kategorie gewählt", ok: !!form.category.trim(), step: 0 },
    { label: "Kurzbeschreibung", ok: !!form.short_description.trim(), step: 1 },
    { label: "Sofortentscheidung / Kurzantwort", ok: !!form.short_answer.trim(), step: 2 },
    { label: "Handlungsempfehlung", ok: !!form.recommendation.trim(), step: 3 },
    { label: "Mind. 5 konkrete fallbezogene Do's", ok: doCount >= 5, step: 3 },
    { label: "Dokumentation dokumentiert", ok: form.documentation.length > 0, step: 4 },
    { label: "Mindestens eine Rechtsgrundlage verknüpft", ok: linksCount > 0, step: 5 },
  ];
  const qsPassed = qsChecks.filter((c) => c.ok).length;

  // Kuratiertes Matching-Profil liegt als Zusatzschlüssel in faq.meta.
  const hasCuratedMatchingProfile = !!(form.meta as Record<string, unknown>).matching_profile;



  // ---------- Schritt-Status (🟢🟡🔴) ----------
  type StepStatus = "full" | "partial" | "missing";
  const stepStatuses: StepStatus[] = STEPS.map((_, i) => {
    switch (i) {
      case 0: {
        const req = [form.title, form.category];
        const opt = [
          form.subcategory,
          form.meta.bildungsgang,
          form.meta.zielgruppe,
          form.meta.schwierigkeit,
          form.meta.bearbeitungsdauer,
        ];
        const r = req.filter((x) => (x ?? "").toString().trim()).length;
        const o = opt.filter((x) => (x ?? "").toString().trim()).length;
        if (r === 0) return "missing";
        if (r === req.length && o >= 3) return "full";
        return "partial";
      }
      case 1: {
        const a = form.short_description.trim().length > 0;
        const b = form.legal_explanation.trim().length > 40;
        return a && b ? "full" : a || b ? "partial" : "missing";
      }
      case 2: {
        const a = form.short_answer.trim().length > 0;
        const b = form.immediate_actions.trim().length > 0;
        return a && b ? "full" : a || b ? "partial" : "missing";
      }
      case 3: {
        const parts = [
          form.recommendation.trim().length > 0,
          form.responsibilities.trim().length > 0,
          form.checklist.filter((x) => x.trim()).length >= 3,
          doCount >= 5,
        ];
        const n = parts.filter(Boolean).length;
        if (n === 0) return "missing";
        if (n >= 3 && doCount >= 5) return "full";
        return "partial";
      }
      case 4: {
        const a = form.documentation.filter((x) => x.trim()).length > 0;
        const b = form.common_mistakes.filter((x) => x.trim()).length > 0;
        return a && b ? "full" : a || b ? "partial" : "missing";
      }
      case 5:
        return linksCount >= 2 ? "full" : linksCount === 1 ? "partial" : "missing";
      case 6:
        return tmplCount >= 2 ? "full" : tmplCount === 1 ? "partial" : "missing";
      case 7:
        return kwCount >= 3 ? "full" : kwCount >= 1 ? "partial" : "missing";
      case 8:
        return hasCuratedMatchingProfile
          ? "full"
          : form.category.trim() || kwCount > 0
            ? "partial"
            : "missing";
      case 9:
        return qsPassed === qsChecks.length
          ? "full"
          : qsPassed >= Math.ceil(qsChecks.length / 2)
            ? "partial"
            : "missing";
      case 10:
        return form.status === "published"
          ? "full"
          : form.status === "review"
            ? "partial"
            : "missing";
      default:
        return "missing";
    }
  });

  const fullCount = stepStatuses.filter((s) => s === "full").length;
  const partialCount = stepStatuses.filter((s) => s === "partial").length;
  const missingCount = stepStatuses.filter((s) => s === "missing").length;
  const completion = Math.round(
    ((fullCount + partialCount * 0.5) / STEPS.length) * 100,
  );

  // ---------- Qualitätsbewertung (0–5 Sterne) ----------
  const qualityCriteria = [
    {
      label: "Vollständigkeit",
      score: fullCount / STEPS.length,
      step: Math.max(0, stepStatuses.findIndex((s) => s !== "full")),
    },
    {
      label: "Verständlichkeit",
      score: Math.min(
        1,
        (form.short_description.trim().length + form.short_answer.trim().length) / 220,
      ),
      step: form.short_description.trim().length < 60 ? 1 : 2,
    },
    { label: "Rechtsgrundlagen", score: Math.min(1, linksCount / 2), step: 5 },
    {
      label: "Dokumentation",
      score: Math.min(1, form.documentation.filter((x) => x.trim()).length / 2),
      step: 4,
    },
    {
      label: "Checkliste",
      score: Math.min(1, form.checklist.filter((x) => x.trim()).length / 4),
      step: 3,
    },
    { label: "Schlagwörter", score: Math.min(1, kwCount / 3), step: 7 },
    { label: "Dokumentvorlagen", score: Math.min(1, tmplCount / 2), step: 6 },
    {
      label: "FAQ / Häufige Fehler",
      score: Math.min(1, form.common_mistakes.filter((x) => x.trim()).length / 3),
      step: 4,
    },
  ];
  const qualityScore =
    qualityCriteria.reduce((s, c) => s + c.score, 0) / qualityCriteria.length;
  const stars = Math.round(qualityScore * 5);
  const missingCriteria = qualityCriteria.filter((c) => c.score < 1);

  const statusIcon = (s: StepStatus) =>
    s === "full" ? "🟢" : s === "partial" ? "🟡" : "🔴";
  const publishBadge =
    form.status === "published"
      ? { label: "Veröffentlicht", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40" }
      : form.status === "review"
        ? { label: "In Prüfung", cls: "bg-amber-500/10 text-amber-700 border-amber-500/40" }
        : form.status === "archived"
          ? { label: "Archiviert", cls: "bg-muted text-muted-foreground border-border" }
          : { label: "Entwurf", cls: "bg-sky-500/10 text-sky-700 border-sky-500/40" };

  const [aiBusy, setAiBusy] = useState(false);
  const [aiStep, setAiStep] = useState<string>("");
  const [aiDraft, setAiDraft] = useState<import("@/components/AiReviewDialog").AiDraft | null>(null);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiCatalog, setAiCatalog] = useState<{
    keywords: Array<{ id: string; label: string }>;
    templates: Array<{ id: string; label: string }>;
    sections: Array<{ id: string; label: string }>;
  }>({ keywords: [], templates: [], sections: [] });

  const runAiSuggest = async () => {
    const title = form.title.trim();
    if (title.length < 3) {
      toast.error("Bitte zuerst einen Titel angeben (mind. 3 Zeichen).");
      return;
    }
    setAiBusy(true);
    try {
      setAiStep("Lade Wissensbasis …");
      const [cats, kws, tmpls, secs, allCases] = await Promise.all([
        catsQ.data ? Promise.resolve(catsQ.data) : listCategories(),
        keywordsQ.data ? Promise.resolve(keywordsQ.data) : listKeywords(),
        templatesQ.data ? Promise.resolve(templatesQ.data) : listTemplates(),
        sectionsQ.data ? Promise.resolve(sectionsQ.data) : listSections(),
        listCases(),
      ]);
      const publishedSecs = (secs as Array<Record<string, unknown>>).filter(
        (s) => (s.status ?? "published") === "published" || s.status === undefined,
      );
      const publishedCases = (allCases as Array<Record<string, unknown>>).filter(
        (c) => c.status === "published" && c.id !== id,
      );

      const desc = form.short_description.trim();
      const description = [
        `Titel: ${title}`,
        form.category ? `Kategorie: ${form.category}` : "",
        form.subcategory ? `Unterkategorie: ${form.subcategory}` : "",
        form.meta.bildungsgang ? `Bildungsbereich: ${form.meta.bildungsgang}` : "",
        form.meta.zielgruppe ? `Zielgruppe: ${form.meta.zielgruppe}` : "",
        "",
        desc ? "Sachverhalt:" : "Hinweis: Nur Titel vorhanden – bitte semantisch ableiten.",
        desc,
      ]
        .filter(Boolean)
        .join("\n");

      const kwCatalog = kws.map((k) => ({ id: k.id, label: k.keyword }));
      const tmplCatalog = tmpls.map((t) => ({ id: t.id, label: t.title }));
      const secCatalog = publishedSecs.map((s) => ({
        id: s.id as string,
        label: `${(s as { legal_sources?: { name?: string } }).legal_sources?.name ?? ""} ${(s.section_number as string) ?? ""} ${(s.title as string) ?? ""}`.trim(),
      }));

      setAiStep("KI erzeugt Vorschläge …");
      const res = await fetch("/api/ai-draft-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          categories: cats.map((c) => c.name),
          keywords: kws.map((k) => k.keyword),
          templates: tmplCatalog,
          sections: secCatalog,
          cases: publishedCases.map((c) => ({
            id: c.id as string,
            label: (c.title as string) ?? "",
            category: (c.category as string) ?? undefined,
          })),
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `AI-Anfrage fehlgeschlagen (${res.status})`);
      }
      const { draft } = (await res.json()) as {
        draft: import("@/components/AiReviewDialog").AiDraft;
      };

      setAiCatalog({ keywords: kwCatalog, templates: tmplCatalog, sections: secCatalog });
      setAiDraft(draft);
      setAiReviewOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("KI-Vorschläge fehlgeschlagen: " + msg);
    } finally {
      setAiBusy(false);
      setAiStep("");
    }
  };

  const applyAiApproved = async (
    result: import("@/components/AiReviewDialog").AiApprovedResult,
  ) => {
    setForm((p) => {
      // Never overwrite existing values – accept only if empty (double safety).
      const nextText = (cur: string, k: string) =>
        cur.trim() ? cur : (result.text[k] ?? "").trim();
      const nextList = (cur: string[], k: string) =>
        cur.filter((x) => x.trim()).length ? cur : (result.list[k] ?? []).filter(Boolean);
      return {
        ...p,
        short_description: nextText(p.short_description, "short_description"),
        short_answer: nextText(p.short_answer, "short_answer"),
        immediate_actions: nextText(p.immediate_actions, "immediate_actions"),
        recommendation: nextText(p.recommendation, "recommendation"),
        practice_tip: nextText(p.practice_tip, "practice_tip"),
        legal_explanation: nextText(p.legal_explanation, "legal_explanation"),
        responsibilities: nextText(p.responsibilities, "responsibilities"),
        common_mistakes: nextList(p.common_mistakes, "common_mistakes"),
        checklist: nextList(p.checklist, "checklist"),
        documentation: nextList(p.documentation, "documentation"),
        meta: {
          ...p.meta,
          template_ids: Array.from(
            new Set([...(p.meta.template_ids ?? []), ...result.templateIds]),
          ),
          keyword_hints: Array.from(
            new Set([...(p.meta.keyword_hints ?? []), ...result.keywordHints]),
          ),
          related_hints: Array.from(
            new Set([...(p.meta.related_hints ?? []), ...result.relatedHints]),
          ),
          faq_items:
            (p.meta.faq_items ?? []).length > 0 || !result.faq
              ? p.meta.faq_items
              : result.faq,
          ai: {
            ...(p.meta.ai ?? {}),
            used: true,
            model: p.meta.ai?.model || "anthropic/claude-haiku-4-5",
            last_assist_at: new Date().toISOString(),
            created_at: p.meta.ai?.created_at ?? new Date().toISOString(),
          },
        },
      };
    });

    if (!isNew) {
      try {
        const existingKw = new Set((caseKwQ.data ?? []).map((k) => k.keyword_id));
        for (const kid of result.keywordIds) {
          if (existingKw.has(kid)) continue;
          try {
            await linkCaseKeyword(id, kid);
          } catch {
            /* ignore duplicates */
          }
        }
        // Rechtsgrundlagen werden zentral über die Pipeline zugeordnet
        // (Legal-Matching-Engine, § 53-Guard, Re-Evaluierung). Kein Direkt-Insert.
        try {
          const { completePracticeCase } = await import("@/lib/casePipeline.completion");
          await completePracticeCase(id, { source: "manual" });
        } catch (e) {
          console.warn("[ai] pipeline nach KI-Freigabe fehlgeschlagen", e);
        }

        qc.invalidateQueries({ queryKey: ["admin", "case-keywords", id] });
        qc.invalidateQueries({ queryKey: ["admin", "case-links", id] });
      } catch (e) {
        console.warn("[ai] link persistence failed", e);
      }
    }

    const parts: string[] = [];
    parts.push(`${result.counts.fields} Felder`);
    if (result.counts.sections) parts.push(`${result.counts.sections} Rechtsgrundlagen`);
    if (result.counts.templates) parts.push(`${result.counts.templates} Dokumentvorlagen`);
    if (result.counts.keywords) parts.push(`${result.counts.keywords} Schlagwörter`);
    toast.success(
      `KI-Vorschläge freigegeben: ${parts.join(", ")} · Qualität ${result.qualityPct} %`,
    );

    // Scroll to the generated content area for review.
    setTimeout(() => {
      document
        .getElementById("editor-content-anchor")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/faelle"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Redaktionsassistent
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              {form.title || (isNew ? "Neuer Praxisfall" : "Ohne Titel")}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {saving && <span>speichert…</span>}
          {!saving && savedAt && (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              gespeichert um {savedAt.toLocaleTimeString()}
            </span>
          )}
          {saveError && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {saveError.message}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={aiBusy || !form.title.trim()}
            onClick={runAiSuggest}
            title="KI schlägt Handlungsempfehlung, Do's/Don'ts, Rechtsgrundlagen, Schlagwörter u. a. vor – nur leere Felder werden befüllt."
          >
            <Sparkles className="h-4 w-4" />
            {aiBusy ? aiStep || "KI arbeitet …" : "KI-Feldvorschläge"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              const hasContent =
                form.title.trim() ||
                form.short_description.trim() ||
                form.recommendation.trim();
              if (
                hasContent &&
                !confirm(
                  "Aktuelle Eingaben werden mit dem Musterfall „Schüler filmt Lehrkraft“ überschrieben. Fortfahren?",
                )
              )
                return;
              setForm({
                ...SAMPLE_CASE,
                status: form.status === "published" ? form.status : "draft",
              });
              setStep(0);
            }}
            title="Vollständigen Beispiel-Praxisfall in das Formular laden"
          >
            <Sparkles className="h-4 w-4" />
            Musterfall laden
          </Button>
          <Button
            variant="default"
            size="sm"
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setSaveError(null);
              try {
                const payload = toPayload({ ...SAMPLE_CASE, status: "draft" });
                const row = await createCase(payload);
                setSavedAt(new Date());
                setSaving(false);
                qc.invalidateQueries({ queryKey: ["admin", "cases"] });
                toast.success("Musterfall wurde als Entwurf gespeichert.");
                if (row?.id) {
                  navigate({
                    to: "/admin/faelle/$id",
                    params: { id: row.id },
                  });
                }
              } catch (e) {
                setSaving(false);
                const details = toDbErrorDetails(e);
                setSaveError(details);
                const msg = details.message;
                toast.error("Speichern fehlgeschlagen: " + msg);
              }
            }}
            title="Musterfall direkt als Entwurf in der Datenbank anlegen"
          >
            <Save className="h-4 w-4" />
            Musterfall als Entwurf speichern
          </Button>
          <Button
            variant={confirmDelete ? "destructive" : "outline"}
            size="sm"
            onClick={() => {
              if (!deletableId) {
                toast.error("Löschen nicht möglich: kein gespeicherter Datensatz.");
                return;
              }
              if (!confirmDelete) {
                setConfirmDelete(true);
                toast.message("Zur Bestätigung erneut klicken", {
                  description: `ID: ${deletableId}`,
                });
                return;
              }
              setConfirmDelete(false);
              deleteMut.mutate(deletableId);
            }}
            disabled={!deletableId || deleteMut.isPending}
            title={
              deleteDisabledReason
                ? `Löschen deaktiviert: ${deleteDisabledReason}`
                : `Löschen (ID: ${deletableId})`
            }
          >
            <Trash2 className="h-4 w-4" />
            {deleteMut.isPending
              ? "Lösche…"
              : confirmDelete
                ? "Wirklich löschen?"
                : "Löschen"}
          </Button>
          {confirmDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Abbrechen
            </Button>
          )}
          {deleteDisabledReason && (
            <span className="text-xs text-muted-foreground">
              {deleteDisabledReason}
            </span>
          )}
        </div>
      </div>

      {/* Zentraler KI-Zuordnungsassistent */}
      <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4 shadow-sm dark:border-violet-900/50 dark:from-violet-950/30 dark:to-fuchsia-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-violet-600 p-2 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-violet-900 dark:text-violet-200">
                🤖 Fall automatisch vernetzen
              </div>
              <div className="text-xs text-violet-800/80 dark:text-violet-300/80">
                KI schlägt passende Rechtsgrundlagen, Wissenskarten, Schlagwörter,
                Dokumentvorlagen und ähnliche Praxisfälle vor.
              </div>
              {isNew && (
                <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  Bitte Praxisfall zuerst speichern, damit Verknüpfungen erstellt werden können.
                </div>
              )}
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            disabled={isNew}
            onClick={() => setNetworkDialogOpen(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Sparkles className="h-4 w-4" />
            Vernetzung starten
          </Button>
        </div>
        {import.meta.env.DEV && (
          <details className="mt-3 rounded border border-violet-200/60 bg-white/60 p-2 text-[11px] dark:bg-black/20">
            <summary className="cursor-pointer font-medium text-violet-900 dark:text-violet-200">
              Debug · Zentraler KI-Zuordnungsassistent
            </summary>
            <dl className="mt-2 grid gap-1 sm:grid-cols-[200px_1fr]">
              <dt>Komponente geladen</dt><dd>ja (CaseNetworkingDialog)</dd>
              <dt>current case_id</dt><dd className="font-mono break-all">{id ?? "—"}</dd>
              <dt>isNew</dt><dd>{String(isNew)}</dd>
              <dt>Button sichtbar</dt><dd>ja</dd>
              <dt>Button aktiv</dt><dd>{isNew ? "nein (Grund: Fall noch nicht gespeichert)" : "ja"}</dd>
              <dt>Dialog geöffnet</dt><dd>{String(networkDialogOpen)}</dd>
              <dt>Verfügbare Module</dt><dd>Rechtsgrundlagen · Wissenskarten · Schlagwörter · Dokumentvorlagen · Ähnliche Fälle</dd>
            </dl>
          </details>
        )}
      </div>



      <DbErrorNotice error={visibleDbError} />
      {saveDiag && (
        <div className={cn(
          "rounded-md border p-3 text-xs",
          saveDiag.error
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
        )}>
          <div className="mb-1 font-medium">
            {saveDiag.error ? "Speicherdiagnose: Fehler" : "Speicherdiagnose: OK"} · {saveDiag.at.toLocaleTimeString()}
          </div>
          <dl className="grid gap-1 text-[11px] sm:grid-cols-[130px_1fr]">
            <dt className="font-medium">Operation</dt><dd>{saveDiag.op}</dd>
            <dt className="font-medium">ID</dt><dd className="font-mono break-all">{saveDiag.id ?? "—"}</dd>
            <dt className="font-medium">Status</dt><dd>{saveDiag.status}</dd>
            {saveDiag.error && (<><dt className="font-medium">Fehler</dt><dd>{saveDiag.error}</dd></>)}
            {typeof saveDiag.count === "number" && (<><dt className="font-medium">Zeilen in practice_cases</dt><dd>{saveDiag.count}</dd></>)}
          </dl>
        </div>
      )}
      {deleteDiag && (
        <div className={cn(
          "rounded-md border p-3 text-xs",
          deleteDiag.ok
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            : "border-destructive/30 bg-destructive/10 text-destructive",
        )}>
          <div className="mb-1 font-medium">
            {deleteDiag.ok ? "Löschdiagnose: OK" : "Löschdiagnose: Fehler"} · {deleteDiag.at.toLocaleTimeString()}
          </div>
          <dl className="grid gap-1 text-[11px] sm:grid-cols-[130px_1fr]">
            <dt className="font-medium">Datensatz-ID</dt><dd className="font-mono break-all">{deleteDiag.id}</dd>
            <dt className="font-medium">Erfolgreich</dt><dd>{deleteDiag.ok ? "ja" : "nein"}</dd>
            {deleteDiag.error && (<><dt className="font-medium">Fehler</dt><dd>{deleteDiag.error}</dd></>)}
          </dl>
        </div>
      )}

      {/* Quality Panel */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Fortschritt
              </div>
              <div className="text-2xl font-semibold leading-tight tabular-nums">
                {completion}%
              </div>
            </div>
            <div className="hidden h-10 w-px bg-border sm:block" />
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="inline-flex items-center gap-1">
                <span>🟢</span>
                <span className="font-medium">{fullCount}</span>
                <span className="text-muted-foreground">vollständig</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span>🟡</span>
                <span className="font-medium">{partialCount}</span>
                <span className="text-muted-foreground">teilweise</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span>🔴</span>
                <span className="font-medium">{missingCount}</span>
                <span className="text-muted-foreground">offen</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Qualität
              </div>
              <div
                className="text-lg leading-none text-amber-500"
                title={`${(qualityScore * 5).toFixed(1)} / 5`}
                aria-label={`Qualitätsbewertung ${stars} von 5`}
              >
                {"★".repeat(stars)}
                <span className="text-muted-foreground/40">{"★".repeat(5 - stars)}</span>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                publishBadge.cls,
              )}
            >
              {publishBadge.label}
            </span>
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${completion}%` }}
          />
        </div>

        <ol className="mt-3 flex flex-wrap gap-1.5">
          {STEPS.map((s, i) => {
            const st = stepStatuses[i];
            const active = i === step;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => {
                    if (isNew && i > 0 && !form.title.trim()) return;
                    setStep(i);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : st === "full"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                        : st === "partial"
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
                          : "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10",
                  )}
                >
                  <span aria-hidden>{statusIcon(st)}</span>
                  <span className="tabular-nums opacity-70">{i + 1}.</span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>

        {missingCriteria.length > 0 && (
          <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 p-2.5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Noch zu verbessern – klicken zum Schritt springen
            </div>
            <div className="flex flex-wrap gap-1.5">
              {missingCriteria.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setStep(Math.max(0, c.step))}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted"
                >
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isNew && ki.index && (
          <div className="mt-3">
            <SuggestionPanel
              index={ki.index}
              caseId={id}
              onApply={async (s) => {
                try {
                  if (s.kind === "keyword") {
                    await linkCaseKeyword(id, s.refId);
                    toast.success(`Schlagwort „${s.label}“ verknüpft.`);
                  } else if (s.kind === "section") {
                    await createLegalLink(id, s.refId, "Vorschlag aus Wissensbasis");
                    toast.success(`Rechtsgrundlage „${s.label}“ verknüpft.`);
                  } else if (s.kind === "template") {
                    setForm((p) => ({
                      ...p,
                      meta: {
                        ...p.meta,
                        template_ids: [
                          ...(p.meta.template_ids ?? []),
                          s.refId,
                        ].filter((v, i, a) => a.indexOf(v) === i),
                      },
                    }));
                    toast.success(`Vorlage „${s.label}“ dem Fall zugeordnet – bitte speichern.`);
                  } else if (s.kind === "case") {
                    setForm((p) => ({
                      ...p,
                      meta: {
                        ...p.meta,
                        related_hints: [
                          ...(p.meta.related_hints ?? []),
                          s.refId,
                        ].filter((v, i, a) => a.indexOf(v) === i),
                      },
                    }));
                    toast.success(`„${s.label}“ als ähnlicher Fall vorgemerkt – bitte speichern.`);
                  }
                  qc.invalidateQueries({ queryKey: ["knowledge-index"] });
                  qc.invalidateQueries({ queryKey: ["admin", "case-legal-links", id] });
                  qc.invalidateQueries({ queryKey: ["admin", "case-keywords", id] });
                } catch (e: any) {
                  toast.error("Übernehmen fehlgeschlagen: " + (e?.message ?? "unbekannt"));
                }
              }}
            />
          </div>
        )}


        {/* KI-Vorbereitung: Bearbeitungsstatus + KI-Informationen (Architektur-Vorbereitung, noch ohne Generierung) */}
        {(() => {
          const ai = form.meta.ai ?? {};
          const secStatus = form.meta.section_status ?? {};
          const currentKey = STEPS[step].key;
          const currentSecStatus: SectionEditStatus =
            (secStatus[currentKey] as SectionEditStatus | undefined) ?? "empty";
          const updateMeta = (patch: Partial<Meta>) =>
            setForm((p) => ({ ...p, meta: { ...p.meta, ...patch } }));
          const setSectionStatus = (val: SectionEditStatus) =>
            updateMeta({ section_status: { ...secStatus, [currentKey]: val } });
          const setAi = (patch: Partial<AiMetadata>) =>
            updateMeta({ ai: { ...ai, ...patch } });
          const fmt = (iso?: string) =>
            iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—";
          return (
            <div className="mt-3 grid gap-3 rounded-md border border-violet-500/30 bg-violet-500/5 p-3 md:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    Bearbeitungsstatus – {STEPS[step].label}
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      SECTION_STATUS_TONE[currentSecStatus],
                    )}
                  >
                    {SECTION_STATUS_LABELS[currentSecStatus]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(SECTION_STATUS_LABELS) as SectionEditStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSectionStatus(s)}
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                        currentSecStatus === s
                          ? SECTION_STATUS_TONE[s] + " ring-1 ring-current"
                          : "border-border bg-background hover:bg-muted",
                      )}
                    >
                      {SECTION_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-violet-500/40 bg-violet-500/10 text-violet-800 hover:bg-violet-500/20 dark:text-violet-200"
                    onClick={() => {
                      setAi({
                        used: true,
                        last_assist_at: new Date().toISOString(),
                        created_at: ai.created_at ?? new Date().toISOString(),
                      });
                      toast.info(
                        "KI-Vervollständigung ist vorbereitet – Generierung folgt in einer späteren Ausbaustufe.",
                      );
                    }}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Mit KI vervollständigen
                  </Button>
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Platzhalter – erzeugt noch keine Inhalte. Nur KI-Metadaten werden protokolliert.
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                  KI-Informationen
                </div>
                <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!ai.used}
                      onChange={(e) => setAi({ used: e.target.checked })}
                    />
                    KI verwendet
                  </label>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">KI-Modell</Label>
                    <Input
                      value={ai.model ?? ""}
                      onChange={(e) => setAi({ model: e.target.value })}
                      placeholder="z. B. anthropic/claude-haiku-4-5"
                      className="h-7 text-[11px]"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Prompt-Version</Label>
                    <Input
                      value={ai.prompt_version ?? ""}
                      onChange={(e) => setAi({ prompt_version: e.target.value })}
                      placeholder="z. B. v1.0"
                      className="h-7 text-[11px]"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Redaktion geprüft von</Label>
                    <Input
                      value={ai.reviewed_by ?? ""}
                      onChange={(e) => setAi({ reviewed_by: e.target.value })}
                      placeholder="Name"
                      className="h-7 text-[11px]"
                    />
                  </div>
                  <div className="sm:col-span-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                    <div>
                      <div className="font-medium text-foreground">Erstellt</div>
                      <div>{fmt(ai.created_at)}</div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Letzte KI-Unterstützung</div>
                      <div>{fmt(ai.last_assist_at)}</div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Freigabe</div>
                      <div>{fmt(ai.released_at)}</div>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => setAi({ released_at: new Date().toISOString() })}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Freigabe-Datum setzen (jetzt)
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>



      {/* Step body */}
      <div className="rounded-xl border border-border bg-card p-5">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs">Titel *</Label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Kurzer, aussagekräftiger Titel des Praxisfalls"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-xs">Kategorie</Label>
                <select
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">— wählen —</option>
                  {(catsQ.data ?? []).map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Unterkategorie</Label>
                <Input
                  value={form.subcategory}
                  onChange={(e) => set("subcategory", e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Bildungsgang</Label>
                <Input
                  value={form.meta.bildungsgang ?? ""}
                  onChange={(e) =>
                    set("meta", { ...form.meta, bildungsgang: e.target.value })
                  }
                  placeholder="z. B. Berufsschule, Gymnasium"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Zielgruppe</Label>
                <Input
                  value={form.meta.zielgruppe ?? ""}
                  onChange={(e) => set("meta", { ...form.meta, zielgruppe: e.target.value })}
                  placeholder="z. B. Lehrkräfte, Schulleitung"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Schwierigkeit</Label>
                <select
                  value={form.meta.schwierigkeit ?? ""}
                  onChange={(e) =>
                    set("meta", {
                      ...form.meta,
                      schwierigkeit: e.target.value as Meta["schwierigkeit"],
                    })
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">— wählen —</option>
                  <option value="leicht">Leicht</option>
                  <option value="mittel">Mittel</option>
                  <option value="komplex">Komplex</option>
                </select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Bearbeitungsdauer</Label>
                <Input
                  value={form.meta.bearbeitungsdauer ?? ""}
                  onChange={(e) =>
                    set("meta", { ...form.meta, bearbeitungsdauer: e.target.value })
                  }
                  placeholder="z. B. 15 Minuten"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Status</Label>
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as FormState["status"])}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Ampel</Label>
                <select
                  value={form.ampel}
                  onChange={(e) => set("ampel", e.target.value as FormState["ampel"])}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="gruen">Grün – Alltag</option>
                  <option value="gelb">Gelb – Rücksprache</option>
                  <option value="rot">Rot – Schulleitung</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs">Kurzbeschreibung</Label>
              <Textarea
                rows={2}
                value={form.short_description}
                onChange={(e) => set("short_description", e.target.value)}
                placeholder="Ein Satz, der den Fall auf den Punkt bringt."
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Ausführliche Situationsbeschreibung</Label>
              <Textarea
                rows={6}
                value={form.legal_explanation}
                onChange={(e) => set("legal_explanation", e.target.value)}
                placeholder="Ausgangslage, beteiligte Personen, Rahmenbedingungen …"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs">
                Sofortentscheidung / Kurzantwort
              </Label>
              <Textarea
                rows={3}
                value={form.short_answer}
                onChange={(e) => set("short_answer", e.target.value)}
                placeholder="Das Wichtigste in 1–2 Sätzen – was ist jetzt zu tun?"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Sofortmaßnahmen</Label>
              <Textarea
                rows={4}
                value={form.immediate_actions}
                onChange={(e) => set("immediate_actions", e.target.value)}
                placeholder="Konkrete Schritte in den ersten Minuten / Stunden."
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs">Handlungsempfehlung</Label>
              <Textarea
                rows={5}
                value={form.recommendation}
                onChange={(e) => set("recommendation", e.target.value)}
                placeholder="Empfohlenes Vorgehen Schritt für Schritt."
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Zuständigkeiten</Label>
              <Input
                value={form.responsibilities}
                onChange={(e) => set("responsibilities", e.target.value)}
                placeholder="z. B. Klassenleitung, Schulleitung"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Checkliste</Label>
              <ListEditor
                values={form.checklist}
                onChange={(v) => set("checklist", v)}
                placeholder="Handlungsschritt …"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">
                Do's – Praxistipp (mindestens 5 konkrete fallbezogene Punkte)
              </Label>
              <Textarea
                rows={6}
                value={form.practice_tip}
                onChange={(e) => set("practice_tip", e.target.value)}
                placeholder={
                  "Pro Zeile ein konkreter, fallbezogener Do.\n" +
                  "Beispiel:\n" +
                  "- Situation sofort deeskalieren und dokumentieren\n" +
                  "- Klassenleitung informieren\n" +
                  "- Elterngespräch anbieten und Termin fixieren\n" +
                  "- Anhörung nach § 28 VwVfG NRW schriftlich vorbereiten\n" +
                  "- Ergebnis in Aktennotiz festhalten"
                }
              />
              <p
                className={`mt-1 text-xs ${
                  doCount >= 5 ? "text-muted-foreground" : "text-destructive"
                }`}
              >
                {doCount} von mindestens 5 konkreten Do's
                {doCount < 5 &&
                  " – Veröffentlichung erst möglich, wenn 5 fallbezogene Do's vorliegen."}
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs">Was ist zu dokumentieren?</Label>
              <ListEditor
                values={form.documentation}
                onChange={(v) => set("documentation", v)}
                placeholder="z. B. Aktennotiz, Elternbrief …"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Häufige Fehler</Label>
              <ListEditor
                values={form.common_mistakes}
                onChange={(v) => set("common_mistakes", v)}
                placeholder="Was sollte vermieden werden?"
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            {isNew ? (
              <p className="text-sm text-muted-foreground">
                Rechtsgrundlagen können erst nach dem ersten Zwischenspeichern verknüpft werden.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Rechtsgrundlagen zuordnen</div>
                    <p className="text-xs text-muted-foreground">
                      Suche, Filter, KI-Vorschläge und Vorschau in einem Fenster —{" "}
                      {(linksQ.data ?? []).length} bereits zugeordnet.
                    </p>
                  </div>
                  <Button type="button" onClick={() => setLegalDialogOpen(true)}>
                    <BookOpen className="h-4 w-4" /> Zuordnungs-Assistent öffnen
                  </Button>
                </div>

                <LegalAssignmentDialog
                  open={legalDialogOpen}
                  onOpenChange={setLegalDialogOpen}
                  caseId={id}
                  caseInput={{
                    title: form.title,
                    short_description: form.short_description,
                    category: form.category,
                    subcategory: form.subcategory,
                    bildungsgang: (form.meta as any)?.bildungsgang ?? "",
                    keywords: ((caseKwQ.data ?? []) as any[])
                      .map((k) => k?.keywords?.keyword)
                      .filter((n): n is string => !!n),
                  }}
                />

                <LegalMatchSuggestions
                  caseId={id}
                  caseInput={{
                    title: form.title,
                    short_description: form.short_description,
                    category: form.category,
                    subcategory: form.subcategory,
                    bildungsgang: (form.meta as any)?.bildungsgang ?? "",
                    keywords: ((caseKwQ.data ?? []) as any[])
                      .map((k) => k?.keywords?.keyword)
                      .filter((n): n is string => !!n),
                  }}
                  onLinked={() => linksQ.refetch()}
                />

                <details className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Schnell-Verknüpfen (Klassisch)
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <select
                        value={newLinkSection}
                        onChange={(e) => setNewLinkSection(e.target.value)}
                        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        <option value="">Rechtsabschnitt wählen…</option>
                        {(sectionsQ.data ?? []).map((s: any) => {
                          const src = (sourcesQ.data ?? []).find((x: any) => x.id === s.source_id);
                          return (
                            <option key={s.id} value={s.id}>
                              {src?.short_name ?? "?"} · {s.reference}
                              {s.title ? ` – ${s.title}` : ""}
                            </option>
                          );
                        })}
                      </select>
                      <Input
                        value={newLinkNote}
                        onChange={(e) => setNewLinkNote(e.target.value)}
                        placeholder="Notiz (optional)"
                      />
                      <Button
                        type="button"
                        onClick={() => addLinkMut.mutate()}
                        disabled={!newLinkSection || addLinkMut.isPending}
                      >
                        <Plus className="h-4 w-4" /> Verknüpfen
                      </Button>
                    </div>
                    {(linksQ.data ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Noch keine Rechtsverknüpfung.</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {(linksQ.data ?? []).map((l: any) => (
                          <li
                            key={l.id}
                            className="flex items-center justify-between px-3 py-2 text-sm"
                          >
                            <div>
                              <div className="font-medium">
                                {l.legal_sections?.legal_sources?.short_name ?? "?"} ·{" "}
                                {l.legal_sections?.reference}
                              </div>
                              {l.legal_sections?.title && (
                                <div className="text-xs text-muted-foreground">
                                  {l.legal_sections.title}
                                </div>
                              )}
                              {l.note && (
                                <div className="text-xs italic text-muted-foreground">{l.note}</div>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLinkMut.mutate(l.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-medium text-violet-900 dark:text-violet-200">
                  📄 Dokumentvorlagen
                </div>
                <div className="text-xs text-violet-800/80 dark:text-violet-300/80">
                  KI schlägt passende Vorlagen aus dem Katalog vor. Neue Standardvorlagen
                  können mit einem Klick angelegt werden.
                </div>
                {isNew && (
                  <div className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    Bitte Praxisfall zuerst speichern, um Vorlagen zuzuordnen.
                  </div>
                )}
              </div>
              <Button
                type="button"
                disabled={isNew}
                onClick={() => setTemplateDialogOpen(true)}
                className="bg-violet-600 text-white hover:bg-violet-700"
              >
                <Sparkles className="h-4 w-4" />
                🤖 Vorlagen automatisch zuordnen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Zusätzlich können Vorlagen unten manuell markiert werden (wird beim Speichern
              in den Fall-Metadaten hinterlegt). Die KI-Zuordnung schreibt direkt in
              <code className="mx-1">case_templates</code>.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {(templatesQ.data ?? []).map((t) => {
                const selected = form.meta.template_ids?.includes(t.id) ?? false;
                return (
                  <label
                    key={t.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selected}
                      onChange={(e) => {
                        const cur = form.meta.template_ids ?? [];
                        const next = e.target.checked
                          ? [...cur, t.id]
                          : cur.filter((x) => x !== t.id);
                        set("meta", { ...form.meta, template_ids: next });
                      }}
                    />
                    <div>
                      <div className="font-medium">{t.title}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                      )}
                    </div>
                  </label>
                );
              })}
              {(templatesQ.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Noch keine Vorlagen vorhanden.</p>
              )}
            </div>
            {!isNew && (
              <CaseDocumentsPanel
                caseId={id}
                linkedTemplates={(templatesQ.data ?? [])
                  .filter((t) => (form.meta.template_ids ?? []).includes(t.id))
                  .map((t) => ({ id: t.id, title: t.title, description: t.description ?? null }))}
              />
            )}
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            {isNew ? (
              <p className="text-sm text-muted-foreground">
                Schlagwörter können erst nach dem ersten Zwischenspeichern zugeordnet werden.
              </p>
            ) : (
              <>
                <div className="-mx-4 flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
                  <Button
                    type="button"
                    onClick={() => setKeywordDialogOpen(true)}
                    className="h-11 bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    <Sparkles className="h-4 w-4" />
                    🤖 Schlagwörter automatisch zuordnen
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    KI analysiert den Fall und schlägt passende Schlagwörter vor.
                  </span>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Zugeordnet</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(caseKwQ.data ?? []).map((k) => (
                      <button
                        key={k.keyword_id}
                        onClick={() => removeKwMut.mutate(k.keyword_id)}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary hover:bg-primary/20"
                      >
                        {k.keywords?.keyword}
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ))}
                    {(caseKwQ.data ?? []).length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        Noch keine Schlagwörter zugeordnet.
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Verfügbar</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(keywordsQ.data ?? [])
                      .filter(
                        (k) =>
                          !(caseKwQ.data ?? []).some((ck) => ck.keyword_id === k.id),
                      )
                      .map((k) => (
                        <button
                          key={k.id}
                          onClick={() => addKwMut.mutate(k.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" /> {k.keyword}
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
            {!isNew && (
              <KeywordAssignmentDialog
                open={keywordDialogOpen}
                onOpenChange={setKeywordDialogOpen}
                caseId={id}
                caseInput={{
                  title: form.title,
                  short_description: form.short_description,
                  category: form.category,
                  subcategory: form.subcategory,
                  short_answer: form.short_answer,
                  immediate_actions: form.immediate_actions,
                  recommendation: form.recommendation,
                  legal_explanation: form.legal_explanation,
                  responsibilities: form.responsibilities,
                  practice_tip: form.practice_tip,
                  common_mistakes: form.common_mistakes,
                  checklist: form.checklist,
                  documentation: form.documentation,
                  legal_context: ((linksQ.data ?? []) as any[])
                    .map(
                      (l) =>
                        `${l?.legal_sections?.legal_sources?.name ?? ""} ${l?.legal_sections?.section_number ?? ""} ${l?.legal_sections?.title ?? ""}`.trim(),
                    )
                    .filter(Boolean),
                  templates: [],
                }}
                catalog={(keywordsQ.data ?? []).map((k) => ({
                  id: k.id,
                  keyword: k.keyword,
                }))}
                linked={(caseKwQ.data ?? []) as any[]}
              />
            )}
          </div>
        )}



        {step === 8 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Merkmale für die automatische Zuordnung zu einem erfassten Sachverhalt. Ohne
              Kuratierung gilt das automatisch abgeleitete Profil.
            </p>
            <MatchingProfilePanel
              caseId={id}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["admin", "case", id] });
              }}
            />
          </div>
        )}

        {step === 9 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Automatische Qualitätsprüfung ({qsPassed} / {qsChecks.length} bestanden).
            </p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {qsChecks.map((c) => (
                <li
                  key={c.label}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{c.label}</span>
                  {c.ok ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-4 w-4" /> fehlt
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 10 && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
              <div className="mb-2 font-medium">Zusammenfassung</div>
              <dl className="grid gap-1 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Titel</dt>
                  <dd className="text-right">{form.title || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Kategorie</dt>
                  <dd className="text-right">
                    {form.category || "—"}
                    {form.subcategory ? ` · ${form.subcategory}` : ""}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Bildungsgang / Zielgruppe</dt>
                  <dd className="text-right">
                    {(form.meta.bildungsgang || "—") + " / " + (form.meta.zielgruppe || "—")}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Rechtsverknüpfungen</dt>
                  <dd className="text-right">{(linksQ.data ?? []).length}</dd>
                </div>
              </dl>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Status setzen</Label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as FormState["status"])}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm sm:w-64"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Wähle „Veröffentlicht“ um den Fall live zu schalten.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const saved = await persist({ status: "draft" });
                  if (saved) {
                    toast.success("Als Entwurf gespeichert.");
                    navigate({ to: "/admin/faelle" });
                  }
                }}
                disabled={saving}
              >
                Als Entwurf speichern
              </Button>
              <Button
                onClick={async () => {
                  if (doCount < 5) {
                    toast.error(
                      "Mindestens 5 konkrete fallbezogene Do's erforderlich.",
                    );
                    return;
                  }
                  const saved = await persist({ status: "published" });
                  if (saved) {
                    toast.success("Praxisfall veröffentlicht.");
                    navigate({ to: "/admin/faelle" });
                  }
                }}
                disabled={saving || !form.title.trim() || doCount < 5}
                title={
                  doCount < 5
                    ? "Mindestens 5 konkrete fallbezogene Do's erforderlich."
                    : undefined
                }
              >
                <Save className="h-4 w-4" /> Veröffentlichen
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Button>
        <div className="text-xs text-muted-foreground">
          Änderungen werden automatisch zwischengespeichert.
        </div>
        {step < STEPS.length - 1 ? (
          <Button onClick={goNext} disabled={!canGoNext || saving}>
            Weiter <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/admin/faelle" })}
          >
            Fertig
          </Button>
        )}
      </div>
      {!isNew && caseQ.data && (
        <DecisionTreeAdminEditor
          caseId={id}
          caseData={mapDbCase(caseQ.data as unknown as Record<string, unknown>)}
          decisionTreeRaw={(caseQ.data as { decision_tree?: unknown }).decision_tree}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin", "case", id] });
            qc.invalidateQueries({ queryKey: ["case-full", id] });
            qc.invalidateQueries({ queryKey: ["published-cases"] });
          }}
        />
      )}
      <AiReviewDialog
        open={aiReviewOpen}
        onOpenChange={setAiReviewOpen}
        draft={aiDraft}
        current={{
          recommendation: form.recommendation,
          practice_tip: form.practice_tip,
          common_mistakes: form.common_mistakes,
          legal_explanation: form.legal_explanation,
          checklist: form.checklist,
          responsibilities: form.responsibilities,
          short_answer: form.short_answer,
          short_description: form.short_description,
          immediate_actions: form.immediate_actions,
          documentation: form.documentation,
          faq: form.meta.faq_items ?? [],
        }}
        keywordCatalog={aiCatalog.keywords}
        templateCatalog={aiCatalog.templates}
        sectionCatalog={aiCatalog.sections}
        onApply={applyAiApproved}
      />
      {!isNew && (
        <CaseNetworkingDialog
          open={networkDialogOpen}
          onOpenChange={setNetworkDialogOpen}
          caseId={id}
          input={{
            title: form.title,
            short_description: form.short_description,
            category: form.category,
            subcategory: form.subcategory,
            bildungsgang: (form.meta as any)?.bildungsgang ?? "",
            recommendation: form.recommendation,
            immediate_actions: form.immediate_actions,
            responsibilities: form.responsibilities,
            legal_explanation: form.legal_explanation,
            short_answer: form.short_answer,
            practice_tip: form.practice_tip,
            common_mistakes: form.common_mistakes,
            checklist: form.checklist,
            documentation: form.documentation,
          }}
        />
      )}
      {!isNew && (
        <TemplateAssignmentDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          caseId={id}
          caseInput={{
            title: form.title,
            short_description: form.short_description,
            category: form.category,
            subcategory: form.subcategory,
            recommendation: form.recommendation,
            immediate_actions: form.immediate_actions,
            responsibilities: form.responsibilities,
            legal_explanation: form.legal_explanation,
            keywords: (caseKwQ.data ?? [])
              .map((k: any) => k?.keywords?.keyword)
              .filter((n: unknown): n is string => !!n),
          }}
        />
      )}
    </div>
  );
}

