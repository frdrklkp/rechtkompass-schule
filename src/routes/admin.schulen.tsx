// Betreiber-Sicht auf die Mandanten (Mandantenkonzept Stufe 3, 05.10.2026):
// Schulen anlegen, Status setzen, erste Schul-Admin einladen, Mitglieder je
// Schule einsehen. Ersetzt perspektivisch die Pilotlisten-Seite.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/schulen")({
  component: SchulenAdmin,
});

interface SchoolRow {
  id: string;
  name: string;
  short_name: string | null;
  city: string | null;
  status: "active" | "paused" | "left";
  email_domains: string[];
  contract_ref: string | null;
  monthly_budget_usd: number;
  joined_at: string | null;
  members_active: number;
  school_admins: number;
  invitations_open: number;
}

interface Member {
  user_id: string;
  email: string | null;
  display_name: string | null;
  school_role: string;
  status: string;
  last_sign_in_at: string | null;
}

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
};

async function loadSchools(): Promise<SchoolRow[]> {
  const { data, error } = await db.rpc("school_overview");
  if (error) throw new Error(error.message);
  return (data ?? []) as SchoolRow[];
}

async function inviteAdmin(schoolId: string, email: string): Promise<{ mailSent: boolean }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Bitte erneut anmelden.");
  const res = await fetch("/api/school-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, schoolId, schoolRole: "schul_admin", note: "Erste Schul-Admin (Betreiber)" }),
  });
  const payload = (await res.json()) as { ok?: boolean; error?: string; mailSent?: boolean };
  if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Einladung fehlgeschlagen.");
  return { mailSent: payload.mailSent === true };
}

const STATUS_LABEL: Record<SchoolRow["status"], string> = { active: "aktiv", paused: "pausiert", left: "ausgetreten" };

function SchulenAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "schools"], queryFn: loadSchools });
  const [form, setForm] = useState({ name: "", short_name: "", city: "", domains: "", contract_ref: "", budget: "10" });
  const [adminEmail, setAdminEmail] = useState<Record<string, string>>({});
  const [openMembers, setOpenMembers] = useState<string | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "schools"] });

  const createMut = useMutation({
    mutationFn: async () => {
      const domains = form.domains.split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
      const { error } = await db.from("schools").insert({
        name: form.name.trim(),
        short_name: form.short_name.trim() || null,
        city: form.city.trim() || null,
        status: "active",
        email_domains: domains,
        contract_ref: form.contract_ref.trim() || null,
        monthly_budget_usd: Number(form.budget) || 10,
        joined_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setForm({ name: "", short_name: "", city: "", domains: "", contract_ref: "", budget: "10" }); refresh(); toast.success("Schule angelegt."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Anlegen fehlgeschlagen."),
  });
  const statusMut = useMutation({
    mutationFn: async (args: { id: string; status: SchoolRow["status"] }) => {
      const patch: Record<string, unknown> = { status: args.status, updated_at: new Date().toISOString() };
      if (args.status === "left") patch.left_at = new Date().toISOString();
      const { error } = await db.from("schools").update(patch).eq("id", args.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(); toast.success("Status geändert."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Statuswechsel fehlgeschlagen."),
  });
  const inviteMut = useMutation({
    mutationFn: (args: { id: string; email: string }) => inviteAdmin(args.id, args.email.trim().toLowerCase()),
    onSuccess: (r, args) => {
      setAdminEmail((s) => ({ ...s, [args.id]: "" }));
      refresh();
      toast[r.mailSent ? "success" : "warning"](r.mailSent ? "Schul-Admin eingeladen, E-Mail verschickt." : "Einladung angelegt, E-Mail konnte nicht verschickt werden.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Einladung fehlgeschlagen."),
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mandanten</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Building2 className="h-5 w-5" /> Schulen
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Jede Schule ist ein eigener Mandant. Der Betreiber legt sie an und lädt die erste Schul-Admin ein; danach verwaltet
          die Schule ihre Mitglieder selbst unter <code className="text-xs">/schule</code>. Erst nach Vertrag und
          Auftragsverarbeitungsvertrag auf „aktiv" setzen.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) createMut.mutate(); }}
        className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-3"
      >
        <Input placeholder="Name der Schule *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="sm:col-span-2" />
        <Input placeholder="Kurzname (eindeutig)" value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} />
        <Input placeholder="Ort" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <Input placeholder="E-Mail-Domains, kommagetrennt (z. B. bk-musterstadt.de)" value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} className="sm:col-span-2" />
        <Input placeholder="Vertragsreferenz" value={form.contract_ref} onChange={(e) => setForm({ ...form, contract_ref: e.target.value })} className="sm:col-span-2" />
        <Input type="number" min={0} step={1} placeholder="Monatsbudget USD" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        <div className="sm:col-span-3">
          <Button type="submit" disabled={!form.name.trim() || createMut.isPending}><Plus className="h-4 w-4" /> Schule anlegen</Button>
        </div>
      </form>

      {q.isLoading && <LoadingState />}
      {q.error && <ErrorState error={q.error} />}
      {q.data && q.data.length === 0 && <EmptyState title="Noch keine Schule" description="Lege die erste Schule an." />}

      {q.data && q.data.length > 0 && (
        <ul className="space-y-3">
          {q.data.map((s) => (
            <li key={s.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{s.name} {s.short_name ? <span className="text-muted-foreground">({s.short_name})</span> : null}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.city ?? "–"} · Domains: {s.email_domains.length ? s.email_domains.join(", ") : "keine"} · Vertrag: {s.contract_ref ?? "–"} · Budget {s.monthly_budget_usd} $/Monat
                    {s.joined_at ? ` · seit ${new Date(s.joined_at).toLocaleDateString("de-DE")}` : ""}
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="font-medium">{s.members_active}</span> aktive Mitglieder · <span className="font-medium">{s.school_admins}</span> Schul-Admin{s.school_admins === 1 ? "" : "s"} · <span className="font-medium">{s.invitations_open}</span> offene Einladungen
                  </p>
                </div>
                <select
                  value={s.status}
                  onChange={(e) => { const st = e.target.value as SchoolRow["status"]; if (st !== s.status && confirm(`Status auf „${STATUS_LABEL[st]}" setzen?`)) statusMut.mutate({ id: s.id, status: st }); }}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                  aria-label="Status"
                >
                  <option value="active">aktiv</option>
                  <option value="paused">pausiert</option>
                  <option value="left">ausgetreten</option>
                </select>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); const v = adminEmail[s.id] ?? ""; if (v.trim()) inviteMut.mutate({ id: s.id, email: v }); }}
                className="mt-3 flex flex-col gap-2 sm:flex-row"
              >
                <Input type="email" placeholder="Schul-Admin per E-Mail einladen (Schulleitung oder Ansprechperson)" value={adminEmail[s.id] ?? ""} onChange={(e) => setAdminEmail((m) => ({ ...m, [s.id]: e.target.value }))} />
                <Button type="submit" variant="outline" disabled={!(adminEmail[s.id] ?? "").trim() || inviteMut.isPending || s.status !== "active"}><Mail className="h-4 w-4" /> Einladen</Button>
                <Button type="button" variant="ghost" onClick={() => setOpenMembers(openMembers === s.id ? null : s.id)}>
                  {openMembers === s.id ? "Mitglieder ausblenden" : "Mitglieder anzeigen"}
                </Button>
              </form>

              {openMembers === s.id && <MemberList schoolId={s.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberList({ schoolId }: { schoolId: string }) {
  const q = useQuery({
    queryKey: ["admin", "school-members", schoolId],
    queryFn: async () => {
      const { data, error } = await db.rpc("school_member_overview", { _school_id: schoolId });
      if (error) throw new Error(error.message);
      return (data ?? []) as Member[];
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const rows = (q.data ?? []).filter((m) => m.status === "aktiv");
  if (rows.length === 0) return <p className="mt-3 text-sm text-muted-foreground">Keine aktiven Mitglieder.</p>;
  return (
    <ul className="mt-3 divide-y divide-border rounded-lg border border-border text-sm">
      {rows.map((m) => (
        <li key={m.user_id} className="flex items-center gap-3 px-3 py-2">
          <span className="min-w-0 flex-1 truncate">{m.display_name || m.email || m.user_id}</span>
          <span className="text-xs text-muted-foreground">{m.school_role === "schul_admin" ? "Schul-Admin" : "Lehrkraft"}</span>
          <span className="text-xs text-muted-foreground">Login {m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleDateString("de-DE") : "noch nie"}</span>
        </li>
      ))}
    </ul>
  );
}
