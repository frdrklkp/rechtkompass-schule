/**
 * TrustIndicator – Vertrauensindikator (Sprint 4.2 – Abschluss).
 *
 * Fünf Dimensionen, jeweils Ampel (grün/gelb/rot):
 *   1. Quellenqualität   – Retrieval-Confidence der genutzten Rechtsgrundlagen.
 *   2. Aktualität        – Alter / Version der Quelle (best effort aus Metadata).
 *   3. Confidence        – Zusammenfassung aus ConfidenceCalculator.
 *   4. Anzahl Quellen    – Wie viele Rechtsgrundlagen wurden herangezogen.
 *   5. Reviewstatus      – Redaktioneller Prüfstatus der Quellen.
 *
 * Keine technischen Begriffe für die Lehrkraft-Sicht – Beschriftungen sind
 * bewusst laienverständlich.
 */
import type { CopilotAnswer, CopilotConfidence, GroundedChunk } from "./types";

export type TrustLevel = "green" | "yellow" | "red";

export interface TrustSignal {
  key: "quality" | "recency" | "confidence" | "coverage" | "review";
  label: string;
  level: TrustLevel;
  value: string;
  hint: string;
}

export interface TrustIndicator {
  level: TrustLevel;
  summary: string;
  signals: TrustSignal[];
}

function levelFromScore(score: number, green = 0.75, yellow = 0.5): TrustLevel {
  if (score >= green) return "green";
  if (score >= yellow) return "yellow";
  return "red";
}

function worst(levels: TrustLevel[]): TrustLevel {
  if (levels.includes("red")) return "red";
  if (levels.includes("yellow")) return "yellow";
  return "green";
}

function readNumber(meta: Record<string, unknown> | undefined, key: string): number | null {
  const v = meta?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
function readString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}

function parseYear(meta: Record<string, unknown>): number | null {
  const candidates = [
    readString(meta, "effectiveDate"),
    readString(meta, "updatedAt"),
    readString(meta, "version"),
    readString(meta, "publishedAt"),
    readString(meta, "issuedAt"),
    readString(meta, "date"),
  ].filter(Boolean) as string[];
  for (const s of candidates) {
    const m = /(19|20)\d{2}/.exec(s);
    if (m) return Number(m[0]);
  }
  const y = readNumber(meta, "year");
  if (y && y > 1900) return y;
  return null;
}

function estimateRecency(grounded: GroundedChunk[]): { level: TrustLevel; label: string } {
  const now = new Date().getUTCFullYear();
  const years: number[] = [];
  for (const g of grounded) {
    const y = parseYear(g.hit.metadata ?? {});
    if (y) years.push(y);
  }
  if (years.length === 0) return { level: "yellow", label: "Datum unklar" };
  const newest = Math.max(...years);
  const age = now - newest;
  if (age <= 3) return { level: "green", label: `Aktuell (${newest})` };
  if (age <= 8) return { level: "yellow", label: `Etwas älter (${newest})` };
  return { level: "red", label: `Älter als 8 Jahre (${newest})` };
}

function readReviewStatuses(grounded: GroundedChunk[]): string[] {
  const out: string[] = [];
  for (const g of grounded) {
    const meta = g.hit.metadata ?? {};
    const s =
      readString(meta, "reviewStatus") ??
      readString(meta, "publicationTier") ??
      readString(meta, "lifecycle");
    if (s) out.push(s.toLowerCase());
  }
  return out;
}

function reviewLevel(statuses: string[]): { level: TrustLevel; label: string } {
  if (statuses.length === 0) return { level: "yellow", label: "Prüfstatus unklar" };
  const positive = statuses.filter((s) =>
    ["approved", "published", "reviewed", "final", "gold", "silver"].some((k) => s.includes(k)),
  ).length;
  const negative = statuses.filter((s) =>
    ["draft", "unreviewed", "unbekannt", "pending"].some((k) => s.includes(k)),
  ).length;
  const share = positive / statuses.length;
  if (share >= 0.75 && negative === 0) return { level: "green", label: "Redaktionell geprüft" };
  if (share >= 0.5) return { level: "yellow", label: "Teilweise geprüft" };
  return { level: "red", label: "Ungeprüfte Quellen" };
}

export const TrustIndicatorBuilder = {
  build(params: {
    answer: CopilotAnswer;
    grounded: GroundedChunk[];
    confidence: CopilotConfidence;
  }): TrustIndicator {
    const { answer, grounded, confidence } = params;

    // 1. Quellenqualität = Ø Retrieval-Confidence
    const qualityScore = grounded.length === 0 ? 0
      : grounded.reduce((a, g) => a + (g.hit.confidence ?? 0), 0) / grounded.length;
    const quality: TrustSignal = {
      key: "quality",
      label: "Quellenqualität",
      level: levelFromScore(qualityScore, 0.7, 0.45),
      value:
        qualityScore >= 0.7 ? "Hoch" :
        qualityScore >= 0.45 ? "Mittel" : "Niedrig",
      hint: "Wie eindeutig passen die gefundenen Rechtsgrundlagen zur geschilderten Situation.",
    };

    // 2. Aktualität
    const recency = estimateRecency(grounded);
    const recencySignal: TrustSignal = {
      key: "recency",
      label: "Aktualität",
      level: recency.level,
      value: recency.label,
      hint: "Wie aktuell die verwendeten Rechtsgrundlagen sind.",
    };

    // 3. Confidence
    const confLevel: TrustLevel =
      confidence.level === "high" ? "green" :
      confidence.level === "medium" ? "yellow" : "red";
    const confSignal: TrustSignal = {
      key: "confidence",
      label: "Verlässlichkeit der Antwort",
      level: confLevel,
      value:
        confLevel === "green" ? "Verlässlich" :
        confLevel === "yellow" ? "Mit Vorbehalt" : "Nur als Orientierung",
      hint: "Gesamteinschätzung aus Passung der Quellen, Belegbarkeit und redaktionellem Prüfstatus.",
    };

    // 4. Anzahl Quellen
    const n = answer.citations.length;
    const coverageLevel: TrustLevel = n >= 3 ? "green" : n >= 2 ? "yellow" : n >= 1 ? "yellow" : "red";
    const coverageSignal: TrustSignal = {
      key: "coverage",
      label: "Anzahl Rechtsgrundlagen",
      level: coverageLevel,
      value: `${n} ${n === 1 ? "Quelle" : "Quellen"}`,
      hint: "Auf wie viele geprüfte Fundstellen sich diese Antwort stützt.",
    };

    // 5. Reviewstatus
    const rev = reviewLevel(readReviewStatuses(grounded));
    const reviewSignal: TrustSignal = {
      key: "review",
      label: "Prüfstatus",
      level: rev.level,
      value: rev.label,
      hint: "Ob die zugrundeliegenden Quellen redaktionell freigegeben wurden.",
    };

    const signals: TrustSignal[] = [quality, recencySignal, confSignal, coverageSignal, reviewSignal];
    const overall = worst(signals.map((s) => s.level));
    const summary =
      overall === "green"
        ? "Antwort ist gut belegt und aktuell."
        : overall === "yellow"
          ? "Antwort ist brauchbar, einzelne Signale bitte beachten."
          : "Bitte diese Antwort nur als Orientierung nutzen und mit weiteren Quellen abgleichen.";

    return { level: overall, summary, signals };
  },
};
