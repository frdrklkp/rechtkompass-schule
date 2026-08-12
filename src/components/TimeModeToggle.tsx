import { Zap, Clock, BookOpen } from "lucide-react";
import { useTimeMode, type TimeMode } from "@/lib/profile";

const OPTIONS: { id: TimeMode; label: string; icon: typeof Zap; short: string }[] = [
  { id: "quick", label: "30 Sek.", icon: Zap, short: "30s" },
  { id: "normal", label: "2 Min.", icon: Clock, short: "2m" },
  { id: "full", label: "Ausführlich", icon: BookOpen, short: "Voll" },
];

export function TimeModeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useTimeMode();
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            onClick={() => setMode(o.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label={o.label}
          >
            <Icon className="h-3 w-3" />
            <span className={compact ? "hidden sm:inline" : ""}>{compact ? o.short : o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
