/** Detailansicht einer abgeschlossenen Fallakte (nur lesend). */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, FileText, Flag, Scale } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { useAuthSession } from "@/lib/adminAuth";
import { AssistantEmailSignIn } from "@/components/assistant/AssistantEmailSignIn";
import { getCaseFile } from "@/services/case-files/CaseFileService";
import { buildCaseSummary, type CaseSummary } from "@/services/case-files/buildCaseSummary";
import { SITUATION_CONTEXT_KEY } from "@/services/situation-analyzer";
import { ASSESSMENT_CONTEXT_KEY } from "@/services/assessment-engine";
import { ACTION_CONTEXT_KEY } from "@/services/action-engine";
import { LEGAL_CONTEXT_KEY } from "@/services/legal-context";
import { DOCUMENTATION_CONTEXT_KEY } from "@/services/documentation-assistant";
import type { CaseFileRecord } from "@/services/case-files/types";

export const Route = createFileRoute("/vorgaenge/$id")({
  head: () => ({
    meta: [{ title: "Fallakte – RechtKompass Schule" }],
  }),
  component: FallaktePage,
});

const TRAFFIC_LIGHT_DOT: Record<string, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
  unknown: "bg-muted-foreground",
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function summaryFromRecord(file: CaseFileRecord): CaseSummary {
  const context: Record<string, unknown> = {
    [SITUATION_CONTEXT_KEY]: file.situationSnapshot ?? undefined,
    [ASSESSMENT_CONTEXT_KEY]: file.assessmentSnapshot ?? undefined,
    [ACTION_CONTEXT_KEY]: file.actionsSnapshot ?? undefined,
    [LEGAL_CONTEXT_KEY]: file.legalSnapshot ?? undefined,
    [DOCUMENTATION_CONTEXT_KEY]: file.documentsSnapshot ?? undefined,
  };
  return buildCaseSummary(context);
}

function FallaktePage() {
  const { id } = Route.useParams();
  const { ready, user } = useAuthSession();
  const [file, setFile] = useState<CaseFileRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    getCaseFile(id)
      .then((record) => {
        if (cancelled) return;
        if (!record) setNotFound(true);
        else setFile(record);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Die Fallakte konnte nicht geladen werden.");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, id]);

  const backLink = (
    <Link
      to="/vorgaenge"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Zurück zu meinen Vorgängen
    </Link>
  );

  if (!ready) return null;

  if (!user) {
    return (
      <PageShell title="Fallakte" subtitle="Anmeldung erforderlich.">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fallakten sind mit Ihrem Konto verknüpft. Melden Sie sich an, um diese Fallakte zu sehen.
          </p>
          <AssistantEmailSignIn />
          {backLink}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Fallakte">
        <div className="space-y-4">
          <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
            {error}
          </p>
          {backLink}
        </div>
      </PageShell>
    );
  }

  if (notFound) {
    return (
      <PageShell title="Fallakte">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Diese Fallakte wurde nicht gefunden oder gehört nicht zu Ihrem Konto.
          </p>
          {backLink}
        </div>
      </PageShell>
    );
  }

  if (!file) {
    return (
      <PageShell title="Fallakte">
        <p className="text-sm text-muted-foreground">Fallakte wird geladen …</p>
      </PageShell>
    );
  }

  const summary = summaryFromRecord(file);

  return (
    <PageShell
      title={file.title}
      subtitle={`${file.caseNumber} · abgeschlossen am ${formatDateTime(file.closedAt)}`}
    >
      <div className="space-y-4">
        {backLink}

        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Flag className="h-4 w-4 text-accent" aria-hidden="true" /> Handlungsstatus
          </p>
          <p className="mt-2 text-sm text-foreground/85">
            {summary.totalActionsCount > 0
              ? `${summary.completedActionsCount} von ${summary.totalActionsCount} Maßnahmen erledigt.`
              : "Keine Maßnahmen erfasst."}
          </p>
          {file.openPoints.length === 0 ? (
            <p className="mt-1 text-sm text-success">Alle Punkte bearbeitet.</p>
          ) : (
            <div className="mt-1 text-sm text-warning">
              <p>
                {file.openPoints.length} Punkt{file.openPoints.length === 1 ? "" : "e"} beim Abschluss offen:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {file.openPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Was ist passiert?</p>
          <p className="mt-2 text-sm text-foreground/85">
            {summary.rawDescription || "Kein Sachverhalt erfasst."}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Bewertung</p>
          {summary.trafficLight ? (
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${TRAFFIC_LIGHT_DOT[summary.trafficLight]}`}
                aria-hidden="true"
              />
              <span className="text-sm text-foreground/85">{summary.assessmentSummary}</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Keine Bewertung vorhanden.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Maßnahmen</p>
          {summary.actions.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Keine Maßnahmen erfasst.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {summary.actions.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm text-foreground/85">
                  {a.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="flex-1">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{a.statusLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Scale className="h-4 w-4 text-accent" aria-hidden="true" /> Rechtsgrundlagen
          </p>
          {summary.legalReferences.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Keine Rechtsgrundlagen verknüpft.</p>
          ) : (
            <ul className="mt-2 list-inside list-disc text-sm text-foreground/85">
              {summary.legalReferences.map((r) => (
                <li key={r.reference}>
                  {r.reference}
                  {r.title ? ` – ${r.title}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-accent" aria-hidden="true" /> Dokumente
          </p>
          {summary.documents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Keine Dokumente erstellt.</p>
          ) : (
            <ul className="mt-2 list-inside list-disc text-sm text-foreground/85">
              {summary.documents.map((d) => (
                <li key={d.id}>{d.title}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
