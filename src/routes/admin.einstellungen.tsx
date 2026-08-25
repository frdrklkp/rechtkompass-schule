import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { signOut } from "@/lib/adminAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_PASSWORD_LENGTH = 8;

function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const changeMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      setPassword("");
      setConfirm("");
    },
  });

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && password === confirm;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) changeMut.mutate();
      }}
      className="mt-3 space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Neues Passwort</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {tooShort && (
            <p className="text-xs text-muted-foreground">Mindestens {MIN_PASSWORD_LENGTH} Zeichen.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Passwort bestätigen</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {mismatch && <p className="text-xs text-destructive">Stimmt nicht überein.</p>}
        </div>
      </div>

      <Button type="submit" disabled={!canSubmit || changeMut.isPending}>
        {changeMut.isPending ? "Wird geändert…" : "Passwort ändern"}
      </Button>

      {changeMut.isSuccess && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          Passwort wurde geändert.
        </p>
      )}
      {changeMut.isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {changeMut.error instanceof Error ? changeMut.error.message : "Passwort konnte nicht geändert werden."}
        </p>
      )}
    </form>
  );
}

export const Route = createFileRoute("/admin/einstellungen")({
  component: () => (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">System</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Konfiguration des Core Builders.</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Organisation</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Schule</dt>
            <dd>Berufskolleg Olsberg (BKO)</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Instanz</dt>
            <dd>Pilotphase</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">App-Version</dt>
            <dd>0.9.0 (MVP)</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Datenquelle</dt>
            <dd>Statisch (Supabase folgt)</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Redaktion</h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Freigabeprozess aktivieren</span>
            <span className="text-xs text-muted-foreground">demnächst</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Versionierung von Praxisfällen</span>
            <span className="text-xs text-muted-foreground">demnächst</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Benachrichtigungen bei Änderungen</span>
            <span className="text-xs text-muted-foreground">demnächst</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Sicherheit</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Die Anmeldung erfolgt über dein persönliches Redaktionskonto (E-Mail + Passwort).
        </p>
        <ChangePasswordForm />
        <div className="mt-4 border-t border-border pt-4">
          <Button variant="outline" onClick={signOut}>
            Abmelden
          </Button>
        </div>
      </section>
    </div>
  ),
});
