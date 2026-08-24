/**
 * Sprint 4.6K – Leichte Anmeldung per Anmeldelink für Lehrkräfte, die einen
 * neuen Praxisfall erstellen lassen möchten. Kein Passwort, kein Zugriff auf
 * den Redaktionsbereich - nur Voraussetzung für /api/case-generation-jobs
 * (Zuordnung "wer hat das angefragt" und Tageslimit pro Person).
 */
import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { signInWithMagicLink } from "@/lib/adminAuth";

export function AssistantEmailSignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState("sending");
    setError(null);
    const result = await signInWithMagicLink(email, window.location.href);
    if (result.ok) {
      setState("sent");
    } else {
      setState("error");
      setError(result.error ?? "Anmeldelink konnte nicht gesendet werden.");
    }
  };

  if (state === "sent") {
    return (
      <div className="mt-3 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        Anmeldelink an {email} gesendet. Bitte E-Mail-Postfach prüfen und den Link öffnen - Sie
        kehren danach automatisch hierher zurück.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-border bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">
        Um einen Praxisfall erstellen zu lassen, melden Sie sich kurz mit Ihrer dienstlichen
        E-Mail-Adresse an (kein Passwort nötig).
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@schule.nrw.de"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-xs"
          />
        </div>
        <button
          type="submit"
          disabled={state === "sending"}
          className="inline-flex items-center gap-1.5 rounded-xl border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-60"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {state === "sending" ? "Wird gesendet…" : "Anmeldelink senden"}
        </button>
      </div>
      {state === "error" && error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </form>
  );
}
