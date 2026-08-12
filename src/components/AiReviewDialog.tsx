import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, X, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type FaqItem = { q: string; a: string };

export type AiDraft = {
  recommendation?: string;
  practice_tip?: string;
  common_mistakes?: string[];
  legal_explanation?: string;
  checklist?: string[];
  responsibilities?: string;
  short_answer?: string;
  short_description?: string;
  immediate_actions?: string;
  documentation?: string[];
  faq?: FaqItem[];
  keyword_ids?: string[];
  keyword_hints?: string[];
  template_ids?: string[];
  legal_section_ids?: string[];
  related_hints?: string[];
};

export type AiApprovedResult = {
  text: Record<string, string>;
  list: Record<string, string[]>;
  faq: FaqItem[] | null;
  keywordIds: string[];
  templateIds: string[];
  sectionIds: string[];
  keywordHints: string[];
  relatedHints: string[];
  counts: {
    fields: number;
    keywords: number;
    templates: number;
    sections: number;
  };
  qualityPct: number;
};

type Current = {
  recommendation: string;
  practice_tip: string;
  common_mistakes: string[];
  legal_explanation: string;
  checklist: string[];
  responsibilities: string;
  short_answer: string;
  short_description: string;
  immediate_actions: string;
  documentation: string[];
  faq: FaqItem[];
};

type Kind = "string" | "list";

type FieldSpec = {
  key: keyof Current;
  label: string;
  kind: Kind;
  displayIn: "Do's" | "Don'ts" | "Warum" | "Rest";
};

const FIELDS: FieldSpec[] = [
  { key: "short_description", label: "Situationsbeschreibung", kind: "string", displayIn: "Rest" },
  { key: "short_answer", label: "Sofortentscheidung (Kurzantwort)", kind: "string", displayIn: "Rest" },
  { key: "immediate_actions", label: "Sofortmaßnahmen", kind: "string", displayIn: "Rest" },
  { key: "recommendation", label: "Handlungsempfehlung", kind: "string", displayIn: "Rest" },
  { key: "practice_tip", label: "Praxistipp (✅ Do's)", kind: "string", displayIn: "Do's" },
  { key: "common_mistakes", label: "Typische Fehler (❌ Don'ts)", kind: "list", displayIn: "Don'ts" },
  { key: "legal_explanation", label: "Rechtliche Erläuterung (💡 Warum wichtig?)", kind: "string", displayIn: "Warum" },
  { key: "responsibilities", label: "Zuständigkeiten", kind: "string", displayIn: "Rest" },
  { key: "checklist", label: "Checkliste", kind: "list", displayIn: "Rest" },
  { key: "documentation", label: "Dokumentation", kind: "list", displayIn: "Rest" },
];

type Decision = "accept" | "reject";

type Ref = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: AiDraft | null;
  current: Current;
  keywordCatalog: Ref[];
  templateCatalog: Ref[];
  sectionCatalog: Ref[];
  onApply: (result: AiApprovedResult) => void | Promise<void>;
};

export function AiReviewDialog({
  open,
  onOpenChange,
  draft,
  current,
  keywordCatalog,
  templateCatalog,
  sectionCatalog,
  onApply,
}: Props) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [faqDecision, setFaqDecision] = useState<Decision>("accept");
  const [selectedKw, setSelectedKw] = useState<Set<string>>(new Set());
  const [selectedTpl, setSelectedTpl] = useState<Set<string>>(new Set());
  const [selectedSec, setSelectedSec] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open || !draft) return;
    const nextDec: Record<string, Decision> = {};
    const nextVals: Record<string, string> = {};
    for (const f of FIELDS) {
      const cur = current[f.key];
      const sug = draft[f.key as keyof AiDraft];
      const hasCurrent =
        f.kind === "string"
          ? String(cur ?? "").trim().length > 0
          : Array.isArray(cur) && (cur as string[]).some((x) => x.trim());
      const hasSuggestion =
        f.kind === "string"
          ? String(sug ?? "").trim().length > 0
          : Array.isArray(sug) && (sug as string[]).some((x) => x && x.trim());
      // Default: accept only if we have a suggestion and no existing content.
      nextDec[f.key] = !hasCurrent && hasSuggestion ? "accept" : "reject";
      nextVals[f.key] =
        f.kind === "string"
          ? String(sug ?? "")
          : ((sug as string[]) ?? []).filter(Boolean).join("\n");
    }
    setDecisions(nextDec);
    setValues(nextVals);
    setEditing({});
    setFaqDecision(current.faq.length ? "reject" : "accept");

    const validKw = new Set(keywordCatalog.map((k) => k.id));
    const validTpl = new Set(templateCatalog.map((t) => t.id));
    const validSec = new Set(sectionCatalog.map((s) => s.id));
    setSelectedKw(new Set((draft.keyword_ids ?? []).filter((x) => validKw.has(x))));
    setSelectedTpl(new Set((draft.template_ids ?? []).filter((x) => validTpl.has(x))));
    setSelectedSec(new Set((draft.legal_section_ids ?? []).filter((x) => validSec.has(x))));
  }, [open, draft, current, keywordCatalog, templateCatalog, sectionCatalog]);

  const summary = useMemo(() => {
    if (!draft) return { fields: 0, faq: 0, kw: 0, tpl: 0, sec: 0 };
    return {
      fields: FIELDS.filter((f) => decisions[f.key] === "accept").length,
      faq: faqDecision === "accept" ? (draft.faq ?? []).length : 0,
      kw: selectedKw.size,
      tpl: selectedTpl.size,
      sec: selectedSec.size,
    };
  }, [draft, decisions, faqDecision, selectedKw, selectedTpl, selectedSec]);

  if (!draft) return null;

  const setDec = (k: string, d: Decision) =>
    setDecisions((p) => ({ ...p, [k]: d }));
  const toggleSet = (
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    id: string,
  ) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSet(n);
  };

  const groups: Array<{ title: string; fields: FieldSpec[] }> = [
    { title: "Situation & Sofortreaktion", fields: FIELDS.filter((f) => ["short_description", "short_answer", "immediate_actions"].includes(f.key)) },
    { title: "Handlung", fields: FIELDS.filter((f) => f.key === "recommendation") },
    { title: "✅ Do's", fields: FIELDS.filter((f) => f.displayIn === "Do's") },
    { title: "❌ Don'ts", fields: FIELDS.filter((f) => f.displayIn === "Don'ts") },
    { title: "💡 Warum ist das wichtig?", fields: FIELDS.filter((f) => f.displayIn === "Warum") },
    { title: "Zuständigkeiten, Checkliste & Doku", fields: FIELDS.filter((f) => ["responsibilities", "checklist", "documentation"].includes(f.key)) },
  ];

  const apply = async () => {
    setApplying(true);
    try {
      const text: Record<string, string> = {};
      const list: Record<string, string[]> = {};
      let acceptedFields = 0;
      for (const f of FIELDS) {
        if (decisions[f.key] !== "accept") continue;
        const raw = values[f.key] ?? "";
        if (f.kind === "string") {
          const v = raw.trim();
          if (v) {
            text[f.key] = v;
            acceptedFields++;
          }
        } else {
          const arr = raw.split("\n").map((s) => s.trim()).filter(Boolean);
          if (arr.length) {
            list[f.key] = arr;
            acceptedFields++;
          }
        }
      }
      const faq = faqDecision === "accept" ? (draft.faq ?? []).filter((x) => x.q && x.a) : null;
      const keywordIds = Array.from(selectedKw);
      const templateIds = Array.from(selectedTpl);
      const sectionIds = Array.from(selectedSec);

      // Quality metric: 9 criteria as per EPIC.
      const q = [
        text.recommendation || current.recommendation,
        text.practice_tip || current.practice_tip,
        (list.common_mistakes && list.common_mistakes.length) || current.common_mistakes.length,
        text.legal_explanation || current.legal_explanation,
        sectionIds.length || 0,
        templateIds.length || 0,
        (faq?.length ?? 0) || current.faq.length,
        (list.checklist && list.checklist.length) || current.checklist.length,
        keywordIds.length || 0,
      ];
      const filled = q.filter(Boolean).length;
      const qualityPct = Math.round((filled / 9) * 100);

      await onApply({
        text,
        list,
        faq,
        keywordIds,
        templateIds,
        sectionIds,
        keywordHints: draft.keyword_hints ?? [],
        relatedHints: draft.related_hints ?? [],
        counts: {
          fields: acceptedFields,
          keywords: keywordIds.length,
          templates: templateIds.length,
          sections: sectionIds.length,
        },
        qualityPct,
      });
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !applying && onOpenChange(v)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            KI-Vorschläge prüfen & freigeben
          </DialogTitle>
          <DialogDescription>
            Jeder Vorschlag muss einzeln übernommen, bearbeitet oder verworfen werden.
            Vorhandene Inhalte werden nie überschrieben.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{summary.fields} Felder ausgewählt</Badge>
          <Badge variant="outline">{summary.sec} Rechtsgrundlagen</Badge>
          <Badge variant="outline">{summary.tpl} Dokumentvorlagen</Badge>
          <Badge variant="outline">{summary.kw} Schlagwörter</Badge>
          {summary.faq > 0 && <Badge variant="outline">{summary.faq} FAQ</Badge>}
        </div>

        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.title} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">{g.title}</h3>
              {g.fields.map((f) => {
                const cur = current[f.key];
                const curText =
                  f.kind === "string"
                    ? String(cur ?? "")
                    : (cur as string[]).join("\n");
                const suggested = values[f.key] ?? "";
                const hasSuggestion = suggested.trim().length > 0;
                const dec = decisions[f.key] ?? "reject";
                const isEditing = editing[f.key];
                const hasCurrent = curText.trim().length > 0;
                return (
                  <div
                    key={f.key}
                    className={cn(
                      "rounded-lg border p-3",
                      dec === "accept"
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-border bg-muted/30",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {f.label}
                        {hasCurrent && (
                          <span className="ml-2 text-xs text-amber-600">
                            (bereits vorhanden – nicht überschreiben)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={dec === "accept" ? "default" : "outline"}
                          disabled={!hasSuggestion || hasCurrent}
                          onClick={() => setDec(f.key, "accept")}
                          className={dec === "accept" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                          title={hasCurrent ? "Feld ist bereits gefüllt" : "Übernehmen"}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Übernehmen
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!hasSuggestion}
                          onClick={() => setEditing((p) => ({ ...p, [f.key]: !p[f.key] }))}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Bearbeiten
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={dec === "reject" ? "secondary" : "ghost"}
                          onClick={() => setDec(f.key, "reject")}
                        >
                          <X className="h-3.5 w-3.5" />
                          Verwerfen
                        </Button>
                      </div>
                    </div>
                    {!hasSuggestion ? (
                      <p className="text-xs italic text-muted-foreground">
                        🟡 Redaktion ergänzen – die KI konnte hierzu keinen belastbaren
                        Vorschlag ableiten.
                      </p>
                    ) : isEditing ? (
                      <Textarea
                        value={suggested}
                        onChange={(e) =>
                          setValues((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        rows={f.kind === "list" ? 5 : 4}
                        className="text-sm"
                        placeholder={f.kind === "list" ? "Ein Eintrag pro Zeile" : ""}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                        {suggested}
                      </pre>
                    )}
                  </div>
                );
              })}
            </section>
          ))}

          {(draft.faq ?? []).length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  FAQ ({(draft.faq ?? []).length})
                </h3>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={faqDecision === "accept" ? "default" : "outline"}
                    onClick={() => setFaqDecision("accept")}
                    className={faqDecision === "accept" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Übernehmen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={faqDecision === "reject" ? "secondary" : "ghost"}
                    onClick={() => setFaqDecision("reject")}
                  >
                    <X className="h-3.5 w-3.5" />
                    Verwerfen
                  </Button>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                {(draft.faq ?? []).map((f, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-medium">{f.q}</p>
                    <p className="text-muted-foreground">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <SelectableList
            title="Rechtsgrundlagen"
            hint="Nur aus vorhandener Wissensbasis – keine erfundenen Quellen."
            items={sectionCatalog.filter((s) => (draft.legal_section_ids ?? []).includes(s.id))}
            selected={selectedSec}
            onToggle={(id) => toggleSet(selectedSec, setSelectedSec, id)}
          />
          <SelectableList
            title="Dokumentvorlagen"
            items={templateCatalog.filter((t) => (draft.template_ids ?? []).includes(t.id))}
            selected={selectedTpl}
            onToggle={(id) => toggleSet(selectedTpl, setSelectedTpl, id)}
          />
          <SelectableList
            title="Schlagwörter"
            items={keywordCatalog.filter((k) => (draft.keyword_ids ?? []).includes(k.id))}
            selected={selectedKw}
            onToggle={(id) => toggleSet(selectedKw, setSelectedKw, id)}
          />

          {(draft.keyword_hints?.length || draft.related_hints?.length) ? (
            <section className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium">KI-Notizen für die Redaktion</p>
              {draft.keyword_hints?.length ? (
                <p>Neue Schlagwort-Ideen: {draft.keyword_hints.join(", ")}</p>
              ) : null}
              {draft.related_hints?.length ? (
                <p>Ähnliche Fälle (Hinweise): {draft.related_hints.join(" · ")}</p>
              ) : null}
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>
            Abbrechen
          </Button>
          <Button type="button" onClick={apply} disabled={applying}>
            {applying ? "Übernehme …" : "Freigegebene Vorschläge übernehmen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectableList({
  title,
  hint,
  items,
  selected,
  onToggle,
}: {
  title: string;
  hint?: string;
  items: Ref[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground">
          {title} ({items.length})
        </h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const on = selected.has(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                on
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              {on ? "✓ " : ""}
              {it.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
