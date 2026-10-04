// Kurz-Umfrage für die Pilotphase (Nutzer-Auftrag 29.09.2026): maximal
// 2 Minuten, 4 Klickfragen + 2 optionale Freitexte. Eine Antwort pro
// Person - erneutes Absenden aktualisiert die eigene Antwort (Upsert auf
// user_id). Tabelle + RLS: db/2026-09-29_pilot_survey.sql.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "../components/PageShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/umfrage")({
  head: () => ({
    meta: [
      { title: "Pilot-Umfrage – RechtKompass Schule" },
      {
        name: "description",
        content: "Kurze Rückmeldung zur Pilotphase von RechtKompass Schule – dauert unter 2 Minuten.",
      },
    ],
  }),
  component: UmfragePage,
});

const NUTZUNG = [
  { value: "mehrmals_woche", label: "Mehrmals pro Woche" },
  { value: "woechentlich", label: "Etwa wöchentlich" },
  { value: "selten", label: "Selten" },
  { value: "noch_nicht", label: "Noch gar nicht" },
] as const;

const FUNKTIONEN = [
  { value: "fallsuche", label: "Fallsuche / Praxisfälle" },
  { value: "entscheidungsassistent", label: "Entscheidungsassistent" },
  { value: "dokumente", label: "Dokumente & Vorlagen" },
  { value: "pdf_export", label: "PDF-Export" },
  { value: "rueckfragen_copilot", label: "Rückfragen-Copilot" },
  { value: "noch_keine", label: "Noch keine" },
] as const;

const EMPFEHLUNG = [
  { value: "ja", label: "Ja" },
  { value: "eher_ja", label: "Eher ja" },
  { value: "eher_nein", label: "Eher nein" },
  { value: "nein", label: "Nein" },
] as const;

interface SurveyDraft {
  nutzung: string | null;
  hilfreich: number | null;
  top_funktion: string | null;
  empfehlung: string | null;
  fehlendes_thema: string;
  verbesserung: string;
}

const EMPTY: SurveyDraft = {
  nutzung: null,
  hilfreich: null,
  top_funktion: null,
  empfehlung: null,
  fehlendes_thema: "",
  verbesserung: "",
};

function UmfragePage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SurveyDraft>(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  // Bereits abgegebene Antwort vorbefüllen (Upsert-Modell).
  const existing = useQuery({
    queryKey: ["pilot-survey-own"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("pilot_survey_responses")
        .select("nutzung, hilfreich, top_funktion, empfehlung, fehlendes_thema, verbesserung")
        .maybeSingle();
      return (data ?? null) as (Omit<SurveyDraft, "fehlendes_thema" | "verbesserung"> & {
        fehlendes_thema: string | null;
        verbesserung: string | null;
      }) | null;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (existing.data) {
      setDraft({
        nutzung: existing.data.nutzung,
        hilfreich: existing.data.hilfreich,
        top_funktion: existing.data.top_funktion,
        empfehlung: existing.data.empfehlung,
        fehlendes_thema: existing.data.fehlendes_thema ?? "",
        verbesserung: existing.data.verbesserung ?? "",
      });
    }
  }, [existing.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error("Bitte melden Sie sich an.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("pilot_survey_responses").upsert(
        {
          user_id: userId,
          nutzung: draft.nutzung,
          hilfreich: draft.hilfreich,
          top_funktion: draft.top_funktion,
          empfehlung: draft.empfehlung,
          fehlendes_thema: draft.fehlendes_thema.trim() || null,
          verbesserung: draft.verbesserung.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setSubmitted(true);
      void qc.invalidateQueries({ queryKey: ["pilot-survey-own"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    },
  });

  const complete =
    draft.nutzung !== null && draft.hilfreich !== null && draft.top_funktion !== null && draft.empfehlung !== null;

  if (submitted) {
    return (
      <PageShell title="Danke für Ihre Rückmeldung!" subtitle="Das hilft uns, RechtKompass gezielt weiterzuentwickeln.">
        <div className="rounded-2xl border border-success/40 bg-success/5 p-5 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-success" /> Ihre Antwort ist gespeichert.
          </p>
          <p className="mt-1 text-muted-foreground">
            Sie können diese Seite jederzeit wieder öffnen und Ihre Antwort aktualisieren.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Kurze Rückmeldung zur Pilotphase"
      subtitle="4 Klicks, 2 optionale Textfelder – dauert unter 2 Minuten. Eine Antwort pro Person, nachträglich änderbar."
    >
      <div className="space-y-6">
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Hinweis zum Datenschutz: Ihre Antwort wird Ihrem Konto zugeordnet gespeichert (damit Sie sie später ändern können) und ausschließlich von der Projektleitung zur Weiterentwicklung der Pilotphase ausgewertet. Bitte in den Freitextfeldern keine Namen oder personenbezogenen Angaben zu Dritten nennen.
        </p>
        <Frage titel="1. Wie oft haben Sie RechtKompass in den letzten Wochen genutzt?">
          <OptionRow options={NUTZUNG} value={draft.nutzung} onChange={(v) => setDraft((d) => ({ ...d, nutzung: v }))} />
        </Frage>

        <Frage titel="2. Wie hilfreich waren die Inhalte für Ihren Schulalltag?">
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, hilfreich: n }))}
                className={`h-10 w-10 rounded-full border text-sm font-semibold transition-colors ${
                  draft.hilfreich === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                }`}
                aria-label={`${n} von 5`}
              >
                {n}
              </button>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">1 = gar nicht · 5 = sehr hilfreich</span>
          </div>
        </Frage>

        <Frage titel="3. Welche Funktion nutzen Sie am häufigsten?">
          <OptionRow
            options={FUNKTIONEN}
            value={draft.top_funktion}
            onChange={(v) => setDraft((d) => ({ ...d, top_funktion: v }))}
          />
        </Frage>

        <Frage titel="4. Würden Sie RechtKompass Kolleginnen und Kollegen empfehlen?">
          <OptionRow
            options={EMPFEHLUNG}
            value={draft.empfehlung}
            onChange={(v) => setDraft((d) => ({ ...d, empfehlung: v }))}
          />
        </Frage>

        <Frage titel="5. Fehlt Ihnen ein Thema oder ein Praxisfall? (optional)">
          <Textarea
            value={draft.fehlendes_thema}
            onChange={(e) => setDraft((d) => ({ ...d, fehlendes_thema: e.target.value }))}
            placeholder="z. B. ein konkreter Fall aus Ihrem Alltag, der noch nicht abgebildet ist…"
            rows={2}
            className="text-sm"
          />
        </Frage>

        <Frage titel="6. Was sollten wir als Nächstes verbessern? (optional)">
          <Textarea
            value={draft.verbesserung}
            onChange={(e) => setDraft((d) => ({ ...d, verbesserung: e.target.value }))}
            placeholder="Ihre Anregung in einem Satz…"
            rows={2}
            className="text-sm"
          />
        </Frage>

        <div className="flex items-center gap-3">
          <Button disabled={!complete || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Antwort absenden
          </Button>
          {!complete && <span className="text-xs text-muted-foreground">Bitte die Fragen 1–4 beantworten.</span>}
        </div>
      </div>
    </PageShell>
  );
}

function Frage({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground">{titel}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function OptionRow({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
            value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:border-primary/50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
