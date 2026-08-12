import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Minus,
  Sparkles,
  Loader2,
  Star,
  FileText,
  ExternalLink,
  X,
  Info,
  BookOpen,
  Filter,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  createLegalLink,
  deleteLegalLink,
  updateLegalLink,
  listCaseLegalLinks,
  listSections,
  listSources,
} from "@/lib/coreBuilder";
import {
  matchLegalSections,
  buildExplanation,
  starsToRelevance,
  confidenceAmpel,
  ampelDot,
  type LegalMatch,
  type MatchResponse,
} from "@/lib/legalMatching";
import { formatSectionHeading } from "@/lib/legalSectionLabel";

type Relevance = "low" | "medium" | "high";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: string;
  caseInput: {
    title: string;
    short_description?: string;
    category?: string;
    subcategory?: string;
    bildungsgang?: string;
    keywords?: string[];
  };
};

function relevanceDot(r?: string | null) {
  if (r === "high") return "🔴";
  if (r === "medium") return "🟡";
  return "⚪";
}

function relevanceLabel(r?: string | null) {
  if (r === "high") return "hoch";
  if (r === "medium") return "mittel";
  return "niedrig";
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("de-DE");
  } catch {
    return "";
  }
}

export function LegalAssignmentDialog({ open, onOpenChange, caseId, caseInput }: Props) {
  const qc = useQueryClient();
  const sectionsQ = useQuery({ queryKey: ["admin", "sections"], queryFn: listSections });
  const sourcesQ = useQuery({ queryKey: ["admin", "sources"], queryFn: listSources });
  const linksQ = useQuery({
    queryKey: ["admin", "case-legal-links", caseId],
    queryFn: () => listCaseLegalLinks(caseId),
    enabled: !!caseId,
  });

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<
    "all" | "published" | "draft" | "used" | "unused"
  >("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<MatchResponse | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const sourceById = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of (sourcesQ.data ?? []) as any[]) m.set(s.id, s);
    return m;
  }, [sourcesQ.data]);

  const sectionById = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of (sectionsQ.data ?? []) as any[]) m.set(s.id, s);
    return m;
  }, [sectionsQ.data]);

  const linkedByIds = useMemo(() => {
    const m = new Map<string, any>();
    for (const l of (linksQ.data ?? []) as any[]) {
      if (l?.legal_section_id) m.set(l.legal_section_id, l);
    }
    return m;
  }, [linksQ.data]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ((sectionsQ.data ?? []) as any[]).filter((s) => {
      if (sourceFilter.size > 0 && !sourceFilter.has(s.source_id)) return false;
      if (statusFilter === "published" && s.status !== "published") return false;
      if (statusFilter === "draft" && s.status === "published") return false;
      if (statusFilter === "used" && !linkedByIds.has(s.id)) return false;
      if (statusFilter === "unused" && linkedByIds.has(s.id)) return false;
      if (!q) return true;
      const src = sourceById.get(s.source_id);
      const hay = [
        s.section_number,
        s.reference,
        s.title,
        s.summary,
        s.practice_relevance,
        s.recommendation,
        s.full_text,
        src?.name,
        src?.short_name,
        src?.legal_area,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sectionsQ.data, sourceById, sourceFilter, statusFilter, search, linkedByIds]);

  const aiMut = useMutation({
    mutationFn: async () => {
      const sections = ((sectionsQ.data ?? []) as any[]).map((s) => {
        const src = sourceById.get(s.source_id);
        return {
          id: s.id as string,
          source_short: (src?.short_name ?? src?.name ?? "") as string,
          section_number: (s.section_number ?? s.reference ?? "") as string,
          title: (s.title ?? "") as string,
          summary: (s.summary ?? s.practice_relevance ?? "") as string,
        };
      });
      if (sections.length === 0) throw new Error("Keine Rechtsabschnitte in der Wissensbasis.");
      return matchLegalSections({ ...caseInput, sections });
    },
    onSuccess: (r) => {
      setAiResult(r);
      if (r.matches.length === 0) toast.info("Kein passender Rechtsabschnitte gefunden.");
      else toast.success(`${r.matches.length} KI-Vorschläge erhalten.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "case-legal-links", caseId] });
    qc.invalidateQueries({ queryKey: ["case-links", caseId] });
    qc.invalidateQueries({ queryKey: ["knowledge-index"] });
  };

  async function assignSection(sectionId: string, opts?: { explanation?: string; relevance?: Relevance | null }) {
    if (linkedByIds.has(sectionId)) {
      toast.message("Bereits verknüpft.");
      return;
    }
    setSavingId(sectionId);
    try {
      await createLegalLink(caseId, sectionId, opts?.explanation ?? undefined, opts?.relevance ?? null);
      toast.success("Rechtsgrundlage zugeordnet.");
      invalidate();
      linksQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function removeLink(linkId: string) {
    try {
      await deleteLegalLink(linkId);
      toast.success("Zuordnung entfernt.");
      invalidate();
      linksQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function patchLink(linkId: string, patch: { explanation?: string | null; relevance?: Relevance | null }) {
    try {
      await updateLegalLink(linkId, patch);
      invalidate();
      linksQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const selected = selectedId ? sectionById.get(selectedId) : null;
  const selectedSource = selected ? sourceById.get(selected.source_id) : null;
  const selectedHeading = selected ? formatSectionHeading(selected, selectedSource) : null;
  const selectedLink = selectedId ? linkedByIds.get(selectedId) : null;

  const linkedList = (linksQ.data ?? []) as any[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" />
            Rechtsgrundlagen zuordnen
          </DialogTitle>
          <DialogDescription className="text-xs">
            Suchen, filtern, KI-Vorschläge übernehmen — links wählen, rechts prüfen.
          </DialogDescription>
        </DialogHeader>

        {/* Search + Filter bar (sticky) */}
        <div className="sticky top-0 z-20 border-b border-border bg-muted/40 px-5 py-3 backdrop-blur">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="lg"
              onClick={() => aiMut.mutate()}
              disabled={aiMut.isPending || !caseInput.title?.trim()}
              className="h-11 flex-1 gap-2 bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 sm:flex-none"
            >
              {aiMut.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> KI analysiert …
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" /> 🤖 Rechtsgrundlagen automatisch zuordnen
                </>
              )}
            </Button>
            {aiResult && aiResult.matches.length > 0 && (
              <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
                {aiResult.matches.length} KI-Vorschläge unten
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="§53, Aufsicht, Datenschutz, Mobbing, Rechtsquelle …"
                className="h-9 pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="h-9 w-[180px]">
                <Filter className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Rechtsabschnitte</SelectItem>
                <SelectItem value="published">Nur veröffentlichte</SelectItem>
                <SelectItem value="draft">Nur Entwürfe</SelectItem>
                <SelectItem value="used">Nur bereits verwendete</SelectItem>
                <SelectItem value="unused">Nur noch nicht verwendete</SelectItem>
              </SelectContent>
            </Select>
          </div>


          {/* Source chips */}
          {(sourcesQ.data ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(sourcesQ.data as any[]).map((s) => {
                const active = sourceFilter.has(s.id);
                const label = s.short_name || s.name;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSourceFilter((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      });
                    }}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted",
                    )}
                    title={s.name}
                  >
                    {active && <Check className="mr-1 inline h-3 w-3" />}
                    {label}
                  </button>
                );
              })}
              {sourceFilter.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSourceFilter(new Set())}
                  className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  <X className="mr-1 inline h-3 w-3" />
                  Filter zurücksetzen
                </button>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* LEFT: available */}
          <div className="flex min-h-0 flex-col border-r border-border">
            <div className="border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Verfügbare Rechtsgrundlagen
              <span className="ml-1 text-muted-foreground/70">
                ({filteredSections.length})
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {/* AI Suggestions */}
              {aiResult && aiResult.matches.length > 0 && (
                <div className="mb-3 rounded-xl border border-accent/40 bg-accent/5 p-2">
                  <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-accent">
                    <Sparkles className="h-3.5 w-3.5" />
                    🤖 Von der KI empfohlen
                  </div>
                  <ul className="space-y-1.5">
                    {aiResult.matches.slice(0, 6).map((m) => {
                      const sec = sectionById.get(m.id);
                      if (!sec) return null;
                      const src = sourceById.get(sec.source_id);
                      const h = formatSectionHeading(sec, src);
                      const ampel = confidenceAmpel(m.confidence);
                      const linked = linkedByIds.has(m.id);
                      return (
                        <AiRow
                          key={m.id}
                          match={m}
                          heading={h}
                          ampel={ampel}
                          linked={linked}
                          selected={selectedId === m.id}
                          onSelect={() => setSelectedId(m.id)}
                          onAssign={() =>
                            assignSection(m.id, {
                              explanation: buildExplanation(m),
                              relevance: starsToRelevance(m.relevance_stars),
                            })
                          }
                          saving={savingId === m.id}
                        />
                      );
                    })}
                  </ul>
                  {aiResult.missing_area && (
                    <p className="mt-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                      🟡 Rechtsbereich nicht in Wissensbasis: {aiResult.missing_area}
                    </p>
                  )}
                </div>
              )}

              {/* Section cards */}
              <ul className="space-y-2">
                {filteredSections.map((s: any) => {
                  const src = sourceById.get(s.source_id);
                  const h = formatSectionHeading(s, src);
                  const linked = linkedByIds.has(s.id);
                  const isSelected = selectedId === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className={cn(
                          "group flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:border-primary/40 hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              {h.source || "—"}
                            </div>
                            <div className="truncate text-sm font-semibold">{h.line || "(ohne Titel)"}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {s.status && s.status !== "published" && (
                              <Badge variant="outline" className="text-[10px]">
                                {s.status}
                              </Badge>
                            )}
                            {linked ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1 px-2 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const l = linkedByIds.get(s.id);
                                  if (l) removeLink(l.id);
                                }}
                              >
                                <Minus className="h-3.5 w-3.5" /> Entfernen
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 gap-1 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  assignSection(s.id);
                                }}
                                disabled={savingId === s.id}
                              >
                                {savingId === s.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5" />
                                )}
                                Zuordnen
                              </Button>
                            )}
                          </div>
                        </div>
                        {s.summary && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{s.summary}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          {linked && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                              ✓ zugeordnet
                            </span>
                          )}
                          {s.last_reviewed_at && (
                            <span>Stand: {formatDate(s.last_reviewed_at)}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
                {filteredSections.length === 0 && (
                  <li className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Keine Treffer. Suche oder Filter anpassen.
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* RIGHT: assigned + preview */}
          <div className="flex min-h-0 flex-col">
            {/* Assigned list */}
            <div className="min-h-0 border-b border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>Bereits zugeordnet</span>
                <span>{linkedList.length}</span>
              </div>
              <div className="max-h-[42vh] overflow-y-auto p-3">
                {linkedList.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Noch keine Rechtsgrundlage zugeordnet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {linkedList.map((l: any) => {
                      const sec = l.legal_sections;
                      const src = sec?.legal_sources;
                      const h = formatSectionHeading(
                        {
                          section_number: sec?.section_number ?? sec?.reference,
                          title: sec?.title,
                        },
                        src ? { name: src?.name, short_name: src?.short_name } : null,
                      );
                      return (
                        <li
                          key={l.id}
                          className={cn(
                            "rounded-xl border p-2.5 text-sm",
                            selectedId === sec?.id
                              ? "border-primary bg-primary/5"
                              : "border-border bg-background",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => sec?.id && setSelectedId(sec.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                {h.source || "—"}
                              </div>
                              <div className="truncate font-semibold">{h.line}</div>
                            </button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeLink(l.id)}
                              title="Entfernen"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                            <Select
                              value={(l.relevance ?? "medium") as string}
                              onValueChange={(v) =>
                                patchLink(l.id, { relevance: v as Relevance })
                              }
                            >
                              <SelectTrigger className="h-7 w-[130px] text-[11px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="high">🔴 hoch</SelectItem>
                                <SelectItem value="medium">🟡 mittel</SelectItem>
                                <SelectItem value="low">⚪ niedrig</SelectItem>
                              </SelectContent>
                            </Select>
                            <LinkExplanationEditor
                              value={l.explanation ?? l.note ?? ""}
                              onSave={(v) => patchLink(l.id, { explanation: v })}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Schnellvorschau
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {!selected ? (
                  <div className="grid h-full place-items-center text-center text-xs text-muted-foreground">
                    <div>
                      <Info className="mx-auto mb-2 h-6 w-6 opacity-50" />
                      Rechtsgrundlage links auswählen, um Vorschau, Praxisrelevanz und
                      Handlungsempfehlung zu sehen.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {selectedHeading?.source || "—"}
                      </div>
                      <h4 className="text-base font-semibold">{selectedHeading?.line}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {selected.status && <Badge variant="outline">{selected.status}</Badge>}
                        {selected.last_reviewed_at && (
                          <span>Stand: {formatDate(selected.last_reviewed_at)}</span>
                        )}
                        {selected.official_url && (
                          <a
                            href={selected.official_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> Offizielle Quelle
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedLink ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeLink(selectedLink.id)}
                        >
                          <Minus className="h-4 w-4" /> Zuordnung entfernen
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => assignSection(selected.id)}
                          disabled={savingId === selected.id}
                        >
                          <Plus className="h-4 w-4" /> Diese Rechtsgrundlage zuordnen
                        </Button>
                      )}
                      <a
                        href={`/admin/rechtsgrundlagen/${selected.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        <BookOpen className="h-3.5 w-3.5" /> Wissenskarte öffnen
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    {selected.summary && (
                      <PreviewBlock title="Kurzbeschreibung" text={selected.summary} />
                    )}
                    {selected.practice_relevance && (
                      <PreviewBlock title="Praxisrelevanz" text={selected.practice_relevance} />
                    )}
                    {selected.recommendation && (
                      <PreviewBlock
                        title="Handlungsempfehlung"
                        text={selected.recommendation}
                        tone="success"
                      />
                    )}
                    {selected.common_mistakes && (
                      <PreviewBlock
                        title="Häufige Fehler"
                        text={selected.common_mistakes}
                        tone="warning"
                      />
                    )}
                    {selected.full_text && (
                      <details className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <FileText className="mr-1 inline h-3 w-3" />
                          Offizieller Gesetzestext
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-foreground/90">
                          {selected.full_text}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-2.5">
          <div className="text-xs text-muted-foreground">
            {linkedList.length} Rechtsgrundlage{linkedList.length === 1 ? "" : "n"} zugeordnet
          </div>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBlock({
  title,
  text,
  tone = "default",
}: {
  title: string;
  text: string;
  tone?: "default" | "success" | "warning";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-background";
  return (
    <div className={cn("rounded-lg border p-3", cls)}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <p className="whitespace-pre-wrap text-xs text-foreground/90">{text}</p>
    </div>
  );
}

function AiRow({
  match,
  heading,
  ampel,
  linked,
  selected,
  onSelect,
  onAssign,
  saving,
}: {
  match: LegalMatch;
  heading: { source: string; line: string };
  ampel: ReturnType<typeof confidenceAmpel>;
  linked: boolean;
  selected: boolean;
  onSelect: () => void;
  onAssign: () => void;
  saving: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg border bg-background p-2",
        selected ? "border-primary" : "border-border",
      )}
    >
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {heading.source}
          <span className="inline-flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "h-3 w-3",
                  i < match.relevance_stars
                    ? "fill-amber-500 text-amber-500"
                    : "text-muted-foreground/40",
                )}
              />
            ))}
          </span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal">
            {ampelDot(ampel)} {Math.round(match.confidence)} %
          </span>
        </div>
        <div className="truncate text-sm font-semibold">{heading.line}</div>
        {match.reason && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{match.reason}</p>
        )}
      </button>
      {linked ? (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          ✓
        </Badge>
      ) : (
        <Button size="sm" className="h-7 shrink-0 gap-1 px-2" onClick={onAssign} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      )}
    </li>
  );
}

function LinkExplanationEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="min-w-0 flex-1 truncate rounded-md border border-dashed border-border bg-background px-2 py-1 text-left text-[11px] italic text-muted-foreground hover:bg-muted"
        title="Begründung bearbeiten"
      >
        {value?.trim() ? value : "Begründung hinzufügen …"}
      </button>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-7 text-[11px]"
        placeholder="Begründung / Signale"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={() => {
          onSave(draft.trim());
          setEditing(false);
        }}
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={() => setEditing(false)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
