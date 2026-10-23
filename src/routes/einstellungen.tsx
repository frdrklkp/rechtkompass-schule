import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Moon, Sun, Type, Shield, FileText, Info, Users, Download, Trash2, Loader2 } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/einstellungen")({
  head: () => ({
    meta: [
      { title: "Einstellungen – RechtKompass Schule" },
      { name: "description", content: "Darstellung, Datenschutz und Impressum." },
    ],
  }),
  component: SettingsPage,
});

const APP_VERSION = "0.1.0 – MVP";

function SettingsPage() {
  const [dark, setDark] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  // Mandantenkonzept Stufe 3: Schul-Admins sehen den Einstieg in die Schulverwaltung.
  const schoolAdmin = useQuery({
    queryKey: ["school", "is-admin"],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc("is_school_admin");
      if (error) return false;
      return data === true;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const savedDark = localStorage.getItem("rk-dark") === "1";
    const savedScale = Number(localStorage.getItem("rk-fontscale") || "1");
    setDark(savedDark);
    setFontScale(savedScale || 1);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("rk-dark", dark ? "1" : "0");
  }, [dark]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-scale", String(fontScale));
    localStorage.setItem("rk-fontscale", String(fontScale));
  }, [fontScale]);

  return (
    <PageShell title="Einstellungen" subtitle="Darstellung, Datenschutz und Impressum.">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Darstellung</h2>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {dark ? (
              <Moon className="h-4 w-4 text-accent" />
            ) : (
              <Sun className="h-4 w-4 text-accent" />
            )}
            <div>
              <p className="text-sm font-medium">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Dunkles Farbschema aktivieren.</p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={dark}
            onClick={() => setDark((d) => !d)}
            data-on={dark}
            className="relative h-6 w-11 shrink-0 rounded-full bg-muted transition-colors data-[on=true]:bg-accent"
          >
            <span
              className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform"
              style={{ transform: dark ? "translateX(20px)" : "translateX(0)" }}
            />
          </button>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center gap-3">
            <Type className="h-4 w-4 text-accent" />
            <p className="text-sm font-medium">Schriftgröße</p>
            <span className="ml-auto text-xs text-muted-foreground">
              {Math.round(fontScale * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.85}
            max={1.25}
            step={0.05}
            value={fontScale}
            onChange={(e) => setFontScale(Number(e.target.value))}
            className="w-full accent-[color:var(--accent)]"
          />
        </div>
      </section>

      {schoolAdmin.data === true && (
        <Link to="/schule" className="mt-4 block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:bg-muted/50">
          <InfoRow icon={Users} title="Schulverwaltung" text="Mitglieder Ihrer Schule einladen und verwalten – ohne Einblick in Inhalte." />
        </Link>
      )}

      <MyDataSection />

      <section className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        <Link to="/datenschutz" className="block transition-colors hover:bg-muted/50">
          <InfoRow
            icon={Shield}
            title="Datenschutz"
            text="Welche Daten verarbeitet werden, wie lange, und welche Rechte Sie haben. Darstellungseinstellungen bleiben nur in Ihrem Browser."
          />
        </Link>
        <Link to="/impressum" className="block transition-colors hover:bg-muted/50">
          <InfoRow icon={FileText} title="Impressum" text="Anbieterkennzeichnung und Hinweis zur Rechtsberatung." />
        </Link>
        <InfoRow icon={Info} title="App-Version" text={APP_VERSION} />
      </section>

      <a
        href="/admin"
        className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-sm transition-colors hover:bg-muted/50"
      >
        <div>
          <p className="font-medium">Core Builder</p>
          <p className="text-xs text-muted-foreground">Redaktionsbereich (nur für Admins & Redakteure)</p>
        </div>
        <span className="text-xs text-primary">öffnen →</span>
      </a>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Diese Informationen dienen der Orientierung und ersetzen keine individuelle
        Rechtsberatung.
      </p>
    </PageShell>
  );
}

function InfoRow({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 p-5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

// DSGVO-Audit 01.10.2026, Punkt 6 (umgesetzt 23.10.2026): Auskunft und
// Löschung zur Selbstbedienung über /api/my-data.
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function MyDataSection() {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  if (!email) return null;

  const doExport = async () => {
    setErr(null);
    setBusy("export");
    try {
      const res = await fetch("/api/my-data", { headers: await authHeader() });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Export fehlgeschlagen.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rechtkompass-meine-daten-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async () => {
    setErr(null);
    setBusy("delete");
    try {
      const res = await fetch("/api/my-data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ confirm }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Löschung fehlgeschlagen.");
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith("rk-") || k.startsWith("sb-")) localStorage.removeItem(k);
        sessionStorage.clear();
      } catch { /* Speicher gesperrt */ }
      await supabase.auth.signOut().catch(() => undefined);
      window.location.href = "/";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Löschung fehlgeschlagen.");
      setBusy(null);
    }
  };

  const confirmed = confirm.trim().toLowerCase() === email.toLowerCase();

  return (
    <section aria-labelledby="meine-daten" className="mt-4 rounded-2xl border border-border bg-card p-5">
      <h2 id="meine-daten" className="text-sm font-semibold text-foreground">Meine Daten</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Angemeldet als <span className="font-medium text-foreground">{email}</span>. Sie können alle Daten, die Ihrem
        Konto zugeordnet sind, jederzeit herunterladen oder Ihr Konto samt dieser Daten löschen (Art. 15, 17 und 20 DSGVO).
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={doExport}
          disabled={busy !== null}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
          Meine Daten herunterladen
        </button>
        {!askDelete && (
          <button
            type="button"
            onClick={() => { setAskDelete(true); setErr(null); }}
            disabled={busy !== null}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-destructive/40 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Konto löschen
          </button>
        )}
      </div>

      {askDelete && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-foreground">Konto endgültig löschen?</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
            <li>Gelöscht werden Ihr Konto, Copilot-Gespräche, Vorgänge mit Notizen und Dokumenten, Fallakten, Favoriten und Umfrageantworten.</li>
            <li>Ihre Fehlermeldungen und Aufträge für neue Fälle bleiben für die Redaktion ohne Bezug zu Ihnen erhalten; Ihre Schilderungen werden entfernt.</li>
            <li>Ihre Freischaltung für die Pilotphase endet. Das lässt sich nicht rückgängig machen – laden Sie Ihre Daten vorher herunter, wenn Sie sie behalten möchten.</li>
          </ul>
          <label htmlFor="delete-confirm" className="mt-3 block text-xs font-medium text-foreground">
            Zur Bestätigung Ihre E-Mail-Adresse eingeben
          </label>
          <input
            id="delete-confirm"
            type="email"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-destructive"
            placeholder={email}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={doDelete}
              disabled={!confirmed || busy !== null}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Konto und Daten löschen
            </button>
            <button
              type="button"
              onClick={() => { setAskDelete(false); setConfirm(""); }}
              disabled={busy !== null}
              className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {err && <p role="alert" className="mt-3 text-xs text-destructive">{err}</p>}
    </section>
  );
}
