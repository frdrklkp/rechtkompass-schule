import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/debug")({
  component: DebugPage,
});

const REQUIRED_PROJECT_REF = "mabbwunovhjaopnmzpfv";
const APP_VERSION = "1.0.0";

function DebugPage() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    "") as string;
  const projectRef = url ? url.replace(/^https?:\/\//, "").split(".")[0] : "—";
  const projectRefOk = projectRef === REQUIRED_PROJECT_REF;

  const casesQ = useQuery({
    queryKey: ["debug", "practice_cases_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("practice_cases")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const sourcesQ = useQuery({
    queryKey: ["debug", "legal_sources_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("legal_sources")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const [lastOk, setLastOk] = useState<string | null>(null);
  useEffect(() => {
    if (casesQ.isSuccess || sourcesQ.isSuccess) {
      setLastOk(new Date().toLocaleString("de-DE"));
    }
  }, [casesQ.isSuccess, sourcesQ.isSuccess, casesQ.dataUpdatedAt, sourcesQ.dataUpdatedAt]);

  const rows: Array<[string, string]> = [
    ["Project Reference", projectRef],
    ["Erforderliche Project Ref", REQUIRED_PROJECT_REF],
    ["VITE_SUPABASE_URL", url ?? "(nicht gesetzt)"],
    ["Anon Key (erste 20 Zeichen)", anon ? anon.slice(0, 20) + "…" : "(nicht gesetzt)"],
    ["Anon Key Länge", String(anon.length)],
    ["Anzahl Praxisfälle", casesQ.isLoading ? "lädt…" : casesQ.error ? "Fehler" : String(casesQ.data ?? 0)],
    ["Anzahl Rechtsgrundlagen", sourcesQ.isLoading ? "lädt…" : sourcesQ.error ? "Fehler" : String(sourcesQ.data ?? 0)],
    ["App-Version", APP_VERSION],
    ["Letzte erfolgreiche DB-Verbindung", lastOk ?? "—"],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Supabase Debug</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Technische Kontrolle der Datenbankverbindung.
        </p>
      </header>

      {!projectRefOk && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Warnung:</strong> Aktive Project Reference{" "}
          <code className="font-mono">{projectRef}</code> entspricht nicht der
          erforderlichen Reference{" "}
          <code className="font-mono">{REQUIRED_PROJECT_REF}</code>. Es dürfen
          keine Änderungen an der Datenbankanbindung vorgenommen werden, bis
          die Environment Variables auf das korrekte Supabase-Projekt
          umgestellt sind.
        </div>
      )}
      {projectRefOk && (
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
          Project Reference stimmt mit dem freigegebenen externen
          Supabase-Projekt überein.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="w-1/2 px-4 py-2.5 font-medium text-muted-foreground">{k}</td>
                <td className="px-4 py-2.5 font-mono text-xs break-all">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(casesQ.error || sourcesQ.error) && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-xs text-destructive">
          {casesQ.error && <div>practice_cases: {(casesQ.error as Error).message}</div>}
          {sourcesQ.error && <div>legal_sources: {(sourcesQ.error as Error).message}</div>}
        </div>
      )}
    </div>
  );
}
