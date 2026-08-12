/** Sprint 4.6B – Erfassung bereits durchgeführter Maßnahmen. */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NewMeasure, SituationMeasure } from "@/services/situation-analyzer";

const TYPE_OPTIONS = [
  { value: "conversation", label: "Gespräch geführt" },
  { value: "separation", label: "Personen getrennt" },
  { value: "parentContact", label: "Eltern kontaktiert" },
  { value: "report", label: "Meldung erstellt" },
  { value: "documentation", label: "Vorgang dokumentiert" },
  { value: "escalation", label: "Weitergabe an andere Stelle" },
  { value: "other", label: "Sonstiges" },
];

export interface SituationMeasureEditorProps {
  measures: SituationMeasure[];
  onAdd: (input: NewMeasure) => void;
  onRemove: (id: string) => void;
}

export function SituationMeasureEditor({ measures, onAdd, onRemove }: SituationMeasureEditorProps) {
  const [type, setType] = useState("conversation");
  const [description, setDescription] = useState("");

  const add = () => {
    const trimmed = description.trim();
    if (!trimmed) return;
    onAdd({ type, description: trimmed });
    setDescription("");
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {measures.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{m.description}</p>
              <p className="text-xs text-muted-foreground">
                {TYPE_OPTIONS.find((t) => t.value === m.type)?.label ?? m.type}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Maßnahme ${m.description} entfernen`}
              onClick={() => onRemove(m.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
        {measures.length === 0 && (
          <li className="text-xs text-muted-foreground">Noch keine Maßnahmen erfasst.</li>
        )}
      </ul>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Art der Maßnahme" className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div>
          <Label htmlFor="measure-description" className="sr-only">
            Beschreibung der Maßnahme
          </Label>
          <Input
            id="measure-description"
            value={description}
            placeholder="Was wurde unternommen?"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button type="button" onClick={add} disabled={!description.trim()} className="gap-2">
          <Plus className="h-4 w-4" /> Hinzufügen
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Es erfolgt keine Bewertung, ob eine Maßnahme richtig oder ausreichend war.
      </p>
    </div>
  );
}
