import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCaseEvents,
  useCaseLegalFlags,
  useCaseReviews,
  useCaseVersions,
  useEditorialCase,
} from "@/hooks/editorial/useWorkflowActions";
import {
  WorkflowBadge,
  PublicationBadge,
  QualityBadge,
  LegalUpdateBadge,
  ReviewBadge,
} from "@/components/editorial/badges";
import { WorkflowProgress } from "@/components/editorial/WorkflowProgress";
import { WorkflowActionButtons } from "@/components/editorial/WorkflowActionButtons";
import { VersionList } from "@/components/editorial/VersionList";
import { EventTimeline } from "@/components/editorial/EventTimeline";
import { useCaseQuality } from "@/hooks/editorial/useQuality";
import { QualitySummaryCard } from "@/components/editorial/quality/QualitySummaryCard";
import { QualityRuleList } from "@/components/editorial/quality/QualityRuleList";
import { ReadinessBadge } from "@/components/editorial/quality/ReadinessBadge";
import { AISessionProvider } from "@/services/editorial/ai";
import { EditorialCopilot } from "@/components/editorial/ai/EditorialCopilot";
import { useEditorialRole } from "@/hooks/editorial/useEditorialRole";

export const Route = createFileRoute("/admin/editorial/faelle/$id")({
  component: EditorialCaseDetail,
});

function EditorialCaseDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const caseQ = useEditorialCase(id);
  const versionsQ = useCaseVersions(id);
  const reviewsQ = useCaseReviews(id);
  const eventsQ = useCaseEvents(id);
  const flagsQ = useCaseLegalFlags(id);
  const qualityQ = useCaseQuality(id);

  const pendingReview =
    reviewsQ.data?.find((r) => r.status === "pending") ?? null;
  const lastDecided = reviewsQ.data?.find(
    (r) => r.status === "changes_requested" || r.status === "rejected",
  );

  if (caseQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (caseQ.error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Fehler beim Laden des Falls.
      </div>
    );
  }
  const c = caseQ.data;
  if (!c) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        Fall nicht gefunden oder nicht zugänglich.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to="/admin/editorial/faelle" className="text-xs text-muted-foreground hover:underline">
              ← zur Fallliste
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <WorkflowBadge status={c.workflow_status} />
              <PublicationBadge tier={c.publication_tier} />
              <QualityBadge status={c.quality_status} />
              <LegalUpdateBadge active={c.legal_update_required} />
              {qualityQ.data && (
                <ReadinessBadge status={qualityQ.data.assessment.readinessStatus} />
              )}
            </div>
          </div>
          <WorkflowActionButtons
            caseRow={c}
            pendingReview={pendingReview}
            onEdit={() => navigate({ to: "/admin/faelle/$id", params: { id } })}
          />
        </div>
        <WorkflowProgress
          status={c.workflow_status}
          lastReviewDecision={
            c.workflow_status === "draft" && lastDecided
              ? (lastDecided.status as "changes_requested" | "rejected")
              : null
          }
        />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Übersicht</TabsTrigger>
              <TabsTrigger value="quality">Qualität</TabsTrigger>
              <TabsTrigger value="ai">KI-Assistent</TabsTrigger>
              <TabsTrigger value="edit">Bearbeitung</TabsTrigger>
              <TabsTrigger value="versions">Versionen ({versionsQ.data?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="reviews">Reviews ({reviewsQ.data?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="events">Ereignisse ({eventsQ.data?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="legal">Rechtsgrundlagen</TabsTrigger>
              <TabsTrigger value="meta">Metadaten</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-3">
              {c.short_description && (
                <p className="text-sm text-foreground">{c.short_description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Kategorie: {c.category ?? "—"}
                {c.subcategory ? ` · ${c.subcategory}` : ""}
              </p>
            </TabsContent>

            <TabsContent value="quality" className="mt-4 space-y-4">
              {qualityQ.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : qualityQ.data ? (
                <>
                  <QualitySummaryCard assessment={qualityQ.data.assessment} />
                  <QualityRuleList assessment={qualityQ.data.assessment} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Qualitätsbewertung nicht verfügbar.
                </p>
              )}
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <AISessionProvider caseId={c.id} key={c.id}>
                <AIPanelForCase
                  caseRow={c as import("@/services/editorial/types").EditorialCaseRow & Record<string, unknown>}
                  versions={versionsQ.data ?? []}
                />
              </AISessionProvider>
            </TabsContent>


            <TabsContent value="edit" className="mt-4">
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
                <p className="mb-2 text-muted-foreground">
                  Bearbeitung ist nur im Status <strong>Entwurf</strong> möglich.
                  Redaktionelle Inhaltsfelder werden im bestehenden Fall-Editor
                  gepflegt.
                </p>
                <Link
                  to="/admin/faelle/$id"
                  params={{ id }}
                  className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Zum Fall-Editor
                </Link>
              </div>
            </TabsContent>

            <TabsContent value="versions" className="mt-4">
              {versionsQ.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <VersionList
                  versions={versionsQ.data ?? []}
                  currentVersionId={c.current_version_id ?? null}
                />
              )}
            </TabsContent>

            <TabsContent value="reviews" className="mt-4">
              {reviewsQ.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (reviewsQ.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Reviews.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border bg-card">
                  {reviewsQ.data!.map((r) => (
                    <li key={r.id} className="p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReviewBadge status={r.status} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("de-DE")}
                        </span>
                      </div>
                      {r.submit_comment && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          <strong>Einreichung:</strong> {r.submit_comment}
                        </p>
                      )}
                      {r.decision_comment && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <strong>Entscheidung:</strong> {r.decision_comment}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="events" className="mt-4">
              {eventsQ.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <EventTimeline events={eventsQ.data ?? []} />
              )}
            </TabsContent>

            <TabsContent value="legal" className="mt-4">
              {flagsQ.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (flagsQ.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine offenen Rechts-Update-Hinweise für diesen Fall.
                </p>
              ) : (
                <ul className="space-y-2">
                  {flagsQ.data!.map((f) => (
                    <li key={f.id} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                      <p>{f.reason ?? "Rechts-Update erforderlich"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        seit {new Date(f.raised_at).toLocaleString("de-DE")}
                        {f.resolved_at ? ` · aufgelöst ${new Date(f.resolved_at).toLocaleString("de-DE")}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="meta" className="mt-4">
              <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <MetaRow k="ID" v={c.id} />
                <MetaRow k="Autor" v={c.created_by ?? "—"} />
                <MetaRow k="Reviewer" v={c.assigned_reviewer_id ?? "—"} />
                <MetaRow k="Aktuelle Version" v={c.current_version_id ?? "—"} />
                <MetaRow k="Legacy-Status" v={c.status} />
              </dl>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Workflow
          </h2>
          <SidebarRow k="Status" v={<WorkflowBadge status={c.workflow_status} />} />
          <SidebarRow k="Sichtbarkeit" v={<PublicationBadge tier={c.publication_tier} />} />
          <SidebarRow k="Qualität" v={<QualityBadge status={c.quality_status} />} />
          <SidebarRow k="Autor" v={c.created_by ? c.created_by.slice(0, 8) : "—"} />
          <SidebarRow k="Reviewer" v={c.assigned_reviewer_id ? c.assigned_reviewer_id.slice(0, 8) : "—"} />
          <SidebarRow k="aktuelle Version" v={c.current_version_id ? c.current_version_id.slice(0, 8) : "—"} />
          <SidebarRow k="eingereicht" v={fmtDate(c.submitted_at)} />
          <SidebarRow k="genehmigt" v={fmtDate(c.approved_at)} />
          <SidebarRow k="veröffentlicht" v={fmtDate(c.published_at)} />
          <SidebarRow k="archiviert" v={fmtDate(c.archived_at)} />
          <SidebarRow
            k="Rechts-Update"
            v={c.legal_update_required ? "erforderlich" : "—"}
          />
        </aside>
      </div>
    </div>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 flex-1 truncate font-mono">{v}</dd>
    </div>
  );
}
function SidebarRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-xs">{v}</span>
    </div>
  );
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE");
}

function AIPanelForCase({
  caseRow,
  versions,
}: {
  caseRow: import("@/services/editorial/types").EditorialCaseRow & Record<string, unknown>;
  versions: import("@/services/editorial/types").CaseVersionRow[];
}) {
  const roleCtx = useEditorialRole();
  const qualityQ = useCaseQuality(caseRow.id);
  // Vorherige Version = zweitneueste (die aktuelle ist versions[0]).
  const previousContent =
    versions.length >= 2 ? (versions[1]?.snapshot ?? null) : null;
  return (
    <EditorialCopilot
      caseRow={caseRow}
      quality={qualityQ.data?.assessment ?? null}
      canEdit={roleCtx.canEdit}
      previousContent={previousContent}
    />
  );
}
