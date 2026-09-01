/**
 * Fall-schildern-Neubau 2026-09-01: leichter Dreischritt
 * "Schildern -> maximal 3 Rückfragen -> klares Ergebnis".
 *
 * Ersetzt die Kachel-Fragenstrecke als EINSTIEG; die Kachel-Erfassung
 * bleibt als Dokumentationswerkzeug erhalten und wird erst auf der
 * Ergebnisseite angeboten (onDocument). Nichts wird gespeichert, bis der
 * Nutzer aktiv dokumentiert oder einen Fall generieren lässt.
 */
import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronRight,
  FileCheck2,
  HelpCircle,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useAuthSession } from "@/lib/adminAuth";
import { AssistantCaseGenerationOffer } from "./AssistantCaseGenerationOffer";
import { AssistantEmailSignIn } from "./AssistantEmailSignIn";

const MIN_LENGTH = 20;
const MAX_LENGTH = 2000;

interface ClarifyingQuestion {
  id: string;
  question: string;
  options: string[];
}

interface AnalysisMatch {
  id: string;
  similarity: number;
  reason: string;
  title: string;
  short_answer: string;
  category: string;
  subcategory: string;
  ampel: string | null;
}

interface AnalysisResponse {
  status: "needs_clarification" | "ready";
  summary: string;
  category_guess: string;
  clarifying_questions: ClarifyingQuestion[];
  matches: AnalysisMatch[];
  error?: string;
}

type Phase =
  | { name: "describe" }
  | { name: "loading"; message: string }
  | { name: "clarify"; questions: ClarifyingQuestion[]; index: number; answers: Array<{ question: string; answer: string }> }
  | { name: "result"; response: AnalysisResponse };

const AMPEL_DOT: Record<string, string> = {
  gruen: "bg-success",
  gelb: "bg-warning",
  rot: "bg-danger",
};

const TILE_CLASS =
  "group flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5 text-left text-sm text-foreground transition-all hover:border-accent hover:bg-accent/5";

export interface DescriptionIntakeProps {
  /** Öffnet die strukturierte Dokumentation (Kachel-Erfassung) mit der Schilderung als Kontext. */
  onDocument: (description: string) => void;
}

export function DescriptionIntake({ onDocument }: DescriptionIntakeProps) {
  const { ready, user } = useAuthSession();
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "describe" });
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(
    async (clarifications: Array<{ question: string; answer: string }>, round: number) => {
      setError(null);
      setPhase({
        name: "loading",
        message: round === 0 ? "Ihre Schilderung wird gelesen und mit den Praxisfällen abgeglichen …" : "Ihre Antworten werden eingeordnet …",
      });
      try {
        const res = await apiFetch("/api/ai-analyze-case-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: description.trim(), clarifications, round }),
        });
        const data = (await res.json()) as AnalysisResponse;
        if (!res.ok) {
          setError(data.error ?? "Die Analyse ist fehlgeschlagen. Bitte versuchen Sie es erneut.");
          setPhase(clarifications.length > 0 ? { name: "describe" } : { name: "describe" });
          return;
        }
        if (data.status === "needs_clarification" && data.clarifying_questions.length > 0 && round === 0) {
          setPhase({ name: "clarify", questions: data.clarifying_questions, index: 0, answers: [] });
        } else {
          setPhase({ name: "result", response: data });
        }
      } catch {
        setError("Die Analyse ist fehlgeschlagen. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.");
        setPhase({ name: "describe" });
      }
    },
    [description],
  );

  const answerClarification = useCallback(
    (answer: string) => {
      if (phase.name !== "clarify") return;
      const current = phase.questions[phase.index];
      const answers = [...phase.answers, { question: current.question, answer }];
      if (phase.index + 1 < phase.questions.length) {
        setPhase({ ...phase, index: phase.index + 1, answers });
      } else {
        void analyze(answers, 1);
      }
    },
    [analyze, phase],
  );

  const restart = useCallback(() => {
    setDescription("");
    setError(null);
    setPhase({ name: "describe" });
  }, []);

  if (!ready) return null;
  if (!user) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Anmeldung erforderlich</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Die Fallschilderung mit KI-Einschätzung steht angemeldeten Pilot-Testerinnen und -Testern zur
          Verfügung.
        </p>
        <div className="mt-3">
          <AssistantEmailSignIn />
        </div>
      </div>
    );
  }

  const trimmed = description.trim();

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {error && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-foreground">
          {error}
        </div>
      )}

      {phase.name === "describe" && (
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Was ist passiert?</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Schildern Sie den Vorfall in Ihren Worten – zwei, drei Sätze genügen. Bitte ohne Klarnamen von
            Schülerinnen und Schülern.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_LENGTH))}
            rows={4}
            placeholder="Beispiel: Ein minderjähriger Auszubildender kommt wiederholt ohne Sicherheitsschuhe in die Werkstatt. Der Betrieb möchte, dass wir ihn vom Praxisunterricht ausschließen …"
            className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-accent"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {trimmed.length < MIN_LENGTH
                ? `Noch mindestens ${MIN_LENGTH - trimmed.length} Zeichen`
                : `${trimmed.length} / ${MAX_LENGTH} Zeichen`}
            </span>
            <button
              type="button"
              disabled={trimmed.length < MIN_LENGTH}
              onClick={() => void analyze([], 0)}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Einschätzung starten <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {phase.name === "loading" && (
        <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent" aria-hidden="true" />
          {phase.message}
        </div>
      )}

      {phase.name === "clarify" && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Rückfrage {phase.index + 1} von {phase.questions.length}
          </p>
          <h2 className="mt-1 text-sm font-semibold text-foreground">
            {phase.questions[phase.index].question}
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {phase.questions[phase.index].options.map((opt) => (
              <button key={opt} type="button" onClick={() => answerClarification(opt)} className={TILE_CLASS}>
                <span className="font-medium">{opt}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => answerClarification("Weiß nicht")}
              className="inline-flex items-center gap-1.5 self-start rounded-full border border-border px-3 py-1.5 text-[11px] text-muted-foreground hover:border-accent"
            >
              <HelpCircle className="h-3 w-3" /> Weiß nicht / überspringen
            </button>
          </div>
        </div>
      )}

      {phase.name === "result" && (
        <ResultView
          response={phase.response}
          description={trimmed}
          onDocument={() => onDocument(trimmed)}
          onRestart={restart}
        />
      )}
    </div>
  );
}

function ResultView({
  response,
  description,
  onDocument,
  onRestart,
}: {
  response: AnalysisResponse;
  description: string;
  onDocument: () => void;
  onRestart: () => void;
}) {
  const [best, ...alternatives] = response.matches;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Ihr Ergebnis</h2>
        {response.summary && (
          <p className="mt-1 text-xs text-muted-foreground">
            So haben wir Ihre Schilderung verstanden: {response.summary}
          </p>
        )}
      </div>

      {best ? (
        <>
          <MatchCard match={best} primary />
          {alternatives.length > 0 && (
            <details className="rounded-2xl border border-border bg-background/50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                {alternatives.length} weitere{alternatives.length === 1 ? "r Treffer" : " Treffer"}
              </summary>
              <div className="mt-3 space-y-3">
                {alternatives.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </details>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-foreground">
            Zu diesem Vorfall gibt es noch keinen geprüften Praxisfall.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Es werden keine Inhalte oder Rechtsgrundlagen erfunden. Sie können den Fall automatisch
            erstellen lassen – er durchläuft dieselbe Rechtsprüfung wie alle Praxisfälle und geht danach
            in die redaktionelle Freigabe.
          </p>
          <AssistantCaseGenerationOffer sketch={description} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onDocument}
          className="inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/20"
        >
          <FileCheck2 className="h-3.5 w-3.5" />
          Vorfall zusätzlich dokumentieren
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium hover:border-accent"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Neue Schilderung
        </button>
      </div>
    </div>
  );
}

function MatchCard({ match, primary }: { match: AnalysisMatch; primary?: boolean }) {
  return (
    <Link
      to="/fall/$id"
      params={{ id: match.id }}
      className={`flex items-start gap-3 rounded-2xl border bg-background p-4 transition-colors hover:border-accent/70 ${
        primary ? "border-accent/50" : "border-border"
      }`}
    >
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${AMPEL_DOT[match.ampel ?? ""] ?? "bg-muted"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {primary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
              <Sparkles className="h-3 w-3" /> Beste Übereinstimmung
            </span>
          )}
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {match.category}
            {match.subcategory ? ` · ${match.subcategory}` : ""} · {match.similarity} % Übereinstimmung
          </span>
        </div>
        <h3 className="mt-1 text-sm font-semibold text-foreground">{match.title}</h3>
        {match.reason && <p className="mt-1 text-xs text-muted-foreground">{match.reason}</p>}
        {match.short_answer && (
          <p className="mt-2 line-clamp-3 rounded-lg bg-muted/50 p-2 text-xs text-foreground">
            {match.short_answer}
          </p>
        )}
      </div>
      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
