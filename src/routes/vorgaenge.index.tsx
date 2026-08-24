import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, FileText, FolderOpen, Sparkles } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { useAuthSession } from "@/lib/adminAuth";
import { AssistantEmailSignIn } from "@/components/assistant/AssistantEmailSignIn";
import { listCaseFiles } from "@/services/case-files/CaseFileService";
import type { CaseFileRecord } from "@/services/case-files/types";

export const Route = createFileRoute("/vorgaenge/")({
  head: () => ({
    meta: [
      { title: "Meine Vorgänge – RechtKompass Schule" },
      { name: "description", content: "Ihre gespeicherten Vorgänge und abgeschlossenen Fallakten." },
    ],
  }),
  component: VorgaengePage,
});

interface SavedCaseRef {
  id: string;
  title?: string;
  savedAt: string;
}

function useSavedCases(): SavedCaseRef[] {
  const [saved, setSaved] = useState<SavedCaseRef[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rk-vorgaenge");
      setSaved(raw ? (JSON.parse(raw) as SavedCaseRef[]) : []);
    } catch {
      setSaved([]);
    }
  }, []);
  return saved;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function CaseFileCard({ file }: { file: CaseFileRecord }) {
  return (
    <Link
      to="/vorgaenge/$id"
      params={{ id: file.id }}
      className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-accent/60"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{file.caseNumber}</span>
        <span className="text-xs text-muted-foreground">{formatDate(file.closedAt)}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-foreground">{file.title}</p>
      {file.category && <p className="text-xs text-muted-foreground">{file.category}</p>}
      {file.openPoints.length > 0 ? (
        <p className="mt-2 text-xs text-warning">
          {file.openPoints.length} offene{file.openPoints.length === 1 ? "r" : ""} Punkt
          {file.openPoints.length === 1 ? "" : "e"} beim Abschluss
        </p>
      ) : (
        <p className="mt-2 text-xs text-success">Vollständig abgeschlossen</p>
      )}
    </Link>
  );
}

function CaseFilesSection() {
  const { ready, user } = useAuthSession();
  const [files, setFiles] = useState<CaseFileRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    listCaseFiles()
      .then((f) => {
        if (!cancelled) setFiles(f);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Fallakten konnten nicht geladen werden.");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  if (!ready) return null;

  if (!user) {
    return (
      <section>
        <h2 className="text-base font-semibold text-foreground">Abgeschlossene Fallakten</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Melden Sie sich an, um Ihre abgeschlossenen Fallbearbeitungen aus dem Navigator hier
          wiederzufinden.
        </p>
        <div className="mt-3">
          <AssistantEmailSignIn />
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">Abgeschlossene Fallakten</h2>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {files === null && !error && (
        <p className="mt-2 text-sm text-muted-foreground">Fallakten werden geladen …</p>
      )}
      {files && files.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Noch keine abgeschlossene Fallbearbeitung. Nach Abschluss einer Bearbeitung im{" "}
          <Link to="/navigator" className="underline underline-offset-2 hover:text-accent">
            Navigator
          </Link>{" "}
          erscheint sie hier.
        </p>
      )}
      {files && files.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {files.map((f) => (
            <CaseFileCard key={f.id} file={f} />
          ))}
        </div>
      )}
    </section>
  );
}

function SavedCasesSection() {
  const saved = useSavedCases();
  if (saved.length === 0) return null;
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">Gespeicherte Praxisfälle</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {saved.map((s) => (
          <Link
            key={s.id}
            to="/fall/$id"
            params={{ id: s.id }}
            className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 hover:border-accent"
          >
            <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {s.title ?? s.id}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function VorgaengePage() {
  const saved = useSavedCases();
  return (
    <PageShell title="Meine Vorgänge" subtitle="Gespeicherte Fälle und abgeschlossene Fallakten.">
      <div className="space-y-8">
        <CaseFilesSection />
        <SavedCasesSection />
        {saved.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
              <FolderOpen className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Praxisfälle, die Sie sich merken möchten, können Sie direkt auf der Fallseite
              speichern.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Sparkles className="h-3.5 w-3.5" /> Frage stellen
              </Link>
              <Link
                to="/faelle"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:border-accent"
              >
                Themen entdecken <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
