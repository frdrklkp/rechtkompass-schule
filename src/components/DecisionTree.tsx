import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Info,
  ListChecks,
  Scale,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { CaseData } from "@/data/cases";
import { TEMPLATES } from "@/data/templates";
import { getCommonMistakes, getLawCards } from "@/lib/caseEnrichment";

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen zur dynamischen Ableitung                          */
/* ------------------------------------------------------------------ */

function clean(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function splitSentences(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/)
    .map((s) => clean(s))
    .filter((s) => s.length > 3);
}

function uniq(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const key = a.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** Formt ein Checklisten-Statement in eine kompakte Prüffrage um. */
function toQuestion(stmt: string): string {
  const s = clean(stmt).replace(/[.!?]+$/g, "");
  const low = s.toLowerCase();
  if (/^(ist|sind|wurde|wurden|haben|hat|besteht|gibt es)\b/.test(low)) {
    return s + "?";
  }
  if (/informieren|informiert/.test(low)) return `Ist ${s.replace(/^./, (c) => c.toLowerCase())}?`;
  if (/dokument/.test(low)) return `Wurde bereits erledigt: ${s}?`;
  if (/prüfen|prüfung/.test(low)) return `Wurde geprüft: ${s}?`;
  if (/anlegen|erstellen|festhalten|erfassen/.test(low)) return `Wurde bereits erledigt: ${s}?`;
  return `Ist geklärt: ${s}?`;
}

function buildPruefFragen(c: CaseData): string[] {
  const base: string[] = [];
  if (c.ampel === "rot") {
    base.push("Besteht eine akute Gefährdung für Personen?");
    base.push("Ist die Schulleitung bereits informiert?");
  } else if (c.ampel === "gelb") {
    base.push("Ist die Situation bereits sachlich dokumentiert?");
    base.push(`Wurde ${c.responsibleParty.split(",")[0].trim()} eingebunden?`);
  } else {
    base.push("Ist die Situation pädagogisch geklärt?");
    base.push("Reicht eine kurze Notiz im Klassenbuch aus?");
  }
  const fromChecklist = c.checklist.slice(0, 6).map(toQuestion);
  return uniq([...base, ...fromChecklist]).slice(0, 5);
}

function buildAblauf(c: CaseData): string[] {
  const fromReco = splitSentences(c.recommendation);
  const fromCheck = c.checklist.map(clean);
  const merged = uniq([...fromReco, ...fromCheck]);
  return merged.slice(0, 8);
}

function buildEskalation(c: CaseData): string[] {
  const resp = c.responsibleParty || "Klassenleitung";
  if (c.ampel === "rot") {
    return [
      "Sofort die Schulleitung mündlich informieren – vor jeder weiteren Maßnahme.",
      "Bei Gefahr für Personen umgehend Erste Hilfe / Notdienste einbeziehen.",
      "Vorfallprotokoll noch am selben Tag erstellen und sichern.",
      `Weitere Schritte ausschließlich in Abstimmung mit ${resp}.`,
    ];
  }
  if (c.ampel === "gelb") {
    return [
      `Bei Unsicherheit oder Formfrage: Rücksprache mit ${resp}.`,
      "Bei Wiederholung: Bildungsgangleitung einbinden und Vorgang bündeln.",
      "Bei Beteiligung Dritter: Schulleitung informieren und Anhörung dokumentieren.",
    ];
  }
  return [
    `Bei Wiederholung durch dieselbe Person: ${resp} informieren.`,
    "Bei zunehmender Störung: Vorgang schriftlich in eine Aktennotiz überführen.",
    "Bei Eskalation oder Beteiligung mehrerer: Bildungsgangleitung einbeziehen.",
  ];
}

function hasEnoughContent(c: CaseData): boolean {
  const chk = c.checklist?.length ?? 0;
  const reco = (c.recommendation ?? "").trim().length;
  const risks = getCommonMistakes(c).length;
  return chk >= 2 && reco > 20 && (risks > 0 || (c.legalBasis?.length ?? 0) > 0);
}

/* ------------------------------------------------------------------ */
/* UI-Bausteine                                                       */
/* ------------------------------------------------------------------ */

function SectionCard({
  icon: Icon,
  title,
  tone = "default",
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone?: "default" | "accent" | "warn" | "danger" | "success";
  children: React.ReactNode;
}) {
  const toneMap = {
    default: "border-border bg-card",
    accent: "border-accent/30 bg-accent/5",
    warn: "border-warning/40 bg-warning/10",
    danger: "border-danger/40 bg-danger/10",
    success: "border-success/40 bg-success/10",
  } as const;
  const iconMap = {
    default: "bg-muted text-foreground",
    accent: "bg-accent text-accent-foreground",
    warn: "bg-warning text-warning-foreground",
    danger: "bg-danger text-danger-foreground",
    success: "bg-success text-success-foreground",
  } as const;
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${toneMap[tone]}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${iconMap[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Hauptkomponente – dynamisch aus dem Praxisfall                     */
/* ------------------------------------------------------------------ */

export function DecisionTree({ c, compact = false }: { c: CaseData; compact?: boolean }) {
  if (!hasEnoughContent(c)) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Info className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          Für diesen Praxisfall liegen noch keine ausreichenden Entscheidungsinformationen vor.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Die Redaktion ergänzt Handlungsempfehlung, Checkliste und typische Fehler in Kürze.
        </p>
      </div>
    );
  }

  const fragen = buildPruefFragen(c);
  const ablauf = buildAblauf(c);
  const vermeiden = getCommonMistakes(c);
  const eskalation = buildEskalation(c);
  const templates = c.applicableTemplates
    .map((id) => TEMPLATES.find((t) => t.id === id))
    .filter((t): t is (typeof TEMPLATES)[number] => Boolean(t));
  const laws = getLawCards(c).slice(0, 6);

  const toneByAmpel =
    c.ampel === "rot" ? "danger" : c.ampel === "gelb" ? "warn" : "success";

  return (
    <div className="space-y-3">
      {/* 1. Ihre Situation */}
      {!compact && (
        <SectionCard icon={Sparkles} title="Ihre Situation" tone={toneByAmpel as "danger" | "warn" | "success"}>
          <p className="text-sm font-medium text-foreground">{c.title}</p>
          <p className="mt-1 text-sm text-foreground/85">{c.shortDescription}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Einstufung: <span className="font-medium text-foreground">{c.ampelLabel}</span> · Zuständig:{" "}
            <span className="font-medium text-foreground">{c.responsibleParty}</span>
          </p>
        </SectionCard>
      )}

      {/* 2. Prüffragen */}
      <SectionCard icon={ListChecks} title="Was jetzt zuerst zu klären ist" tone="accent">
        <ul className="space-y-2">
          {fragen.map((q, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 rounded-xl border border-border bg-background/70 p-2.5"
            >
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent text-[11px] font-semibold text-accent">
                {i + 1}
              </span>
              <span className="text-sm text-foreground/90">{q}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* 3. Empfohlener Ablauf */}
      {!compact && (
        <SectionCard icon={CheckCircle2} title="Empfohlener Ablauf">
          <ol className="space-y-2">
            {ablauf.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-xl bg-muted/40 p-2.5 text-sm">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-foreground/90">{s}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      {/* 4. Bitte vermeiden */}
      {!compact && vermeiden.length > 0 && (
        <SectionCard icon={AlertTriangle} title="Bitte vermeiden" tone="warn">
          <ul className="space-y-1.5">
            {vermeiden.slice(0, 6).map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/90">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* 5. Eskalation */}
      <SectionCard icon={ShieldAlert} title="Wann eskalieren?" tone={c.ampel === "rot" ? "danger" : "default"}>
        <ul className="space-y-1.5">
          {eskalation.map((e, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/90">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* 6. Passende Dokumentation */}
      {!compact && templates.length > 0 && (
        <SectionCard icon={FileText} title="Passende Dokumentation">
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((t) => (
              <Link
                key={t.id}
                to="/dokumentation"
                search={{ vorlage: t.id, fall: c.id } as never}
                className="group flex items-center justify-between rounded-xl border border-border bg-background p-3 text-left transition-all hover:border-accent hover:bg-accent/5"
              >
                <span>
                  <span className="block text-sm font-semibold text-foreground">{t.title}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 7. Rechtliche Grundlage */}
      {!compact && laws.length > 0 && (
        <SectionCard icon={Scale} title="Rechtliche Grundlage">
          <div className="grid gap-2 sm:grid-cols-2">
            {laws.map((l, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-background p-3"
              >
                <p className="text-xs font-semibold text-accent">{l.paragraph}</p>
                <p className="mt-0.5 text-xs font-medium text-foreground">{l.gesetz}</p>
                <p className="mt-1 text-xs text-muted-foreground">{l.kurz}</p>
              </div>
            ))}
          </div>
          {c.legalSections && c.legalSections.length > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {c.legalSections.length} zugeordnete Rechtsabschnitte in der Fallakte unten.
            </p>
          )}
        </SectionCard>
      )}
    </div>
  );
}

