import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Moon, Sun, Type, Shield, FileText, Info } from "lucide-react";
import { PageShell } from "../components/PageShell";

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

      <section className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        <InfoRow
          icon={Shield}
          title="Datenschutz"
          text="RechtKompass Schule speichert keine personenbezogenen Daten. Einstellungen werden lokal im Browser gespeichert."
        />
        <InfoRow
          icon={FileText}
          title="Impressum"
          text="Prototyp im Rahmen des MVP. Anbieterinformationen werden vor Veröffentlichung ergänzt."
        />
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
