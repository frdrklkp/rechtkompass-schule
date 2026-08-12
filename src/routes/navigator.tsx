import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  head: () => ({
    meta: [
      { title: "Entscheidungsnavigator – RechtKompass Schule" },
      {
        name: "description",
        content:
          "Geführter Ablauf für die schrittweise Bearbeitung schulischer Situationen – von der Situation bis zum Abschluss, mit Demo-Bearbeitung.",
      },
      { property: "og:title", content: "Entscheidungsnavigator – RechtKompass Schule" },
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 pb-28">
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
