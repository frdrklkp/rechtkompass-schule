/** Sprint 4.6C – Zusammengesetzte Ergebnisansicht der Bewertung. */
import { useEffect, useRef } from "react";
import { AssessmentConfidencePanel } from "./AssessmentConfidence";
import { AssessmentConflictList } from "./AssessmentConflictList";
import { AssessmentLimitations } from "./AssessmentLimitations";
import { AssessmentMissingInformationList } from "./AssessmentMissingInformation";
import { AssessmentReasonList } from "./AssessmentReasonList";
import { AssessmentStatusBadge } from "./AssessmentStatusBadge";
import { AssessmentSummary } from "./AssessmentSummary";
import { AssessmentTrafficLight } from "./AssessmentTrafficLight";
import type { AssessmentResult } from "@/services/assessment-engine";

export interface AssessmentOverviewProps {
  result: AssessmentResult;
  /** Fokus nach einer bewussten Neuberechnung auf die Ergebnisüberschrift setzen. */
  focusOnMount?: boolean;
}

export function AssessmentOverview({ result, focusOnMount }: AssessmentOverviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount, result.assessmentId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold text-foreground">
          Ergebnis der Bewertung
        </h3>
        <AssessmentStatusBadge status={result.status} />
      </div>
      <AssessmentTrafficLight trafficLight={result.trafficLight} />
      <AssessmentSummary result={result} />
      <AssessmentConflictList conflicts={result.conflicts} />
      <AssessmentReasonList reasons={result.reasons} />
      <AssessmentConfidencePanel confidence={result.confidence} />
      <AssessmentMissingInformationList items={result.missingInformation} />
      <AssessmentLimitations limitations={result.limitations} />
    </div>
  );
}
