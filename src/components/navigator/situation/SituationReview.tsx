/** Sprint 4.6B – Strukturierte Zusammenfassung der erfassten Situation. */
import type { SituationCase } from "@/services/situation-analyzer";

export interface SituationReviewProps {
  situationCase: SituationCase;
}

const KNOWLEDGE_TEXT: Record<string, string> = {
  known: "ja",
  unknown: "unbekannt",
  notApplicable: "nein bzw. nicht zutreffend",
  notAnswered: "noch offen",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[13rem_1fr]">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

export function SituationReview({ situationCase }: SituationReviewProps) {
  const c = situationCase;
  const list = (values: string[]) => (values.length ? values.join(", ") : "—");

  return (
    <section aria-labelledby="situation-review" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h3 id="situation-review" className="text-base font-semibold text-foreground">
        Zusammenfassung der Angaben
      </h3>
      <dl className="space-y-2">
        <Row label="Kurzbeschreibung" value={c.title ? `${c.title} – ${c.rawDescription}` : c.rawDescription} />
        <Row
          label="Zeitpunkt"
          value={`${c.incident.occurredAt ?? KNOWLEDGE_TEXT[c.incident.dateKnown]}`}
        />
        <Row label="Ort" value={`${c.incident.locationType}${c.incident.location ? ` – ${c.incident.location}` : ""}`} />
        <Row label="Andauernd" value={KNOWLEDGE_TEXT[c.incident.isOngoing]} />
        <Row label="Wiederholt" value={KNOWLEDGE_TEXT[c.incident.wasRepeated]} />
        <Row
          label="Beteiligte"
          value={list(c.participants.map((p) => `${p.displayName} (${p.role})`))}
        />
        <Row label="Zeugen" value={list(c.witnesses.map((w) => w.displayName))} />
        <Row label="Nachweise" value={list(c.evidence.map((e) => `${e.type}: ${e.description}`))} />
        <Row
          label="Gefahr laut Angabe"
          value={`${KNOWLEDGE_TEXT[c.dangerInformation.acuteDangerReported]}${
            c.dangerInformation.dangerType ? ` – ${c.dangerInformation.dangerType}` : ""
          }`}
        />
        <Row
          label="Durchgeführte Maßnahmen"
          value={list(c.measuresTaken.map((m) => m.description))}
        />
        <Row label="Informierte Stellen" value={list(c.responsiblePersonsInformed)} />
        <Row
          label="Offene bzw. unbekannte Angaben"
          value={list(c.uncertainties.map((u) => `${u.title} (${KNOWLEDGE_TEXT[u.reason] ?? u.reason})`))}
        />
      </dl>
      <p className="text-xs text-muted-foreground">
        Diese Übersicht enthält ausschließlich Ihre Angaben. Es erfolgt keine Bewertung.
      </p>
    </section>
  );
}
