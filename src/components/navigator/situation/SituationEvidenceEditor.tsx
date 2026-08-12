/** Sprint 4.6B – Erfassung vorhandener Nachweise (nur Metadaten). */
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
import type { NewEvidence, SituationEvidence } from "@/services/situation-analyzer";

const TYPE_OPTIONS = [
  { value: "document", label: "Dokument" },
  { value: "photo", label: "Foto" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Tonaufnahme" },
  { value: "message", label: "Nachricht" },
  { value: "email", label: "E-Mail" },
  { value: "witnessStatement", label: "Zeugenaussage" },
  { value: "systemLog", label: "Systemprotokoll" },
  { value: "other", label: "Sonstiges" },
];

export interface SituationEvidenceEditorProps {
  evidence: SituationEvidence[];
  onAdd: (input: NewEvidence) => void;
  onRemove: (id: string) => void;
}

export function SituationEvidenceEditor({ evidence, onAdd, onRemove }: SituationEvidenceEditorProps) {
  const [type, setType] = useState("document");
  const [description, setDescription] = useState("");

  const add = () => {
    const trimmed = description.trim();
    if (!trimmed) return;
    onAdd({ type, description: trimmed, available: true });
    setDescription("");
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {evidence.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{e.description}</p>
              <p className="text-xs text-muted-foreground">
                {TYPE_OPTIONS.find((t) => t.value === e.type)?.label ?? e.type}
                {e.secured ? " · gesichert" : ""}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Nachweis ${e.description} entfernen`}
              onClick={() => onRemove(e.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
        {evidence.length === 0 && (
          <li className="text-xs text-muted-foreground">Noch keine Nachweise erfasst.</li>
        )}
      </ul>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Art des Nachweises" className="sm:w-48">
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
          <Label htmlFor="evidence-description" className="sr-only">
            Beschreibung des Nachweises
          </Label>
          <Input
            id="evidence-description"
            value={description}
            placeholder="Kurze Beschreibung"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button type="button" onClick={add} disabled={!description.trim()} className="gap-2">
          <Plus className="h-4 w-4" /> Hinzufügen
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Es werden ausschließlich Angaben erfasst. Dateien werden nicht hochgeladen.
      </p>
    </div>
  );
}
