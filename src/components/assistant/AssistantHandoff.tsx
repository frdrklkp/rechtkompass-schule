/**
 * Sprint 4.6F – Abschlussansicht nach der Übergabe an den Navigator.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { AssistantSession } from "@/services/assistant";

export interface AssistantHandoffProps {
  session: AssistantSession;
  onReset: () => void;
}

export function AssistantHandoff({ session, onReset }: AssistantHandoffProps) {
  return (
    <section className="rounded-2xl border border-success/50 bg-success/10 p-4">
      <h2 className="text-base font-semibold text-foreground">
        <CheckCircle2 className="mr-1 inline h-4 w-4 text-success" aria-hidden="true" />
        Angaben übernommen
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Der Entscheidungsnavigator wurde mit Ihrem Sachverhalt gestartet
        {session.handoffAt
          ? ` (${new Date(session.handoffAt).toLocaleString("de-DE")})`
          : ""}
        . Die Phasen „Start“ und „Situation“ gelten als abgeschlossen.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/navigator"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          Zum Navigator <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-border bg-background px-4 py-2 text-sm hover:border-accent"
        >
          Neue Fallschilderung beginnen
        </button>
      </div>
    </section>
  );
}
