import { AlertCircle, CheckCircle2, FileText, Flag, Scale, Users, Zap } from "lucide-react";

export type NavStep =
  | "situation"
  | "bewertung"
  | "sofort"
  | "doku"
  | "zustaendig"
  | "recht"
  | "abschluss";

const STEPS: { id: NavStep; label: string; icon: typeof Flag }[] = [
  { id: "situation", label: "Situation", icon: Flag },
  { id: "bewertung", label: "Bewertung", icon: AlertCircle },
  { id: "sofort", label: "Sofortmaßnahme", icon: Zap },
  { id: "doku", label: "Dokumentation", icon: FileText },
  { id: "zustaendig", label: "Zuständigkeiten", icon: Users },
  { id: "recht", label: "Rechtsgrundlagen", icon: Scale },
  { id: "abschluss", label: "Abschluss", icon: CheckCircle2 },
];

export function HandlungsNavigator({ current = "situation" as NavStep }: { current?: NavStep }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  const pct = ((currentIdx + 1) / STEPS.length) * 100;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between text-[11px] font-medium">
        <span className="text-muted-foreground">Handlungsnavigator</span>
        <span className="text-accent">
          Schritt {currentIdx + 1} / {STEPS.length}
        </span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <ol className="flex min-w-max items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <li key={s.id} className="flex items-center gap-1">
                <a
                  href={`#step-${s.id}`}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : done
                        ? "bg-accent/15 text-accent"
                        : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {s.label}
                </a>
                {i < STEPS.length - 1 && <span className="text-muted-foreground/40">›</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
