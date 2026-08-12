/**
 * Sprint 4.6G – Unveränderte Anzeige des gespeicherten Quelltexts.
 * Der Text stammt aus dem Legal-Knowledge-System (legal_sections.original_text)
 * und wird niemals zusammengefasst oder umformuliert.
 */
import { FileText } from "lucide-react";

export interface LegalOriginalTextProps {
  text: string | null;
  /** Anzeigename der Quelle, z. B. „SchulG NRW“. */
  sourceLabel: string | null;
  /** Fassungsangabe, sofern vorhanden. */
  versionLabel?: string | null;
}

export function LegalOriginalText({ text, sourceLabel, versionLabel }: LegalOriginalTextProps) {
  if (!text || text.trim().length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Für diese Referenz liegt aktuell kein gespeicherter Quelltext vor.
      </p>
    );
  }
  return (
    <figure
      className="mt-3 rounded-lg border border-border bg-muted/30 p-3"
      aria-label="Originaltext aus der hinterlegten Quelle"
    >
      <figcaption className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Originaltext aus der hinterlegten Quelle
      </figcaption>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Quelle: {sourceLabel ?? "nicht hinterlegt"}
        {versionLabel ? ` · Fassung: ${versionLabel}` : ""} · unverändert übernommen
      </p>
      <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-3 text-xs leading-relaxed text-foreground">
        {text}
      </blockquote>
    </figure>
  );
}
