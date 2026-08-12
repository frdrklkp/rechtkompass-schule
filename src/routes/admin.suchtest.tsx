import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, ClipboardCopy, PlayCircle, Save, Trash2 } from "lucide-react";
import { usePublishedCases } from "@/lib/casesFromDb";
import type { CaseData } from "@/data/cases";
import {
  SEARCH_TESTSET,
  resolveTestSet,
  type SearchTestCase,
  type TestAudit,
} from "@/lib/searchTestSet";
import {
  diagnoseTest,
  aggregateDiagnoses,
  ERROR_CLASS_LABEL,
  DIAGNOSTIC_VERSION,
  type TestDiagnosis,
  type AggregateMetrics,
  type ErrorClass,
  type Evaluation,
} from "@/lib/searchDiagnostics";
import {
  listTestOverrides,
  upsertTestOverride,
  deleteTestOverride,
  type TestOverride,
} from "@/lib/searchTestOverridesRepo";

export const Route = createFileRoute("/admin/suchtest")({
  component: SearchTestAdmin,
});

function num(x: number, digits = 2): string {
  return x.toFixed(digits);
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function StatusBadge({ ev }: { ev: Evaluation }) {
  const map: Record<Evaluation["status"], { text: string; cls: string }> = {
    TOP_1: { text: "Top-1", cls: "bg-success/10 text-success" },
    TOP_3: { text: `Top-3 (Rang ${ev.expectedRank})`, cls: "bg-warning/10 text-warning" },
    MISS: {
      text: ev.expectedRank ? `Miss (Rang ${ev.expectedRank})` : "Miss (nicht in Ergebnissen)",
      cls: "bg-danger/10 text-danger",
    },
    CONTENT_GAP: { text: "Content Gap", cls: "bg-muted text-muted-foreground" },
    AMBIGUOUS: { text: "Mehrdeutig", cls: "bg-muted text-muted-foreground" },
    GROUND_TRUTH_MISSING: {
      text: "Ground-Truth fehlt",
      cls: "bg-muted text-muted-foreground",
    },
  };
  const b = map[ev.status];
  return <span className={`rounded px-2 py-0.5 text-[10px] ${b.cls}`}>{b.text}</span>;
}

function ErrorBadge({ e }: { e: ErrorClass }) {
  const positive = e === "OK";
  const neutral =
    e === "NEAR_MISS" ||
    e === "CONTENT_GAP" ||
    e === "AMBIGUOUS" ||
    e === "GROUND_TRUTH_CASE_MISSING";
  const cls = positive
    ? "bg-success/10 text-success"
    : neutral
      ? "bg-muted text-muted-foreground"
      : "bg-danger/10 text-danger";
  return <span className={`rounded px-2 py-0.5 text-[10px] ${cls}`}>{ERROR_CLASS_LABEL[e]}</span>;
}

function SignalChips({ d }: { d: TestDiagnosis }) {
  const s = d.querySignals;
  const parts: Array<[string, string[]]> = [
    ["Intent", s.intents],
    ["Beteiligte", s.participants],
    ["Situation", s.situations],
    ["Handlung", s.actions],
  ];
  return (
    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
      {parts.map(([k, arr]) =>
        arr.length ? (
          <span key={k} className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
            {k}: {arr.join("/")}
          </span>
        ) : null,
      )}
    </div>
  );
}

function DiagRow({ d, winnerId }: { d: TestDiagnosis; winnerId: string | null }) {
  const [open, setOpen] = useState(false);
  const ev = d.evaluation;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{d.test.id}</span>
            <span>· {d.test.category}</span>
            {d.test.audit && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{d.test.audit}</span>
            )}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
              GT: {ev.resolution}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <ErrorBadge e={d.errorClass} />
              <StatusBadge ev={ev} />
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold">{d.test.query}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Akzeptierte caseIds ({ev.acceptedCaseIds.length}):{" "}
            {ev.acceptedCaseIds.length
              ? ev.acceptedCaseIds.slice(0, 4).map(shortId).join(", ")
              : "–"}
            {ev.expectedRank ? ` · Expected Rank: ${ev.expectedRank}` : ""}
            {ev.matchedCaseId ? ` · Matched: ${shortId(ev.matchedCaseId)}` : ""}
          </div>
          <SignalChips d={d} />
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs">
          <div>
            <span className="font-semibold">Grund: </span>
            <span className="text-muted-foreground">{d.errorReason}</span>
          </div>

          <div>
            <div className="mb-1 font-semibold">Varianten-Vergleich (Top-1 dieser Frage)</div>
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">Var</th>
                  <th className="text-left">Top-1 Titel</th>
                  <th>Δ Top1-2</th>
                  <th>Rang</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.variants.map((v) => (
                  <tr key={v.variantId} className={v.variantId === winnerId ? "bg-accent/5" : ""}>
                    <td className="font-mono">{v.variantId}</td>
                    <td className="pr-2">{v.hybridTop5[0]?.title ?? "–"}</td>
                    <td className="text-center">{num(v.gapTop1Top2, 3)}</td>
                    <td className="text-center">{v.evaluation.expectedRank ?? "–"}</td>
                    <td className="text-center">
                      {v.evaluation.isTop1 ? "✓" : v.evaluation.isTop3 ? "≈" : "✗"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="mb-1 font-semibold">Top-5 in Referenz-Variante A (Scores)</div>
            <table className="w-full text-[10px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">Titel</th>
                  <th className="text-left">caseId</th>
                  <th>sem</th>
                  <th>str</th>
                  <th>top</th>
                  <th>sig</th>
                  <th>leg</th>
                  <th>qual</th>
                  <th>pen</th>
                  <th>final</th>
                </tr>
              </thead>
              <tbody>
                {d.hybridTop5.map((c, i) => (
                  <tr key={c.caseId} className={c.isAccepted ? "bg-success/10" : ""}>
                    <td>{i + 1}</td>
                    <td className="pr-2">{c.title}</td>
                    <td className="pr-2 font-mono text-[9px]">{shortId(c.caseId)}</td>
                    <td className="text-center">{num(c.semantic)}</td>
                    <td className="text-center">{num(c.structured)}</td>
                    <td className="text-center">{num(c.topics)}</td>
                    <td className="text-center">{num(c.signalScore)}</td>
                    <td className="text-center">{num(c.legal)}</td>
                    <td className="text-center">{num(c.quality)}</td>
                    <td className="text-center text-danger">−{num(c.negativeMismatchPenalty)}</td>
                    <td className="text-center font-semibold">{num(c.finalScore, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="mb-1 font-semibold text-muted-foreground">Baseline (Struktur) Top-5</div>
            <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground">
              {d.structuredTop5.map((r) => (
                <li key={r.caseId} className={r.isAccepted ? "text-success" : ""}>
                  {r.title} <span>({r.relevanceScore})</span>
                </li>
              ))}
              {d.structuredTop5.length === 0 && <li className="list-none">–</li>}
            </ol>
          </div>

          {ev.missingCaseIds.length > 0 && (
            <div className="rounded bg-warning/10 p-2 text-[11px]">
              Referenzierte caseIds fehlen im Korpus:{" "}
              {ev.missingCaseIds.map(shortId).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VariantsPanel({ m }: { m: AggregateMetrics }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Gewichtungs-Sweep</div>
        {m.winnerVariantId && (
          <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
            Gewinner: Variante {m.winnerVariantId}
          </span>
        )}
      </div>
      <table className="w-full text-[11px]">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left">Variante</th>
            <th>sem</th>
            <th>str</th>
            <th>top</th>
            <th>sig</th>
            <th>leg</th>
            <th>qual</th>
            <th>n eval.</th>
            <th>Top-1 %</th>
            <th>Top-3 %</th>
            <th>falsch Top-1</th>
            <th>Ø Δ</th>
            <th>min Kat.</th>
          </tr>
        </thead>
        <tbody>
          {m.variants.map((v) => (
            <tr
              key={v.variantId}
              className={v.variantId === m.winnerVariantId ? "bg-accent/10 font-semibold" : ""}
            >
              <td className="text-left">{v.variantLabel}</td>
              <td className="text-center">{v.weights.semantic.toFixed(2)}</td>
              <td className="text-center">{v.weights.structured.toFixed(2)}</td>
              <td className="text-center">{v.weights.topics.toFixed(2)}</td>
              <td className="text-center">{v.weights.signals.toFixed(2)}</td>
              <td className="text-center">{v.weights.legal.toFixed(2)}</td>
              <td className="text-center">{v.weights.quality.toFixed(2)}</td>
              <td className="text-center">{v.evaluableCount}</td>
              <td className="text-center">{v.top1Pct}</td>
              <td className="text-center">{v.top3Pct}</td>
              <td className="text-center">{v.wrongTop1}</td>
              <td className="text-center">{v.avgGap.toFixed(3)}</td>
              <td className="text-center">{v.topicRobustness.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricsPanel({ m }: { m: AggregateMetrics }) {
  const errorEntries = (Object.entries(m.errorClassCounts) as Array<[ErrorClass, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3 text-xs">
        <div className="font-semibold">
          Testset: {m.n} gesamt · {m.nEvaluable} bewertbar · {m.contentGaps} Content Gap ·{" "}
          {m.ambiguous} mehrdeutig · {m.groundTruthMissing} Ground-Truth fehlt
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
          <div className="text-xs font-semibold uppercase text-accent">Hybrid (Referenz A)</div>
          <div className="mt-1 text-sm">Top-1: {m.hybridTop1Pct}%</div>
          <div className="text-sm">Top-3: {m.hybridTop3Pct}%</div>
          <div className="text-xs text-muted-foreground">
            No-Result: {m.hybridNoRes} · Ø Δ Top1→Top2: {m.avgGapHybrid}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Baseline (Struktur)</div>
          <div className="mt-1 text-sm">Top-1: {m.structuredTop1Pct}%</div>
          <div className="text-sm">Top-3: {m.structuredTop3Pct}%</div>
          <div className="text-xs text-muted-foreground">
            No-Result: {m.structuredNoRes} · Ø Δ Top1→Top2: {m.avgGapStructured}
          </div>
        </div>
      </div>
      {m.variants && m.variants.length > 0 ? (
        <VariantsPanel m={m} />
      ) : (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          Varianten-Sweep wurde nicht ausgeführt. HYBRID_WEIGHT_VARIANTS lieferten keine Ergebnisse.
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-3 text-xs">
        <div className="font-semibold">Fehlerklassen (Referenz A)</div>
        <ul className="mt-1 grid grid-cols-2 gap-1">
          {errorEntries.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between rounded border border-border px-2 py-1">
              <span>{ERROR_CLASS_LABEL[k]}</span>
              <span className="font-mono">{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Ground-Truth-Editor ────────────────────────────────────────────────────
const TECHNICAL_ERROR_CLASSES: ErrorClass[] = [
  "NEAR_MISS",
  "SEARCH_DOCUMENT_WEAK",
  "TOPIC_DETECTION_WRONG",
  "SEMANTIC_FALSE_POSITIVE",
  "STRUCTURED_SCORE_TOO_STRONG",
  "LEGAL_CONTEXT_WRONG",
  "SIGNAL_MISMATCH",
  "DUPLICATE_OR_OVERLAPPING_CASES",
];

function NextActionsPanel({ diags }: { diags: TestDiagnosis[] }) {
  const contentGaps = diags.filter((d) => d.evaluation.status === "CONTENT_GAP");
  const ambiguous = diags.filter((d) => d.evaluation.status === "AMBIGUOUS");
  const technical = diags.filter((d) => TECHNICAL_ERROR_CLASSES.includes(d.errorClass));

  const Section = ({
    title,
    tone,
    items,
    render,
    empty,
  }: {
    title: string;
    tone: "muted" | "warning" | "danger";
    items: TestDiagnosis[];
    render: (d: TestDiagnosis) => React.ReactNode;
    empty: string;
  }) => {
    const toneCls =
      tone === "danger"
        ? "border-danger/40 bg-danger/5"
        : tone === "warning"
          ? "border-warning/40 bg-warning/5"
          : "border-border bg-muted/40";
    return (
      <div className={`rounded-xl border p-3 ${toneCls}`}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">{title}</div>
          <span className="text-[11px] text-muted-foreground">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground">{empty}</div>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {items.map((d) => (
              <li key={d.test.id} className="rounded border border-border/60 bg-background/60 p-2">
                {render(d)}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Nächste Qualitätsmaßnahmen</h2>
        <p className="text-xs text-muted-foreground">
          Konkrete Arbeitsaufgaben aus dem aktuellen Diagnose-Lauf. Redaktion und Ranking
          getrennt, damit nicht jeder Miss über Gewichte gelöst wird.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
          Content-Lücken: <b>{contentGaps.length}</b>
        </span>
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
          Redaktionell mehrdeutig: <b>{ambiguous.length}</b>
        </span>
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
          Technische Ranking-Fehler: <b>{technical.length}</b>
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Section
          title="Content-Lücken"
          tone="muted"
          items={contentGaps}
          empty="Keine offenen Content-Lücken."
          render={(d) => (
            <>
              <div className="font-mono text-[10px] text-muted-foreground">{d.test.id}</div>
              <div className="font-medium">{d.test.query}</div>
              <div className="text-muted-foreground">
                Kategorie: {d.test.category ?? "–"} · Neuer Praxisfall erforderlich.
              </div>
            </>
          )}
        />
        <Section
          title="Redaktionell mehrdeutig"
          tone="warning"
          items={ambiguous}
          empty="Keine mehrdeutigen Fragen."
          render={(d) => (
            <>
              <div className="font-mono text-[10px] text-muted-foreground">{d.test.id}</div>
              <div className="font-medium">{d.test.query}</div>
              <div className="text-muted-foreground">
                Ground Truth präzisieren oder acceptableCaseIds erweitern.
              </div>
            </>
          )}
        />
        <Section
          title="Technische Ranking-Fehler"
          tone="danger"
          items={technical}
          empty="Keine technischen Ranking-Fehler."
          render={(d) => {
            const top1 = d.hybridTop5[0];
            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="font-mono text-[10px] text-muted-foreground">{d.test.id}</div>
                  <ErrorBadge e={d.errorClass} />
                </div>
                <div className="font-medium">{d.test.query}</div>
                <div className="text-muted-foreground">
                  Rang: {d.evaluation.expectedRank ?? "—"} · Top-1: {top1 ? top1.title : "–"}
                </div>
                <div className="text-muted-foreground">{d.errorReason}</div>
              </>
            );
          }}
        />
      </div>
    </div>
  );
}


const AUDIT_OPTIONS: Array<TestAudit | ""> = [
  "",
  "EXACT_MATCH_AVAILABLE",
  "GOOD_ALTERNATIVE_AVAILABLE",
  "CONTENT_GAP",
  "AMBIGUOUS_EXPECTATION",
];

type EditorRowState = {
  expected: string[];
  acceptable: string[];
  audit: TestAudit | "";
  note: string;
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  error: string | null;
};

function makeInitialState(t: SearchTestCase, override: TestOverride | undefined): EditorRowState {
  return {
    expected: override?.expected_case_ids ?? t.expectedCaseIds ?? [],
    acceptable: override?.acceptable_case_ids ?? t.acceptableCaseIds ?? [],
    audit: (override?.audit ?? t.audit ?? "") as TestAudit | "",
    note: override?.note ?? "",
    dirty: false,
    saving: false,
    savedAt: null,
    error: null,
  };
}

function EditorRow({
  test,
  override,
  cases,
  diag,
  onSaved,
  onDeleted,
}: {
  test: SearchTestCase;
  override: TestOverride | undefined;
  cases: CaseData[];
  diag: TestDiagnosis | undefined;
  onSaved: (o: TestOverride) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<EditorRowState>(() => makeInitialState(test, override));
  const [manualId, setManualId] = useState("");

  const titleFor = (id: string): string =>
    cases.find((c) => c.id === id)?.title ?? `⚠ nicht im Korpus (${shortId(id)})`;

  const patch = (p: Partial<EditorRowState>) =>
    setS((prev) => ({ ...prev, ...p, dirty: true, savedAt: null, error: null }));

  const toggle = (id: string, kind: "expected" | "acceptable") => {
    setS((prev) => {
      const cur = prev[kind];
      const has = cur.includes(id);
      const next = has ? cur.filter((x) => x !== id) : [...cur, id];
      // Wenn in "expected" aufgenommen, aus "acceptable" entfernen (und umgekehrt).
      const other = kind === "expected" ? "acceptable" : "expected";
      const otherList = has ? prev[other] : prev[other].filter((x) => x !== id);
      return { ...prev, [kind]: next, [other]: otherList, dirty: true, savedAt: null, error: null };
    });
  };

  const removeCase = (id: string) => {
    setS((prev) => ({
      ...prev,
      expected: prev.expected.filter((x) => x !== id),
      acceptable: prev.acceptable.filter((x) => x !== id),
      dirty: true,
      savedAt: null,
      error: null,
    }));
  };

  const addManual = () => {
    const id = manualId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      patch({ error: "Bitte eine gültige UUID einfügen." });
      return;
    }
    if (!s.acceptable.includes(id) && !s.expected.includes(id)) {
      setS((prev) => ({ ...prev, acceptable: [...prev.acceptable, id], dirty: true, savedAt: null, error: null }));
    }
    setManualId("");
  };

  const save = async () => {
    setS((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const saved = await upsertTestOverride({
        test_id: test.id,
        expected_case_ids: s.expected,
        acceptable_case_ids: s.acceptable,
        audit: s.audit === "" ? null : s.audit,
        note: s.note.trim() || null,
      });
      setS((prev) => ({ ...prev, dirty: false, saving: false, savedAt: Date.now(), error: null }));
      onSaved(saved);
    } catch (e: any) {
      setS((prev) => ({ ...prev, saving: false, error: e?.message ?? "Fehler beim Speichern" }));
    }
  };

  const del = async () => {
    if (!override) return;
    if (!confirm(`Override für ${test.id} löschen?`)) return;
    try {
      await deleteTestOverride(test.id);
      onDeleted(test.id);
      setS(makeInitialState(test, undefined));
    } catch (e: any) {
      setS((prev) => ({ ...prev, error: e?.message ?? "Fehler beim Löschen" }));
    }
  };

  const candidates: Array<{ id: string; title: string; source: string }> = [];
  const seen = new Set<string>();
  if (diag) {
    for (const c of diag.hybridTop5) {
      if (!seen.has(c.caseId)) {
        candidates.push({ id: c.caseId, title: c.title, source: "Hybrid" });
        seen.add(c.caseId);
      }
    }
    for (const b of diag.structuredTop5) {
      if (!seen.has(b.caseId)) {
        candidates.push({ id: b.caseId, title: b.title, source: "Struktur" });
        seen.add(b.caseId);
      }
    }
  }
  // Bereits ausgewählte, die nicht in Kandidaten sind, auch anzeigen:
  for (const id of [...s.expected, ...s.acceptable]) {
    if (!seen.has(id)) {
      candidates.push({ id, title: titleFor(id), source: "manuell" });
      seen.add(id);
    }
  }

  const hasGT = s.expected.length + s.acceptable.length > 0;
  const gtLabel = override ? "Override aktiv" : hasGT ? "Static GT" : "keine GT";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 text-left"
      >
        {open ? <ChevronDown className="mt-0.5 h-4 w-4" /> : <ChevronRight className="mt-0.5 h-4 w-4" />}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{test.id}</span>
            <span>· {test.category}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{gtLabel}</span>
            {s.audit && (
              <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">{s.audit}</span>
            )}
            {s.dirty && (
              <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">ungespeichert</span>
            )}
            {s.savedAt && !s.dirty && (
              <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">gespeichert</span>
            )}
            <span className="ml-auto text-[10px]">
              expected: {s.expected.length} · acceptable: {s.acceptable.length}
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold">{test.query}</div>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs">
          {/* aktuelle Auswahl */}
          <div>
            <div className="mb-1 font-semibold">Aktuelle Ground Truth</div>
            {s.expected.length + s.acceptable.length === 0 ? (
              <div className="text-muted-foreground">Keine caseIds ausgewählt.</div>
            ) : (
              <ul className="space-y-1">
                {s.expected.map((id) => (
                  <li key={"e" + id} className="flex items-center gap-2 rounded border border-success/40 bg-success/5 px-2 py-1">
                    <span className="rounded bg-success/20 px-1 text-[9px] font-semibold text-success">EXPECTED</span>
                    <span className="flex-1">{titleFor(id)}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">{shortId(id)}</span>
                    <button type="button" onClick={() => removeCase(id)} className="text-danger">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
                {s.acceptable.map((id) => (
                  <li key={"a" + id} className="flex items-center gap-2 rounded border border-accent/40 bg-accent/5 px-2 py-1">
                    <span className="rounded bg-accent/20 px-1 text-[9px] font-semibold text-accent">ACCEPT</span>
                    <span className="flex-1">{titleFor(id)}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">{shortId(id)}</span>
                    <button type="button" onClick={() => removeCase(id)} className="text-danger">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Kandidaten */}
          <div>
            <div className="mb-1 flex items-center justify-between font-semibold">
              <span>Kandidaten (aus letzter Diagnose)</span>
              {!diag && <span className="text-[10px] text-muted-foreground">Bitte erst Diagnose ausführen</span>}
            </div>
            {candidates.length === 0 ? (
              <div className="text-muted-foreground">Keine Kandidaten verfügbar.</div>
            ) : (
              <table className="w-full">
                <tbody>
                  {candidates.map((c) => {
                    const inE = s.expected.includes(c.id);
                    const inA = s.acceptable.includes(c.id);
                    return (
                      <tr key={c.id} className="border-b border-border/50 last:border-b-0">
                        <td className="py-1 pr-2">{c.title}</td>
                        <td className="pr-2 text-[10px] text-muted-foreground">{c.source}</td>
                        <td className="pr-1 font-mono text-[9px] text-muted-foreground">{shortId(c.id)}</td>
                        <td className="pr-1 text-center">
                          <label className="inline-flex items-center gap-1 text-[10px]">
                            <input
                              type="checkbox"
                              checked={inE}
                              onChange={() => toggle(c.id, "expected")}
                            />
                            exp
                          </label>
                        </td>
                        <td className="text-center">
                          <label className="inline-flex items-center gap-1 text-[10px]">
                            <input
                              type="checkbox"
                              checked={inA}
                              onChange={() => toggle(c.id, "acceptable")}
                            />
                            acc
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Manuell caseId */}
          <div className="flex items-center gap-2">
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="caseId (UUID) manuell hinzufügen"
              className="flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-[10px]"
            />
            <Button size="sm" variant="outline" onClick={addManual}>
              + acceptable
            </Button>
          </div>

          {/* Audit + Note */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block font-semibold">Audit</label>
              <select
                value={s.audit}
                onChange={(e) => patch({ audit: e.target.value as TestAudit | "" })}
                className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
              >
                {AUDIT_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a || "(kein Audit)"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-semibold">Redaktionelle Notiz</label>
              <Textarea
                value={s.note}
                onChange={(e) => patch({ note: e.target.value })}
                rows={2}
                className="text-[11px]"
              />
            </div>
          </div>

          {s.error && (
            <div className="rounded bg-danger/10 p-2 text-[11px] text-danger">{s.error}</div>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={s.saving || !s.dirty}>
              <Save className="mr-1 h-3 w-3" />
              {s.saving ? "…" : "Speichern"}
            </Button>
            {override && (
              <Button size="sm" variant="outline" onClick={del}>
                <Trash2 className="mr-1 h-3 w-3" />
                Override löschen
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hauptkomponente ────────────────────────────────────────────────────────

function SearchTestAdmin() {
  const { data: cases = [] } = usePublishedCases();
  const [overrides, setOverrides] = useState<TestOverride[]>([]);
  const [overridesLoaded, setOverridesLoaded] = useState(false);
  const [overridesError, setOverridesError] = useState<string | null>(null);
  const [diags, setDiags] = useState<TestDiagnosis[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runInfo, setRunInfo] = useState<{ runId: string; startedAt: string } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTestOverrides()
      .then((r) => {
        if (cancelled) return;
        setOverrides(r);
        setOverridesLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setOverridesError(e?.message ?? "Overrides konnten nicht geladen werden");
        setOverridesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedTests = useMemo(() => resolveTestSet(overrides), [overrides]);
  const overridesById = useMemo(() => {
    const m = new Map<string, TestOverride>();
    for (const o of overrides) m.set(o.test_id, o);
    return m;
  }, [overrides]);

  const diagsById = useMemo(() => {
    const m = new Map<string, TestDiagnosis>();
    for (const d of diags ?? []) m.set(d.test.id, d);
    return m;
  }, [diags]);

  const runAll = async () => {
    if (!cases.length) return;
    setRunning(true);
    setProgress(0);
    const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    setRunInfo({ runId, startedAt });
    try {
      const out: TestDiagnosis[] = [];
      for (const t of resolvedTests) {
        out.push(await diagnoseTest(t, cases));
        setProgress(out.length);
      }
      setDiags(out);
    } finally {
      setRunning(false);
    }
  };

  const metrics = useMemo(() => (diags ? aggregateDiagnoses(diags) : null), [diags]);

  const copyJson = async () => {
    if (!diags || !metrics) return;
    const payload = {
      diagnosticVersion: DIAGNOSTIC_VERSION,
      runInfo,
      metrics,
      diagnoses: diags,
      // Fehlerklasse-Buckets als Test-ID-Listen, damit ich sie im nächsten Turn
      // gezielt auslesen und beheben kann, ohne 30 Zeilen zu parsen.
      errorBuckets: diags.reduce<Record<string, string[]>>((acc, d) => {
        (acc[d.errorClass] ??= []).push(d.test.id);
        return acc;
      }, {}),
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  };

  const onSaved = (o: TestOverride) =>
    setOverrides((prev) => {
      const others = prev.filter((x) => x.test_id !== o.test_id);
      return [...others, o];
    });
  const onDeleted = (id: string) => setOverrides((prev) => prev.filter((o) => o.test_id !== id));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Suchtest & Diagnose</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {SEARCH_TESTSET.length} realistische Lehrerfragen × 5 Gewichtungsvarianten.
          Accuracy wird ausschließlich anhand konkreter caseIds bewertet — Titel-Fragmente
          dienen nur zur Ground-Truth-Auflösung, wenn keine caseIds hinterlegt sind.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={runAll} disabled={running || cases.length === 0 || !overridesLoaded}>
          <PlayCircle className="mr-2 h-4 w-4" />
          Diagnose ausführen ({resolvedTests.length} Fragen × 5 Varianten)
        </Button>
        {diags && (
          <Button variant="outline" onClick={copyJson}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            JSON kopieren (mit Fehlerklassen-Buckets)
          </Button>
        )}
        <Button variant={editorOpen ? "default" : "outline"} onClick={() => setEditorOpen((o) => !o)}>
          Ground-Truth-Editor {editorOpen ? "schließen" : "öffnen"}
        </Button>
        {running && (
          <span className="self-center text-xs text-muted-foreground">
            läuft … {progress}/{resolvedTests.length}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          Overrides: {overrides.length} aktiv{overridesError ? ` · ⚠ ${overridesError}` : ""}
        </span>
      </div>

      {runInfo && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] font-mono text-muted-foreground">
          Diagnose-Version: {DIAGNOSTIC_VERSION} · Run-ID: {runInfo.runId} · Ausgeführt:{" "}
          {new Date(runInfo.startedAt).toLocaleString()} · Korpus: {cases.length} veröffentlichte
          Fälle · Overrides: {overrides.length} · Varianten:{" "}
          {diags && diags[0] ? diags[0].variants.length : "–"}
        </div>
      )}

      {editorOpen && (
        <div className="space-y-3">
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 text-xs">
            <div className="font-semibold text-accent">Ground-Truth-Editor</div>
            <p className="mt-1 text-muted-foreground">
              Kandidaten stammen aus Hybrid-Top-5 und Struktur-Top-5 der letzten Diagnose.
              Führe die Diagnose einmal aus, dann kannst du pro Frage die passenden Fälle
              als <em>expected</em> (zählt für Top-1) oder <em>acceptable</em> (zählt für Top-3)
              markieren. Manuelle caseIds können per UUID ergänzt werden. Overrides überschreiben
              die statische SEARCH_TESTSET beim nächsten Diagnose-Lauf.
            </p>
          </div>
          {resolvedTests.map((t) => (
            <EditorRow
              key={t.id}
              test={t}
              override={overridesById.get(t.id)}
              cases={cases}
              diag={diagsById.get(t.id)}
              onSaved={onSaved}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}

      {metrics && <MetricsPanel m={metrics} />}

      {diags && <NextActionsPanel diags={diags} />}

      {diags && !editorOpen && (
        <div className="space-y-2">
          {diags.map((d) => (
            <DiagRow key={d.test.id} d={d} winnerId={metrics?.winnerVariantId ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
