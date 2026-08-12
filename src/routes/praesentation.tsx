import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, FileText, Scale, ShieldCheck, Sparkles } from "lucide-react";
import { CASES, CATEGORY_META, DEMO_IDS, type CaseData } from "../data/cases";
import { TEMPLATES } from "../data/templates";
import { LAWS } from "../data/laws";
import { PageShell } from "../components/PageShell";

export const Route = createFileRoute("/praesentation")({
  head: () => ({
    meta: [
      { title: "Präsentationsmodus – RechtKompass Schule" },
      {
        name: "description",
        content:
          "Kompakter Überblick über Umfang und Nutzen des RechtKompass Schule für die Schulleitung des BKO.",
      },
    ],
  }),
  component: PraesentationPage,
});

const ampelDot: Record<string, string> = {
  gruen: "bg-success",
  gelb: "bg-warning",
  rot: "bg-danger",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{label}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DemoCard({ c }: { c: CaseData }) {
  return (
    <Link
      to="/fall/$id"
      params={{ id: c.id }}
      className="group block rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${ampelDot[c.ampel]}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {c.category}
        </span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-foreground">{c.title}</h3>
      <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{c.shortAnswer}</p>
      <p className="mt-3 text-xs font-medium text-accent">Demo öffnen →</p>
    </Link>
  );
}

function PraesentationPage() {
  const demoCases = DEMO_IDS.map((id) => CASES.find((c) => c.id === id)).filter(
    Boolean,
  ) as CaseData[];
  const ampelCounts = {
    gruen: CASES.filter((c) => c.ampel === "gruen").length,
    gelb: CASES.filter((c) => c.ampel === "gelb").length,
    rot: CASES.filter((c) => c.ampel === "rot").length,
  };

  return (
    <PageShell
      title="Präsentationsmodus"
      subtitle="Der RechtKompass Schule auf einen Blick – für die Schulleitung des BKO."
    >
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
        <Sparkles className="h-4 w-4 text-accent" />
        <span>
          Statischer MVP mit ausgearbeiteten Praxisfällen, Checklisten und Dokumentationsvorlagen.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Praxisfälle" value={String(CASES.length)} hint="strukturiert nach Alltag" />
        <Stat label="Kategorien" value={String(CATEGORY_META.length)} hint="vom Unterricht bis zum Notfall" />
        <Stat label="Dokumentationsvorlagen" value={String(TEMPLATES.length)} hint="mit Live-Vorschau" />
        <Stat label="Rechtsquellen" value={String(LAWS.length)} hint="GG, SchulG NRW, BASS, DSGVO …" />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-accent" /> Ampelverteilung
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {(["gruen", "gelb", "rot"] as const).map((a) => (
            <div key={a} className="rounded-xl border border-border bg-card p-4">
              <div className={`h-2 w-8 rounded-full ${ampelDot[a]}`} />
              <p className="mt-2 text-2xl font-semibold text-foreground">{ampelCounts[a]}</p>
              <p className="text-xs text-muted-foreground">
                {a === "gruen" ? "Grün – Alltag" : a === "gelb" ? "Gelb – Sorgfalt" : "Rot – Schulleitung"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <BookOpen className="h-4 w-4 text-accent" /> Demo-Fälle
        </h2>
        <div className="grid grid-cols-1 gap-3">
          {demoCases.map((c) => (
            <DemoCard key={c.id} c={c} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <Scale className="h-4 w-4 text-accent" /> Beispielhafte Rechtsquellen
        </h2>
        <ul className="flex flex-wrap gap-2">
          {LAWS.map((l) => (
            <li
              key={l.id}
              className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground/80"
            >
              {l.short} – {l.title}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Alle Rechtsgrundlagen im MVP sind Platzhalter und werden im späteren Ausbau durch
          echte, tagesaktuelle Rechtsdaten ersetzt.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <FileText className="h-4 w-4 text-accent" /> Was der MVP heute leistet
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-foreground/90">
          <li>• Über {CASES.length} ausgearbeitete Praxisfälle mit Ampelsystem</li>
          <li>• Handlungsempfehlung, Checkliste und Dokumentation je Fall</li>
          <li>• Verknüpfung passender Dokumentationsvorlagen</li>
          <li>• Volltextsuche über Titel, Stichworte, Rechtsgrundlagen</li>
          <li>• {TEMPLATES.length} Vorlagen mit Live-Vorschau zum Kopieren</li>
        </ul>
      </section>
    </PageShell>
  );
}
