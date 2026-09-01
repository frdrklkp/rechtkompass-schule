/**
 * Sprint 4.6K – Angebot im "kein passender Praxisfall"-Zustand des
 * Assistenten: Lehrkräfte können aus der bereits geschilderten Situation
 * automatisch einen neuen Praxisfall erstellen lassen. Der Fall entsteht
 * über /api/case-generation-jobs und geht anschließend in die normale
 * redaktionelle Prüfung - er wird NICHT automatisch veröffentlicht.
 */
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCaseGenerationJob } from "@/hooks/assistant/useCaseGenerationJob";
import { useAuthSession } from "@/lib/adminAuth";
import { AssistantEmailSignIn } from "./AssistantEmailSignIn";

const PHASE_LABELS: Record<string, string> = {
  entwurf: "Entwurf wird erstellt",
  anlegen: "Fall wird angelegt",
  vernetzen: "Rechtsgrundlagen werden verknüpft",
  entscheidungsbaum: "Entscheidungsbaum wird erstellt",
  qualitaet: "Qualität wird optimiert",
  einreichen: "Wird zur redaktionellen Prüfung eingereicht",
  fertig: "Fertig",
};

export interface AssistantCaseGenerationOfferProps {
  sketch: string;
}

export function AssistantCaseGenerationOffer({ sketch }: AssistantCaseGenerationOfferProps) {
  const { state, start } = useCaseGenerationJob();
  const { ready, user } = useAuthSession();

  if (!ready) return null;

  if (!user) {
    return <AssistantEmailSignIn />;
  }

  if (state.status === "idle") {
    return (
      <button
        type="button"
        onClick={() => start(sketch)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-accent/50 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/20"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Passenden Praxisfall erstellen lassen
      </button>
    );
  }

  if (state.status === "starting" || state.status === "running") {
    const label = state.status === "running" ? PHASE_LABELS[state.phase] ?? state.phase : "Wird gestartet";
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden="true" />
        <span>{label} … Das kann einige Minuten dauern – Sie können die Seite zwischendurch verlassen, der Fall wird im Hintergrund fertiggestellt.</span>
      </div>
    );
  }

  if (state.status === "succeeded") {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-xs text-foreground">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>
          Fall erstellt und zur redaktionellen Prüfung eingereicht. Sie können ihn schon jetzt ansehen.{" "}
          <Link
            to="/fall/$id"
            params={{ id: state.caseId }}
            className="font-medium underline underline-offset-2 hover:text-accent"
          >
            Fall ansehen
          </Link>
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-foreground">
      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
      <span>{state.error}</span>
    </div>
  );
}
