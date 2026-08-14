import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CaseData } from "@/data/cases";
import { getDecisionTree, getRecommendationByPath } from "@/lib/caseEnrichment";
import {
  parseCuratedTree,
  validateCuratedTree,
  type CuratedResult,
} from "@/lib/decisionTree";

type Answer = { nodeId: string; optionIndex: number };
type Path = Answer[];

interface Props {
  c: CaseData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overrideTree?: import("@/lib/decisionTree").CuratedDecisionTree;
}

interface NormalizedOption {
  label: string;
  next?: string;
  result?: CuratedResult;
}

interface NormalizedStep {
  question: string;
  explanation?: string;
  options: NormalizedOption[];
}

interface NormalizedTree {
  start: string;
  steps: Record<string, NormalizedStep>;
  curated: boolean;
}

const URGENCY_FALLBACK: Record<"A" | "B" | "C", string> = {
  A: "Pädagogisch lösbar – keine sofortige Eskalation nötig",
  B: "Zeitnah handeln – Dokumentation und Einbindung erforderlich",
  C: "Sofort handeln – Schulleitung unverzüglich einbeziehen",
};

const WARNING_FALLBACK: Record<"A" | "B" | "C", string> = {
  A: "Beobachten Sie die Situation weiter. Bei Wiederholung greifen strengere Vorgaben.",
  B: "Treffen Sie keine abschließende Bewertung, bevor der Sachverhalt ausreichend geklärt ist.",
  C: "Handeln Sie ausschließlich in Abstimmung mit der Schulleitung. Keine Alleingänge.",
};

function fallbackResult(c: CaseData, key: "A" | "B" | "C"): CuratedResult {
  const base = getRecommendationByPath(c, key);
  const responsible = c.responsibleParty?.split(",")[0]?.trim() || "Klassenleitung";
  return {
    title: base.title,
    color: base.color,
    urgency: URGENCY_FALLBACK[key],
    recommendation: base.steps[0] ?? "",
    responsible: key === "C" ? "Schulleitung" : responsible,
    documentation:
      key === "A"
        ? "Kurznotiz im Klassenbuch genügt."
        : key === "B"
          ? "Aktennotiz mit Beobachtung, Anhörung und Information dokumentieren."
          : "Vorfallprotokoll unverzüglich erstellen und Zeug:innen sichern.",
    warning: WARNING_FALLBACK[key],
    steps: base.steps,
  };
}

function normalizeFromCurated(
  parsed: import("@/lib/decisionTree").CuratedDecisionTree,
): NormalizedTree {
  const steps: Record<string, NormalizedStep> = {};
  for (const [id, s] of Object.entries(parsed.steps)) {
    steps[id] = {
      question: s.question,
      explanation: s.explanation,
      options: s.options.map((o) => ({
        label: o.label,
        next: o.next,
        result: o.result ? parsed.results[o.result] : undefined,
      })),
    };
  }
  return { start: parsed.start, steps, curated: true };
}

function normalizeTree(
  c: CaseData,
  overrideTree?: import("@/lib/decisionTree").CuratedDecisionTree,
): NormalizedTree {
  if (overrideTree) return normalizeFromCurated(overrideTree);
  const parsed = parseCuratedTree(c.decisionTreeRaw);
  if (parsed && validateCuratedTree(parsed).valid) {
    return normalizeFromCurated(parsed);
  }
  // Fallback: regelbasierter Baum aus caseEnrichment.
  const legacy = getDecisionTree(c);
  const steps: Record<string, NormalizedStep> = {};
  for (const [id, s] of Object.entries(legacy.steps)) {
    steps[id] = {
      question: s.question,
      options: s.options.map((o) => ({
        label: o.label,
        next: o.next,
        result: o.recommendation ? fallbackResult(c, o.recommendation) : undefined,
      })),
    };
  }
  return { start: legacy.start, steps, curated: false };
}

export function DecisionAssistant({ c, open, onOpenChange, overrideTree }: Props) {
  const tree = useMemo(() => normalizeTree(c, overrideTree), [c, overrideTree]);

  const [path, setPath] = useState<Path>([]);

  const currentNodeId = useMemo(() => {
    let node = tree.start;
    for (const a of path) {
      const step = tree.steps[node];
      if (!step) return null;
      const opt = step.options[a.optionIndex];
      if (!opt) return null;
      if (opt.result) return null;
      if (!opt.next || !tree.steps[opt.next]) return null;
      node = opt.next;
    }
    return node;
  }, [tree, path]);

  const result = useMemo<CuratedResult | null>(() => {
    if (path.length === 0) return null;
    let node = tree.start;
    for (let i = 0; i < path.length - 1; i++) {
      const step = tree.steps[node];
      const opt = step?.options[path[i].optionIndex];
      if (!opt?.next) return null;
      node = opt.next;
    }
    const last = path[path.length - 1];
    const opt = tree.steps[node]?.options[last.optionIndex];
    return opt?.result ?? null;
  }, [tree, path]);

  const brokenLink = currentNodeId === null && result === null;

  const step = currentNodeId && tree.steps[currentNodeId] ? tree.steps[currentNodeId] : null;
  const totalEstimate = Math.max(path.length + (step ? 1 : 0), 1);
  const currentIndex = path.length + 1;

  const reset = () => setPath([]);
  const back = () => setPath((p) => p.slice(0, -1));
  const answer = (optionIndex: number) => {
    if (!currentNodeId) return;
    setPath((p) => [...p, { nodeId: currentNodeId, optionIndex }]);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) setPath([]);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-accent" />
            Kurz-Check zu diesem Fall
          </DialogTitle>
          <DialogDescription className="text-xs">
            Beantworten Sie wenige Fragen zu Ihrer konkreten Situation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {brokenLink ? (
            <BrokenState onReset={reset} />
          ) : result ? (
            <ResultView result={result} />
          ) : step ? (
            <QuestionView
              step={step}
              index={currentIndex}
              total={totalEstimate}
              onAnswer={answer}
            />
          ) : (
            <BrokenState onReset={reset} />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={back}
            disabled={path.length === 0}
            className="text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zurück
          </Button>
          <div className="flex items-center gap-2">
            {result && (
              <Link
                to="/faelle/$id/dokument"
                params={{ id: c.id }}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
                onClick={() => onOpenChange(false)}
              >
                <FileText className="h-3.5 w-3.5" />
                Passendes Dokument erstellen
              </Link>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={path.length === 0}
              className="text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Neu starten
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestionView({
  step,
  index,
  total,
  onAnswer,
}: {
  step: NormalizedStep;
  index: number;
  total: number;
  onAnswer: (i: number) => void;
}) {
  const pct = Math.min(100, Math.round((index / Math.max(total, index)) * 100));
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Frage {index}
        </p>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <h3 className="text-base font-semibold leading-snug text-foreground">
        {step.question}
      </h3>
      {step.explanation && (
        <p className="text-xs text-muted-foreground">{step.explanation}</p>
      )}
      <div className="flex flex-col gap-2">
        {step.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onAnswer(i)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5 text-left text-sm text-foreground transition-all hover:border-accent hover:bg-accent/5"
          >
            <span className="font-medium">{opt.label}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultView({ result }: { result: CuratedResult }) {
  const tone =
    result.color === "rot"
      ? "border-danger/40 bg-danger/5"
      : result.color === "gelb"
        ? "border-warning/40 bg-warning/10"
        : "border-success/40 bg-success/10";
  const iconTone =
    result.color === "rot"
      ? "bg-danger text-danger-foreground"
      : result.color === "gelb"
        ? "bg-warning text-warning-foreground"
        : "bg-success text-success-foreground";
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 ${tone}`}>
        <div className="flex items-start gap-3">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconTone}`}>
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ihre nächsten Schritte
            </p>
            <h3 className="mt-0.5 text-base font-semibold text-foreground">
              {result.title}
            </h3>
          </div>
        </div>
      </div>

      {result.urgency && (
        <InfoRow icon={Zap} label="Dringlichkeit">
          {result.urgency}
        </InfoRow>
      )}
      {result.recommendation && (
        <InfoRow icon={CheckCircle2} label="Empfehlung">
          {result.recommendation}
        </InfoRow>
      )}
      {result.responsible && (
        <InfoRow icon={ShieldAlert} label="Einbeziehen">
          {result.responsible}
        </InfoRow>
      )}
      {result.documentation && (
        <InfoRow icon={FileText} label="Dokumentation">
          {result.documentation}
        </InfoRow>
      )}

      {result.steps.length > 1 && (
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Konkrete Schritte
          </p>
          <ol className="mt-2 space-y-1.5">
            {result.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/90">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {result.warning && (
        <div className="rounded-xl border-l-4 border-warning bg-warning/10 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warning-foreground">
            <TriangleAlert className="h-3.5 w-3.5" /> Wichtiger Hinweis
          </p>
          <p className="mt-1 text-sm text-foreground/90">{result.warning}</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-background p-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-foreground/90">{children}</p>
      </div>
    </div>
  );
}

function BrokenState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
        <TriangleAlert className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">
        Der Entscheidungsweg konnte nicht weiter aufgelöst werden.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Bitte starten Sie den Assistenten neu.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onReset}
        className="mt-3 text-xs"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Neu starten
      </Button>
    </div>
  );
}
