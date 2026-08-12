// Quality-getriebene Assistenz. Zeigt für jede Blocker/Warnung eine konkrete
// KI-Aktion (kein generischer Button). Aktionen werden serialisiert
// ausgelöst; Ergebnisse landen als Suggestions in der Session-Historie.

import { useState } from "react";
import { ListChecks, HelpCircle, Lightbulb, FileText, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AIEditorialService,
  isAIError,
  useAISession,
  type AITaskType,
} from "@/services/editorial/ai";
import type { EditorialCaseRow } from "@/services/editorial/types";
import type { CaseQualityAssessment } from "@/services/editorial/quality/types";

interface Props {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality: CaseQualityAssessment | null;
  canEdit: boolean;
}

// Regel-ID -> KI-Task Mapping. Nicht jede Regel bekommt eine Aktion; nur
// die, für die eine sinnvolle KI-Unterstützung existiert.
const RULE_TASK: Record<string, { task: AITaskType; label: string; Icon: typeof Sparkles }> = {
  faq_missing: { task: "generate.faq", label: "FAQ erzeugen", Icon: HelpCircle },
  checklist_missing: { task: "generate.checklist", label: "Checkliste erzeugen", Icon: ListChecks },
  documentation_missing: {
    task: "generate.documentation",
    label: "Dokumentationsschritte erzeugen",
    Icon: FileText,
  },
  practice_tip_missing: {
    task: "generate.practiceTips",
    label: "Praxistipp erzeugen",
    Icon: Lightbulb,
  },
  recommendation_too_short: {
    task: "improve.recommendation",
    label: "Empfehlung erweitern",
    Icon: Sparkles,
  },
  legal_explanation_missing: {
    task: "improve.legalExplanation",
    label: "Rechtliche Einordnung ergänzen",
    Icon: ShieldCheck,
  },
  legal_explanation_too_short: {
    task: "improve.legalExplanation",
    label: "Rechtliche Einordnung erweitern",
    Icon: ShieldCheck,
  },
  short_description_too_short: {
    task: "improve.shortDescription",
    label: "Kurzbeschreibung erweitern",
    Icon: FileText,
  },
  title_too_short: { task: "improve.title", label: "Titel schärfen", Icon: Sparkles },
};

interface RuleLike {
  ruleId: string;
  title: string;
  severity?: "blocker" | "warning";
  relatedField?: string | null;
}

export function QualityAssistantList({ caseRow, quality, canEdit }: Props) {
  const session = useAISession();
  const [runningId, setRunningId] = useState<string | null>(null);

  if (!quality) {
    return (
      <p className="text-xs text-muted-foreground">
        Qualitätsbewertung nicht verfügbar.
      </p>
    );
  }

  const rules: RuleLike[] = [
    ...quality.blockers.map((r) => ({ ...r, severity: "blocker" as const })),
    ...quality.warnings.map((r) => ({ ...r, severity: "warning" as const })),
  ];

  if (rules.length === 0) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300">
        Keine offenen Qualitätspunkte – der Fall ist redaktionell rund.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {rules.map((r) => {
        const map = RULE_TASK[r.ruleId];
        const key = r.ruleId + (r.relatedField ?? "");
        return (
          <li
            key={key}
            className={`flex items-start justify-between gap-2 rounded-md border px-2.5 py-2 text-xs ${
              r.severity === "blocker"
                ? "border-red-500/30 bg-red-500/5"
                : "border-amber-500/30 bg-amber-500/5"
            }`}
          >
            <div className="min-w-0">
              <div className="font-medium">{r.title}</div>
              {r.relatedField && (
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Feld: {r.relatedField}
                </div>
              )}
            </div>
            {map ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 gap-1 text-[11px]"
                disabled={!canEdit || runningId !== null}
                onClick={async () => {
                  setRunningId(key);
                  try {
                    const s = await AIEditorialService.suggest({
                      task: map.task,
                      caseRow,
                      quality,
                      hint: `Reagiere auf die Qualitätsregel „${r.title}“.`,
                    });
                    session.add(s);
                    toast.success("Vorschlag erstellt.");
                  } catch (err) {
                    toast.error(
                      isAIError(err)
                        ? err.userMessage
                        : err instanceof Error
                          ? err.message
                          : "KI-Aufruf fehlgeschlagen.",
                    );
                  } finally {
                    setRunningId(null);
                  }
                }}
              >
                <map.Icon className="h-3 w-3" />
                {map.label}
                {runningId === key && (
                  <span className="text-[10px] text-muted-foreground">…</span>
                )}
              </Button>
            ) : (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                (manuell)
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
