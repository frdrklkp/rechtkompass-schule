import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DecisionNavigator } from "@/components/navigator/DecisionNavigator";
import { NavigatorLanding } from "@/components/navigator/NavigatorLanding";
import { useDecisionNavigator } from "@/hooks/navigator/useDecisionNavigator";
import {
  NAVIGATOR_DEMO_CONTEXT_KEY,
  NAVIGATOR_DEMO_TITLE,
} from "@/services/decision-navigator";
import {
  buildDemoSituationCase,
  SITUATION_CONTEXT_KEY,
} from "@/services/situation-analyzer";

export const Route = createFileRoute("/navigator")({
  // Sprint 4.6J.2: ?fortsetzen=true setzt die gespeicherte Bearbeitung direkt
  // fort (genutzt vom Assistant-Handoff "Fall bearbeiten") - ohne den Umweg
  // über die Startansicht. Direktaufrufe ohne Parameter zeigen weiterhin die
  // Startansicht mit expliziter Auswahl; ungültige Werte fallen auf sie zurück.
  validateSearch: (search: Record<string, unknown>): { fortsetzen?: boolean } => ({
    fortsetzen:
      search.fortsetzen === true || search.fortsetzen === "true" || search.fortsetzen === "1"
        ? true
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Fall bearbeiten – RechtKompass Schule" },
      {
        name: "description",
        content:
          "Strukturierter Bearbeitungsweg für schulische Situationen – Schritt für Schritt von der Situation bis zum Abschluss, mit Demo-Bearbeitung.",
      },
      { property: "og:title", content: "Fall bearbeiten – RechtKompass Schule" },
      {
        property: "og:description",
        content: "Schritt für Schritt durch die Bearbeitung eines Vorgangs – mit Fortschritt und Wiederaufnahme.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NavigatorPage,
});

function NavigatorPage() {
  const [mode, setMode] = useState<"work" | "demo" | null>(null);
  const work = useDecisionNavigator({ mode: "work" });
  const demo = useDecisionNavigator({ mode: "demo" });
  const nav = mode === "demo" ? demo : work;
  const { fortsetzen } = Route.useSearch();

  // Auto-Fortsetzung nach Assistant-Handoff (?fortsetzen=true): die soeben
  // übergebene Session direkt öffnen statt die Startansicht zu zeigen. Läuft
  // höchstens einmal und nur, wenn tatsächlich eine fortsetzbare Session
  // existiert - sonst bleibt die Startansicht mit ihren Optionen.
  const autoResumed = useRef(false);
  const workSummary = work.sessionSummary;
  useEffect(() => {
    if (!fortsetzen || autoResumed.current || !work.hydrated || mode !== null) return;
    autoResumed.current = true;
    const canResume =
      workSummary?.exists &&
      workSummary.problem === "none" &&
      (workSummary.status === "running" || workSummary.status === "paused");
    if (canResume) {
      setMode("work");
      work.resumeStored();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fortsetzen, work.hydrated, workSummary, mode]);

  const startDemo = () => {
    const engineNav = demo;
    setMode("demo");
    const engine = engineNav.startNew({
      [NAVIGATOR_DEMO_CONTEXT_KEY]: true,
      navigatorTitle: NAVIGATOR_DEMO_TITLE,
    });
    engineNav.patchContext({
      [SITUATION_CONTEXT_KEY]: buildDemoSituationCase(
        engine.getState().navigatorId,
        engine.getState().workflowId,
      ),
    });
  };

  const showNavigator = mode !== null && nav.active;

  // pb erhöht: unterhalb von md ist NavigatorFooter zusätzlich zur globalen
  // BottomNav angeheftet (siehe NavigatorFooter.tsx), der Seiteninhalt
  // braucht entsprechend mehr Platz am Ende, um nicht darunter zu verschwinden.
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 pb-56 md:pb-8">
      {showNavigator ? (
        <DecisionNavigator
          nav={nav}
          onLeave={() => setMode(null)}
          onResetSession={() => setMode(null)}
        />
      ) : (
        <NavigatorLanding
          hydrated={work.hydrated}
          storageAvailable={work.storageAvailable}
          workSession={work.sessionSummary}
          demoSession={demo.sessionSummary}
          onStartNew={() => {
            setMode("work");
            work.startNew();
          }}
          onStartDemo={startDemo}
          onResume={() => {
            setMode("work");
            work.resumeStored();
          }}
          onResumeDemo={() => {
            setMode("demo");
            demo.resumeStored();
          }}
          onReset={(m) => {
            if (m === "demo") demo.resetSession();
            else work.resetSession();
            setMode(null);
          }}
        />
      )}
    </main>
  );
}
