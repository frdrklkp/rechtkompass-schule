import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Link2 } from "lucide-react";
import {
  listCases,
  listSources,
  listSections,
  listCaseLegalLinks,
  createLegalLink,
  deleteLegalLink,
} from "@/lib/coreBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";

export const Route = createFileRoute("/admin/verknuepfungen")({
  component: LinksAdmin,
});

function LinksAdmin() {
  const qc = useQueryClient();
  const casesQ = useQuery({ queryKey: ["admin", "cases"], queryFn: listCases });
  const sourcesQ = useQuery({ queryKey: ["admin", "sources"], queryFn: listSources });
  const sectionsQ = useQuery({ queryKey: ["admin", "sections"], queryFn: listSections });
  const linksQ = useQuery({ queryKey: ["admin", "all-links"], queryFn: () => listCaseLegalLinks() });

  const [caseId, setCaseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [note, setNote] = useState("");

  const addMut = useMutation({
    mutationFn: () => createLegalLink(caseId, sectionId, note),
    onSuccess: () => {
      setCaseId("");
      setSectionId("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "all-links"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteLegalLink(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "all-links"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Beziehungen</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Verknüpfungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Verbinde Praxisfälle mit passenden Rechtsabschnitten.</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Neue Verknüpfung</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs">Praxisfall</Label>
            <select
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Fall wählen…</option>
              {(casesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Rechtsabschnitt</Label>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Rechtsabschnitt wählen…</option>
              {(sectionsQ.data ?? []).map((s: any) => {
                const src = (sourcesQ.data ?? []).find((x: any) => x.id === s.source_id);
                return (
                  <option key={s.id} value={s.id}>
                    {src?.short_name ?? "?"} · {s.reference}
                    {s.title ? ` – ${s.title}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <Label className="mb-1.5 block text-xs">Notiz (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. gilt insbesondere für belastende Maßnahmen" />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => addMut.mutate()} disabled={!caseId || !sectionId || addMut.isPending}>
            <Plus className="h-4 w-4" /> Verknüpfung anlegen
          </Button>
        </div>
        {addMut.error && <div className="mt-3"><ErrorState error={addMut.error} /></div>}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Vorhandene Verknüpfungen</h2>
        </div>
        {linksQ.isLoading && <LoadingState />}
        {linksQ.error && <ErrorState error={linksQ.error} />}
        {linksQ.data && linksQ.data.length === 0 && (
          <EmptyState title="Noch keine Verknüpfungen" description="Verbinde deinen ersten Praxisfall mit einem Rechtsabschnitt." />
        )}
        {linksQ.data && linksQ.data.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Praxisfall</th>
                  <th className="px-4 py-2.5 text-left font-medium">Rechtsabschnitt</th>
                  <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell">Notiz</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linksQ.data.map((l: any) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">{l.practice_cases?.title ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">
                        {l.legal_sections?.legal_sources?.short_name ?? "?"} ·{" "}
                      </span>
                      <span className="font-medium">{l.legal_sections?.reference}</span>
                      {l.legal_sections?.title && (
                        <span className="text-xs text-muted-foreground"> — {l.legal_sections.title}</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground md:table-cell">{l.note ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => delMut.mutate(l.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
