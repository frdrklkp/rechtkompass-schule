/**
 * Sprint 4.6F – Freie Fallschilderung.
 * Nimmt ausschließlich Text auf; die Auswertung erfolgt im Service.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { MIN_DESCRIPTION_LENGTH } from "@/services/assistant";

export interface AssistantInputProps {
  initialValue?: string;
  busy?: boolean;
  disabled?: boolean;
  submitLabel?: string;
  onSubmit: (description: string) => void;
}

export function AssistantInput({
  initialValue = "",
  busy = false,
  disabled = false,
  submitLabel = "Angaben strukturieren",
  onSubmit,
}: AssistantInputProps) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const tooShort = value.trim().length < MIN_DESCRIPTION_LENGTH;

  return (
    <form
      className="rounded-2xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (tooShort || disabled || busy) return;
        onSubmit(value);
      }}
    >
      <label htmlFor="assistant-description" className="text-sm font-semibold text-foreground">
        Was ist vorgefallen?
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        Schildern Sie den Fall in eigenen Worten. Bitte keine vollständigen Namen verwenden.
      </p>
      <textarea
        id="assistant-description"
        ref={ref}
        rows={6}
        value={value}
        disabled={disabled || busy}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Zum Beispiel: Ein Schüler hat im Unterricht wiederholt eine Mitschülerin beleidigt. Es gab Zeugen, die Schulleitung ist noch nicht informiert."
        className="mt-3 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-accent disabled:opacity-60"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {value.trim().length} Zeichen · mindestens {MIN_DESCRIPTION_LENGTH} Zeichen
        </p>
        <button
          type="submit"
          disabled={tooShort || disabled || busy}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
