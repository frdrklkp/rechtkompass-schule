/**
 * Sprint 4.6E – Redaktioneller Chip-Editor für Listenmerkmale.
 * Rein darstellend: keine Matching-Logik, keine Ableitung.
 */
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TokenListEditorProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  /** Automatisch abgeleitete Werte als Vorschläge. */
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
}

export function TokenListEditor({
  label,
  values,
  onChange,
  suggestions = [],
  placeholder,
  disabled,
}: TokenListEditorProps) {
  const [draft, setDraft] = useState("");
  const add = (value: string) => {
    const v = value.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
  };
  const open = suggestions.filter((s) => !values.includes(s));

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{values.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Keine Angabe</span>
        )}
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px]"
          >
            {v}
            {!disabled && (
              <button
                type="button"
                aria-label={`${v} entfernen`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder={placeholder ?? "Eintrag hinzufügen"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
                setDraft("");
              }
            }}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              add(draft);
              setDraft("");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {!disabled && open.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-muted-foreground">Vorschläge:</span>
          {open.slice(0, 12).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className={cn(
                "rounded-full border border-dashed border-border px-2 py-0.5 text-[11px]",
                "text-muted-foreground hover:bg-muted",
              )}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface SignalPickerProps {
  label: string;
  options: readonly string[];
  optionLabels: Record<string, string>;
  values: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
}

export function SignalPicker({
  label,
  options,
  optionLabels,
  values,
  onChange,
  suggestions = [],
}: SignalPickerProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{values.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((signal) => {
          const active = values.includes(signal);
          const derived = suggestions.includes(signal);
          return (
            <button
              key={signal}
              type="button"
              onClick={() =>
                onChange(active ? values.filter((v) => v !== signal) : [...values, signal])
              }
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : derived
                    ? "border-dashed border-primary/40 text-muted-foreground hover:bg-muted"
                    : "border-border text-muted-foreground hover:bg-muted",
              )}
              title={derived ? "Aus den Falldaten abgeleitet" : undefined}
            >
              {optionLabels[signal] ?? signal}
            </button>
          );
        })}
      </div>
    </div>
  );
}
