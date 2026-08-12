/** Sprint 4.5H – Verständliche Fehlerdarstellung mit Handlungsempfehlung. */
import { AlertTriangle, Lightbulb } from "lucide-react";
import { describeImportError } from "@/services/legal-knowledge/import-experience";

export function ImportErrorNotice({ error }: { error: unknown }) {
  const info = describeImportError(error);
  return (
    <div className="space-y-1 rounded-md border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-900">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {info.title}
      </div>
      <p>{info.explanation}</p>
      <p className="flex items-start gap-1">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-medium">Empfehlung:</span> {info.recommendation}
        </span>
      </p>
      <p className="font-mono text-[10px] opacity-70">{info.technical}</p>
    </div>
  );
}
