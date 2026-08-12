import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag, ShieldAlert, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createFeedbackReport,
  REPORT_TYPE_LABELS,
  URGENCY_LABELS,
  type FeedbackReportType,
  type FeedbackUrgency,
} from "@/lib/feedbackReportsRepo";

type Props = {
  caseId?: string | null;
  caseTitle?: string | null;
  reportedArea?: string;
  triggerClassName?: string;
  variant?: "button" | "compact";
};

const REPORT_TYPES: FeedbackReportType[] = [
  "content_unclear",
  "recommendation_mismatch",
  "dos_donts_missing",
  "legal_mismatch",
  "legal_missing",
  "knowledge_mismatch",
  "template_mismatch",
  "decision_tree_unclear",
  "case_missing",
  "technical_bug",
  "other",
];

export function FeedbackReportDialog({
  caseId,
  caseTitle,
  reportedArea,
  triggerClassName,
  variant = "button",
}: Props) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<FeedbackReportType>("content_unclear");
  const [message, setMessage] = useState("");
  const [urgency, setUrgency] = useState<FeedbackUrgency>("medium");
  const qc = useQueryClient();

  const reset = () => {
    setReportType("content_unclear");
    setMessage("");
    setUrgency("medium");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const route = typeof window !== "undefined" ? window.location.pathname : null;
      return createFeedbackReport({
        case_id: caseId ?? null,
        case_title: caseTitle ?? null,
        report_type: reportType,
        message,
        urgency,
        route,
        reported_area: reportedArea ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Danke für Ihren Hinweis. Die Meldung wurde an die Redaktion übermittelt.");
      qc.invalidateQueries({ queryKey: ["admin", "feedback-reports"] });
      reset();
      setOpen(false);
    },
    onError: (e: Error) => {
      toast.error(e.message || "Meldung konnte nicht gespeichert werden.");
    },
  });

  const canSubmit = message.trim().length >= 5 && !mutation.isPending;

  return (
    <>
      {variant === "compact" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            triggerClassName ??
            "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-accent"
          }
        >
          <Flag className="h-3.5 w-3.5" />
          Problem melden
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            triggerClassName ??
            "inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground/85 transition-colors hover:border-accent hover:bg-accent/5 hover:text-accent"
          }
        >
          <Flag className="h-4 w-4 text-accent" />
          Problem melden
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Problem oder Verbesserung melden</DialogTitle>
            <DialogDescription>
              Ist Ihnen bei diesem Praxisfall etwas aufgefallen? Helfen Sie uns, RechtKompass Schule weiter zu verbessern.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs font-medium">Meldetyp</Label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as FeedbackReportType)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {REPORT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-medium">Was stimmt aus Ihrer Sicht nicht oder was fehlt?</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Beschreiben Sie kurz, was Ihnen aufgefallen ist …"
                rows={5}
                maxLength={2000}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {message.trim().length < 5 ? "Bitte mind. 5 Zeichen." : `${message.length} Zeichen`}
              </p>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-medium">Dringlichkeit</Label>
              <div className="flex gap-2">
                {(["low", "medium", "high"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUrgency(u)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      urgency === u ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground/80 hover:bg-muted"
                    }`}
                  >
                    {URGENCY_LABELS[u]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Bitte geben Sie keine vollständigen Namen von Schülerinnen und Schülern oder andere sensible personenbezogene Daten ein.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Abbrechen
            </Button>
            <Button type="button" onClick={() => mutation.mutate()} disabled={!canSubmit}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Meldung absenden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
