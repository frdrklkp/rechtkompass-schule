// Publish-Dialog mit Quality-Ergebnissen (Score, Grade, Readiness, Blocker,
// Warnungen). Verhalten:
// - BLOCKED  → Button deaktiviert, Blocker verständlich auflisten.
// - READY_WITH_WARNINGS → bewusste Bestätigungs-Checkbox verlangen.
// - READY → normale Bestätigung.
// Ruft weiterhin `EditorialWorkflowService.publish` via bestehendem Hook.

import { useState } from "react";
import { AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublish } from "@/hooks/editorial/useWorkflowActions";
import { useCaseQuality } from "@/hooks/editorial/useQuality";
import type { PublicationTier } from "@/services/editorial";
import { QualitySummaryCard } from "./QualitySummaryCard";

export function PublishReadinessDialog({
  caseId,
  open,
  onOpenChange,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tier, setTier] = useState<PublicationTier>("public");
  const [confirmed, setConfirmed] = useState(false);
  const publish = usePublish();
  const q = useCaseQuality(open ? caseId : undefined);

  const a = q.data?.assessment ?? null;
  const readiness = a?.readinessStatus ?? "not_assessable";
  const isBlocked = readiness === "blocked" || readiness === "not_assessable";
  const isWarn = readiness === "ready_with_warnings";
  const canPublish = !isBlocked && (!isWarn || confirmed);

  async function handle() {
    if (!canPublish) return;
    await publish
      .mutateAsync({ caseId, publicationTier: tier })
      .then(() => {
        setConfirmed(false);
        onOpenChange(false);
      })
      .catch(() => {
        /* Fehler-Toast im Hook */
      });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fall veröffentlichen</DialogTitle>
          <DialogDescription>
            Vor der Veröffentlichung wird die deterministische
            Qualitätsprüfung angezeigt. Die tatsächliche Freigabe erfolgt
            weiterhin serverseitig.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : a ? (
          <div className="space-y-4">
            <QualitySummaryCard assessment={a} compact />

            {a.blockers.length > 0 && (
              <BlockList
                title="Diese Punkte verhindern eine Veröffentlichung"
                icon={Ban}
                tone="rose"
                items={a.blockers.map((b) => ({
                  title: b.title,
                  hint: b.remediation,
                  href: b.relatedRoute,
                }))}
              />
            )}
            {a.warnings.length > 0 && (
              <BlockList
                title="Redaktionelle Hinweise (Warnungen)"
                icon={AlertTriangle}
                tone="amber"
                items={a.warnings.map((b) => ({
                  title: b.title,
                  hint: b.remediation,
                  href: b.relatedRoute,
                }))}
              />
            )}
            {readiness === "ready" && (
              <p className="flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Keine offenen Punkte – Fall ist zur Veröffentlichung bereit.
              </p>
            )}

            <div className="space-y-1.5">
              <Label>Sichtbarkeit</Label>
              <Select
                value={tier}
                onValueChange={(v) => setTier(v as PublicationTier)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Intern</SelectItem>
                  <SelectItem value="beta">Beta</SelectItem>
                  <SelectItem value="public">Öffentlich</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isWarn && (
              <label className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(!!v)}
                  aria-label="Warnungen zur Kenntnis genommen"
                />
                <span>
                  Ich habe die redaktionellen Warnungen zur Kenntnis genommen
                  und möchte trotzdem veröffentlichen.
                </span>
              </label>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Qualitätsprüfung nicht möglich.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handle}
            disabled={!canPublish || publish.isPending}
            aria-disabled={!canPublish || publish.isPending}
          >
            {publish.isPending ? "Veröffentliche…" : "Veröffentlichen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlockList({
  title,
  icon: Icon,
  tone,
  items,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "rose" | "amber";
  items: Array<{ title: string; hint: string; href?: string | null }>;
}) {
  const border =
    tone === "rose" ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/30 bg-amber-500/5";
  const iconCls = tone === "rose" ? "text-rose-600" : "text-amber-600";
  return (
    <div className={`rounded-md border ${border} p-3`}>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Icon className={`h-4 w-4 ${iconCls}`} aria-hidden="true" />
        {title}
      </div>
      <ul className="space-y-1.5 text-xs">
        {items.map((it, idx) => (
          <li key={idx} className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-foreground">{it.title}</div>
              <div className="text-muted-foreground">{it.hint}</div>
            </div>
            {it.href && (
              <a
                href={it.href}
                className="shrink-0 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] hover:bg-muted"
              >
                Bearbeiten
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
