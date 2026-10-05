// Schulverwaltung für Schul-Admins (Mandantenkonzept Stufe 3, 05.10.2026):
// Mitglieder der eigenen Schule sehen, einladen, entfernen, Rolle setzen;
// offene Einladungen widerrufen. Zeigt nie Inhalte (Gespräche, Vorgänge),
// nur Namen, Rolle, Status und letzten Login - Entscheidung "Berichte nur
// als Summen". Alle Schreibwege sind RPCs mit eigener Berechtigungsprüfung.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, ShieldCheck, Trash2, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "../components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/schule")({
  head: () => ({
    meta: [
      { title: "Schulverwaltung – RechtKompass Schule" },
      { name: "description", content: "Mitglieder und Einladungen Ihrer Schule verwalten." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SchulePage,
});

interface Member {
  user_id: string;
  email: string | null;
  display_name: string | null;
  school_role: "lehrkraft" | "schul_admin";
  status: string;
  member_since: string;
  last_sign_in_at: string | null;
}

interface Invitation {
  id: string;
  email: string;
  school_role: string;
  note: string | null;
  created_at: string;
  expires_at: string;
}

// school_* ist nicht in supabase/types.ts - bewusster Cast wie in admin.pilot.tsx.
const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
};

async function loadIsSchoolAdmin(): Promise<boolean> {
  const { data, error } = await db.rpc("is_school_admin");
  if (error) throw new Error(error.message);
  return data === true;
}

async function loadMembers(): Promise<Member[]> {
  const { data, error } = await db.rpc("school_member_overview");
  if (error) throw new Error(error.message);
  return (data ?? []) as Member[];
}

async function loadInvitations(): Promise<Invitation[]> {
  const { data, error } = await db
    .from("school_invitations")
    .select("id, email, school_role, note, created_at, expires_at")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Invitation[];
}

async function invite(email: string, note: string): Promise<{ mailSent: boolean; mailError: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Bitte melden Sie sich erneut an.");
  const res = await fetch("/api/school-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, note: note || undefined }),
  });
  const payload = (await res.json()) as { ok?: boolean; error?: string; mailSent?: boolean; mailError?: string | null };
  if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Einladung fehlgeschlagen.");
  return { mailSent: payload.mailSent === true, mailError: payload.mailError ?? null };
}

function formatDate(iso: string | null): string {
  if (!iso) return "noch nie";
  return new Date(iso).toLocaleDateString("de-DE");
}

function SchulePage() {
  const qc = useQueryClient();
  const admin = useQuery({ queryKey: ["school", "is-admin"], queryFn: loadIsSchoolAdmin, staleTime: 60_000 });
  const members = useQuery({ queryKey: ["school", "members"], queryFn: loadMembers, enabled: admin.data === true });
  const invitations = useQuery({ queryKey: ["school", "invitations"], queryFn: loadInvitations, enabled: admin.data === true });
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["school", "members"] });
    void qc.invalidateQueries({ queryKey: ["school", "invitations"] });
  };

  const inviteMut = useMutation({
    mutationFn: () => invite(email.trim().toLowerCase(), note.trim()),
    onSuccess: (r) => {
      setEmail("");
      setNote("");
      refresh();
      if (r.mailSent) toast.success("Einladung angelegt und per E-Mail verschickt.");
      else toast.warning("Einladung angelegt, aber die E-Mail konnte nicht verschickt werden. Bitte die Person direkt informieren.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Einladung fehlgeschlagen."),
  });
  const revokeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("revoke_school_invitation", { _id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(); toast.success("Einladung widerrufen."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Widerruf fehlgeschlagen."),
  });
  const removeMut = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await db.rpc("remove_school_member", { _user_id: userId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(); toast.success("Mitglied entfernt. Der Zugang endet sofort."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Entfernen fehlgeschlagen."),
  });
  const roleMut = useMutation({
    mutationFn: async (args: { userId: string; role: "lehrkraft" | "schul_admin" }) => {
      const { error } = await db.rpc("set_school_member_role", { _user_id: args.userId, _role: args.role });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(); toast.success("Rolle geändert."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Rollenwechsel fehlgeschlagen."),
  });

  if (admin.isLoading) return <PageShell title="Schulverwaltung"><LoadingState /></PageShell>;
  if (admin.error) return <PageShell title="Schulverwaltung"><ErrorState error={admin.error} /></PageShell>;
  if (admin.data !== true) {
    return (
      <PageShell title="Schulverwaltung" subtitle="Nur für Schul-Admins.">
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Diese Seite steht der Schulleitung bzw. der benannten Ansprechperson Ihrer Schule zur Verfügung. Wenn Sie
          diese Rolle übernehmen sollen, wenden Sie sich an die Projektleitung.{" "}
          <Link to="/einstellungen" className="underline underline-offset-2">Zurück zu den Einstellungen</Link>
        </p>
      </PageShell>
    );
  }

  const active = (members.data ?? []).filter((m) => m.status === "aktiv");

  return (
    <PageShell
      title="Schulverwaltung"
      subtitle="Mitglieder einladen und verwalten. Sie sehen Namen, Rolle und letzten Login – keine Inhalte."
    >
      <div className="space-y-6">
        <form
          onSubmit={(e) => { e.preventDefault(); if (email.trim()) inviteMut.mutate(); }}
          className="rounded-2xl border border-border bg-card p-4"
        >
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4 text-accent" /> Kollegin oder Kollegen einladen</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="email" placeholder="dienstliche E-Mail-Adresse" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input placeholder="Notiz (optional, nur für Sie sichtbar)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button type="submit" disabled={!email.trim() || inviteMut.isPending}>Einladen</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Die Person erhält eine E-Mail mit dem Anmeldeweg und wird beim ersten Login Mitglied. Einladungen gelten 30 Tage.
          </p>
        </form>

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-accent" /> Mitglieder</p>
            <span className="text-xs text-muted-foreground">{active.length} aktiv</span>
          </div>
          {members.isLoading && <LoadingState />}
          {members.error && <ErrorState error={members.error} />}
          {members.data && active.length === 0 && <EmptyState title="Noch keine Mitglieder" description="Laden Sie die erste Kollegin oder den ersten Kollegen ein." />}
          {active.length > 0 && (
            <ul className="divide-y divide-border">
              {active.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.display_name || m.email || "–"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.display_name ? `${m.email ?? ""} · ` : ""}seit {formatDate(m.member_since)} · letzter Login {formatDate(m.last_sign_in_at)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${m.school_role === "schul_admin" ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
                    {m.school_role === "schul_admin" ? "Schul-Admin" : "Lehrkraft"}
                  </span>
                  <button
                    type="button"
                    onClick={() => roleMut.mutate({ userId: m.user_id, role: m.school_role === "schul_admin" ? "lehrkraft" : "schul_admin" })}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    title={m.school_role === "schul_admin" ? "Zur Lehrkraft machen" : "Zur Schul-Admin machen"}
                  >
                    <ShieldCheck className="inline h-3.5 w-3.5" /> {m.school_role === "schul_admin" ? "Rolle abgeben" : "Zum Schul-Admin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`${m.display_name || m.email} aus der Schule entfernen? Der Zugang endet sofort.`)) removeMut.mutate(m.user_id); }}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Mitglied entfernen"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Offene Einladungen</p>
            <span className="text-xs text-muted-foreground">{invitations.data?.length ?? 0}</span>
          </div>
          {invitations.isLoading && <LoadingState />}
          {invitations.error && <ErrorState error={invitations.error} />}
          {invitations.data && invitations.data.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Keine offenen Einladungen.</p>}
          {invitations.data && invitations.data.length > 0 && (
            <ul className="divide-y divide-border">
              {invitations.data.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      eingeladen am {formatDate(inv.created_at)} · gültig bis {formatDate(inv.expires_at)}{inv.note ? ` · ${inv.note}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Einladung für ${inv.email} widerrufen?`)) revokeMut.mutate(inv.id); }}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Einladung widerrufen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-muted-foreground">
          Entfernte Mitglieder verlieren den Zugang sofort; ihre Vorgänge und Dokumente bleiben als dienstliche Unterlagen bei der
          Schule. Copilot-Gespräche werden 90 Tage nach der letzten Aktivität gelöscht.
        </p>
      </div>
    </PageShell>
  );
}
