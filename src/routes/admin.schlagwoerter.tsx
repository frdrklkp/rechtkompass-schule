import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { listKeywords, createKeyword, deleteKeyword } from "@/lib/coreBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/schlagwoerter")({
  component: KeywordsAdmin,
});

async function loadKeywordsWithCounts() {
  const kws = await listKeywords();
  const { data: links, error } = await supabase.from("case_keywords").select("keyword_id");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.keyword_id, (counts.get(l.keyword_id) ?? 0) + 1);
  return kws.map((k) => ({ ...k, count: counts.get(k.id) ?? 0 }));
}

function KeywordsAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "keywords-with-counts"], queryFn: loadKeywordsWithCounts });
  const [name, setName] = useState("");

  const addMut = useMutation({
    mutationFn: () => createKeyword(name.trim()),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["admin", "keywords-with-counts"] });
      qc.invalidateQueries({ queryKey: ["admin", "keywords"] });
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteKeyword(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "keywords-with-counts"] });
      qc.invalidateQueries({ queryKey: ["admin", "keywords"] });
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Struktur</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Schlagwörter</h1>
        <p className="mt-1 text-sm text-muted-foreground">Werden Praxisfällen im Bearbeitungsformular zugeordnet.</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) addMut.mutate();
        }}
        className="flex gap-2 rounded-xl border border-border bg-card p-4"
      >
        <Input placeholder="Neues Schlagwort…" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim() || addMut.isPending}>
          <Plus className="h-4 w-4" /> Hinzufügen
        </Button>
      </form>
      {addMut.error && <ErrorState error={addMut.error} />}

      {q.isLoading && <LoadingState />}
      {q.error && <ErrorState error={q.error} />}
      {q.data && q.data.length === 0 && (
        <EmptyState title="Noch keine Schlagwörter" description="Lege dein erstes Schlagwort an." />
      )}

      {q.data && q.data.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-2">
            {q.data.map((k) => (
              <span
                key={k.id}
                className={
                  k.count === 0
                    ? "inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/5 px-3 py-1 text-xs"
                    : "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs"
                }
                title={k.count === 0 ? "Wird in keinem Praxisfall verwendet" : `In ${k.count} Fall/-fällen verwendet`}
              >
                {k.keyword}
                <span
                  className={
                    k.count === 0
                      ? "rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                      : "rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  }
                >
                  {k.count === 0 ? "verwaist" : k.count}
                </span>
                <button
                  onClick={() => {
                    if (confirm(`Schlagwort „${k.keyword}" löschen?`)) delMut.mutate(k.id);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="löschen"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
