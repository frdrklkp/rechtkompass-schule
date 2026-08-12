import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  Plus,
  X,
  Check,
  FileText,
  Wand2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  matchTemplates,
  applyTemplateMatches,
  seedStandardTemplates,
  templateAmpel,
  templateAmpelDot,
  listCaseTemplateLinks,
  unlinkCaseTemplate,
  type TemplateMatch,
  type CaseTemplateMatchInput,
} from "@/lib/templateMatching";
import { listTemplates } from "@/lib/coreBuilder";

type CatalogTemplate = {
  id: string;
  title: string;
  template_type?: string | null;
  fields?: unknown;
};

function describe(t: CatalogTemplate): string {
  const f = t.fields;
  if (f && typeof f === "object" && !Array.isArray(f)) {
    const d = (f as Record<string, unknown>).description;
    if (typeof d === "string") return d;
  }
  return "";
}

export function TemplateAssignmentDialog({
  open,
  onOpenChange,
  caseId,
  caseInput,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: string;
  caseInput: Omit<CaseTemplateMatchInput, "templates" | "already_linked">;
}) {
  const qc = useQueryClient();
  const [matches, setMatches] = useState<TemplateMatch[]>([]);
  const [missing, setMissing] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const catalogQ = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: listTemplates,
    enabled: open,
  });
  const linkedQ = useQuery({
    queryKey: ["admin", "case-templates", caseId],
    queryFn: () => listCaseTemplateLinks(caseId),
    enabled: open && !!caseId,
  });

  const catalog: CatalogTemplate[] = (catalogQ.data ?? []) as CatalogTemplate[];
  const byId = useMemo(() => {
    const m = new Map<string, CatalogTemplate>();
    for (const t of catalog) m.set(t.id, t);
    return m;
  }, [catalog]);
  const linkedIds = useMemo(
    () => new Set((linkedQ.data ?? []).map((l) => l.template_id)),
    [linkedQ.data],
  );

  const runMut = useMutation({
    mutationFn: async () => {
      return matchTemplates({
        ...caseInput,
        templates: catalog.map((t) => ({
          id: t.id,
          title: t.title,
          type: t.template_type ?? undefined,
          description: describe(t),
        })),
        already_linked: Array.from(linkedIds),
      });
    },
    onSuccess: (data) => {
      setMatches(data.matches);
      setMissing(data.missing_area ?? null);
      setRanAt(new Date());
      setSelected(new Set());
      if (data.matches.length === 0) {
        toast.info("Keine passenden Dokumentvorlagen gefunden.");
      } else {
        toast.success(`${data.matches.length} Vorschläge erhalten.`);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const applyMut = useMutation({
    mutationFn: async (ms: TemplateMatch[]) => {
      return applyTemplateMatches(
        caseId,
        ms.map((m) => ({
          template_id: m.id,
          relevance:
            m.confidence >= 85 ? "high" : m.confidence >= 60 ? "medium" : "low",
          explanation: m.reason,
        })),
        { alreadyLinked: Array.from(linkedIds) },
      );
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["admin", "case-templates", caseId] });
      await qc.invalidateQueries({ queryKey: ["case-networking", "catalogs", caseId] });
      setSelected(new Set());
      const parts = [
        `✓ ${res.assigned} zugeordnet`,
        res.skipped > 0 ? `↷ ${res.skipped} bereits vorhanden` : null,
        res.failed > 0 ? `⚠ ${res.failed} Fehler` : null,
      ].filter(Boolean);
      if (res.failed > 0) {
        toast.error(parts.join(" · "), {
          description: res.errors
            .slice(0, 3)
            .map((e) => {
              const t = byId.get(e.template_id);
              return `${t?.title ?? e.template_id}: ${e.message}${e.code ? ` (${e.code})` : ""}`;
            })
            .join("\n"),
        });
      } else if (res.assigned === 0) {
        toast.info("Keine neuen Zuordnungen (alle bereits vorhanden).");
      } else {
        toast.success(parts.join(" · "));
      }
    },
    onError: (e) =>
      toast.error("Zuordnung fehlgeschlagen: " + (e instanceof Error ? e.message : String(e))),
  });

  const removeMut = useMutation({
    mutationFn: (tid: string) => unlinkCaseTemplate(caseId, tid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "case-templates", caseId] }),
    onError: (e) =>
      toast.error("Entfernen fehlgeschlagen: " + (e instanceof Error ? e.message : String(e))),
  });

  const addFromCatalogMut = useMutation({
    mutationFn: (tid: string) =>
      applyTemplateMatches(caseId, [{ template_id: tid }], {
        alreadyLinked: Array.from(linkedIds),
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["admin", "case-templates", caseId] });
      if (res.failed > 0) {
        toast.error(res.errors[0]?.message ?? "Zuordnung fehlgeschlagen");
      } else if (res.assigned > 0) {
        toast.success("Vorlage zugeordnet.");
      }
    },
  });

  const seedMut = useMutation({
    mutationFn: seedStandardTemplates,
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["admin", "templates"] });
      const parts = [
        res.created > 0 ? `✓ ${res.created} Vorlagen neu angelegt` : null,
        res.existing > 0 ? `↷ ${res.existing} bereits vorhanden` : null,
        res.failed > 0 ? `⚠ ${res.failed} Fehler` : null,
      ].filter(Boolean);
      if (res.failed > 0) {
        toast.error(parts.join(" · "), {
          description: res.errors
            .slice(0, 3)
            .map((e) => `${e.title}: ${e.message}${e.code ? ` (${e.code})` : ""}`)
            .join("\n"),
        });
      } else {
        toast.success(parts.length ? parts.join(" · ") : "Alle Standardvorlagen vorhanden.");
      }
    },
    onError: (e) =>
      toast.error(
        "Standardvorlagen konnten nicht erzeugt werden: " +
          (e instanceof Error ? e.message : String(e)),
      ),
  });

  const applyAllRecommended = () => {
    const rec = matches.filter((m) => m.confidence >= 70 && !linkedIds.has(m.id));
    if (rec.length === 0) {
      toast.info("Keine Vorschläge mit ≥ 70 % Konfidenz vorhanden.");
      return;
    }
    applyMut.mutate(rec);
  };
  const applySelected = () => {
    const chosen = matches.filter((m) => selected.has(m.id) && !linkedIds.has(m.id));
    if (chosen.length === 0) return;
    applyMut.mutate(chosen);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((t) => !linkedIds.has(t.id))
      .filter((t) =>
        q
          ? t.title.toLowerCase().includes(q) ||
            (t.template_type ?? "").toLowerCase().includes(q)
          : true,
      )
      .slice(0, 200);
  }, [catalog, linkedIds, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Dokumentvorlagen zuordnen</DialogTitle>
          <DialogDescription>
            KI analysiert den Praxisfall und schlägt passende Vorlagen aus dem Katalog vor.
            Es werden ausschließlich vorhandene Vorlagen verknüpft – neue Vorlagen entstehen
            nur über „Standard-Dokumentvorlagen erzeugen“.
          </DialogDescription>
        </DialogHeader>

        {/* Action Bar */}
        <div className="sticky top-0 z-20 -mx-6 border-b border-border bg-card/95 px-6 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending || catalog.length === 0}
              className="h-11 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {runMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              🤖 Dokumentvorlagen automatisch zuordnen
            </Button>
            {matches.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={applyAllRecommended}
                  disabled={applyMut.isPending}
                >
                  <Check className="h-4 w-4" />
                  Alle empfohlenen zuordnen (≥ 70 %)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={applySelected}
                  disabled={applyMut.isPending || selected.size === 0}
                >
                  <Check className="h-4 w-4" />
                  Ausgewählte zuordnen ({selected.size})
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => seedMut.mutate()}
              disabled={seedMut.isPending}
              title="Legt fehlende Standard-Dokumentvorlagen als Entwurf an (idempotent)."
              className="ml-auto"
            >
              {seedMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              📄 Standard-Dokumentvorlagen erzeugen
            </Button>
            {ranAt && (
              <span className="w-full text-right text-[11px] text-muted-foreground">
                Letzte KI-Analyse: {ranAt.toLocaleTimeString()}
              </span>
            )}
          </div>
          {missing && (
            <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
              Hinweis der KI: {missing}
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* LEFT: AI suggestions + catalog */}
          <div className="space-y-4">
            <section>
              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                KI-Vorschläge
              </Label>
              {matches.length === 0 && (
                <p className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Noch keine Vorschläge – Button oben klicken, um die KI-Analyse zu starten.
                </p>
              )}
              <ul className="space-y-2">
                {matches.map((m) => {
                  const t = byId.get(m.id);
                  const linkedAlready = linkedIds.has(m.id);
                  const a = templateAmpel(m.confidence);
                  const isSel = selected.has(m.id);
                  return (
                    <li
                      key={m.id}
                      className={`rounded-lg border p-2.5 text-sm transition-colors ${
                        linkedAlready
                          ? "border-emerald-500/30 bg-emerald-500/5 opacity-70"
                          : isSel
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isSel}
                          disabled={linkedAlready}
                          onChange={() => toggleSelect(m.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{t?.title ?? m.id.slice(0, 8)}</span>
                            {t?.template_type && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {t.template_type}
                              </span>
                            )}
                            <span className="text-xs">{templateAmpelDot(a)}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                a === "gruen"
                                  ? "bg-emerald-500/15 text-emerald-700"
                                  : a === "gelb"
                                    ? "bg-amber-500/15 text-amber-700"
                                    : a === "orange"
                                      ? "bg-orange-500/15 text-orange-700"
                                      : "bg-rose-500/15 text-rose-700"
                              }`}
                            >
                              {Math.round(m.confidence)} %
                            </span>
                            {linkedAlready && (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700">
                                bereits zugeordnet
                              </span>
                            )}
                          </div>
                          {t && describe(t) && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Zweck: {describe(t)}
                            </div>
                          )}
                          {m.reason && (
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              Begründung: {m.reason}
                            </div>
                          )}
                          {m.signals?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {m.signals.map((s, i) => (
                                <span
                                  key={i}
                                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {!linkedAlready && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => applyMut.mutate([m])}
                            disabled={applyMut.isPending}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Zuordnen
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Verfügbare Vorlagen
              </Label>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Vorlage suchen…"
                  className="pl-7 text-sm"
                />
              </div>
              <div className="max-h-56 overflow-auto rounded-md border border-border bg-background p-2">
                <div className="flex flex-wrap gap-1.5">
                  {filteredCatalog.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => addFromCatalogMut.mutate(t.id)}
                      disabled={addFromCatalogMut.isPending}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" />
                      {t.title}
                      {t.template_type && (
                        <span className="text-muted-foreground">· {t.template_type}</span>
                      )}
                    </button>
                  ))}
                  {filteredCatalog.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Keine passenden Vorlagen gefunden.
                    </span>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT: assigned */}
          <div>
            <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Zugeordnet ({linkedQ.data?.length ?? 0})
            </Label>
            <div className="rounded-md border border-border bg-background p-2">
              <ul className="space-y-1.5">
                {(linkedQ.data ?? []).map((l) => {
                  const t = byId.get(l.template_id);
                  return (
                    <li
                      key={l.template_id}
                      className="flex items-start justify-between gap-2 rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{t?.title ?? l.template_id.slice(0, 8)}</span>
                          {t?.template_type && (
                            <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {t.template_type}
                            </span>
                          )}
                        </div>
                        {l.explanation && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {l.explanation}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMut.mutate(l.template_id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Entfernen"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
                {(linkedQ.data ?? []).length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    Noch keine Vorlagen zugeordnet.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-2 flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
