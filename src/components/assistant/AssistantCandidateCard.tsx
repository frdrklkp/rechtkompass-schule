/**
 * Sprint 4.6F – Darstellung eines Trefferkandidaten.
 * Technische Werte bleiben in einer aufklappbaren Detailansicht.
 */
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import type { PracticeCaseMatch, PracticeCaseSource } from "@/services/practice-case-matching";

export const MATCH_LEVEL_LABELS: Record<string, string> = {
  strong: "Hohe Übereinstimmung",
  moderate: "Plausible Übereinstimmung",
  weak: "Schwache Übereinstimmung",
  none: "Keine ausreichende Übereinstimmung",
};

const LEVEL_STYLE: Record<string, string> = {
  strong: "border-success/50 bg-success/10",
  moderate: "border-warning/50 bg-warning/10",
  weak: "border-border bg-muted/40",
  none: "border-border bg-muted/40",
};

export interface AssistantCandidateCardProps {
  match: PracticeCaseMatch;
  source: PracticeCaseSource | null;
  selected: boolean;
  primary?: boolean;
  onSelect: () => void;
}

export function AssistantCandidateCard({
  match,
  source,
  selected,
  primary = false,
  onSelect,
}: AssistantCandidateCardProps) {
  const positive = match.reasons.filter((r) => r.positive);
  const negative = match.reasons.filter((r) => !r.positive);

  return (
    <article
      className={`rounded-2xl border p-4 ${LEVEL_STYLE[match.level] ?? "border-border bg-card"} ${
        selected ? "ring-2 ring-accent" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium">
          {MATCH_LEVEL_LABELS[match.level] ?? match.level}
        </span>
        {primary && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
            Bester Treffer
          </span>
        )}
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {source?.hasDecisionTree ? "Kuratierte Bearbeitung" : "Generische Bearbeitung"}
        </span>
      </div>

      <h3 className="mt-2 text-sm font-semibold text-foreground">{match.title}</h3>
      {source?.shortDescription && (
        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{source.shortDescription}</p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Stand des Praxisfalls:{" "}
        {source?.updatedAt ? new Date(source.updatedAt).toLocaleDateString("de-DE") : "unbekannt"} ·
        Profilstatus: {match.profileStatus}
      </p>

      {positive.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-foreground">
          {positive.slice(0, 4).map((r) => (
            <li key={`${r.code}-${r.detail}`} className="flex gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden="true" />
              <span>
                <span className="font-medium">{r.label}:</span> {r.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {negative.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {negative.slice(0, 3).map((r) => (
            <li key={`${r.code}-${r.detail}`}>
              Unsicherheit – {r.label}: {r.detail}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3 rounded-xl border border-border bg-background/60 p-2">
        <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
          Technische Details anzeigen
        </summary>
        <dl className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>Punktwert</dt>
            <dd>{match.score} / 100</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Konfidenz</dt>
            <dd>{match.confidence} %</dd>
          </div>
          {match.dimensions.map((d) => (
            <div key={d.dimension} className="flex justify-between gap-2">
              <dt>
                {d.dimension} (Gewicht {d.weight})
              </dt>
              <dd>
                {d.points} Pkt. · {Math.round(d.ratio * 100)} %
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
            selected
              ? "border border-accent bg-accent/10 text-foreground"
              : "bg-accent text-accent-foreground"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
          {selected ? "Ausgewählt" : "Diesen Praxisfall verwenden"}
        </button>
        <Link
          to="/fall/$id"
          params={{ id: match.caseId }}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs hover:border-accent"
        >
          Praxisfall ansehen <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
