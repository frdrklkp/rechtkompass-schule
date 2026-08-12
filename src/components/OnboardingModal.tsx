import { useEffect, useState } from "react";
import { Compass, GraduationCap, UserCog, X } from "lucide-react";
import { BILDUNGSGAENGE, FUNKTIONEN, useProfile, type Funktion } from "@/lib/profile";

export function OnboardingModal() {
  const { profile, ready, setProfile } = useProfile();
  const [manualOpen, setManualOpen] = useState(false);
  const [funktion, setFunktion] = useState<Funktion>("Fachlehrkraft");
  const [bg, setBg] = useState<string>(BILDUNGSGAENGE[0]);

  useEffect(() => {
    if (profile) {
      setFunktion(profile.funktion);
      setBg(profile.bildungsgang);
    }
  }, [profile]);

  useEffect(() => {
    const handler = () => setManualOpen(true);
    window.addEventListener("rk-open-onboarding", handler);
    return () => window.removeEventListener("rk-open-onboarding", handler);
  }, []);

  if (!ready) return null;
  const open = manualOpen || !profile;
  if (!open) return null;

  const submit = () => {
    setProfile({ funktion, bildungsgang: bg, createdAt: new Date().toISOString() });
    setManualOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg animate-in slide-in-from-bottom-4 rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Willkommen am BKO</h2>
              <p className="text-xs text-muted-foreground">
                Kurze Einrichtung – personalisiert Ihre Empfehlungen.
              </p>
            </div>
          </div>
          {profile && (
            <button
              onClick={() => setManualOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Schließen"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <UserCog className="h-3.5 w-3.5" /> Funktion
            </span>
            <select
              value={funktion}
              onChange={(e) => setFunktion(e.target.value as Funktion)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              {FUNKTIONEN.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" /> Bildungsgang am BKO
            </span>
            <select
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              {BILDUNGSGAENGE.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
          Diese Angaben werden ausschließlich lokal in Ihrem Browser gespeichert und passen Fallvorschläge, Suchergebnisse und Zuständigkeiten an.
        </div>

        <button
          onClick={submit}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          {profile ? "Änderungen speichern" : "RechtKompass starten"}
        </button>
      </div>
    </div>
  );
}
