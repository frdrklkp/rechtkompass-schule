// Event-Timeline auf Basis von case_events.

import {
  Archive,
  CheckCircle2,
  FileText,
  Gauge,
  RotateCcw,
  Send,
  Upload,
  XCircle,
  Zap,
  MessageSquareWarning,
} from "lucide-react";
import type { CaseEventRow } from "@/services/editorial";

const EVENT_META: Record<
  string,
  { label: string; icon: typeof FileText; tone: string }
> = {
  "case.submitted_for_review": { label: "Zur Prüfung eingereicht", icon: Send, tone: "text-amber-600" },
  "review.created": { label: "Review erstellt", icon: FileText, tone: "text-blue-600" },
  "review.decided": { label: "Reviewentscheidung", icon: CheckCircle2, tone: "text-emerald-600" },
  "case.approved": { label: "Genehmigt", icon: CheckCircle2, tone: "text-emerald-600" },
  "case.changes_requested": { label: "Änderungen angefordert", icon: MessageSquareWarning, tone: "text-orange-600" },
  "case.rejected": { label: "Abgelehnt", icon: XCircle, tone: "text-rose-600" },
  "case.published": { label: "Veröffentlicht", icon: Upload, tone: "text-emerald-600" },
  "case.archived": { label: "Archiviert", icon: Archive, tone: "text-zinc-600" },
  "case.reactivated": { label: "Reaktiviert", icon: RotateCcw, tone: "text-blue-600" },
  "quality.recomputed": { label: "Qualität neu berechnet", icon: Gauge, tone: "text-purple-600" },
};

function formatPayload(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  // Nur sicherheitsunkritische Felder anzeigen
  const safeKeys = ["decision", "publication_tier", "version_no", "reason"];
  const entries = safeKeys
    .filter((k) => k in payload)
    .map((k) => [k, payload[k]] as const);
  if (!entries.length) return null;
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="inline font-medium">{k}:</dt>{" "}
          <dd className="inline">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EventTimeline({ events }: { events: CaseEventRow[] }) {
  if (!events.length) {
    return (
      <p className="text-sm text-muted-foreground">Noch keine Ereignisse.</p>
    );
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const meta = EVENT_META[e.event_type] ?? {
          label: e.event_type,
          icon: Zap,
          tone: "text-muted-foreground",
        };
        const Icon = meta.icon;
        return (
          <li key={e.id} className="flex gap-3">
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card ${meta.tone}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium">{meta.label}</span>
                <time className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("de-DE")}
                </time>
              </div>
              <div className="text-xs text-muted-foreground">
                {e.actor_role ? <span>{e.actor_role}</span> : null}
                {e.actor_id ? (
                  <span className="ml-2 font-mono">{e.actor_id.slice(0, 8)}</span>
                ) : null}
                {e.version_id ? (
                  <span className="ml-2">v-{e.version_id.slice(0, 6)}</span>
                ) : null}
              </div>
              {formatPayload(e.payload)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
