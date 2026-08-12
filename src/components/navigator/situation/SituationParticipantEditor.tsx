/** Sprint 4.6B – Erfassung beteiligter Personen. */
import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NewParticipant, SituationParticipant } from "@/services/situation-analyzer";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "student", label: "Schülerin oder Schüler" },
  { value: "teacher", label: "Lehrkraft" },
  { value: "schoolLeadership", label: "Schulleitung" },
  { value: "parent", label: "Elternteil" },
  { value: "guardian", label: "Erziehungsberechtigte Person" },
  { value: "schoolStaff", label: "Weiteres Schulpersonal" },
  { value: "externalPerson", label: "Externe Person" },
  { value: "unknown", label: "Unbekannt" },
];

const FLAGS: { key: keyof SituationParticipant; label: string }[] = [
  { key: "isAffected", label: "betroffen" },
  { key: "isAccused", label: "beschuldigt" },
  { key: "isWitness", label: "hat beobachtet" },
  { key: "isResponsiblePerson", label: "verantwortlich" },
];

export interface SituationParticipantEditorProps {
  participants: SituationParticipant[];
  onAdd: (input: NewParticipant) => void;
  onUpdate: (id: string, patch: Partial<Omit<SituationParticipant, "id">>) => void;
  onRemove: (id: string) => void;
}

export function SituationParticipantEditor({
  participants,
  onAdd,
  onUpdate,
  onRemove,
}: SituationParticipantEditorProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({ displayName: trimmed, role });
    setName("");
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {participants.map((p) => (
          <li key={p.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{p.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_OPTIONS.find((r) => r.value === p.role)?.label ?? p.role}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Beteiligte Person ${p.displayName} entfernen`}
                onClick={() => onRemove(p.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {FLAGS.map((flag) => {
                const id = `${p.id}-${String(flag.key)}`;
                return (
                  <div key={id} className="flex items-center gap-1.5">
                    <Checkbox
                      id={id}
                      checked={Boolean(p[flag.key])}
                      onCheckedChange={(next) => onUpdate(p.id, { [flag.key]: next === true })}
                    />
                    <Label htmlFor={id} className="text-xs font-normal">
                      {flag.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
        {participants.length === 0 && (
          <li className="text-xs text-muted-foreground">Noch keine Personen erfasst.</li>
        )}
      </ul>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <Label htmlFor="participant-name" className="sr-only">
            Bezeichnung der beteiligten Person
          </Label>
          <Input
            id="participant-name"
            value={name}
            placeholder="Bezeichnung, z. B. „Schüler A“"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger aria-label="Rolle der beteiligten Person" className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" onClick={add} disabled={!name.trim()} className="gap-2">
          <UserPlus className="h-4 w-4" /> Hinzufügen
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Verwenden Sie sparsame Bezeichnungen. Erfassen Sie keine unnötigen personenbezogenen Daten.
      </p>
    </div>
  );
}
