import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  Flag,
  Link2,
  Save,
  Scale,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { CASES, type CaseData, type LegalSectionCard } from "@/data/cases";
import { TEMPLATES } from "@/data/templates";
import { Disclaimer } from "@/components/Disclaimer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AmpelBanner } from "@/components/AmpelBanner";
import { DecisionAssistant } from "@/components/DecisionAssistant";
import { LoadingState, ErrorState } from "@/components/DataStates";
import { LegalSectionModal } from "@/components/LegalSectionModal";
import { usePublishedCase } from "@/lib/casesFromDb";
import { isCuratedTreeApproved } from "@/lib/decisionTree";
import { useQuery } from "@tanstack/react-query";
import { listTemplatesForCase } from "@/lib/templatesRepo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  getCommonMistakes,
  getLawCards,
  getPracticeTips,
  getRelatedCases,
} from "@/lib/caseEnrichment";
import { FeedbackReportDialog } from "@/components/FeedbackReportDialog";

export const Route = createFileRoute("/faelle/$id")({
  component: CaseDetailRoute,
  head: () => ({
    meta: [{ title: "Praxisfall – RechtKompass Schule" }],
  }),
});

function CaseDetailRoute() {
  const { id } = Route.useParams();
  return <CaseDetailById id={id} />;
}

export function CaseDetailById({ id }: { id: string }) {
  const { data: dbCase, isLoading, error } = usePublishedCase(id);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28">
        <LoadingState label="Praxisfall wird geladen…" />
      </div>
    );
  }

  const staticCase = CASES.find((x) => x.id === id);
  const c = dbCase ?? staticCase;

  if (!c) {
    if (error) {
      return (
        <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28">
          <ErrorState error={error} />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-2xl px-4 pt-16 pb-28 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Praxisfall wurde nicht gefunden.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Der angeforderte Fall existiert nicht oder wurde entfernt.
        </p>
        <Link to="/faelle" className="mt-6 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          Zurück zu allen Fällen
        </Link>
      </div>
    );
  }

  return <CaseDetail c={c} />;
}

const AMPEL_DOT: Record<string, string> = {
  gruen: "bg-success",
  gelb: "bg-warning",
  rot: "bg-danger",
};

const AMPEL_URGENCY: Record<string, string> = {
  gruen: "Dokumentieren und beobachten",
  gelb: "Zeitnah klären",
  rot: "Sofort handeln – Schulleitung einbeziehen",
};

const MAX_DOS = 5;
const MAX_DONTS = 3;

/* ---------- Helpers ---------- */

function formatWarning(raw: string): string {
  const s = raw.trim().replace(/^[-–•\s]+/, "");
  if (!s) return "";
  const imperativeStart =
    /^(Vermeiden|Beginnen|Achten|Dokumentieren|Warten|Handeln|Prüfen|Sprechen|Informieren|Melden|Nutzen|Kontaktieren|Klären|Wenden|Setzen|Stellen|Zeigen|Unterlassen|Bewahren|Trennen|Sichern|Reagieren|Erstellen)\s+Sie\b/i;
  const endWithPeriod = (t: string) => (/[.!?]$/.test(t) ? t : t + ".");
  if (imperativeStart.test(s)) return endWithPeriod(s);
  const cleaned = s
    .replace(/^(Keine|Kein|Nie|Niemals|Nicht)\s+/i, "")
    .replace(/^./, (m) => m.toLowerCase());
  return endWithPeriod(`Vermeiden Sie unbedingt: ${cleaned}`);
}

/* ---------- Do's / Don'ts mit Aufklappen ---------- */

function CollapsibleList({
  items,
  max,
  variant,
}: {
  items: string[];
  max: number;
  variant: "do" | "dont";
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, max);
  const rest = items.length - max;
  const Icon = variant === "do" ? CheckCircle2 : TriangleAlert;
  const iconTone = variant === "do" ? "text-success" : "text-danger";
  return (
    <>
      <ul className="mt-3 space-y-2">
        {shown.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm text-foreground/90">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconTone}`} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          {expanded ? "Weniger anzeigen" : `Weitere ${rest} anzeigen`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </>
  );
}

/* ---------- Ebene-Header (Accordion-Trigger-Inhalt) ---------- */

function EbeneTriggerInner({
  number,
  title,
  subtitle,
}: {
  number: 1 | 2 | 3;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-3 text-left">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-bold text-accent">
        {number}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ebene {number}
        </p>
        <p className="text-base font-semibold text-foreground sm:text-lg">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

/* ---------- Save-Button (Fall speichern) ---------- */

function SaveVorgangButton({ c }: { c: CaseData }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("rk-vorgaenge");
      const list = raw ? (JSON.parse(raw) as Array<{ id: string }>) : [];
      setSaved(list.some((v) => v.id === c.id));
    } catch {
      /* noop */
    }
  }, [c.id]);

  const saveVorgang = () => {
    try {
      const key = "rk-vorgaenge";
      const raw = localStorage.getItem(key);
      const list: Array<{ id: string; title?: string; savedAt: string }> = raw ? JSON.parse(raw) : [];
      if (list.find((v) => v.id === c.id)) {
        toast.info("Vorgang war bereits gespeichert.");
        return;
      }
      list.unshift({ id: c.id, title: c.title, savedAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(list.slice(0, 100)));
      setSaved(true);
      toast.success("Vorgang gespeichert.");
    } catch {
      toast.info("Diese Funktion wird derzeit vorbereitet.");
    }
  };

  return (
    <button
      type="button"
      onClick={saveVorgang}
      className={`inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground/85 hover:border-accent hover:text-accent ${
        saved ? "border-accent bg-accent/10 text-accent" : ""
      }`}
    >
      <Save className="h-4 w-4" />
      {saved ? "Gespeichert" : "Fall speichern"}
    </button>
  );
}

/* ---------- Hauptkomponente ---------- */

function CaseDetail({ c }: { c: CaseData }) {
  const tips = getPracticeTips(c);
  const mistakes = getCommonMistakes(c);
  const laws = getLawCards(c);
  const related = getRelatedCases(c, 5).filter((r) => r.id !== c.id).slice(0, 5);
  const staticTpls = c.applicableTemplates
    .map((id) => TEMPLATES.find((t) => t.id === id))
    .filter(Boolean) as { id: string; title: string; description?: string }[];

  const dbTemplates = useQuery({
    queryKey: ["case-templates", c.id],
    queryFn: () => listTemplatesForCase(c.id),
    staleTime: 30_000,
  });

  const legalSections: LegalSectionCard[] = c.legalSections ?? [];

  // Wichtigster Warnhinweis – erste common_mistake als Imperativ.
  const topWarning = mistakes.length > 0 ? formatWarning(mistakes[0]) : "";
  // Don'ts ohne den bereits als Warnhinweis dargestellten Eintrag.
  const dontsForList = topWarning ? mistakes.slice(1) : mistakes;

  const [legalModal, setLegalModal] = useState<{
    section: LegalSectionCard | null;
    sectionId: string | null;
  }>({ section: null, sectionId: null });

  const openLegal = useCallback(
    (arg: { section?: LegalSectionCard | null; sectionId?: string | null }) => {
      setLegalModal({
        section: arg.section ?? null,
        sectionId: arg.sectionId ?? arg.section?.id ?? null,
      });
    },
    [],
  );

  // Der Assistent wird ausschließlich dann prominent gezeigt, wenn ein
  // kuratierter fallspezifischer Entscheidungsbaum aus practice_cases.decision_tree
  // vorliegt (siehe src/lib/decisionTree.ts). Der regelbasierte Fallback bleibt für
  // Diagnose/Vorschau intern nutzbar, wird im Lehrer-Frontend aber NICHT als
  // gleichwertige Produktfunktion angeboten.
  const hasDecisionContent = isCuratedTreeApproved(c.decisionTreeRaw);

  const [assistantOpen, setAssistantOpen] = useState(false);

  const dbTpls = dbTemplates.data ?? [];
  const templateCount = dbTpls.length > 0 ? dbTpls.length : staticTpls.length;
  const templatesAvailable = templateCount > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-24 sm:px-6">
      <div className="mb-3">
        <Breadcrumbs
          items={[
            { label: "Praxisfälle", to: "/faelle" },
            { label: c.category, to: "/faelle", search: { cat: c.category } },
            { label: c.title },
          ]}
        />
      </div>

      <Link
        to="/faelle"
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Zurück
      </Link>

      {/* FALLKOPF */}
      <header className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium">{c.category}</span>
          {c.subcategory && (
            <>
              <span aria-hidden>·</span>
              <span>{c.subcategory}</span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {c.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SaveVorgangButton c={c} />
          <FeedbackReportDialog
            caseId={c.id}
            caseTitle={c.title}
            reportedArea="lehrer_fallakte"
            variant="compact"
          />
        </div>
      </header>

      {/* 3-EBENEN-ACCORDION */}
      <Accordion
        type="multiple"
        defaultValue={["ebene-1"]}
        className="mt-6 space-y-3"
      >
        {/* ============================================================ */}
        {/* EBENE 1 – ORIENTIEREN                                         */}
        {/* ============================================================ */}
        <AccordionItem
          value="ebene-1"
          className="rounded-2xl border border-border bg-card px-4 sm:px-5"
        >
          <AccordionTrigger className="hover:no-underline">
            <EbeneTriggerInner
              number={1}
              title="Orientieren"
              subtitle="Das Wichtigste zum Praxisfall"
            />
          </AccordionTrigger>
          <AccordionContent className="pb-5 pt-1">
            {/* Dringlichkeit */}
            <div className="mb-4">
              <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${AMPEL_DOT[c.ampel]}`} />
                Dringlichkeit: {AMPEL_URGENCY[c.ampel]}
              </p>
              <AmpelBanner ampel={c.ampel} note={c.ampelLabel} />
            </div>

            {/* Das Wichtigste auf einen Blick (Kurzantwort) */}
            {c.shortAnswer && c.shortAnswer.trim().length > 0 && (
              <div className="rounded-3xl border border-accent/40 bg-accent/5 p-5 sm:p-6">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
                  <Sparkles className="h-3.5 w-3.5" /> Das Wichtigste auf einen Blick
                </p>
                <p className="mt-3 text-base font-medium leading-relaxed text-foreground sm:text-lg">
                  {c.shortAnswer}
                </p>
              </div>
            )}

            {/* Do's & Don'ts */}
            {(tips.length > 0 || dontsForList.length > 0) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {tips.length > 0 && (
                  <div className="rounded-2xl border border-success/30 bg-success/5 p-4 sm:p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      ✅ Das sollten Sie tun
                    </p>
                    <CollapsibleList items={tips} max={MAX_DOS} variant="do" />
                  </div>
                )}
                {dontsForList.length > 0 && (
                  <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 sm:p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      ❌ Das sollten Sie vermeiden
                    </p>
                    <CollapsibleList items={dontsForList} max={MAX_DONTS} variant="dont" />
                  </div>
                )}
              </div>
            )}

            {/* Wichtigster Warnhinweis */}
            {topWarning && (
              <div className="mt-4 rounded-2xl border-l-4 border-danger bg-danger/5 p-4 sm:p-5">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-danger">
                  <TriangleAlert className="h-3.5 w-3.5" /> Wichtigster Warnhinweis
                </p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-foreground sm:text-base">
                  {topWarning}
                </p>
              </div>
            )}

            {/* Entscheidungsassistent (kompakt) */}
            {hasDecisionContent && (
              <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Zap className="h-4 w-4 text-accent" /> Unsicher, was als Nächstes zu tun ist?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Beantworten Sie wenige Fragen zu Ihrer konkreten Situation und
                  erhalten Sie eine passende Handlungsempfehlung.
                </p>
                <button
                  type="button"
                  onClick={() => setAssistantOpen(true)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90 sm:w-auto"
                >
                  Entscheidungsassistent starten
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* ============================================================ */}
        {/* EBENE 2 – DOKUMENTIEREN                                       */}
        {/* ============================================================ */}
        <AccordionItem
          value="ebene-2"
          className="rounded-2xl border border-border bg-card px-4 sm:px-5"
        >
          <AccordionTrigger className="hover:no-underline">
            <EbeneTriggerInner
              number={2}
              title="Dokumentieren"
              subtitle="Passendes Dokument zum Fall erstellen"
            />
          </AccordionTrigger>
          <AccordionContent className="pb-5 pt-1">
            {templatesAvailable ? (
              <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="h-4 w-4 text-accent" /> Fall dokumentieren
                </p>
                <p className="mt-2 text-sm text-foreground/85">
                  Erstellen Sie auf Grundlage dieses Praxisfalls eine passende Dokumentation.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Für diesen Fall {templateCount === 1 ? "ist" : "sind"} {templateCount} passende Dokumentvorlage
                  {templateCount === 1 ? "" : "n"} verfügbar.
                </p>
                <Link
                  to="/faelle/$id/dokument"
                  params={{ id: c.id }}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90 sm:w-auto"
                >
                  Passendes Dokument erstellen
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
                <p className="text-sm text-foreground/85">
                  Für diesen Praxisfall ist derzeit noch keine passende Dokumentvorlage hinterlegt.
                </p>
                <div className="mt-3">
                  <FeedbackReportDialog
                    caseId={c.id}
                    caseTitle={c.title}
                    reportedArea="lehrer_fallakte"
                    variant="compact"
                  />
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* ============================================================ */}
        {/* EBENE 3 – RECHTLICH VERTIEFEN                                 */}
        {/* ============================================================ */}
        <AccordionItem
          value="ebene-3"
          className="rounded-2xl border border-border bg-card px-4 sm:px-5"
        >
          <AccordionTrigger className="hover:no-underline">
            <EbeneTriggerInner
              number={3}
              title="Rechtlich vertiefen"
              subtitle="Rechtsgrundlagen und weiterführende Informationen"
            />
          </AccordionTrigger>
          <AccordionContent className="pb-5 pt-1">
            <div className="space-y-4">
              {/* Rechtsgrundlagen */}
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Scale className="h-4 w-4 text-accent" /> Rechtsgrundlagen
                </p>
                {c.legalExplanation && c.legalExplanation.trim().length > 0 && (
                  <p className="mb-3 text-sm leading-relaxed text-foreground/90">
                    {c.legalExplanation}
                  </p>
                )}
                {legalSections.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {legalSections.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openLegal({ section: s })}
                        className="group rounded-xl border border-border bg-background p-3 text-left hover:border-accent/60 hover:bg-accent/5"
                      >
                        {s.source?.name && (
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {s.source.name}
                          </p>
                        )}
                        <p className="text-xs font-semibold text-foreground group-hover:text-accent">
                          {s.section_number}
                          {s.title ? ` ${s.title}` : ""}
                        </p>
                        {(s.explanation || s.practice_relevance || s.summary) && (
                          <p className="mt-2 line-clamp-3 text-xs text-foreground/80">
                            {s.explanation ?? s.practice_relevance ?? s.summary}
                          </p>
                        )}
                        <p className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded-full bg-muted px-2 py-0.5">Quelle vorhanden</span>
                          {(s.summary || s.practice_relevance) && (
                            <span className="rounded-full bg-muted px-2 py-0.5">Wissenskarte</span>
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : laws.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {laws.map((l) => (
                      <div
                        key={l.paragraph + l.gesetz}
                        className="rounded-xl border border-border bg-background p-3"
                      >
                        <p className="text-xs font-semibold text-foreground">{l.paragraph}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                          {l.gesetz}
                        </p>
                        <p className="mt-2 text-xs text-foreground/80">{l.kurz}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Für diesen Praxisfall liegen noch keine Rechtsgrundlagen vor.
                  </p>
                )}
              </div>

              {/* Wissenskarten & Quellen */}
              {legalSections.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ShieldCheck className="h-4 w-4 text-accent" /> Wissenskarten &amp; Quellen
                  </p>
                  <div className="space-y-2">
                    {legalSections.map((s) => (
                      <div key={s.id} className="rounded-xl border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground">
                              {s.section_number}
                              {s.title ? ` ${s.title}` : ""}
                            </p>
                            {s.source?.name && (
                              <p className="text-[11px] text-muted-foreground">{s.source.name}</p>
                            )}
                            {(s.summary || s.practice_relevance) && (
                              <p className="mt-2 line-clamp-2 text-xs text-foreground/80">
                                {s.summary ?? s.practice_relevance}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => openLegal({ section: s })}
                            className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground/80 hover:border-accent hover:text-accent"
                          >
                            Mehr erfahren
                          </button>
                        </div>
                        {s.official_url && (
                          <a
                            href={s.official_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-[11px] text-accent hover:underline"
                          >
                            Offizielle Quelle öffnen
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ähnliche Fälle */}
              {related.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Link2 className="h-4 w-4 text-accent" /> Ähnliche Fälle
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {related.map((r) => (
                      <Link
                        key={r.id}
                        to="/fall/$id"
                        params={{ id: r.id }}
                        className="group flex items-start gap-2 rounded-xl border border-border bg-background p-3 hover:border-accent/60"
                      >
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${AMPEL_DOT[r.ampel]}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground group-hover:text-accent">
                            {r.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {r.category}
                            {r.subcategory ? ` · ${r.subcategory}` : ""}
                          </p>
                        </div>
                        <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Problem melden – dezent am Ende */}
      <div className="mt-6 flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <Flag className="h-3.5 w-3.5" />
        <span>Unstimmigkeit gefunden?</span>
        <FeedbackReportDialog
          caseId={c.id}
          caseTitle={c.title}
          reportedArea="lehrer_fallakte"
          variant="compact"
        />
      </div>

      <Disclaimer />

      <LegalSectionModal
        open={!!(legalModal.section || legalModal.sectionId)}
        onOpenChange={(v) => {
          if (!v) setLegalModal({ section: null, sectionId: null });
        }}
        section={legalModal.section}
        sectionId={legalModal.sectionId}
      />

      {hasDecisionContent && (
        <DecisionAssistant
          c={c}
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
        />
      )}
    </div>
  );
}
