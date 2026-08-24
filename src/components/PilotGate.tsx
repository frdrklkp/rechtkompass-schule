// Pilotphasen-Zugangsschranke für die öffentliche (Lehrkräfte-)Seite.
// Admin-/Redaktionsbereich (/admin/**) hat eine eigene, unabhängige
// Anmeldung (siehe src/routes/admin.tsx) und läuft NICHT durch dieses Gate.
//
// Ablauf: Anmeldung über den bereits vorhandenen Magic-Link-Flow für
// Lehrkräfte (signInWithMagicLink, Sprint 4.6K) - NEU ist ausschließlich die
// Prüfung gegen die Pilotliste (public.is_pilot_approved()) nach dem Login.
import { type ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { signInWithMagicLink, signOut, useAuthSession } from "@/lib/adminAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function fetchPilotApproved(): Promise<boolean> {
  // is_pilot_approved() ist (wie has_role/current_app_role) noch nicht in
  // supabase/types.ts enthalten - bewusster Cast, analog adminAuth.ts.
  const client = supabase as unknown as {
    rpc: (fn: string) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("is_pilot_approved");
  if (error) {
    console.warn("[PilotGate] is_pilot_approved fehlgeschlagen:", error.message);
    return false;
  }
  return data === true;
}

function GateShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">RechtKompass Schule</h1>
            <p className="text-xs text-muted-foreground">Geschlossene Pilotphase</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
        <p className="text-sm text-foreground/90">
          Anmeldelink an <strong>{email}</strong> gesendet. Bitte E-Mail-Postfach prüfen und Link öffnen.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        const res = await signInWithMagicLink(email, `${window.location.origin}${window.location.pathname}`);
        setBusy(false);
        if (!res.ok) setErr(res.error ?? "Anmeldung fehlgeschlagen.");
        else setSent(true);
      }}
      className="space-y-4"
    >
      <p className="text-sm text-muted-foreground">
        RechtKompass befindet sich aktuell in einer geschlossenen Pilotphase. Eingeladene
        Kolleginnen und Kollegen melden sich hier mit ihrer dienstlichen E-Mail-Adresse an.
      </p>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">E-Mail</label>
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErr(null);
          }}
          placeholder="name@schule.de"
          autoFocus
          required
        />
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
        <Mail className="h-4 w-4" />
        {busy ? "Wird gesendet…" : "Anmeldelink anfordern"}
      </Button>
    </form>
  );
}

function NotApproved({ email }: { email: string | null }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm text-foreground/90">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>
          {email ? <>Das Konto <strong>{email}</strong> ist</> : "Dieses Konto ist"} noch nicht für die
          Pilotphase freigeschaltet. Bitte wende dich an die Schulleitung/Projektleitung, um
          aufgenommen zu werden.
        </p>
      </div>
      <Button variant="outline" className="w-full" onClick={() => void signOut()}>
        Abmelden
      </Button>
    </div>
  );
}

export function PilotGate({ children }: { children: ReactNode }) {
  const { ready, user } = useAuthSession();
  const approvedQuery = useQuery({
    queryKey: ["pilot-approved", user?.id ?? null],
    queryFn: fetchPilotApproved,
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  if (!ready || (user && approvedQuery.isLoading)) return null;

  if (!user) {
    return (
      <GateShell>
        <LoginForm />
      </GateShell>
    );
  }

  if (approvedQuery.data !== true) {
    return (
      <GateShell>
        <NotApproved email={user.email ?? null} />
      </GateShell>
    );
  }

  return <>{children}</>;
}
