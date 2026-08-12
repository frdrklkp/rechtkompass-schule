/**
 * Sprint 4.6G – UI- und Integrationstests der Rechtsgrundlagen-Phase.
 *
 * Rendert serverseitig (renderToString). Der Navigator-Container wird mit
 * vorbefülltem QueryClient-Cache durch den echten Hook (useLegalContext)
 * getestet; die Fachlogik bleibt in den Service-Tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { NavigatorStepRenderer, isStepAvailable } = await import("../../NavigatorStepRenderer");
const { LegalContextStepPanel } = await import("../LegalContextStepPanel");
const { LegalContextView } = await import("../LegalContextView");
const { LegalFreshnessBadge } = await import("../LegalFreshnessBadge");
const { LegalOriginalText } = await import("../LegalOriginalText");
const { LegalIssues } = await import("../LegalIssues");
const { LegalStaleNotice } = await import("../LegalStaleNotice");

const { LegalContextService, LEGAL_CONTEXT_KEY } = await import("@/services/legal-context");
const { ASSISTANT_SELECTED_CASE_KEY } = await import("@/services/assistant");

import type { LegalContextData, LegalContextResult } from "@/services/legal-context";

/* ------------------------------ Fixtures --------------------------------- */

const NOW = new Date("2026-07-20T12:00:00.000Z");
const now = () => new Date(NOW.getTime());

const DATA: LegalContextData = {
  caseRow: {
    id: "case-1",
    title: "Beleidigung im Unterricht",
    updated_at: "2026-07-15T10:00:00.000Z",
    status: "published",
  },
  links: [
    { id: "link-1", legal_section_id: "sec-53", relevance: "high", explanation: "Tragende Norm.", created_at: "2026-07-10T09:00:00.000Z" },
    { id: "link-2", legal_section_id: "sec-vv1", relevance: "medium", explanation: null, created_at: "2026-07-10T09:00:00.000Z" },
    { id: "link-3", legal_section_id: "sec-fehlt", relevance: "low", explanation: null, created_at: "2026-07-10T09:00:00.000Z" },
  ],
  sections: [
    {
      id: "sec-53",
      source_id: "src-schulg",
      section_number: "§ 53",
      title: "Ordnungsmaßnahmen",
      summary: "Ordnungsmaßnahmen bei Verstößen.",
      official_url: "https://recht.nrw/schulg#53",
      valid_from: "2005-01-01",
      status: "approved",
      last_reviewed_at: "2026-07-01",
      updated_at: "2026-07-01T08:00:00.000Z",
      original_text: "§ 53 Ordnungsmaßnahmen\n(1) Bei Verstößen …",
    },
    {
      id: "sec-vv1",
      source_id: "src-vv",
      section_number: "Nr. 4.2",
      title: "Verfahrenshinweise",
      status: "draft",
      updated_at: "2026-06-01T08:00:00.000Z",
    },
  ],
  sources: [
    {
      id: "src-schulg",
      name: "Schulgesetz für das Land Nordrhein-Westfalen",
      short_name: "SchulG NRW",
      source_type: "law",
      source_type_v2: "law",
      official_url: "https://recht.nrw/schulg",
      lifecycle_status: "active",
      verification_status: "editorial_reviewed",
      valid_from: "2005-01-01",
      last_verified_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T08:00:00.000Z",
    },
    {
      id: "src-vv",
      name: "Verwaltungsvorschrift Schulrecht",
      short_name: "VV-SchulR",
      source_type_v2: "administrative_regulation",
      lifecycle_status: "active",
      verification_status: "unverified",
      updated_at: "2026-06-01T08:00:00.000Z",
    },
  ],
};

const service = new LegalContextService({ now });
const RESULT: LegalContextResult = service.buildResult(DATA);

function render(element: React.ReactElement): string {
  return renderToString(element).replace(/<!--.*?-->/g, "");
}

function withClient(element: React.ReactElement, prime?: [unknown[], unknown][]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [key, data] of prime ?? []) client.setQueryData(key, data);
  return React.createElement(QueryClientProvider, { client, children: element });
}

const PANEL_PROPS = {
  navigatorId: "test-nav",
  workflowId: "test-flow",
  onPatchContext: () => {},
  canGoBack: true,
  onBack: () => {},
};

const SELECTED_CASE = {
  caseId: "case-1",
  title: "Beleidigung im Unterricht",
  version: "2026-07-15T10:00:00.000Z",
  curated: true,
  legalSectionIds: ["sec-53"],
  templateIds: [],
  matchLevel: "strong",
  matchScore: 90,
};

/* ------------------------------- Tests ----------------------------------- */

test("Phase „rechtsgrundlagen“ ist produktiv verfügbar (kein Platzhalter)", () => {
  assert.equal(isStepAvailable("rechtsgrundlagen"), true);
});

test("Rechtsgrundlagenphase wird über den zentralen Step Renderer gerendert", () => {
  const html = render(
    withClient(
      <NavigatorStepRenderer stepId="rechtsgrundlagen" context={{}} patchContext={() => {}} {...PANEL_PROPS} />,
    ),
  );
  assert.ok(html.includes("Rechtsgrundlagen"));
  assert.ok(!html.includes("Noch nicht verfügbar"));
});

test("Generischer Fallback: kein Praxisfall → transparente Meldung, keine erfundene Norm", () => {
  const html = render(withClient(<LegalContextStepPanel context={{}} {...PANEL_PROPS} />));
  assert.ok(html.includes("Für diese Bearbeitung wurde kein kuratierter Praxisfall bestätigt."));
  assert.ok(html.includes("keine fallspezifisch geprüften Rechtsgrundlagen"));
  assert.ok(!html.includes("§ 53"));
  assert.ok(!html.includes("SchulG"));
});

test("Bestätigter Praxisfall lädt den LegalContext (Ladezustand ohne Cache)", () => {
  const html = render(
    withClient(
      <LegalContextStepPanel context={{ [ASSISTANT_SELECTED_CASE_KEY]: SELECTED_CASE }} {...PANEL_PROPS} />,
    ),
  );
  assert.ok(html.includes("Rechtsgrundlagen werden geladen"));
});

test("Panel zeigt aufgelösten Kontext: Bezug, Anzahl, zentrale und ergänzende Gruppen", () => {
  const html = render(
    withClient(
      <LegalContextStepPanel context={{ [ASSISTANT_SELECTED_CASE_KEY]: SELECTED_CASE }} {...PANEL_PROPS} />,
      [[["legal-context", "case-1"], RESULT]],
    ),
  );
  assert.ok(html.includes("„Beleidigung im Unterricht“"));
  assert.ok(html.includes("2 mit diesem Praxisfall verknüpfte Rechtsgrundlagen"));
  assert.ok(html.includes("Zentrale Rechtsgrundlagen"));
  assert.ok(html.includes("Ergänzende Rechtsgrundlagen"));
  assert.ok(html.includes("§ 53"));
  assert.ok(html.includes("Ordnungsmaßnahmen"));
  assert.ok(html.includes("Schulgesetz für das Land Nordrhein-Westfalen"));
  assert.ok(html.includes("Nr. 4.2"));
  assert.ok(html.includes("Mit diesem Praxisfall verknüpfte Rechtsgrundlage"));
  assert.ok(!html.includes("entscheidet den Fall"));
});

test("Karte zeigt Begründung, Relevanz, Freshness-Text und offizielle Quelle", () => {
  const html = render(
    <LegalContextView result={RESULT} isStale={false} onRefresh={() => {}} onDismissStale={() => {}} />,
  );
  assert.ok(html.includes("Begründung der Anzeige"));
  assert.ok(html.includes("Tragende Norm."));
  assert.ok(html.includes("Zentrale Rechtsgrundlage"));
  assert.ok(html.includes("Aktuelle Fassung"));
  assert.ok(html.includes("Aktualität unbekannt"));
  assert.ok(html.includes("Offizielle Quelle"));
  assert.ok(html.includes("https://recht.nrw/schulg#53"));
  assert.ok(html.includes("Details"));
  assert.ok(html.includes("Originaltext anzeigen"));
});

test("Freshness-Badge bildet alle vier Zustände als Text ab", () => {
  for (const [status, label] of [
    ["current", "Aktuelle Fassung"],
    ["aging", "Ältere geprüfte Fassung"],
    ["outdated", "Prüfung empfohlen"],
    ["unknown", "Aktualität unbekannt"],
  ] as const) {
    const html = render(<LegalFreshnessBadge status={status} />);
    assert.ok(html.includes(label), `${status} fehlt`);
  }
});

test("Issues (fehlender Abschnitt, unverifizierte Quelle) werden sichtbar gemeldet", () => {
  assert.ok(RESULT.issues.some((i) => i.type === "missing_section"));
  const html = render(<LegalIssues issues={RESULT.issues} />);
  assert.ok(html.includes("role=\"alert\""));
  assert.ok(html.includes("Hinweise zu einzelnen Verknüpfungen"));
  assert.ok(html.includes("nicht gefunden"));
  assert.ok(html.includes("noch nicht verifiziert"));
  assert.ok(html.includes("nicht betroffen"));
});

test("Originaltext wird unverändert und gekennzeichnet angezeigt", () => {
  const html = render(
    <LegalOriginalText text="§ 53 Ordnungsmaßnahmen&#x27;" sourceLabel="SchulG NRW" versionLabel="Stand 2026" />,
  );
  assert.ok(html.includes("Originaltext aus der hinterlegten Quelle"));
  assert.ok(html.includes("SchulG NRW"));
  assert.ok(html.includes("Fassung: Stand 2026"));
});

test("Fehlender Originaltext wird verständlich dargestellt", () => {
  const html = render(<LegalOriginalText text={null} sourceLabel="VV-SchulR" />);
  assert.ok(html.includes("Für diese Referenz liegt aktuell kein gespeicherter Quelltext vor."));
});

test("Stale-Hinweis erscheint mit Grund und Aktualisieren-Button", () => {
  const html = render(<LegalStaleNotice onRefresh={() => {}} onDismiss={() => {}} />);
  assert.ok(html.includes("Rechtsgrundlagen veraltet"));
  assert.ok(html.includes("wurden"));
  assert.ok(html.includes("Rechtsgrundlagen aktualisieren"));
  assert.ok(html.includes("nicht automatisch überschrieben"));
});

test("Stale über den echten Hook: gespeicherter Stand + geänderter frischer Stand", () => {
  const stored = { ...RESULT, inputHash: "alter-hash" };
  const html = render(
    withClient(
      <LegalContextStepPanel
        context={{
          [ASSISTANT_SELECTED_CASE_KEY]: SELECTED_CASE,
          [LEGAL_CONTEXT_KEY]: stored,
        }}
        {...PANEL_PROPS}
      />,
      [[["legal-context", "case-1"], RESULT]],
    ),
  );
  assert.ok(html.includes("Rechtsgrundlagen veraltet"));
  assert.ok(html.includes("Rechtsgrundlagen aktualisieren"));
  // Vorheriger Stand bleibt sichtbar.
  assert.ok(html.includes("§ 53"));
});

test("Reload: gespeicherter Stand wird wiederhergestellt (kein Stale bei gleichem Hash)", () => {
  const restored = service.restore(JSON.parse(JSON.stringify(RESULT)));
  assert.equal(restored.error, null);
  const html = render(
    withClient(
      <LegalContextStepPanel
        context={{
          [ASSISTANT_SELECTED_CASE_KEY]: SELECTED_CASE,
          [LEGAL_CONTEXT_KEY]: restored.entry,
        }}
        {...PANEL_PROPS}
      />,
      [[["legal-context", "case-1"], RESULT]],
    ),
  );
  assert.ok(html.includes("§ 53"));
  assert.ok(html.includes("Zentrale Rechtsgrundlagen"));
  assert.ok(!html.includes("Rechtsgrundlagen veraltet"));
});

test("Technische IDs und Hash erscheinen nur in Detailansichten", () => {
  const html = render(
    <LegalContextView result={RESULT} isStale={false} onRefresh={() => {}} onDismissStale={() => {}} />,
  );
  // Hash nur innerhalb der eingeklappten Technischen Angaben.
  assert.ok(html.includes("Technische Angaben"));
  assert.ok(html.includes("Eingabe-Hash"));
  assert.ok(html.includes(RESULT.inputHash));
});

test("Leerstand: Praxisfall ohne Verknüpfungen zeigt ehrlichen Leerzustand", () => {
  const empty = service.buildResult({ ...DATA, links: [], sections: [], sources: [] });
  const html = render(
    <LegalContextView result={empty} isStale={false} onRefresh={() => {}} onDismissStale={() => {}} />,
  );
  assert.ok(html.includes("Für diesen Praxisfall sind aktuell keine Rechtsgrundlagen verknüpft."));
  assert.ok(!html.includes("§ 53"));
});

test("Grenzen der Anzeige werden ausgewiesen", () => {
  const html = render(
    <LegalContextView result={RESULT} isStale={false} onRefresh={() => {}} onDismissStale={() => {}} />,
  );
  assert.ok(html.includes("Grenzen dieser Anzeige"));
  assert.ok(html.includes("ersetzt keine Rechtsberatung"));
  assert.ok(html.includes("amtliche Fassung"));
});
