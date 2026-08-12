/** Sprint 4.6B – Textbasierte Eingabe für Situationsfragen. */
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface SituationTextInputProps {
  id: string;
  value: string;
  multiline?: boolean;
  type?: "text" | "date" | "time" | "datetime-local";
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function SituationTextInput({
  id,
  value,
  multiline,
  type = "text",
  describedBy,
  invalid,
  disabled,
  onChange,
}: SituationTextInputProps) {
  if (multiline) {
    return (
      <Textarea
        id={id}
        value={value}
        rows={4}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input
      id={id}
      type={type}
      value={value}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
