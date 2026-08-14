import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  ArrowRight,
  ShieldCheck,
  Compass,
  Info,
  UserCog,
  Sparkles,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { Disclaimer } from "../components/Disclaimer";
import { usePublishedCases } from "../lib/casesFromDb";
import { useProfile } from "../lib/profile";
import {
  confidenceLabelText,
  searchPublishedPracticeCases,
  type SearchResult,
  type IntelligentSearchResponse,
} from "../lib/intelligentSearch";
import { searchPracticeCasesHybrid, type HybridSearchResponse } from "../lib/hybridSearch";
import { useQuery } from "@tanstack/react-query";
import type { CaseData } from "../data/cases";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RechtKompass Schule – Schulrechtliche Fragen schnell beantwortet" },
      {
        name: "description",
        content:
          "Beschreiben Sie eine Situation aus dem Schulalltag und erhalten Sie sofort Orientierung, Handlungsschritte und rechtliche Quellen.",
      },
    ],
  }),
  component: Home,
});

const EXAMPLE_PROMPTS = [
  "Ein Schüler filmt mich heimlich im Unterricht.",
  "Darf ich ein Handy einziehen?",
  "Ein Schüler fehlt ständig und die Eltern reagieren nicht.",
  "Darf ich wegen Spickens eine Sechs geben?",
  "Ein Kollege erzählt vertrauliche Infos über einen Schüler weiter.",
];

const QUICK_TOPICS: Array<{ label: string; cat: string; emoji: string }> = [
  { label: "Unterricht & Verhalten", cat: "Unterricht", emoji: "📘" },
  { label: "Prüfungen & Noten", cat: "Prüfungen", emoji: "🎓" },
  { label: "Aufsicht & Sicherheit", cat: "Aufsicht", emoji: "🛡️" },
  { label: "Datenschutz", cat: "Datenschutz", emoji: "🔒" },
  { label: "Eltern", cat: "Eltern und Kommunikation", emoji: "👥" },
  { label: "Dienstrecht & Kollegium", cat: "Dienstrecht", emoji: "👩‍🏫" },
];

function ampelDot(a: string) {
  return a === "gruen" ? "bg-success" : a === "gelb" ? "bg-warning" : "bg-danger";
}

function ResultCard({ result, primary }: { result: SearchResult; primary?: boolean }) {
  const c = result.case;
  const label = confidenceLabelText(result.confidenceLabel);
  const top3 = (c.checklist ?? []).slice(0, 3);
  return (
    <Link
      to="/fall/$id"
      params={{ id: c.id }}
      className={`group block rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] ${
        primary
          ? "border-accent/60 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent"
          : "border-border bg-card hover:border-accent/60"
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium">
        <span className={`h-2 w-2 rounded-full ${ampelDot(c.ampel)}`} />
        <span className="text-muted-foreground">{c.category}{c.subcategory ? ` · ${c.subcategory}` : ""}</span>
        <span className="ml-auto rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          {label}
        </span>
      </div>
      <h3 className="mt-1 text-sm font-semibold text-foreground sm:text-base">{c.title}</h3>
      {primary && result.matchReasons[0] ? (
        <p className="mt-1 text-[11px] text-accent/90">Warum dieser Fall: {result.matchReasons[0]}</p>
      ) : null}
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground sm:text-sm">
        {c.shortAnswer || c.shortDescription}
      </p>
      {primary && top3.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {top3.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-foreground/90">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent">
        {primary ? "Praxisfall vollständig öffnen" : "Fall öffnen"}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function Home() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { profile } = useProfile();
  const { data: dbCases, isLoading } = usePublishedCases();

  const cases: CaseData[] = useMemo(() => dbCases ?? [], [dbCases]);

  const { data: hybridData } = useQuery<HybridSearchResponse | IntelligentSearchResponse>({
    queryKey: ["hybrid-search", submitted, cases.length],
    enabled: submitted.length > 0 && cases.length > 0,
    staleTime: 30_000,
    queryFn: () => searchPracticeCasesHybrid(submitted, cases, { limit: 5 }),
  });

  const response = useMemo<HybridSearchResponse | IntelligentSearchResponse>(
    () => hybridData ?? searchPublishedPracticeCases(submitted, cases, { limit: 5 }),
    [hybridData, submitted, cases],
  );

  const doSearch = (text?: string) => {
    const v = (text ?? q).trim();
    setQ(v);
    setSubmitted(v);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-28 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-accent">
          <ShieldCheck className="h-4 w-4" />
          <span>RechtKompass Schule</span>
        </div>
        <button
          onClick={() => window.dispatchEvent(new Event("rk-open-onboarding"))}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-accent hover:text-accent"
        >
          <UserCog className="h-3.5 w-3.5" />
          {profile ? profile.funktion : "Profil"}
        </button>
      </div>

      {/* Hero */}
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Was ist passiert – oder welche rechtliche Frage hast du?
      </h1>
      <p className="mt-2 text-sm text-muted-foreground sm:text-base">
        Situation in eigenen Worten beschreiben. Die Plattform findet den passenden
        Praxisfall – mit Handlungsschritten und Rechtsgrundlagen.
      </p>

      {/* Suche */}
      <div className="mt-5 rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-card)] focus-within:border-accent">
        <label className="flex items-center gap-3 rounded-xl px-3 py-3">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ein Schüler filmt mich im Unterricht …"
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch();
            }}
          />
        </label>
      </div>

      <button
        onClick={() => doSearch()}
        disabled={!q.trim() || isLoading}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition-all hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        <Sparkles className="h-4 w-4" />
        Orientierung finden
        <ArrowRight className="h-4 w-4" />
      </button>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Bitte keine vollständigen Namen oder unnötige personenbezogene Daten von Schüler:innen eingeben.
      </p>

      {/* Schnellzugriffe */}
      <div className="mt-5 flex flex-wrap gap-2">
        {QUICK_TOPICS.map((t) => (
          <Link
            key={t.cat}
            to="/faelle"
            search={{ cat: t.cat }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 hover:border-accent hover:text-accent"
          >
            <span aria-hidden>{t.emoji}</span>
            {t.label}
          </Link>
        ))}
      </div>

      {/* Beispiele */}
      {!submitted && (
        <div className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Beispiele
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex}
                onClick={() => doSearch(ex)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-accent hover:text-accent"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ergebnisse */}
      {submitted && (
        <section className="mt-8" aria-live="polite">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          ) : response.clarificationNeeded && response.clarificationQuestions.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <HelpCircle className="h-4 w-4 text-accent" />
                Bitte präzisiere deine Frage
              </div>
              {response.clarificationQuestions.map((q) => (
                <div key={q.key} className="mt-3">
                  <p className="text-xs text-muted-foreground">{q.question}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <button
                        key={o.label}
                        onClick={() => {
                          if (o.value) {
                            navigate({ to: "/faelle", search: { cat: o.value } });
                          } else {
                            doSearch(`${submitted} ${o.label}`);
                          }
                        }}
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {response.bestMatch && (
                <p className="mt-4 text-[11px] text-muted-foreground">
                  Aktuell bestes gefundenes Ergebnis:{" "}
                  <Link
                    to="/fall/$id"
                    params={{ id: response.bestMatch.case.id }}
                    className="text-accent hover:underline"
                  >
                    {response.bestMatch.case.title}
                  </Link>
                </p>
              )}
            </div>
          ) : response.results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm">
              <p className="font-semibold text-foreground">
                Zu deiner Frage haben wir aktuell noch keinen ausreichend passenden Praxisfall.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Versuche eine andere Formulierung – oder stöbere in den Themenbereichen.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setSubmitted("")}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
                >
                  Frage anders formulieren
                </button>
                <Link
                  to="/faelle"
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
                >
                  Themen durchsuchen
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Das passt am ehesten zu deiner Situation
                </p>
                <ResultCard result={response.results[0]} primary />
              </div>

              {response.alternatives.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Das könnte ebenfalls relevant sein
                  </p>
                  <ul className="space-y-2">
                    {response.alternatives.map((r) => (
                      <li key={r.case.id}>
                        <ResultCard result={r} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <button
                  onClick={() => setSubmitted("")}
                  className="rounded-full border border-border bg-card px-3 py-1 hover:border-accent hover:text-accent"
                >
                  Frage präzisieren
                </button>
                {response.detectedTopics.length > 0 && (
                  <span>
                    Erkannte Themen: {response.detectedTopics.join(", ")}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Einen Fall klären – primärer Einstieg in die Fallbearbeitung.
          Sprint 4.6J.2: ersetzt die zwei zuvor gleichrangigen Karten
          (Entscheidungsnavigator/Entscheidungsassistent). Die Suche oben
          bleibt der Einstieg fürs NACHSCHLAGEN; diese Karte ist der eine
          Einstieg fürs BEARBEITEN eines konkreten Falls. Bewusst nur ein
          CTA-Button und kein zweites Freitextfeld neben der Suche. */}
      <section
        aria-labelledby="fall-klaeren-heading"
        className="mt-8 rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent p-5"
      >
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground shadow-lg">
            <Compass className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="fall-klaeren-heading" className="text-base font-semibold text-foreground">
              Einen Fall klären
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Schildern Sie die Situation in eigenen Worten. RechtKompass stellt gezielte
              Rückfragen und führt Sie anschließend Schritt für Schritt durch Bewertung,
              Maßnahmen, Rechtsgrundlagen und Dokumentation.
            </p>
            <Link
              to="/assistent"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90"
            >
              Fall schildern <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              Ohne freie Schilderung arbeiten?{" "}
              <Link
                to="/navigator"
                className="font-medium underline underline-offset-2 hover:text-accent"
              >
                Fall direkt strukturiert erfassen
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="mt-8 rounded-2xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          Grundlage dieser Orientierung
        </p>
        <p className="mt-2 text-sm text-foreground/90">
          {cases.length > 0
            ? `${cases.length} redaktionell geprüfte Praxisfälle mit Wissenskarten, Rechtsgrundlagen und Dokumentvorlagen.`
            : "Redaktionell geprüfte Praxisfälle mit Wissenskarten und Rechtsgrundlagen."}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Maßgeblich bleiben die offiziellen Rechtsquellen.
        </p>
      </section>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p>
          <strong>RechtKompass Schule</strong> bietet Orientierung – ersetzt aber keine
          individuelle Rechtsberatung und keine Entscheidung der Schulleitung.
        </p>
      </div>

      <Disclaimer />
    </div>
  );
}
