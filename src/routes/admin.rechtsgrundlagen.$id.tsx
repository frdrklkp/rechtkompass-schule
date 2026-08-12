import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  listSources,
  listSections,
  listSectionUsage,
  listCases,
  type SectionUsageEntry,
} from "@/lib/coreBuilder";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingState, ErrorState } from "@/components/DataStates";
import { useKnowledgeIndex } from "@/lib/knowledgeIndex";
import { ImpactPanel } from "@/components/ImpactPanel";

export const Route = createFileRoute("/admin/rechtsgrundlagen/$id")({
  component: AdminSectionDetail,
});

const RELEVANCE_LABEL: Record<string, string> = { low: "niedrig", medium: "mittel", high: "hoch" };
const RELEVANCE_TONE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  reviewed: "Geprüft",
  published: "Veröffentlicht",
};

type LinkDebug = {
  action: "insert" | "delete";
  triggeredAt: string;
  handlerTriggered: boolean;
  currentLegalSectionIdSet: boolean;
  selectedCaseIdSet?: boolean;
  queryExecuted: boolean;
  selectedCaseTitle?: string;
  case_id?: string;
  legal_section_id?: string;
  relevance?: "low" | "medium" | "high";
  explanation?: string | null;
  insertPayload?: Record<string, unknown>;
  deleteQuery?: string;
  link_id?: string;
  errorMessage?: string | null;
  errorCode?: string | null;
  resultData?: unknown;
  deletedRows?: number | null;
  rlsBlocked?: boolean;
  grantMissing?: boolean;
  reloadRequested?: boolean;
};

function analyzeSupabaseError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? "";
  const code = error?.code ?? "";
  return {
    rlsBlocked: /row-level security|rls/i.test(message),
    grantMissing: code === "42501" || /permission denied|grant/i.test(message),
  };
}

function SectionBlock({
  title,
  text,
}: {
  title: string;
  text?: string | null;
}) {
  const value = typeof text === "string" ? text.trim() : "";
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {value ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{value}</p>
      ) : (
        <p className="mt-2 text-xs italic text-muted-foreground">
          Dieser Abschnitt ist noch nicht redaktionell ausgearbeitet.
        </p>
      )}
    </section>
  );
}

function AdminSectionDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ki = useKnowledgeIndex();

  const sectionsQ = useQuery({ queryKey: ["admin", "sections"], queryFn: listSections });
  const sourcesQ = useQuery({ queryKey: ["admin", "sources"], queryFn: listSources });
  const usageQ = useQuery({ queryKey: ["admin", "section-usage"], queryFn: listSectionUsage });
  const casesQ = useQuery({ queryKey: ["admin", "cases"], queryFn: listCases });
  const rawLinksQ = useQuery({
    queryKey: ["admin", "case-legal-links", id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("case_legal_links") as any)
        .select("id, case_id, legal_section_id, relevance, explanation, created_at")
        .eq("legal_section_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const section = useMemo(
    () => ((sectionsQ.data ?? []) as any[]).find((s) => s.id === id),
    [sectionsQ.data, id],
  );
  const source = useMemo(
    () => ((sourcesQ.data ?? []) as any[]).find((s) => s.id === section?.source_id),
    [sourcesQ.data, section],
  );
  const usage: SectionUsageEntry | undefined = usageQ.data?.get(id);

  const [addOpen, setAddOpen] = useState(false);
  const [pendingUnlink, setPendingUnlink] = useState<{ linkId: string; caseId: string; title: string } | null>(null);
  const [linkDebug, setLinkDebug] = useState<LinkDebug | null>(null);

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "case-legal-links", id] }),
      qc.invalidateQueries({ queryKey: ["admin", "section-usage"] }),
      qc.invalidateQueries({ queryKey: ["admin", "cases"] }),
    ]);
  };

  const linkMut = useMutation({
    mutationFn: async (p: {
      caseId: string;
      selectedCaseTitle?: string;
      explanation?: string;
      relevance: "low" | "medium" | "high";
    }) => {
      const payload = {
        case_id: p.caseId,
        legal_section_id: id,
        relevance: p.relevance,
        explanation: p.explanation?.trim() || null,
      };
      const baseDebug: LinkDebug = {
        action: "insert",
        triggeredAt: new Date().toISOString(),
        handlerTriggered: true,
        currentLegalSectionIdSet: Boolean(id),
        selectedCaseIdSet: Boolean(p.caseId),
        selectedCaseTitle: p.selectedCaseTitle,
        case_id: p.caseId,
        legal_section_id: id,
        relevance: p.relevance,
        explanation: payload.explanation,
        insertPayload: payload,
        queryExecuted: false,
        errorMessage: null,
        errorCode: null,
        resultData: null,
      };
      setLinkDebug(baseDebug);
      if (!id || !p.caseId) {
        throw new Error("legal_section_id oder case_id fehlt – Insert wurde nicht ausgeführt.");
      }

      const { data, error } = await (supabase.from("case_legal_links") as any)
        .insert(payload)
        .select("id, case_id, legal_section_id, relevance, explanation, created_at");
      const analysis = analyzeSupabaseError(error);
      setLinkDebug({
        ...baseDebug,
        queryExecuted: true,
        errorMessage: error?.message ?? null,
        errorCode: error?.code ?? null,
        resultData: data ?? null,
        ...analysis,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setAddOpen(false);
      await invalidate();
      setLinkDebug((prev) => (prev ? { ...prev, reloadRequested: true } : prev));
      toast.success("Praxisfall verknüpft.");
    },
    onError: async (err: unknown) => {
      await invalidate();
      setLinkDebug((prev) => (prev ? { ...prev, reloadRequested: true } : prev));
      const e = err as Error;
      toast.error("Verknüpfung fehlgeschlagen: " + e.message);
    },
  });

  const unlinkMut = useMutation({
    mutationFn: async (p: { linkId: string; caseId: string; legalSectionId: string }) => {
      const baseDebug: LinkDebug = {
        action: "delete",
        triggeredAt: new Date().toISOString(),
        handlerTriggered: true,
        currentLegalSectionIdSet: Boolean(p.legalSectionId),
        queryExecuted: false,
        link_id: p.linkId,
        case_id: p.caseId,
        legal_section_id: p.legalSectionId,
        deleteQuery: `supabase.from("case_legal_links").delete().eq("id", "${p.linkId}")`,
        errorMessage: null,
        errorCode: null,
        resultData: null,
        deletedRows: null,
      };
      setLinkDebug(baseDebug);
      if (!p.linkId) throw new Error("link.id fehlt – Delete wurde nicht ausgeführt.");

      const { data, error } = await (supabase.from("case_legal_links") as any)
        .delete()
        .eq("id", p.linkId)
        .select("id, case_id, legal_section_id, relevance, explanation, created_at");
      const analysis = analyzeSupabaseError(error);
      setLinkDebug({
        ...baseDebug,
        queryExecuted: true,
        errorMessage: error?.message ?? null,
        errorCode: error?.code ?? null,
        resultData: data ?? null,
        deletedRows: Array.isArray(data) ? data.length : null,
        ...analysis,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setPendingUnlink(null);
      await invalidate();
      setLinkDebug((prev) => (prev ? { ...prev, reloadRequested: true } : prev));
      toast.success("Verknüpfung gelöscht.");
    },
    onError: async (err: unknown) => {
      await invalidate();
      setLinkDebug((prev) => (prev ? { ...prev, reloadRequested: true } : prev));
      const e = err as Error;
      toast.error("Löschen fehlgeschlagen: " + e.message);
    },
  });

  if (sectionsQ.isLoading || sourcesQ.isLoading) return <LoadingState />;
  if (sectionsQ.error) return <ErrorState error={sectionsQ.error} />;
  if (!section) {
    return (
      <div className="space-y-4">
        <Link
          to="/admin/rechtsgrundlagen"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Zurück zur Übersicht
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Rechtsabschnitt nicht gefunden (ID: <code className="rounded bg-muted px-1">{id}</code>).
          </p>
        </div>
      </div>
    );
  }

  const status = section.status ?? "draft";
  const linkedIds = new Set((usage?.cases ?? []).map((c) => c.id));
  const availableCases = ((casesQ.data ?? []) as any[]).filter((c) => !linkedIds.has(c.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/admin/rechtsgrundlagen"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Zurück zur Übersicht
        </Link>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            navigate({
              to: "/admin/rechtsgrundlagen",
              search: { edit: section.id } as any,
            })
          }
        >
          <Pencil className="h-3.5 w-3.5" /> Wissenskarte bearbeiten
        </Button>
      </div>

      {/* Header / Wissenskarte */}
      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span>{source?.short_name || source?.name || "Rechtsquelle"}</span>
          {source?.legal_area && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] normal-case tracking-normal">
              {source.legal_area}
            </span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] normal-case tracking-normal">
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {section.section_number}
          {section.title ? <span className="text-muted-foreground"> — {section.title}</span> : null}
        </h1>
        {section.summary && (
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">{section.summary}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
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
          {section.version_label && <span>Rechtsstand: {section.version_label}</span>}
          {section.valid_from && <span>Gültig ab: {section.valid_from}</span>}
          {section.last_reviewed_at && <span>Zuletzt geprüft: {section.last_reviewed_at}</span>}
        </div>
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] italic text-amber-800 dark:text-amber-300">
          Maßgeblich ist ausschließlich die offizielle Rechtsquelle.
        </p>
      </header>

      {/* Impact-Analyse aus der Wissensbasis */}
      {ki.index && (
        <ImpactPanel index={ki.index} entityKind="section" entityId={id} editing />
      )}

      {/* Wissenskarten-Blöcke */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionBlock title="1. Was regelt diese Vorschrift?" text={section.summary} />
        <SectionBlock title="2. Warum ist sie für Lehrkräfte wichtig?" text={section.practice_relevance} />
        <SectionBlock title="3. Was bedeutet sie im Schulalltag?" text={section.practice_relevance} />
        <SectionBlock title="4. Welche Handlung folgt daraus?" text={section.recommendation} />
        <SectionBlock title="5. Welche Fehler sollte man vermeiden?" text={section.common_mistakes} />
        <SectionBlock title="Volltext (Arbeitsentwurf)" text={section.full_text} />
      </div>

      {/* Verknüpfte Praxisfälle */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              6. Welche Praxisfälle sind damit verbunden?
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {(usage?.cases ?? []).length} verknüpfte Praxisfälle
            </p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Praxisfall verknüpfen
          </Button>
        </div>

        {(usage?.cases ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs italic text-muted-foreground">
            Noch keine Praxisfälle verknüpft.
          </p>
        ) : (
          <ul className="space-y-2">
            {(usage?.cases ?? []).map((c) => (
              <li
                key={c.link_id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
              >
                <Link
                  to="/admin/faelle/$id"
                  params={{ id: c.id }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-accent"
                >
                  <BookOpen className="h-3.5 w-3.5" /> {c.title}
                </Link>
                {c.relevance && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      RELEVANCE_TONE[c.relevance] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    Relevanz: {RELEVANCE_LABEL[c.relevance] ?? c.relevance}
                  </span>
                )}
                {c.note && (
                  <span className="text-[11px] text-muted-foreground">„{c.explanation ?? c.note}“</span>
                )}
                <button
                  onClick={() =>
                    setPendingUnlink({ linkId: c.link_id, caseId: c.id, title: c.title })
                  }
                  className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  title="Verknüpfung löschen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <LinkDebugPanel debug={linkDebug} rawLinks={rawLinksQ.data ?? []} rawLinksError={rawLinksQ.error} />
      </section>

      {/* Offizielle Quelle */}
      {section.official_url && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">7. Offizielle Quelle öffnen</h2>
          <a
            href={section.official_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <ExternalLink className="h-4 w-4" /> {section.official_url}
          </a>
        </section>
      )}

      {/* Add-Dialog */}
      <AddLinkDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        cases={availableCases}
        pending={linkMut.isPending}
        onSubmit={(p) => linkMut.mutate(p)}
      />

      {/* Unlink-Confirm */}
      <AlertDialog
        open={!!pendingUnlink}
        onOpenChange={(o) => !o && setPendingUnlink(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verknüpfung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Verknüpfung zum Praxisfall „{pendingUnlink?.title}“ wird entfernt. Der Praxisfall
              selbst bleibt bestehen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingUnlink) {
                  unlinkMut.mutate({
                    linkId: pendingUnlink.linkId,
                    caseId: pendingUnlink.caseId,
                    legalSectionId: id,
                  });
                }
              }}
              disabled={unlinkMut.isPending}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LinkDebugPanel({
  debug,
  rawLinks,
  rawLinksError,
}: {
  debug: LinkDebug | null;
  rawLinks: any[];
  rawLinksError: unknown;
}) {
  const rawError = rawLinksError as { message?: string; code?: string } | null;
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        Debug case_legal_links
      </div>
      <dl className="grid gap-1 text-[11px] font-mono text-foreground/80 sm:grid-cols-2">
        <div><dt className="inline text-muted-foreground">case_legal_links geladen: </dt><dd className="inline">{rawLinks.length}</dd></div>
        {rawError?.message && (
          <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Reload-Fehler: </dt><dd className="inline">{rawError.message}</dd></div>
        )}
        {debug ? (
          <>
            <div><dt className="inline text-muted-foreground">Aktion: </dt><dd className="inline">{debug.action}</dd></div>
            <div><dt className="inline text-muted-foreground">Button-Handler: </dt><dd className="inline">{debug.handlerTriggered ? "ausgelöst" : "nein"}</dd></div>
            <div><dt className="inline text-muted-foreground">currentLegalSectionId gesetzt: </dt><dd className="inline">{debug.currentLegalSectionIdSet ? "ja" : "nein"}</dd></div>
            {debug.selectedCaseIdSet !== undefined && (
              <div><dt className="inline text-muted-foreground">selectedCaseId gesetzt: </dt><dd className="inline">{debug.selectedCaseIdSet ? "ja" : "nein"}</dd></div>
            )}
            <div><dt className="inline text-muted-foreground">Query ausgeführt: </dt><dd className="inline">{debug.queryExecuted ? "ja" : "nein"}</dd></div>
            {debug.rlsBlocked !== undefined && <div><dt className="inline text-muted-foreground">RLS blockiert: </dt><dd className="inline">{debug.rlsBlocked ? "wahrscheinlich ja" : "nein"}</dd></div>}
            {debug.grantMissing !== undefined && <div><dt className="inline text-muted-foreground">GRANT fehlt: </dt><dd className="inline">{debug.grantMissing ? "wahrscheinlich ja" : "nein"}</dd></div>}
          </>
        ) : (
          <div className="sm:col-span-2 text-muted-foreground">Noch keine Insert/Delete-Aktion in dieser Ansicht.</div>
        )}
      </dl>
      {debug && (
        <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-background p-3 text-[11px] text-foreground/85">
          {JSON.stringify(debug, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AddLinkDialog({
  open,
  onOpenChange,
  cases,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cases: any[];
  onSubmit: (p: {
    caseId: string;
    selectedCaseTitle?: string;
    relevance: "low" | "medium" | "high";
    explanation?: string;
  }) => void;
  pending: boolean;
}) {
  const [caseId, setCaseId] = useState("");
  const [relevance, setRelevance] = useState<"low" | "medium" | "high">("medium");
  const [explanation, setExplanation] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setCaseId("");
          setRelevance("medium");
          setExplanation("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Praxisfall verknüpfen</DialogTitle>
          <DialogDescription>
            Wähle den Praxisfall, die Relevanz und begründe kurz den Zusammenhang.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Praxisfall</label>
            <select
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">— Praxisfall wählen —</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            {cases.length === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Alle vorhandenen Praxisfälle sind bereits verknüpft.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Relevanz</label>
            <select
              value={relevance}
              onChange={(e) => setRelevance(e.target.value as any)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="low">niedrig</option>
              <option value="medium">mittel</option>
              <option value="high">hoch</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Begründung</label>
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={3}
              placeholder="Warum ist dieser Praxisfall mit der Rechtsgrundlage verknüpft?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            disabled={!caseId || pending}
            onClick={() => {
              const selectedCaseTitle = cases.find((c) => c.id === caseId)?.title;
              onSubmit({
                caseId,
                selectedCaseTitle,
                relevance,
                explanation: explanation.trim() || undefined,
              });
            }}
          >
            <Link2 className="h-4 w-4" /> Verknüpfen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
