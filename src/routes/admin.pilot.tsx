import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/pilot")({
  component: PilotAllowlistAdmin,
});

interface PilotEntry {
  email: string;
  name: string | null;
  note: string | null;
  added_at: string;
}

// pilot_allowlist ist (wie user_profiles) noch nicht in supabase/types.ts
// enthalten - bewusster Cast, analog admin.schlagwoerter.tsx-Konventionen.
const table = () => (supabase as unknown as { from: (t: string) => any }).from("pilot_allowlist");

async function loadPilotList(): Promise<PilotEntry[]> {
  const { data, error } = await table().select("email, name, note, added_at").order("added_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PilotEntry[];
}

function PilotAllowlistAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "pilot-allowlist"], queryFn: loadPilotList });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await table().insert({ email: email.trim().toLowerCase(), name: name.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmail("");
      setName("");
      qc.invalidateQueries({ queryKey: ["admin", "pilot-allowlist"] });
    },
  });
  const delMut = useMutation({
    mutationFn: async (targetEmail: string) => {
      const { error } = await table().delete().eq("email", targetEmail);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "pilot-allowlist"] }),
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Zugang</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Users className="h-5 w-5" /> Pilotphase – Zugangsliste
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nur E-Mail-Adressen auf dieser Liste können sich auf der öffentlichen Seite anmelden
          (Redaktions-/Adminkonten sind davon unabhängig immer zugelassen). Ziel: 10-15 Pilot-Kolleg:innen.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) addMut.mutate();
        }}
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row"
      >
        <Input
          type="email"
          placeholder="name@schule.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!email.trim() || addMut.isPending}>
          <Plus className="h-4 w-4" /> Freischalten
        </Button>
      </form>
      {addMut.error && <ErrorState error={addMut.error} />}

      {q.isLoading && <LoadingState />}
      {q.error && <ErrorState error={q.error} />}
      {q.data && q.data.length === 0 && (
        <EmptyState title="Noch niemand freigeschaltet" description="Trage die erste Pilot-Kollegin/den ersten Pilot-Kollegen ein." />
      )}

      {q.data && q.data.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">E-Mail</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Freigeschaltet am</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {q.data.map((p) => (
                <tr key={p.email} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{p.email}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.name ?? "–"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(p.added_at).toLocaleDateString("de-DE")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Zugang für „${p.email}" entziehen?`)) delMut.mutate(p.email);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Zugang entziehen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {q.data.length} von 10-15 geplanten Pilot-Plätzen belegt.
          </p>
        </div>
      )}
    </div>
  );
}
