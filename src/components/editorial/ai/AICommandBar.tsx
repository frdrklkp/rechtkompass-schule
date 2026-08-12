// AI Command Bar – kurze Textzeile mit vordefinierten Schnellbefehlen.
// Verhindert freie Prompts (Copilot ist Werkzeugkasten, kein Chat).

import { useMemo, useState } from "react";
import { Command } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AITaskType } from "@/services/editorial/ai";

export interface CopilotCommand {
  id: string;
  label: string;
  hint?: string;
  task?: AITaskType;
  action: string; // logischer Aktionsname, wird an onRun übergeben
}

interface Props {
  commands: CopilotCommand[];
  disabled?: boolean;
  onRun: (cmd: CopilotCommand) => void;
}

export function AICommandBar({ commands, disabled, onRun }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 6);
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q),
    );
  }, [query, commands]);

  return (
    <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent p-3">
      <div className="mb-2 flex items-center gap-2">
        <Command className="h-3.5 w-3.5 text-violet-600" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          KI-Schnellbefehle
        </span>
      </div>
      <Input
        placeholder="Befehl suchen … z. B. „FAQ erstellen“, „Titel verbessern“"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8 text-xs"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {filtered.map((c) => (
          <Button
            key={c.id}
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            disabled={disabled}
            onClick={() => onRun(c)}
          >
            {c.label}
          </Button>
        ))}
        {filtered.length === 0 && (
          <span className="text-[11px] text-muted-foreground">
            Kein Befehl gefunden.
          </span>
        )}
      </div>
    </div>
  );
}
