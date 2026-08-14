/**
 * Sprint 4.6B.1 – Startansicht des Decision Navigators.
 * Startet keine Bearbeitung automatisch.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Compass, Play, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { buildStandardFlow, type NavigatorSessionSummary } from "@/services/decision-navigator";

export interface NavigatorLandingProps {
  hydrated: boolean;
  storageAvailable: boolean;
  workSession: NavigatorSessionSummary | null;
  demoSession: NavigatorSessionSummary | null;
  onStartNew: () => void;
  onStartDemo: () => void;
  onResume: () => void;
  onResumeDemo: () => void;
  onReset: (mode: "work" | "demo") => void;
}

const flow = buildStandardFlow();

export function NavigatorLanding({
  hydrated,
  storageAvailable,
  workSession,
  demoSession,
  onStartNew,
  onStartDemo,
  onResume,
  onResumeDemo,
  onReset,
}: NavigatorLandingProps) {
  const [pendingReset, setPendingReset] = useState<null | "work" | "demo">(null);

  const canResume =
    workSession?.exists &&
    workSession.problem === "none" &&
    (workSession.status === "running" || workSession.status === "paused");
  const canResumeDemo =
    demoSession?.exists &&
    demoSession.problem === "none" &&
    (demoSession.status === "running" || demoSession.status === "paused");

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Compass className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Fall bearbeiten
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Der strukturierte Bearbeitungsweg: einen schulischen Vorgang Schritt für Schritt
            erfassen – von der Situation bis zum Abschluss.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Entwicklungsstatus</h2>
        <p className="mt-1.5 text-sm text-foreground/85">
          Verfügbar sind aktuell der Ablauf selbst und die strukturierte Situationserfassung. Die
          weiteren Phasen sind sichtbar, aber noch nicht fachlich umgesetzt. Es erfolgt keine
          rechtliche Bewertung, keine Ampel und keine KI-Unterstützung.
        </p>
        <ol className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          {flow.steps.map((s, i) => (
            <li key={s.id} className="rounded-full border border-border px-2 py-0.5">
              {i + 1}. {s.title}
            </li>
          ))}
        </ol>
      </section>

      {!storageAvailable && hydrated && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Der lokale Speicher dieses Browsers ist nicht verfügbar. Sie können den Navigator
          verwenden, Ihre Angaben gehen beim Neuladen der Seite aber verloren.
        </p>
      )}

      {(workSession?.message || demoSession?.message) && (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          {workSession?.message && <p className="text-sm text-foreground">{workSession.message}</p>}
          {demoSession?.message && <p className="text-sm text-foreground">{demoSession.message}</p>}
          <p className="text-xs text-muted-foreground">
            Gespeicherte Angaben werden nicht automatisch gelöscht. Sie entscheiden, ob
            zurückgesetzt oder neu begonnen wird.
          </p>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Eigene Bearbeitung</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {canResume
              ? `Gespeicherter Stand: ${workSession?.currentStepTitle ?? "unbekannt"} · ${workSession?.percent ?? 0}%`
              : "Noch keine gespeicherte Bearbeitung vorhanden."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" className="gap-2" onClick={onStartNew}>
              <Play className="h-4 w-4" aria-hidden="true" /> Neuen Fall strukturiert erfassen
            </Button>
            {canResume && (
              <Button type="button" variant="outline" className="gap-2" onClick={onResume}>
                Fall fortsetzen
              </Button>
            )}
            {workSession?.exists && (
              <Button
                type="button"
                variant="ghost"
                className="gap-2 text-muted-foreground"
                onClick={() => setPendingReset("work")}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Zurücksetzen
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Allgemeine schulische Situation – Demo
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Beispieldaten zum Ausprobieren. Keine echten Personen, keine rechtliche Bewertung.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="gap-2" onClick={onStartDemo}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Demo starten
            </Button>
            {canResumeDemo && (
              <Button type="button" variant="outline" className="gap-2" onClick={onResumeDemo}>
                Demo fortsetzen
              </Button>
            )}
            {demoSession?.exists && (
              <Button
                type="button"
                variant="ghost"
                className="gap-2 text-muted-foreground"
                onClick={() => setPendingReset("demo")}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Demo zurücksetzen
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Sprint 4.6J.2: Rückweg zum primären Einstieg. Wer hier ohne Session
          landet (Deep Link, Neugier), soll den empfohlenen Weg über die freie
          Fallschilderung kennen, ohne dass der strukturierte Einstieg
          abgewertet wird. */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Lieber frei schildern?</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Beschreiben Sie die Situation in eigenen Worten – RechtKompass strukturiert die
          Angaben, stellt Rückfragen und übernimmt alles in die Fallbearbeitung.
        </p>
        <Link
          to="/assistent"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:border-accent hover:text-accent"
        >
          Fall schildern <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </section>

      <AlertDialog open={pendingReset !== null} onOpenChange={(o) => !o && setPendingReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingReset === "demo" ? "Demo zurücksetzen?" : "Bearbeitung zurücksetzen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Die gespeicherte Session wird gelöscht. Dieser Schritt kann nicht rückgängig gemacht
              werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zurück</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingReset) onReset(pendingReset);
                setPendingReset(null);
              }}
            >
              Zurücksetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
