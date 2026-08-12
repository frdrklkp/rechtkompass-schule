/**
 * Sprint 4.6E – Matching-Testansicht für Redakteurinnen und Redakteure.
 *
 * Grundlage ist die bestehende Demo-Situation des Situation Analyzers.
 * Merkmale können angepasst werden; bewertet wird ausschließlich mit dem
 * bestehenden PracticeCaseMatchScorer. Keine KI, kein eigenes Scoring.
 */
import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignalPicker, TokenListEditor } from "./TokenListEditor";
import { buildDemoSituationCase } from "@/services/situation-analyzer";
import {
  MATCH_DIMENSION_LABELS,
  MATCH_LOCATION_LABELS,
  MATCH_ROLE_LABELS,
  MATCH_SIGNALS,
  MATCH_SIGNAL_LABELS,
  defaultFeatureExtractor,
  defaultMatchScorer,
  matchLevelForScore,
  type MatchSignal,
  type PracticeCaseMatch,
  type PracticeCaseMatchIndex,
  type SituationMatchFeatures,
} from "@/services/practice-case-matching";

const LEVEL_LABELS = {
  strong: "starker Treffer",
  moderate: "plausibler Treffer",
  weak: "schwacher Treffer",
  none: "kein Treffer",
} as const;

function demoFeatures(): SituationMatchFeatures {
  const situation = buildDemoSituationCase("nav-matching-test", "wf-matching-test");
  return defaultFeatureExtractor.extract(situation);
}

export function MatchingTestPanel({ index }: { index: PracticeCaseMatchIndex | null }) {
  const [features, setFeatures] = useState<SituationMatchFeatures>(() => demoFeatures());
  const [result, setResult] = useState<PracticeCaseMatch[] | null>(null);
  const [excluded, setExcluded] = useState<PracticeCaseMatch[]>([]);

  const patch = (p: Partial<SituationMatchFeatures>) => setFeatures((f) => ({ ...f, ...p }));

  const run = () => {
    if (!index) return;
    const scored = index.entries.map((entry) => defaultMatchScorer.score(entry, features));
    setExcluded(scored.filter((m) => m.excluded));
    setResult(
      scored
        .filter((m) => !m.excluded && m.level !== "none")
        .sort((a, b) => b.score - a.score || a.caseId.localeCompare(b.caseId)),
    );
  };

  const summary = useMemo(() => {
    if (!result) return null;
    return {
      strong: result.filter((m) => m.level === "strong").length,
      moderate: result.filter((m) => m.level === "moderate").length,
      weak: result.filter((m) => m.level === "weak").length,
    };
  }, [result]);

  return (
    <div className="space-y-4">
      {!index && (
        <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          Es ist kein Matching-Index gespeichert. Bitte zuerst im Bereich „Indexsteuerung“ eine
          Vorschau berechnen und übernehmen.
        </p>
      )}

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <TokenListEditor
          label="Kategoriehinweise der Situation"
          values={features.categoryHints}
          onChange={(categoryHints) => patch({ categoryHints })}
        />
        <TokenListEditor
          label="Suchbegriffe / Tokens"
          values={features.tokens}
          onChange={(tokens) => patch({ tokens })}
        />
        <SignalPicker
          label="Beteiligtenrollen"
          options={Object.keys(MATCH_ROLE_LABELS)}
          optionLabels={MATCH_ROLE_LABELS}
          values={features.roles}
          onChange={(roles) => patch({ roles })}
        />
        <SignalPicker
          label="Orte"
          options={Object.keys(MATCH_LOCATION_LABELS)}
          optionLabels={MATCH_LOCATION_LABELS}
          values={features.locationTypes}
          onChange={(locationTypes) => patch({ locationTypes })}
        />
        <div className="md:col-span-2">
          <SignalPicker
            label="Situationsmerkmale"
            options={MATCH_SIGNALS}
            optionLabels={MATCH_SIGNAL_LABELS}
            values={features.signals}
            onChange={(signals) => patch({ signals: signals as MatchSignal[] })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <Button type="button" size="sm" disabled={!index} onClick={run}>
            <Play className="h-4 w-4" /> Matching ausführen
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setFeatures(demoFeatures());
              setResult(null);
              setExcluded([]);
            }}
          >
            Demo-Situation laden
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Erfassungsgrad {features.completionPercentage} %
            {features.unknownAspects.length > 0
              ? ` · unklar: ${features.unknownAspects.slice(0, 4).join(", ")}`
              : ""}
          </span>
        </div>
      </div>

      {result && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {result.length} Treffer ({summary?.strong} stark, {summary?.moderate} plausibel,{" "}
            {summary?.weak} schwach) · {excluded.length} ausgeschlossen · Schwelle für starken
            Treffer: {matchLevelForScore(70) === "strong" ? "70" : "—"} Punkte
          </p>
          {result.map((match) => (
            <div key={match.caseId} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm font-medium">{match.title}</div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  Score {match.score} · Konfidenz {match.confidence} %
                  <span
                    className={cn(
                      "ml-2 rounded-full border px-2 py-0.5 text-[11px]",
                      match.level === "strong"
                        ? "border-emerald-500/40 text-emerald-700"
                        : match.level === "moderate"
                          ? "border-amber-500/40 text-amber-700"
                          : "border-border",
                    )}
                  >
                    {LEVEL_LABELS[match.level]}
                  </span>
                </div>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <ul className="space-y-0.5 text-[11px]">
                  {match.dimensions.map((d) => (
                    <li key={d.dimension} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">
                        {MATCH_DIMENSION_LABELS[d.dimension]}
                        {d.matched.length > 0 ? `: ${d.matched.slice(0, 4).join(", ")}` : ""}
                      </span>
                      <span className="tabular-nums">
                        {d.points} / {d.weight}
                      </span>
                    </li>
                  ))}
                </ul>
                <ul className="space-y-0.5 text-[11px]">
                  {match.reasons.map((r) => (
                    <li
                      key={r.code + r.detail}
                      className={r.positive ? "text-emerald-700" : "text-amber-700"}
                    >
                      {r.positive ? "+" : "−"} {r.label}: {r.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
          {excluded.length > 0 && (
            <details className="rounded-xl border border-border bg-card p-3 text-xs">
              <summary className="cursor-pointer">
                {excluded.length} ausgeschlossene Praxisfälle
              </summary>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {excluded.map((m) => (
                  <li key={m.caseId}>
                    {m.title} – {m.exclusionReasons.join(" · ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
