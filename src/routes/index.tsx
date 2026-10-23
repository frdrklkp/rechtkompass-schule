import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ArrowRight,
  ShieldCheck,
  Compass,
  Info,
  CheckCircle2,
  HelpCircle,
  BookOpen,
  GraduationCap,
  ShieldAlert,
  Lock,
  Users,
  Briefcase,
  Landmark,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { Disclaimer } from "../components/Disclaimer";
import { AssistantCaseGenerationOffer } from "@/components/assistant/AssistantCaseGenerationOffer";
import { usePublishedCases } from "../lib/casesFromDb";
import {
  confidenceLabelText,
  searchPublishedPracticeCases,
  type SearchResult,
  type IntelligentSearchResponse,
} from "../lib/intelligentSearch";
import { searchPracticeCasesHybrid, type HybridSearchResponse } from "../lib/hybridSearch";
import { useQuery } from "@tanstack/react-query";
import type { CaseData } from "../data/cases";
import { getChecklist } from "../lib/caseEnrichment";

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

const QUICK_TOPICS: Array<{ label: string; cat: string; icon: LucideIcon; hint: string }> = [
  { label: "Unterricht & Verhalten", cat: "Unterricht", icon: BookOpen, hint: "Ordnungsmaßnahmen, Störungen" },
  { label: "Prüfungen & Noten", cat: "Prüfungen", icon: GraduationCap, hint: "Leistung, Täuschung, APO-BK" },
  { label: "Aufsicht & Sicherheit", cat: "Aufsicht", icon: ShieldAlert, hint: "Aufsichtspflicht, Unfälle" },
  { label: "Datenschutz", cat: "Datenschutz", icon: Lock, hint: "Fotos, Daten, Weitergabe" },
  { label: "Eltern", cat: "Eltern und Kommunikation", icon: Users, hint: "Gespräche, Auskunft, Konflikte" },
  { label: "Dienstrecht & Kollegium", cat: "Dienstrecht", icon: Briefcase, hint: "Pflichten, Mehrarbeit, Haftung" },
];

function ampelDot(a: string) {
  return a === "gruen" ? "bg-success" : a === "gelb" ? "bg-warning" : "bg-danger";
}

function ResultCard({ result, primary }: { result: SearchResult; primary?: boolean }) {
  const c = result.case;
  const label = confidenceLabelText(result.confidenceLabel);
  const top3 = getChecklist(c).slice(0, 3);
  return (
    <Link
      to="/fall/$id"
      params={{ id: c.id }}
      className={`group block rounded-xl border bg-card p-5 transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-elevated)] ${
        primary
          ? "border-accent/40 shadow-[var(--shadow-card)] ring-1 ring-accent/15"
          : "border-border hover:border-accent/40"
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium">
        <span className={`h-2 w-2 rounded-full ${ampelDot(c.ampel)}`} />
        <span className="text-muted-foreground">{c.category}{c.subcategory ? ` · ${c.subcategory}` : ""}</span>
        <span className="ml-auto rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          {label}
        </span>
      </div>
      <h3 className={`mt-2 font-semibold leading-snug text-foreground ${primary ? "font-serif text-lg sm:text-xl" : "text-[15px]"}`}>{c.title}</h3>
      {primary && result.matchReasons[0] ? (
        <p className="mt-1.5 text-xs text-accent">Warum dieser Fall: {result.matchReasons[0]}</p>
      ) : null}
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {c.shortAnswer || c.shortDescription}
      </p>
      {primary && top3.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
          {top3.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
        {primary ? "Praxisfall vollständig öffnen" : "Fall öffnen"}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function Home() {
  const navigate = useNavigate();
  // Pilot-Feedback 08.09.2026: Zurück von einer Fallseite landete auf der
  // unsortierten Fallliste statt beim Suchergebnis - Suchtext und
  // abgeschickte Anfrage je Tab in sessionStorage halten, damit die
  // Ergebnisseite beim Zurückkommen wiederhergestellt wird (die Treffer
  // selbst liefert der React-Query-Cache bzw. eine erneute Suche).
  const [q, setQ] = useState(() => {
    try { return sessionStorage.getItem("rk-start-suche-q") ?? ""; } catch { return ""; }
  });
  const [submitted, setSubmitted] = useState(() => {
    try { return sessionStorage.getItem("rk-start-suche-submitted") ?? ""; } catch { return ""; }
  });
  useEffect(() => {
    try {
      if (q) sessionStorage.setItem("rk-start-suche-q", q);
      else sessionStorage.removeItem("rk-start-suche-q");
      if (submitted) sessionStorage.setItem("rk-start-suche-submitted", submitted);
      else sessionStorage.removeItem("rk-start-suche-submitted");
    } catch { /* Storage gesperrt - Suche läuft ohne Persistenz. */ }
  }, [q, submitted]);
  const { data: dbCases, isLoading } = usePublishedCases();

  const cases: CaseData[] = useMemo(() => dbCases ?? [], [dbCases]);

  const { data: hybridData } = useQuery<HybridSearchResponse | IntelligentSearchResponse>({
    queryKey: ["hybrid-search", submitted, cases.length],
    enabled: submitted.length > 0 && cases.length > 0,
    staleTime: 30_000,
    queryFn: () => searchPracticeCasesHybrid(submitted, cases, { limit: 7 }),
  });

  const response = useMemo<HybridSearchResponse | IntelligentSearchResponse>(
    () => hybridData ?? searchPublishedPracticeCases(submitted, cases, { limit: 7 }),
    [hybridData, submitted, cases],
  );

  const doSearch = (text?: string) => {
    const v = (text ?? q).trim();
    setQ(v);
    setSubmitted(v);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-28 sm:px-6 md:pt-16 md:pb-16">
      {/* Hero */}
      <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
        <Landmark className="h-3.5 w-3.5 text-accent" aria-hidden />
        Rechtliche Orientierung für Lehrkräfte an Berufskollegs in NRW
      </p>
      <h1 className="mt-5 text-[2rem] font-semibold leading-[1.12] text-foreground sm:text-5xl">
        Was ist passiert – oder welche rechtliche Frage hast du?
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        Situation in eigenen Worten beschreiben. RechtKompass findet den passenden
        Praxisfall – mit Handlungsschritten, Rechtsgrundlagen und Vorlagen.
      </p>

      {/* Suche */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          doSearch();
        }}
        className="mt-8 flex flex-col gap-2 rounded-2xl border border-input bg-card p-2 shadow-[var(--shadow-elevated)] transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10 sm:flex-row sm:items-center"
      >
        <label className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Situation oder Frage beschreiben</span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ein Schüler filmt mich im Unterricht …"
            className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/80"
          />
        </label>
        <button
          type="submit"
          disabled={!q.trim() || isLoading}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Orientierung finden
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </form>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        Bitte keine vollständigen Namen oder unnötige personenbezogene Daten von Schüler:innen eingeben.
      </p>

      {/* Beispiele */}
      {!submitted && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Häufige Fragen
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => doSearch(ex)}
                className="min-h-9 rounded-full border border-border bg-card px-3.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:border-accent/50 hover:text-accent"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Themenbereiche */}
      {!submitted && (
        <section aria-labelledby="themen-heading" className="mt-12">
          <div className="flex items-end justify-between gap-4">
            <h2 id="themen-heading" className="font-serif text-xl font-semibold text-foreground sm:text-2xl">
              Themenbereiche
            </h2>
            <Link to="/faelle" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline underline-offset-4">
              Alle Fälle <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_TOPICS.map((t) => (
              <Link
                key={t.cat}
                to="/faelle"
                search={{ cat: t.cat }}
                className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-[var(--shadow-card)]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                  <t.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{t.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{t.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Ergebnisse */}
      {submitted && (
        <section className="mt-10" aria-live="polite">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
          ) : response.clarificationNeeded && response.clarificationQuestions.length > 0 ? (
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
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
            <div className="rounded-xl border border-dashed border-input bg-card p-6 text-sm">
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
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-xs font-semibold text-foreground">
                  Kein passender Fall gefunden? Dann gib ihn hier ein.
                </p>
                <AssistantCaseGenerationOffer sketch={submitted} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Das passt am ehesten zu deiner Situation
                </p>
                <ResultCard result={response.results[0]} primary />
              </div>

              {response.alternatives.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-foreground">
                  Kein passender Fall dabei? Dann gib ihn hier ein.
                </p>
                <AssistantCaseGenerationOffer sketch={submitted} />
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
          CTA-Button und kein zweites Freitextfeld neben der Suche.
          Fund 2026-08-20: sobald Suchergebnisse (inkl. Fallgenerierung)
          angezeigt werden, konkurriert diese Karte sichtbar mit dem
          eigentlichen Ergebnis und wirkt dort nur noch als Ablenkung –
          daher nur im Ausgangszustand vor einer Sucheingabe sichtbar. */}
      {!submitted && (
        <section
          aria-labelledby="fall-klaeren-heading"
          className="relative mt-12 overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-[var(--shadow-elevated)] sm:p-8"
        >
          <Scale className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-white/[0.06]" aria-hidden />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-gold ring-1 ring-inset ring-white/15">
              <Compass className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="fall-klaeren-heading" className="font-serif text-xl font-semibold sm:text-2xl">
                Einen Fall klären
              </h2>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-primary-foreground/80">
                Schildern Sie die Situation in eigenen Worten. RechtKompass stellt gezielte
                Rückfragen und führt Sie anschließend Schritt für Schritt durch Bewertung,
                Maßnahmen, Rechtsgrundlagen und Dokumentation.
              </p>
              <Link
                to="/assistent"
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-primary transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
              >
                Fall schildern <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="mt-4 text-sm text-primary-foreground/70">
                Ohne freie Schilderung arbeiten?{" "}
                <Link
                  to="/navigator"
                  className="font-medium text-primary-foreground underline underline-offset-4 hover:text-gold"
                >
                  Fall direkt strukturiert erfassen
                </Link>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Grundlage */}
      <section aria-labelledby="grundlage-heading" className="mt-12 border-t border-border pt-10">
        <h2 id="grundlage-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
          Grundlage dieser Orientierung
        </h2>
        <dl className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-semibold text-foreground">Praxisfälle</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {cases.length > 0
                ? `${cases.length} redaktionell geprüfte Fälle mit Handlungsschritten und Dokumentvorlagen.`
                : "Redaktionell geprüfte Fälle mit Handlungsschritten und Dokumentvorlagen."}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-foreground">Amtliche Normtexte</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Verknüpft mit SchulG NRW, APO-BK, BASS und weiteren Rechtsquellen im Wortlaut.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-foreground">Verlässlichkeits-Ampel</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Jeder Fall zeigt, wie gesichert die Einschätzung ist – offene Rechtsfragen werden benannt.
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-8 flex items-start gap-3 rounded-xl border border-border bg-secondary/60 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p>
          <strong className="text-foreground">RechtKompass Schule</strong> bietet Orientierung – ersetzt aber keine
          individuelle Rechtsberatung und keine Entscheidung der Schulleitung. Maßgeblich bleiben die offiziellen Rechtsquellen.
        </p>
      </div>

      <Disclaimer />
    </div>
  );
}
