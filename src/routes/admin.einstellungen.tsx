import { createFileRoute } from "@tanstack/react-router";
import { signOut } from "@/lib/adminAuth";
import { Button } from "@/components/ui/button";

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
          Die Anmeldung erfolgt derzeit über ein gemeinsames Redaktionspasswort. Mit Anbindung an Lovable Cloud werden
          individuelle Benutzerkonten und Rollen (Admin, Redakteur, Leser) eingeführt.
        </p>
        <div className="mt-3">
          <Button variant="outline" onClick={signOut}>
            Abmelden
          </Button>
        </div>
      </section>
    </div>
  ),
});
