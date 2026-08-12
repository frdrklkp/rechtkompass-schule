import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ListChecks,
  Scale,
  Users,
} from "lucide-react";
import { useChecklistState } from "@/lib/profile";
import type { LegalSectionCard } from "@/data/cases";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


type LawInfo = {
  paragraph: string;
  gesetz: string;
  kurz?: string;
  status?: string;
};

type NextStepCtx = {
  documentation?: string[];
  responsibleParty?: string;
  legalBasis?: string[];
  laws?: LawInfo[];
  templates?: { id: string; title: string }[];
  checklist?: string[];
};

type SectionKey = "doku" | "zustaendig" | "recht" | "vorlagen" | "abschluss";

type NextStep = {
  key: SectionKey;
  icon: typeof FileText;
  title: string;
  description: string;
  buttonLabel: string;
  to?: string;
  section?: SectionKey;
  done: boolean;
  payload?: Record<string, unknown>;
};

function buildNextSteps(ctx: NextStepCtx, checklistDone: boolean): NextStep[] {
  const steps: NextStep[] = [];

  if ((ctx.documentation?.length ?? 0) > 0) {
    steps.push({
      key: "doku",
      icon: FileText,
      title: "Dokumentation erstellen",
      description: "Gespräch dokumentieren oder Klassenbucheintrag anlegen.",
      buttonLabel: "Dokumentation öffnen",
      to: "/dokumentation",
      done: false,
    });
  }

  if ((ctx.responsibleParty ?? "").trim().length > 0) {
    steps.push({
      key: "zustaendig",
      icon: Users,
      title: "Zuständige informieren",
      description: "Klassenleitung oder Schulleitung informieren.",
      buttonLabel: "Zuständigkeiten öffnen",
      section: "zustaendig",
      done: false,
    });
  }

  const firstLaw = (ctx.legalBasis ?? []).find((l) => l && l.trim().length > 0);
  if (firstLaw) {
    steps.push({
      key: "recht",
      icon: Scale,
      title: "Rechtsgrundlage ansehen",
      description: "Relevante Vorschriften prüfen.",
      buttonLabel: `${firstLaw} öffnen`,
      section: "recht",
      done: false,
      payload: { law: firstLaw },
    });
  }

  if ((ctx.templates?.length ?? 0) > 0) {
    steps.push({
      key: "vorlagen",
      icon: ListChecks,
      title: "Dokumentvorlage öffnen",
      description: "Passende Vorlage auswählen.",
      buttonLabel: "Vorlagen öffnen",
      to: "/dokumentation",
      done: false,
    });
  }

  if ((ctx.checklist?.length ?? 0) > 0) {
    steps.push({
      key: "abschluss",
      icon: ClipboardCheck,
      title: "Fall abschließen",
      description: "Kontrolle, ob alle Schritte erledigt wurden.",
      buttonLabel: "Qualitätsprüfung öffnen",
      section: "abschluss",
      done: checklistDone,
    });
  }

  return steps;
}

function NextStepsPanel({
  ctx,
  checklistDone,
  caseId,
  onOpenSection,
  onOpenLegal,
}: {
  ctx: NextStepCtx;
  checklistDone: boolean;
  caseId?: string;
  onOpenSection?: (section: SectionKey) => void;
  onOpenLegal?: () => void;
}) {
  const steps = buildNextSteps(ctx, checklistDone);
  const [lawOpen, setLawOpen] = useState(false);
  const [activeLaw, setActiveLaw] = useState<LawInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (steps.length === 0) return null;

  const findLaw = (label: string): LawInfo | null => {
    const laws = ctx.laws ?? [];
    return (
      laws.find(
        (l) =>
          `${l.paragraph} ${l.gesetz}`.toLowerCase().includes(label.toLowerCase()) ||
          label.toLowerCase().includes(l.paragraph.toLowerCase()),
      ) ??
      (laws[0]
        ? laws[0]
        : { paragraph: label, gesetz: "", kurz: undefined })
    );
  };

  const handleClick = (s: NextStep) => {
    setErrorMsg(null);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[NextSteps] click", {
        action: s.key,
        targetSection: s.section,
        caseId,
        payload: s.payload,
      });
    }

    if (s.key === "recht") {
      // Prefer the shared knowledge-card modal (opens the linked legal_section).
      if (onOpenLegal) {
        onOpenLegal();
        if (s.section) onOpenSection?.(s.section);
        return;
      }
      // Fallback: legacy inline dialog with the static short description.
      const label = (s.payload?.law as string) ?? "";
      const law = findLaw(label);
      if (!law || (!law.paragraph && !law.gesetz)) {
        setErrorMsg("Rechtsgrundlage konnte nicht geöffnet werden.");
        return;
      }
      setActiveLaw(law);
      setLawOpen(true);
      if (s.section) onOpenSection?.(s.section);
      return;
    }

    if (s.section) {
      onOpenSection?.(s.section);
    }

  };

  return (
    <div className="mt-5 rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
          <ListChecks className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Empfohlene nächste Schritte</p>
          <p className="text-[11px] text-muted-foreground">
            Automatisch aus den Falldaten erzeugt.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger"
        >
          {errorMsg}
        </div>
      )}

      <ol className="space-y-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const btnClasses =
            "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90";
          const button = s.to ? (
            <Link
              to={s.to}
              className={btnClasses}
              onClick={() => {
                if (import.meta.env.DEV) {
                  // eslint-disable-next-line no-console
                  console.log("[NextSteps] navigate", { to: s.to, action: s.key, caseId });
                }
              }}
            >
              {s.buttonLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <button type="button" onClick={() => handleClick(s)} className={btnClasses}>
              {s.buttonLabel}
              <ArrowRight className="h-3 w-3" />
            </button>
          );
          return (
            <li
              key={s.key}
              className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-background p-3 sm:flex-nowrap"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {i + 1}.
                  </span>
                  <p className="text-sm font-semibold text-foreground">{s.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      s.done
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.done ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> erledigt
                      </span>
                    ) : (
                      "offen"
                    )}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
              </div>
              {button}
            </li>
          );
        })}
      </ol>

      <Dialog open={lawOpen} onOpenChange={setLawOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-accent" />
              {activeLaw?.paragraph}
            </DialogTitle>
            {activeLaw?.gesetz && (
              <DialogDescription className="text-xs">{activeLaw.gesetz}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {activeLaw?.kurz ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Kurzbeschreibung
                </p>
                <p className="mt-1 leading-relaxed text-foreground/85">{activeLaw.kurz}</p>
              </div>
            ) : (
              <p className="italic text-muted-foreground">
                Keine Kurzbeschreibung hinterlegt.
              </p>
            )}
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] italic text-amber-800 dark:text-amber-300">
              MVP-Hinweis: Diese Anzeige dient der Orientierung. Maßgeblich bleibt die
              offizielle Fassung der Vorschrift.
            </div>
            <Link
              to="/rechtsgrundlagen"
              onClick={() => setLawOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Zur Übersicht Rechtsgrundlagen
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function InteractiveChecklist({
  caseId,
  steps,
  ctx,
  onOpenSection,
  onOpenLegal,
  legalSections,
}: {
  caseId: string;
  steps: string[];
  onDone?: () => void;
  ctx?: NextStepCtx;
  onOpenSection?: (section: SectionKey) => void;
  onOpenLegal?: (sectionId: string) => void;
  legalSections?: LegalSectionCard[];
}) {
  const { checked, toggle, reset } = useChecklistState(caseId, steps.length);
  const done = checked.filter(Boolean).length;
  const complete = done === steps.length && steps.length > 0;
  const nextIdx = checked.findIndex((c) => !c);

  const stepCtx: NextStepCtx = {
    checklist: steps,
    ...(ctx ?? {}),
  };

  const primarySection = legalSections?.[0];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">
          {done} / {steps.length} erledigt
        </span>
        {done > 0 && (
          <button onClick={reset} className="text-muted-foreground hover:text-accent">
            Zurücksetzen
          </button>
        )}
      </div>
      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${(done / Math.max(1, steps.length)) * 100}%` }}
        />
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          return (
            <li
              key={i}
              className={`flex gap-3 rounded-xl border p-3 transition-colors ${
                checked[i]
                  ? "border-border/60 bg-muted/40 opacity-70"
                  : isNext
                    ? "border-accent/50 bg-accent/5"
                    : "border-border bg-background"
              }`}
            >
              <button
                onClick={() => toggle(i)}
                aria-pressed={checked[i]}
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                  checked[i] ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background"
                }`}
              >
                {checked[i] ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              </button>
              <span className={`text-sm ${checked[i] ? "line-through" : "text-foreground"}`}>{s}</span>
            </li>
          );
        })}
      </ol>

      <NextStepsPanel
        ctx={stepCtx}
        checklistDone={complete}
        caseId={caseId}
        onOpenSection={onOpenSection}
        onOpenLegal={onOpenLegal && primarySection ? () => onOpenLegal(primarySection.id) : undefined}
      />

      {!complete && nextIdx >= 0 && done > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-accent/40 bg-accent/5 p-3 text-xs">
          <span className="font-semibold text-accent">Als Nächstes:</span>{" "}
          <span className="text-foreground/80">{steps[nextIdx]}</span>
        </div>
      )}
    </div>
  );
}

