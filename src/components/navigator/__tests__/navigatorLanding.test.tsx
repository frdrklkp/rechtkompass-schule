/**
 * Sprint 4.6J.2 – UI-Smoke-Tests der Navigator-Startansicht.
 *
 * Prüft die Assistant-first-Positionierung: teacher-facing Titel
 * "Fall bearbeiten", strukturierte Neuerfassung, Session-Resume und den
 * Querverweis zurück zur freien Fallschilderung (/assistent).
 * Gleiches Muster wie assistantUi.test.tsx (renderToString + Link-Mock).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";

const { mock } = await import("bun:test");

const actualRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) =>
    React.createElement("a", { href: typeof to === "string" ? to : "#" }, children),
}));

const { NavigatorLanding } = await import("../NavigatorLanding");
import type { NavigatorSessionSummary } from "@/services/decision-navigator";

function render(element: React.ReactElement): string {
  return renderToString(element).replace(/<!--.*?-->/g, "");
}

function makeSummary(overrides: Partial<NavigatorSessionSummary> = {}): NavigatorSessionSummary {
  return {
    navigatorId: "nav-test",
    mode: "work",
    exists: false,
    problem: "none",
    message: null,
    status: null,
    currentStepId: null,
    currentStepTitle: null,
    percent: 0,
    updatedAt: null,
    isDemo: false,
    ...overrides,
  } as NavigatorSessionSummary;
}

const noop = () => {};

function renderLanding(work: NavigatorSessionSummary | null, demo: NavigatorSessionSummary | null) {
  return render(
    <NavigatorLanding
      hydrated
      storageAvailable
      workSession={work}
      demoSession={demo}
      onStartNew={noop}
      onStartDemo={noop}
      onResume={noop}
      onResumeDemo={noop}
      onReset={noop}
    />,
  );
}

test("Leerer Navigator: teacher-facing Titel und strukturierte Neuerfassung", () => {
  const html = renderLanding(makeSummary(), makeSummary({ mode: "demo", isDemo: true }));
  assert.ok(html.includes("Fall bearbeiten"));
  assert.ok(!html.includes("Decision Navigator"));
  assert.ok(html.includes("Neuen Fall strukturiert erfassen"));
  assert.ok(html.includes("Noch keine gespeicherte Bearbeitung vorhanden."));
});

test("Leerer Navigator: Querverweis zur freien Fallschilderung", () => {
  const html = renderLanding(makeSummary(), makeSummary({ mode: "demo", isDemo: true }));
  assert.ok(html.includes("Lieber frei schildern?"));
  assert.ok(html.includes("Fall schildern"));
  assert.ok(html.includes('href="/assistent"'));
});

test("Bestehende Session: 'Fall fortsetzen' wird angeboten", () => {
  const work = makeSummary({
    exists: true,
    status: "paused",
    currentStepId: "situation",
    currentStepTitle: "Situation",
    percent: 28,
    updatedAt: "2026-08-14T10:00:00.000Z",
  });
  const html = renderLanding(work, makeSummary({ mode: "demo", isDemo: true }));
  assert.ok(html.includes("Fall fortsetzen"));
  assert.ok(html.includes("Situation"));
  assert.ok(html.includes("28%"));
});

test("Demo-Einstieg bleibt als sekundäre Option erhalten", () => {
  const html = renderLanding(makeSummary(), makeSummary({ mode: "demo", isDemo: true }));
  assert.ok(html.includes("Demo starten"));
  assert.ok(html.includes("Keine echten Personen"));
});
