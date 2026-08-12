import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  listCases,
  listCategories,
  AMPEL_LABELS,
  AMPEL_DOT,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/lib/coreBuilder";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { AiDraftCaseButton } from "@/components/AiDraftCaseButton";
import { matches } from "@/lib/synonyms";

export const Route = createFileRoute("/admin/faelle/")({
  component: FaelleAdmin,
});

function FaelleAdmin() {
  const casesQ = useQuery({ queryKey: ["admin", "cases"], queryFn: listCases });
  const catsQ = useQuery({ queryKey: ["admin", "categories"], queryFn: listCategories });
  const navigate = useNavigate();
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [clickDebug, setClickDebug] = useState<string | null>(null);

  const startWizard = () => {
    setWizardError(null);
    setClickDebug("Neuer Praxisfall wurde angeklickt.");
    window.setTimeout(() => {
      try {
        navigate({ to: "/admin/faelle/neu" });
      } catch (e) {
        setWizardError("Wizard konnte nicht geöffnet werden.");
        console.error("[admin.faelle] Wizard-Start fehlgeschlagen", e);
      }
    }, 200);
  };

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("alle");
  const [amp, setAmp] = useState("alle");
  const [status, setStatus] = useState("alle");

  const list = useMemo(() => {
    const term = q.trim();
    return (casesQ.data ?? []).filter((c) => {
      if (cat !== "alle" && c.category !== cat) return false;
      if (amp !== "alle" && c.ampel !== amp) return false;
      if (status !== "alle" && c.status !== status) return false;
      if (term) {
        const hay = [
          c.title,
          c.category,
          c.subcategory,
          c.short_description,
          c.short_answer,
        ]
          .filter(Boolean)
          .join(" ");
        if (!matches(hay, term)) return false;
      }
      return true;
    });
  }, [casesQ.data, q, cat, amp, status]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Inhalte</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Praxisfälle</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {casesQ.data ? `${casesQ.data.length} Fälle insgesamt · ${list.length} angezeigt` : "…"}
          </p>
        </div>
        <div className="max-w-full overflow-hidden rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] text-muted-foreground">
          <div><span className="text-foreground">Query:</span> supabase.from("practice_cases").select("*").order("created_at", desc)</div>
          <div><span className="text-foreground">Status:</span> {casesQ.isLoading ? "lädt…" : casesQ.error ? "Fehler" : `OK · ${casesQ.data?.length ?? 0} Datensätze`}</div>
          <div><span className="text-foreground">Vor Filterung:</span> {casesQ.data?.length ?? 0}</div>
          <div><span className="text-foreground">Nach Filterung:</span> {list.length}</div>
          <div><span className="text-foreground">Suchbegriff:</span> {q || "—"}</div>
          <div><span className="text-foreground">Statusfilter:</span> {status}</div>
          <div><span className="text-foreground">Kategoriefilter:</span> {cat}</div>
          <div><span className="text-foreground">Ampelfilter:</span> {amp}</div>
          {casesQ.data?.[0] && (
            <details className="mt-1">
              <summary className="cursor-pointer text-foreground">Erste Zeile (JSON)</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(casesQ.data[0], null, 2)}</pre>
            </details>
          )}
          {casesQ.error && (
            <div className="text-destructive"><span className="text-foreground">Fehler:</span> {(casesQ.error as Error).message}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <AiDraftCaseButton />
            <Button
              type="button"
              onClick={startWizard}
              title="Neuen Praxisfall anlegen"
              className="relative z-10 pointer-events-auto"
            >
              <Plus className="h-4 w-4" />
              Neuer Praxisfall
            </Button>
          </div>
          {clickDebug && (
            <span className="text-[11px] text-emerald-600">{clickDebug}</span>
          )}
          {wizardError && (
            <span className="text-[11px] text-destructive">{wizardError}</span>
          )}
        </div>
      </header>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Titel suchen…"
            className="pl-9"
          />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="alle">Alle Kategorien</option>
          {(catsQ.data ?? []).map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={amp} onChange={(e) => setAmp(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="alle">Alle Ampeln</option>
          <option value="gruen">Grün</option>
          <option value="gelb">Gelb</option>
          <option value="rot">Rot</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="alle">Alle Status</option>
          <option value="draft">Entwurf</option>
          <option value="review">In Prüfung</option>
          <option value="published">Veröffentlicht</option>
          <option value="archived">Archiviert</option>
        </select>
      </div>

      {casesQ.isLoading && <LoadingState />}
      {casesQ.error && <ErrorState error={casesQ.error} />}
      {casesQ.data && list.length === 0 && (
        <EmptyState
          title={casesQ.data.length === 0 ? "Noch keine Praxisfälle" : "Keine Treffer"}
          description={
            casesQ.data.length === 0
              ? "Lege den ersten Praxisfall an."
              : "Passe Suchbegriff oder Filter an."
          }
          action={
            casesQ.data.length === 0 ? (
              <Button type="button" onClick={startWizard}>
                <Plus className="h-4 w-4" />
                Neuen Praxisfall erstellen
              </Button>
            ) : undefined
          }
        />
      )}

      {list.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Titel</th>
                <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell">Kategorie</th>
                <th className="px-4 py-2.5 text-left font-medium">Ampel</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{c.title}</div>
                    {c.short_description && (
                      <div className="line-clamp-1 text-xs text-muted-foreground">{c.short_description}</div>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                    {c.category ?? "—"}
                    {c.subcategory ? <span className="text-xs"> · {c.subcategory}</span> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`h-2 w-2 rounded-full ${AMPEL_DOT[c.ampel]}`} />
                      {AMPEL_LABELS[c.ampel]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[c.status] ?? ""}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link to="/admin/faelle/$id" params={{ id: c.id }} className="text-xs text-primary hover:underline">
                      bearbeiten
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}