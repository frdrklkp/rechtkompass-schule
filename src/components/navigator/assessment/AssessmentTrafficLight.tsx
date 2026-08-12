/**
 * Sprint 4.6C – Darstellung der Ampel. Farbe ist nie der alleinige Informationsträger:
 * Symbol, Text und Bedeutung werden immer ausgegeben.
 */
import {
  TRAFFIC_LIGHT_LABEL,
  TRAFFIC_LIGHT_MEANING,
  TRAFFIC_LIGHT_SYMBOL,
  type TrafficLight,
} from "@/services/assessment-engine";

const TONE: Record<TrafficLight, string> = {
  red: "border-destructive/50 bg-destructive/10 text-foreground",
  yellow: "border-accent/50 bg-accent/10 text-foreground",
  green: "border-primary/40 bg-primary/10 text-foreground",
  unknown: "border-border bg-muted/40 text-foreground",
};

export interface AssessmentTrafficLightProps {
  trafficLight: TrafficLight;
}

export function AssessmentTrafficLight({ trafficLight }: AssessmentTrafficLightProps) {
  const label = TRAFFIC_LIGHT_LABEL[trafficLight];
  const meaning = TRAFFIC_LIGHT_MEANING[trafficLight];
  const symbol = TRAFFIC_LIGHT_SYMBOL[trafficLight];

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-4 ${TONE[trafficLight]}`}
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current text-lg font-bold"
      >
        {symbol}
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-sm text-foreground/85">{meaning}</p>
      </div>
    </div>
  );
}
