import { useMemo } from "react";
import { Lightbulb, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KnowledgeIndex, Suggestion } from "@/lib/knowledgeIndex";

/**
 * Automatische Vorschläge aus dem digitalen Zwilling.
 * Basiert ausschließlich auf vorhandenen Verknüpfungen (gemeinsame
 * Kategorie + Schlagwörter). Keine automatische Übernahme —
 * der Redakteur klickt "Übernehmen" pro Vorschlag.
 */
export function SuggestionPanel({
  index,
  caseId,
  onApply,
}: {
  index: KnowledgeIndex;
  caseId: string;
  onApply: (s: Suggestion) => void;
}) {
  const groups = useMemo(() => {
    const list = index.suggestionsForCase(caseId);
    const g: Record<Suggestion["kind"], Suggestion[]> = {
      section: [],
      template: [],
      keyword: [],
      case: [],
    };
    for (const s of list) g[s.kind].push(s);
    return g;
  }, [index, caseId]);

  const total =
    groups.section.length + groups.template.length + groups.keyword.length + groups.case.length;

  const KIND_LABEL: Record<Suggestion["kind"], string> = {
    section: "Rechtsgrundlagen",
    template: "Dokumentvorlagen",
    keyword: "Schlagwörter",
    case: "Ähnliche Praxisfälle",
  };

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold">Vorschläge der Wissensbasis ({total})</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Berechnet aus gemeinsamen Schlagwörtern und Kategorien anderer Praxisfälle. Keine
        automatische Übernahme — bitte prüfen.
      </p>

      {total === 0 && (
        <p className="text-xs text-muted-foreground">
          Keine Vorschläge — Kategorie und Schlagwörter setzen, um passende Inhalte zu finden.
        </p>
      )}

      <div className="space-y-3">
        {(Object.keys(groups) as Suggestion["kind"][]).map((k) => {
          const items = groups[k];
          if (items.length === 0) return null;
          return (
            <div key={k}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {KIND_LABEL[k]}
              </div>
              <ul className="space-y-1">
                {items.map((s) => (
                  <li
                    key={`${s.kind}:${s.refId}`}
                    className="flex items-start justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{s.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {s.reason} · Score {s.score}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                      onClick={() => onApply(s)}
                    >
                      <Plus className="h-3 w-3" />
                      Übernehmen
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
