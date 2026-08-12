/** Sprint 4.6B – Erfassung von Zeugen. */
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
import type { NewWitness, SituationParticipant, SituationWitness } from "@/services/situation-analyzer";

const NONE = "__none__";

export interface SituationWitnessEditorProps {
  witnesses: SituationWitness[];
  participants: SituationParticipant[];
  onAdd: (input: NewWitness) => void;
  onRemove: (id: string) => void;
}

export function SituationWitnessEditor({
  witnesses,
  participants,
  onAdd,
  onRemove,
}: SituationWitnessEditorProps) {
  const [name, setName] = useState("");
  const [participantId, setParticipantId] = useState(NONE);

  const add = () => {
    const linked = participants.find((p) => p.id === participantId);
    const displayName = linked ? linked.displayName : name.trim();
    if (!displayName) return;
    onAdd({
      displayName,
      participantId: linked ? linked.id : null,
      role: linked ? linked.role : "unknown",
    });
    setName("");
    setParticipantId(NONE);
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {witnesses.map((w) => (
          <li key={w.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{w.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {w.participantId ? "mit Beteiligtem verknüpft" : "eigenständig erfasst"}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Zeuge ${w.displayName} entfernen`}
              onClick={() => onRemove(w.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
        {witnesses.length === 0 && (
          <li className="text-xs text-muted-foreground">Noch keine Zeugen erfasst.</li>
        )}
      </ul>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select value={participantId} onValueChange={setParticipantId}>
          <SelectTrigger aria-label="Bereits erfasste beteiligte Person auswählen">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Neue Person erfassen</SelectItem>
            {participants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div>
          <Label htmlFor="witness-name" className="sr-only">
            Bezeichnung des Zeugen
          </Label>
          <Input
            id="witness-name"
            value={name}
            disabled={participantId !== NONE}
            placeholder="Bezeichnung, z. B. „Schülerin B“"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button
          type="button"
          onClick={add}
          disabled={participantId === NONE && !name.trim()}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Hinzufügen
        </Button>
      </div>
    </div>
  );
}
