import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, Plus, Trash2, Search, X, Check } from "lucide-react";
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
  linkCaseKeyword,
  unlinkCaseKeyword,
} from "@/lib/coreBuilder";
import {
  matchKeywords,
  keywordAmpel,
  keywordAmpelDot,
  applyKeywordMatches,
  type KeywordMatch,
  type CaseKeywordMatchInput,
} from "@/lib/keywordMatching";


type CatalogKeyword = { id: string; keyword: string };
type LinkedKeyword = { keyword_id: string; keywords: { id: string; keyword: string } | null };

export function KeywordAssignmentDialog({
  open,
  onOpenChange,
  caseId,
  caseInput,
  catalog,
  linked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: string;
  caseInput: Omit<CaseKeywordMatchInput, "existing_keywords" | "already_linked">;
  catalog: CatalogKeyword[];
  linked: LinkedKeyword[];
}) {
  const qc = useQueryClient();
  const [matches, setMatches] = useState<KeywordMatch[]>([]);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const linkedNamesLower = useMemo(
    () =>
      new Set(
        linked
          .map((l) => l.keywords?.keyword?.trim().toLowerCase() ?? "")
          .filter(Boolean),
      ),
    [linked],
  );
  const catalogByName = useMemo(() => {
    const m = new Map<string, CatalogKeyword>();
    for (const k of catalog) m.set(k.keyword.trim().toLowerCase(), k);
    return m;
  }, [catalog]);

  const runMut = useMutation({
    mutationFn: async () => {
      return matchKeywords({
        ...caseInput,
        existing_keywords: catalog.map((k) => k.keyword),
        already_linked: linked
          .map((l) => l.keywords?.keyword ?? "")
          .filter(Boolean),
      });
    },
    onSuccess: (data) => {
      setMatches(data.matches);
      setRanAt(new Date());
      setSelected(new Set());
      if (data.matches.length === 0) {
        toast.info("Keine passenden Schlagwörter gefunden.");
      } else {
        toast.success(`${data.matches.length} Vorschläge erhalten.`);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : String(err));
    },
  });

  const applySelectedMut = useMutation({
    mutationFn: async (ms: KeywordMatch[]) => {
      return applyKeywordMatches(
        caseId,
        ms.map((m) => ({ keyword: m.keyword })),
        {
          catalog,
          alreadyLinked: linked
            .map((l) => l.keywords?.keyword ?? "")
            .filter(Boolean),
        },
      );
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["admin", "case-keywords", caseId] });
      await qc.invalidateQueries({ queryKey: ["admin", "keywords"] });
      setSelected(new Set());
      const parts = [
        `✓ ${res.assigned} zugeordnet`,
        res.created > 0 ? `✓ ${res.created} neu angelegt` : null,
        res.skipped > 0 ? `↷ ${res.skipped} übersprungen` : null,
        res.failed > 0 ? `⚠ ${res.failed} Fehler` : null,
      ].filter(Boolean);
      if (res.failed > 0) {
        toast.error(parts.join(" · "), {
          description: res.errors
            .slice(0, 3)
            .map((e) => `${e.keyword}: ${e.message}${e.code ? ` (${e.code})` : ""}`)
            .join("\n"),
        });
      } else if (res.assigned === 0) {
        toast.info("Keine neuen Zuordnungen (alle bereits vorhanden).");
      } else {
        toast.success(parts.join(" · "));
      }
    },
    onError: (err) => {
      toast.error(
        "Zuordnung fehlgeschlagen: " + (err instanceof Error ? err.message : String(err)),
      );
    },
  });

  const applyAllRecommended = () => {
    const rec = matches.filter(
      (m) => m.confidence >= 70 && !linkedNamesLower.has(m.keyword.toLowerCase()),
    );
    if (rec.length === 0) {
      toast.info("Keine Vorschläge mit ≥ 70 % Konfidenz vorhanden.");
      return;
    }
    applySelectedMut.mutate(rec);
  };
  const applySelected = () => {
    const chosen = matches.filter(
      (m) => selected.has(m.keyword) && !linkedNamesLower.has(m.keyword.toLowerCase()),
    );
    if (chosen.length === 0) return;
    applySelectedMut.mutate(chosen);
  };


  const removeMut = useMutation({
    mutationFn: (kwId: string) => unlinkCaseKeyword(caseId, kwId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "case-keywords", caseId] }),
  });

  const addFromCatalogMut = useMutation({
    mutationFn: (kwId: string) => linkCaseKeyword(caseId, kwId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "case-keywords", caseId] }),
  });

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((k) => !linkedNamesLower.has(k.keyword.toLowerCase()))
      .filter((k) => (q ? k.keyword.toLowerCase().includes(q) : true))
      .slice(0, 200);
  }, [catalog, linkedNamesLower, search]);

  const toggleSelect = (kw: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Schlagwörter zuordnen</DialogTitle>
          <DialogDescription>
            KI analysiert den Praxisfall und schlägt passende Schlagwörter vor. Vorhandene
            Schlagwörter werden bevorzugt wiederverwendet.
          </DialogDescription>
        </DialogHeader>

        {/* Sticky Action bar */}
        <div className="sticky top-0 z-20 -mx-6 border-b border-border bg-card/95 px-6 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending}
              className="h-11 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {runMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              🤖 Schlagwörter automatisch zuordnen
            </Button>
            {matches.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={applyAllRecommended}
                  disabled={applySelectedMut.isPending}
                >
                  <Check className="h-4 w-4" />
                  Alle empfohlenen zuordnen (≥ 70 %)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={applySelected}
                  disabled={applySelectedMut.isPending || selected.size === 0}
                >
                  <Check className="h-4 w-4" />
                  Ausgewählte zuordnen ({selected.size})
                </Button>
              </>
            )}
            {ranAt && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                Letzte KI-Analyse: {ranAt.toLocaleTimeString()}
              </span>
            )}
          </div>
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
                  const linkedAlready = linkedNamesLower.has(m.keyword.toLowerCase());
                  const inCatalog = catalogByName.has(m.keyword.toLowerCase());
                  const a = keywordAmpel(m.confidence);
                  const isSel = selected.has(m.keyword);
                  return (
                    <li
                      key={m.keyword}
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
                          onChange={() => toggleSelect(m.keyword)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{m.keyword}</span>
                            <span className="text-xs">{keywordAmpelDot(a)}</span>
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
                            {linkedAlready ? (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700">
                                bereits zugeordnet
                              </span>
                            ) : inCatalog ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                vorhanden
                              </span>
                            ) : (
                              <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent-foreground">
                                neu
                              </span>
                            )}
                          </div>
                          {m.reason && (
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {m.reason}
                            </div>
                          )}
                        </div>
                        {!linkedAlready && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => applySelectedMut.mutate([m])}
                            disabled={applySelectedMut.isPending}
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
                Verfügbare Schlagwörter
              </Label>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Schlagwort suchen…"
                  className="pl-7 text-sm"
                />
              </div>
              <div className="max-h-56 overflow-auto rounded-md border border-border bg-background p-2">
                <div className="flex flex-wrap gap-1.5">
                  {filteredCatalog.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => addFromCatalogMut.mutate(k.id)}
                      disabled={addFromCatalogMut.isPending}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" /> {k.keyword}
                    </button>
                  ))}
                  {filteredCatalog.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Keine passenden Schlagwörter gefunden.
                    </span>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT: assigned */}
          <div>
            <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Zugeordnet ({linked.length})
            </Label>
            <div className="rounded-md border border-border bg-background p-2">
              <div className="flex flex-wrap gap-1.5">
                {linked.map((l) => (
                  <span
                    key={l.keyword_id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                  >
                    {l.keywords?.keyword ?? "—"}
                    <button
                      type="button"
                      onClick={() => removeMut.mutate(l.keyword_id)}
                      className="text-primary/70 hover:text-primary"
                      title="Entfernen"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {linked.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Noch keine Schlagwörter zugeordnet.
                  </span>
                )}
              </div>
            </div>
            {linked.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Klick auf ✕ entfernt die Zuordnung. Änderungen sind sofort in der
                Datenbank wirksam.
              </p>
            )}
          </div>
        </div>

        <div className="mt-2 flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <Trash2 className="hidden" />
            Schließen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
