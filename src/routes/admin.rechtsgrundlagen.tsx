import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Link2,
  Search,
  X,
  Download,
  Wrench,
  RotateCcw,
  Loader2,
  Sparkles,
  ListChecks,
} from "lucide-react";
import { LegalImportWizard } from "@/components/LegalImportWizard";
import {
  listSources,
  listSections,
  listSectionUsage,
  listCases,
  createSource,
  updateSource,
  deleteSource,
  createSection,
  updateSection,
  deleteSection,
  createLegalLink,
  deleteLegalLink,
  type LegalSourceInput,
  type LegalSectionInput,
  type SectionUsageEntry,
} from "@/lib/coreBuilder";
import {
  listImportJobs,
  resetSourceImports,
  startImportJob,
  finishImportJob,
  updateJobCounters,
  recordJobItem,
} from "@/lib/importJobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";

export const Route = createFileRoute("/admin/rechtsgrundlagen")({
  component: RechtsAdmin,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  reviewed: "Geprüft",
  published: "Veröffentlicht",
};
const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  reviewed: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

const RELEVANCE_LABEL: Record<string, string> = {
  low: "niedrig",
  medium: "mittel",
  high: "hoch",
};
const RELEVANCE_TONE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

const MVP_NOTICE =
  "Diese Rechtsgrundlage ist im MVP redaktionell gepflegt und muss vor produktiver Nutzung fachlich geprüft werden. Maßgeblich bleibt die offizielle Quelle.";

type SourceForm = LegalSourceInput;
type SectionForm = LegalSectionInput;

function RechtsAdmin() {
  const qc = useQueryClient();
  const sourcesQ = useQuery({ queryKey: ["admin", "sources"], queryFn: listSources });
  const sectionsQ = useQuery({ queryKey: ["admin", "sections"], queryFn: listSections });
  const usageQ = useQuery({ queryKey: ["admin", "section-usage"], queryFn: listSectionUsage });
  const casesQ = useQuery({ queryKey: ["admin", "cases"], queryFn: listCases });

  const [openSource, setOpenSource] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<string | "new" | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [newSectionFor, setNewSectionFor] = useState<string | null>(null);
  const [linkingSection, setLinkingSection] = useState<string | null>(null);

  // Filter & Suche
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<string>("");
  const [filterArea, setFilterArea] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  const [importOpen, setImportOpen] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin", "sources"] });
    qc.invalidateQueries({ queryKey: ["admin", "sections"] });
    qc.invalidateQueries({ queryKey: ["admin", "section-usage"] });
  };

  const sourceMut = useMutation({
    mutationFn: async (p: { id?: string; data: SourceForm }) =>
      p.id ? updateSource(p.id, p.data) : createSource(p.data),
    onSuccess: () => {
      setEditingSource(null);
      invalidateAll();
    },
  });
  const deleteSourceMut = useMutation({
    mutationFn: (id: string) => deleteSource(id),
    onSuccess: invalidateAll,
  });
  const sectionMut = useMutation({
    mutationFn: async (p: { id?: string; data: SectionForm }) =>
      p.id ? updateSection(p.id, p.data) : createSection(p.data),
    onSuccess: () => {
      setEditingSection(null);
      setNewSectionFor(null);
      invalidateAll();
    },
  });
  const deleteSectionMut = useMutation({
    mutationFn: (id: string) => deleteSection(id),
    onSuccess: invalidateAll,
  });
  const linkMut = useMutation({
    mutationFn: (p: {
      caseId: string;
      sectionId: string;
      note?: string;
      relevance?: "low" | "medium" | "high" | null;
    }) => createLegalLink(p.caseId, p.sectionId, p.note, p.relevance),
    onSuccess: () => invalidateAll(),
  });
  const unlinkMut = useMutation({
    mutationFn: (id: string) => deleteLegalLink(id),
    onSuccess: () => invalidateAll(),
  });

  const sectionsBySource = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of (sectionsQ.data ?? []) as any[]) {
      const arr = map.get(s.source_id) ?? [];
      arr.push(s);
      map.set(s.source_id, arr);
    }
    return map;
  }, [sectionsQ.data]);

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const s of (sourcesQ.data ?? []) as any[]) {
      if (s.legal_area) set.add(String(s.legal_area));
    }
    return Array.from(set).sort();
  }, [sourcesQ.data]);

  const sourcesFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ((sourcesQ.data ?? []) as any[]).filter((s) => {
      if (filterSource && s.id !== filterSource) return false;
      if (filterArea && s.legal_area !== filterArea) return false;
      const secs = sectionsBySource.get(s.id) ?? [];
      const secsMatchStatus = filterStatus
        ? secs.some((sec) => (sec.status ?? "draft") === filterStatus)
        : true;
      if (!secsMatchStatus) return false;
      if (!q) return true;
      const hay = [
        s.name,
        s.short_name,
        s.title,
        s.legal_area,
        s.scope,
        s.description,
        ...secs.flatMap((sec) => [
          sec.section_number,
          sec.title,
          sec.summary,
          sec.practice_relevance,
          sec.recommendation,
          sec.common_mistakes,
        ]),
      ]
        .filter(Boolean)
        .join(" \n ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sourcesQ.data, sectionsBySource, search, filterSource, filterArea, filterStatus]);

  const filterActive = Boolean(search || filterSource || filterArea || filterStatus);

  const totalSections = sectionsQ.data?.length ?? 0;
  const totalSources = sourcesQ.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Inhalte</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Rechtsquellen-Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalSources} Rechtsquellen · {totalSections} Rechtsabschnitte
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4" /> Offizielle Quelle importieren
          </Button>
          <Button onClick={() => setEditingSource("new")}>
            <Plus className="h-4 w-4" /> Rechtsquelle
          </Button>
        </div>
      </header>

      {importOpen && <LegalImportWizard onClose={() => setImportOpen(false)} />}

      {/* Filterleiste */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen in Rechtsquellen, Paragraphen, Beschreibungen…"
              className="pl-8"
            />
          </div>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Alle Rechtsquellen</option>
            {((sourcesQ.data ?? []) as any[]).map((s) => (
              <option key={s.id} value={s.id}>
                {s.short_name || s.name}
              </option>
            ))}
          </select>
          <select
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Alle Rechtsgebiete</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Alle Status</option>
            <option value="draft">Entwurf</option>
            <option value="reviewed">Geprüft</option>
            <option value="published">Veröffentlicht</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            disabled={!filterActive}
            onClick={() => {
              setSearch("");
              setFilterSource("");
              setFilterArea("");
              setFilterStatus("");
            }}
          >
            <X className="h-4 w-4" /> Zurücksetzen
          </Button>
        </div>
      </div>

      {editingSource === "new" && (
        <SourceEditor
          onCancel={() => setEditingSource(null)}
          onSubmit={(data) => sourceMut.mutate({ data })}
          pending={sourceMut.isPending}
          error={sourceMut.error}
        />
      )}

      {(sourcesQ.isLoading || sectionsQ.isLoading) && <LoadingState />}
      {sourcesQ.error ? <ErrorState error={sourcesQ.error} /> : null}
      {sourcesQ.data && sourcesQ.data.length === 0 && (
        <EmptyState
          title="Noch keine Rechtsquellen"
          description="Lege deine erste Rechtsquelle (z. B. SchulG NRW) an."
        />
      )}
      {sourcesQ.data && sourcesQ.data.length > 0 && sourcesFiltered.length === 0 && (
        <EmptyState
          title="Keine Treffer"
          description="Passe Suche oder Filter an, um Rechtsgrundlagen zu finden."
        />
      )}

      <div className="space-y-4">
        {sourcesFiltered.map((s: any) => {
          const isOpen = openSource === s.id || filterActive;
          const secsAll = sectionsBySource.get(s.id) ?? [];
          const secs = filterStatus
            ? secsAll.filter((sec) => (sec.status ?? "draft") === filterStatus)
            : secsAll;
          const isEditing = editingSource === s.id;

          return (
            <div key={s.id} className="rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between gap-3 p-4">
                <button
                  onClick={() => setOpenSource(isOpen && openSource === s.id ? null : s.id)}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <div className="mt-0.5 text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {s.short_name || s.name}
                      </span>
                      {s.legal_area && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {s.legal_area}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-0.5 text-sm font-semibold">{s.title || s.name}</h2>
                    {s.scope && <p className="mt-0.5 text-xs text-muted-foreground">{s.scope}</p>}
                    {s.description && <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {secsAll.length} Rechtsabschnitte
                      {filterStatus && secs.length !== secsAll.length ? ` · ${secs.length} im Filter` : ""}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditingSource(s.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Rechtsquelle bearbeiten"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Rechtsquelle „${s.name}" wirklich löschen? Alle zugehörigen Abschnitte werden ebenfalls entfernt.`,
                        )
                      ) {
                        deleteSourceMut.mutate(s.id);
                      }
                    }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Rechtsquelle löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="border-t border-border p-4">
                  <SourceEditor
                    initial={s}
                    onCancel={() => setEditingSource(null)}
                    onSubmit={(data) => sourceMut.mutate({ id: s.id, data })}
                    pending={sourceMut.isPending}
                    error={sourceMut.error}
                  />
                </div>
              )}

              {isOpen && (
                <SourceDevTools
                  sourceId={s.id}
                  sourceName={s.short_name || s.name}
                  sections={secsAll}
                />
              )}


              {isOpen && (
                <div className="border-t border-border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Rechtsabschnitte
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setNewSectionFor(newSectionFor === s.id ? null : s.id)}
                    >
                      <Plus className="h-3.5 w-3.5" /> Abschnitt
                    </Button>
                  </div>

                  {newSectionFor === s.id && (
                    <div className="mb-3 rounded-lg border border-border bg-card p-3">
                      <SectionEditor
                        sourceId={s.id}
                        allSections={(sectionsQ.data ?? []) as any[]}
                        onCancel={() => setNewSectionFor(null)}
                        onSubmit={(data) => sectionMut.mutate({ data })}
                        pending={sectionMut.isPending}
                        error={sectionMut.error}
                      />
                    </div>
                  )}

                  {secs.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Keine Abschnitte im Filter.</p>
                  ) : (
                    <ul className="space-y-2">
                      {secs.map((sec: any) => (
                        <SectionRow
                          key={sec.id}
                          section={sec}
                          usage={usageQ.data?.get(sec.id)}
                          isEditing={editingSection === sec.id}
                          isLinking={linkingSection === sec.id}
                          onToggleLink={() =>
                            setLinkingSection(linkingSection === sec.id ? null : sec.id)
                          }
                          onEdit={() => setEditingSection(editingSection === sec.id ? null : sec.id)}
                          onDelete={() => {
                            if (confirm(`Abschnitt „${sec.section_number}" wirklich löschen?`)) {
                              deleteSectionMut.mutate(sec.id);
                            }
                          }}
                          allSections={(sectionsQ.data ?? []) as any[]}
                          allCases={(casesQ.data ?? []) as any[]}
                          onSubmit={(data) => sectionMut.mutate({ id: sec.id, data })}
                          pending={sectionMut.isPending}
                          error={sectionMut.error}
                          onLink={(payload) => linkMut.mutate({ sectionId: sec.id, ...payload })}
                          onUnlink={(linkId) => unlinkMut.mutate(linkId)}
                          linkPending={linkMut.isPending}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Source Editor ---------------- */

function SourceEditor({
  initial,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  initial?: any;
  onSubmit: (data: SourceForm) => void;
  onCancel: () => void;
  pending: boolean;
  error: unknown;
}) {
  const [form, setForm] = useState<SourceForm>({
    name: initial?.name ?? initial?.short_name ?? "",
    legal_area: initial?.legal_area ?? "",
    scope: initial?.scope ?? "",
    description: initial?.description ?? "",
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">
        {initial ? "Rechtsquelle bearbeiten" : "Neue Rechtsquelle"}
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Rechtsquelle (Kurzname)">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="z. B. SchulG NRW"
          />
        </Field>
        <Field label="Rechtsgebiet">
          <Input
            value={form.legal_area ?? ""}
            onChange={(e) => setForm({ ...form, legal_area: e.target.value })}
            placeholder="z. B. Schulrecht, Datenschutz"
          />
        </Field>
        <Field label="Geltungsbereich">
          <Input
            value={form.scope ?? ""}
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
            placeholder="z. B. Nordrhein-Westfalen"
          />
        </Field>
        <Field label="Beschreibung" className="md:col-span-2">
          <Textarea
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
        </Field>
      </div>
      {error ? (
        <div className="mt-3">
          <ErrorState error={error} />
        </div>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button onClick={() => onSubmit(form)} disabled={!form.name || pending}>
          Speichern
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Section Row + Editor ---------------- */

function SectionRow({
  section,
  usage,
  isEditing,
  isLinking,
  onEdit,
  onDelete,
  onToggleLink,
  allSections,
  allCases,
  onSubmit,
  pending,
  error,
  onLink,
  onUnlink,
  linkPending,
}: {
  section: any;
  usage?: SectionUsageEntry;
  isEditing: boolean;
  isLinking: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleLink: () => void;
  allSections: any[];
  allCases: any[];
  onSubmit: (data: SectionForm) => void;
  pending: boolean;
  error: unknown;
  onLink: (payload: {
    caseId: string;
    note?: string;
    relevance?: "low" | "medium" | "high" | null;
  }) => void;
  onUnlink: (linkId: string) => void;
  linkPending: boolean;
}) {
  const status = section.status ?? "draft";
  const count = usage?.count ?? 0;

  return (
    <li className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/rechtsgrundlagen/$id"
              params={{ id: section.id }}
              className="text-sm font-semibold hover:text-accent hover:underline"
            >
              {section.section_number}
            </Link>
            {section.title && (
              <Link
                to="/admin/rechtsgrundlagen/$id"
                params={{ id: section.id }}
                className="text-sm text-muted-foreground hover:text-accent hover:underline"
              >
                — {section.title}
              </Link>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[status]}`}
            >
              {STATUS_LABEL[status] ?? status}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {count} {count === 1 ? "Praxisfall" : "Praxisfälle"}
            </span>
            {section.version_label && (
              <span className="text-[10px] text-muted-foreground">v{section.version_label}</span>
            )}
          </div>
          {section.summary && (
            <p className="mt-1 text-xs text-muted-foreground">{section.summary}</p>
          )}
          {(section.official_url ||
            section.valid_from ||
            section.last_reviewed_at ||
            section.imported_at ||
            section.import_url) && (
            <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              {section.official_url && (
                <a
                  href={section.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-accent"
                >
                  <ExternalLink className="h-3 w-3" /> Offizielle Quelle
                </a>
              )}
              {section.valid_from && <span>Gültig ab: {section.valid_from}</span>}
              {section.last_reviewed_at && <span>Geprüft: {section.last_reviewed_at}</span>}
              {section.imported_at && (
                <span>
                  Importiert: {new Date(section.imported_at).toLocaleDateString("de-DE")}
                </span>
              )}
            </div>
          )}
          <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] italic text-amber-800 dark:text-amber-300">
            {MVP_NOTICE}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Link
            to="/admin/rechtsgrundlagen/$id"
            params={{ id: section.id }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-accent"
            title="Wissenskarte öffnen"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={onToggleLink}
            className={`rounded-md p-1.5 hover:bg-muted ${
              isLinking ? "text-accent" : "text-muted-foreground hover:text-foreground"
            }`}
            title="Praxisfälle verknüpfen"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onEdit}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Abschnitt bearbeiten"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
            title="Abschnitt löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isLinking && (
        <div className="border-t border-border bg-muted/20 p-3">
          <LinkedCases
            usage={usage}
            allCases={allCases}
            onLink={onLink}
            onUnlink={onUnlink}
            pending={linkPending}
          />
        </div>
      )}

      {isEditing && (
        <div className="border-t border-border p-3">
          <SectionEditor
            sourceId={section.source_id}
            initial={section}
            allSections={allSections}
            onCancel={onEdit}
            onSubmit={onSubmit}
            pending={pending}
            error={error}
          />
        </div>
      )}
    </li>
  );
}

/* ---------------- Case-Linking Panel ---------------- */

function LinkedCases({
  usage,
  allCases,
  onLink,
  onUnlink,
  pending,
}: {
  usage?: SectionUsageEntry;
  allCases: any[];
  onLink: (payload: {
    caseId: string;
    note?: string;
    relevance?: "low" | "medium" | "high" | null;
  }) => void;
  onUnlink: (linkId: string) => void;
  pending: boolean;
}) {
  const linkedIds = new Set((usage?.cases ?? []).map((c) => c.id));
  const available = allCases.filter((c: any) => !linkedIds.has(c.id));
  const [selCase, setSelCase] = useState<string>("");
  const [relevance, setRelevance] = useState<"low" | "medium" | "high">("medium");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Verknüpfte Praxisfälle
      </h4>
      {(usage?.cases ?? []).length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Noch keine Praxisfälle verknüpft.</p>
      ) : (
        <ul className="space-y-1.5">
          {(usage?.cases ?? []).map((c) => (
            <li
              key={c.link_id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
            >
              <Link
                to="/admin/faelle/$id"
                params={{ id: c.id }}
                className="inline-flex items-center gap-1 text-xs hover:text-accent"
              >
                <BookOpen className="h-3 w-3" /> {c.title}
              </Link>
              {c.relevance && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    RELEVANCE_TONE[c.relevance] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  Relevanz: {RELEVANCE_LABEL[c.relevance] ?? c.relevance}
                </span>
              )}
              {c.note && (
                <span className="text-[10px] text-muted-foreground">„{c.note}"</span>
              )}
              <button
                onClick={() => {
                  if (confirm("Verknüpfung entfernen?")) onUnlink(c.link_id);
                }}
                className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Verknüpfung entfernen"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-border bg-card p-2">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">Praxisfall verknüpfen</p>
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <select
            value={selCase}
            onChange={(e) => setSelCase(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">— Praxisfall wählen —</option>
            {available.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select
            value={relevance}
            onChange={(e) => setRelevance(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="low">Relevanz: niedrig</option>
            <option value="medium">Relevanz: mittel</option>
            <option value="high">Relevanz: hoch</option>
          </select>
          <Button
            size="sm"
            disabled={!selCase || pending}
            onClick={() => {
              onLink({ caseId: selCase, note: note || undefined, relevance });
              setSelCase("");
              setNote("");
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Verknüpfen
          </Button>
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Kurze Begründung (optional)"
          className="mt-2"
        />
      </div>
    </div>
  );
}

function SectionEditor({
  sourceId,
  initial,
  allSections,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  sourceId: string;
  initial?: any;
  allSections: any[];
  onSubmit: (data: SectionForm) => void;
  onCancel: () => void;
  pending: boolean;
  error: unknown;
}) {
  const [form, setForm] = useState<SectionForm>({
    source_id: sourceId,
    section_number: initial?.section_number ?? "",
    title: initial?.title ?? "",
    summary: initial?.summary ?? "",
    full_text: initial?.full_text ?? "",
    practice_relevance: initial?.practice_relevance ?? "",
    recommendation: initial?.recommendation ?? "",
    common_mistakes: initial?.common_mistakes ?? "",
    related_section_ids: initial?.related_section_ids ?? [],
    official_url: initial?.official_url ?? "",
    valid_from: initial?.valid_from ?? "",
    version_label: initial?.version_label ?? "",
    last_reviewed_at: initial?.last_reviewed_at ?? "",
    status: (initial?.status ?? "draft") as SectionForm["status"],
  });

  const otherSections = allSections.filter((s) => s.id !== initial?.id);

  const loadTemplate = () => {
    setForm((f) => ({
      ...f,
      section_number: "§ 53",
      title: "Erzieherische Einwirkungen, Ordnungsmaßnahmen",
      summary:
        "Diese Vorschrift betrifft schulische Reaktionen auf Fehlverhalten von Schülerinnen und Schülern. Sie unterscheidet zwischen pädagogischen Einwirkungen und formellen Ordnungsmaßnahmen.",
      practice_relevance:
        "Für Lehrkräfte ist die Vorschrift relevant, wenn Unterrichtsstörungen, Regelverstöße, Beleidigungen, Gewalt, Täuschung oder andere schwerwiegende Vorfälle auftreten. Sie hilft dabei, pädagogisches Handeln von formellen Maßnahmen abzugrenzen.",
      recommendation:
        "Zunächst sollte die Situation pädagogisch geklärt und dokumentiert werden. Bei schwereren oder wiederholten Vorfällen sind Klassenleitung, Bildungsgangleitung oder Schulleitung einzubeziehen. Formelle Ordnungsmaßnahmen dürfen nicht vorschnell oder allein durch einzelne Lehrkräfte ausgesprochen werden.",
      common_mistakes:
        "- vorschnelle Sanktionen ohne Sachverhaltsklärung\n- fehlende Dokumentation\n- fehlende Beteiligung zuständiger Stellen\n- Verwechslung pädagogischer Maßnahmen mit formellen Ordnungsmaßnahmen\n- unklare Kommunikation gegenüber Schülerinnen, Schülern oder Eltern",
      official_url: "https://recht.nrw.de/",
      version_label: "MVP-Platzhalter – fachlich zu prüfen",
      last_reviewed_at: "",
      status: "draft",
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-accent/40 bg-accent/5 p-2">
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Muster-Wissenskarte</span> für
          {" "}
          <span className="font-medium">§ 53 SchulG NRW</span> (Rechtsgebiet: Schulrecht /
          Ordnungsmaßnahmen) als redaktionellen Arbeitsentwurf laden.
        </div>
        <Button size="sm" variant="outline" type="button" onClick={loadTemplate}>
          ✨ Muster-Wissenskarte laden
        </Button>
      </div>
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] italic text-amber-800 dark:text-amber-300">
        Diese Wissenskarte dient im MVP als redaktioneller Arbeitsentwurf. Maßgeblich ist
        ausschließlich die offizielle Rechtsquelle. Vor produktiver Nutzung ist eine fachliche
        Prüfung erforderlich. Keine verbindliche Rechtsauskunft.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Paragraph / Artikel">
          <Input
            value={form.section_number}
            onChange={(e) => setForm({ ...form, section_number: e.target.value })}
            placeholder="§ 53 SchulG NRW"
          />
        </Field>
        <Field label="Überschrift" className="md:col-span-2">
          <Input
            value={form.title ?? ""}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label="Kurzbeschreibung (summary)" className="md:col-span-3">
          <Textarea
            value={form.summary ?? ""}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            rows={2}
            placeholder="Prägnante Zusammenfassung in eigenen Worten"
          />
        </Field>
        <Field label="Volltext (full_text)" className="md:col-span-3">
          <Textarea
            value={form.full_text ?? ""}
            onChange={(e) => setForm({ ...form, full_text: e.target.value })}
            rows={4}
            placeholder="Offizieller Volltext der Norm. Leer lassen, wenn nicht hinterlegt – dann wird die Kurzbeschreibung oder ein Platzhalter gespeichert."
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Maßgeblich ist ausschließlich die offizielle Rechtsquelle.
          </p>
        </Field>
        <Field label="Praxisbedeutung" className="md:col-span-3">
          <Textarea
            value={form.practice_relevance ?? ""}
            onChange={(e) => setForm({ ...form, practice_relevance: e.target.value })}
            rows={2}
          />
        </Field>
        <Field label="Handlungsempfehlung" className="md:col-span-3">
          <Textarea
            value={form.recommendation ?? ""}
            onChange={(e) => setForm({ ...form, recommendation: e.target.value })}
            rows={2}
          />
        </Field>
        <Field label="Typische Fehler" className="md:col-span-3">
          <Textarea
            value={form.common_mistakes ?? ""}
            onChange={(e) => setForm({ ...form, common_mistakes: e.target.value })}
            rows={2}
          />
        </Field>
        <Field label="Offizielle URL" className="md:col-span-2">
          <Input
            type="url"
            value={form.official_url ?? ""}
            onChange={(e) => setForm({ ...form, official_url: e.target.value })}
            placeholder="https://…"
          />
        </Field>
        <Field label="Version / Rechtsstand">
          <Input
            value={form.version_label ?? ""}
            onChange={(e) => setForm({ ...form, version_label: e.target.value })}
            placeholder="z. B. 2024-01"
          />
        </Field>
        <Field label="Gültig ab">
          <Input
            type="date"
            value={form.valid_from ?? ""}
            onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
          />
        </Field>
        <Field label="Letzte fachliche Prüfung">
          <Input
            type="date"
            value={form.last_reviewed_at ?? ""}
            onChange={(e) => setForm({ ...form, last_reviewed_at: e.target.value })}
          />
        </Field>
        <Field label="Status">
          <select
            value={form.status ?? "draft"}
            onChange={(e) => setForm({ ...form, status: e.target.value as SectionForm["status"] })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="draft">Entwurf</option>
            <option value="reviewed">Geprüft</option>
            <option value="published">Veröffentlicht</option>
          </select>
        </Field>
        <Field label="Verwandte Rechtsgrundlagen" className="md:col-span-3">
          <select
            multiple
            value={form.related_section_ids ?? []}
            onChange={(e) =>
              setForm({
                ...form,
                related_section_ids: Array.from(e.target.selectedOptions).map((o) => o.value),
              })
            }
            className="min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          >
            {otherSections.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.section_number}
                {s.title ? ` – ${s.title}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Cmd/Strg+Klick für Mehrfachauswahl.
          </p>
        </Field>
      </div>
      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] italic text-amber-800 dark:text-amber-300">
        {MVP_NOTICE}
      </p>
      {error ? <ErrorState error={error} /> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button onClick={() => onSubmit(form)} disabled={!form.section_number || pending}>
          Speichern
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      {children}
    </div>
  );
}

/* ---------------- 🛠 Entwicklerwerkzeuge pro Rechtsquelle ---------------- */

function SourceDevTools({
  sourceId,
  sourceName,
  sections,
}: {
  sourceId: string;
  sourceName: string;
  sections: any[];
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "reset" | "enrich">(null);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastReport, setLastReport] = useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ["admin", "import-jobs", sourceId],
    queryFn: () => listImportJobs({ sourceId }),
  });

  const latestJob = jobsQ.data?.[0];

  async function handleReset() {
    if (
      !confirm(
        `Alle importierten Rechtsabschnitte der Quelle „${sourceName}" zurücksetzen?\n\n` +
          `Gelöscht werden nur importierte Entwürfe, die nicht veröffentlicht, ` +
          `nicht redaktionell geprüft und nicht mit Praxisfällen verknüpft sind. ` +
          `Manuell gepflegte Inhalte, Praxisfälle, Vorlagen und Schlagwörter bleiben unverändert.`,
      )
    ) return;
    setBusy("reset");
    setLastReport(null);
    try {
      const r = await resetSourceImports(sourceId);
      setLastReport(`Reset: ${r.deleted} gelöscht, ${r.skipped.length} übersprungen.`);
      qc.invalidateQueries({ queryKey: ["admin", "sections"] });
      qc.invalidateQueries({ queryKey: ["admin", "section-usage"] });
      qc.invalidateQueries({ queryKey: ["admin", "import-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin", "import-jobs", sourceId] });
    } catch (err) {
      alert((err as Error).message || "Reset fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  }

  async function handleReEnrich() {
    // KI-Wissenskarten für alle Abschnitte dieser Quelle erzeugen,
    // deren redaktionelle Felder noch leer sind.
    const targets = sections.filter(
      (sec) =>
        !sec.summary &&
        !sec.practice_relevance &&
        !sec.recommendation &&
        !sec.common_mistakes,
    );
    if (targets.length === 0) {
      alert("Alle Abschnitte enthalten bereits redaktionelle Inhalte – kein Bedarf.");
      return;
    }
    if (
      !confirm(
        `KI-Wissenskarten für ${targets.length} Abschnitt(e) ohne redaktionelle Inhalte erzeugen?`,
      )
    ) return;

    setBusy("enrich");
    setEnrichProgress({ current: 0, total: targets.length });
    setLastReport(null);

    const job = await startImportJob({
      source_id: sourceId,
      source_url: "kixi-batch://" + sourceId,
      detected_count: targets.length,
      notes: "KI-Wissenskarten-Batch",
    });

    let ok = 0;
    let failed = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const sec = targets[i];
        try {
          const res = await fetch("/api/enrich-legal-section", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              section_number: sec.section_number,
              title: sec.title ?? "",
              full_text: sec.full_text ?? "",
            }),
          });
          const raw = await res.text();
          const data = raw ? JSON.parse(raw) : null;
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
          const draft = data?.draft ?? {};
          // Nur schreiben, was tatsächlich befüllt wurde.
          const patch: Record<string, unknown> = {};
          if (draft.summary) patch.summary = draft.summary;
          if (draft.practice_relevance) patch.practice_relevance = draft.practice_relevance;
          if (draft.recommendation) patch.recommendation = draft.recommendation;
          if (draft.common_mistakes) patch.common_mistakes = draft.common_mistakes;
          if (Object.keys(patch).length) {
            const { supabase } = await import("@/integrations/supabase/client");
            const { error: updErr } = await (supabase.from("legal_sections") as any)
              .update(patch)
              .eq("id", sec.id);
            if (updErr) throw new Error(updErr.message);
          }
          await recordJobItem({
            job_id: job.id,
            section_number: sec.section_number,
            title: sec.title ?? null,
            section_id: sec.id,
            action: "enriched",
          });
          ok++;
        } catch (err) {
          failed++;
          try {
            await recordJobItem({
              job_id: job.id,
              section_number: sec.section_number,
              title: sec.title ?? null,
              section_id: sec.id,
              action: "failed",
              error: (err as Error).message,
            });
          } catch { /* Protokoll bestenfalls */ }
        }
        setEnrichProgress({ current: i + 1, total: targets.length });
      }
      await updateJobCounters(job.id, { enriched_count: ok, error_count: failed });
      await finishImportJob(job.id, failed === 0 ? "succeeded" : "failed");
      setLastReport(`KI-Wissenskarten: ${ok} erzeugt, ${failed} Fehler.`);
      qc.invalidateQueries({ queryKey: ["admin", "sections"] });
      qc.invalidateQueries({ queryKey: ["admin", "import-jobs"] });
    } finally {
      setBusy(null);
      setEnrichProgress(null);
    }
  }

  const statusIcon: Record<string, string> = {
    running: "🟡",
    succeeded: "🟢",
    failed: "🔴",
    cancelled: "⚪",
  };

  return (
    <div className="border-t border-dashed border-border bg-amber-500/[0.03] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-amber-600" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          Entwicklerwerkzeuge
        </h4>
        {latestJob && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            Letzter Import: {statusIcon[latestJob.status] ?? "·"} {new Date(latestJob.started_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={handleReset}>
          {busy === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Import zurücksetzen
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={handleReEnrich}>
          {busy === "enrich" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          KI-Wissenskarten neu erzeugen
        </Button>
        <Link to="/admin/import-protokoll">
          <Button size="sm" variant="ghost">
            <ListChecks className="h-3.5 w-3.5" /> Importprotokoll
          </Button>
        </Link>
      </div>
      {enrichProgress && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Erstelle Wissenskarten … {enrichProgress.current} von {enrichProgress.total} fertig
        </div>
      )}
      {lastReport && (
        <div className="mt-2 rounded-md border border-border bg-card p-2 text-[11px]">{lastReport}</div>
      )}
      <p className="mt-2 text-[10px] italic text-muted-foreground">
        Entwicklungsfunktion – löscht nur importierte Entwürfe ohne Prüfung und ohne Verknüpfungen. Alle anderen Inhalte bleiben unverändert.
      </p>
    </div>
  );
}
