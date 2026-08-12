// LegalCopilotPanel – neue Sektion im Editorial Copilot.
// Rein Vorschlagsbasiert: Zeigt Buttons für die Legal-Intelligence-Tasks
// und stellt die Ergebnisse als Empfehlungen im Panel dar. Keine automatische
// Übernahme, keine Verknüpfung.

import { useState } from "react";
import { Scale, AlertTriangle, GitCompareArrows, ShieldQuestion, FileSearch, Landmark, Sparkles, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  LegalIntelligenceService,
  type LegalRecommendation,
} from "@/services/editorial/legal-intelligence";
import { isAIError } from "@/services/editorial/ai";
import type { EditorialCaseRow } from "@/services/editorial/types";
import type { CaseQualityAssessment } from "@/services/editorial/quality/types";
import type {
  LegalCatalogEntry,
  LegalFlagCtx,
  LegalLinkCtx,
  SimilarCaseCtx,
} from "@/services/editorial/legal-intelligence/LegalContextBuilder";

interface Props {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality: CaseQualityAssessment | null;
  linkedSections?: LegalLinkCtx[];
  flags?: LegalFlagCtx[];
  catalog?: LegalCatalogEntry[];
  similarCases?: SimilarCaseCtx[];
}

type Kind = LegalRecommendation["kind"];

const ACTIONS: Array<{ id: Kind; label: string; Icon: typeof Scale; description: string }> = [
  { id: "completeness",  label: "Vollständigkeit prüfen",   Icon: ClipboardList,   description: "Fehlende juristisch relevante Themen erkennen." },
  { id: "sources",       label: "Rechtsgrundlagen vorschlagen", Icon: Landmark,    description: "Passende Rechtsgrundlagen aus dem Katalog vorschlagen." },
  { id: "consistency",   label: "Konsistenz prüfen",         Icon: GitCompareArrows, description: "Widersprüche und unklare Aussagen markieren." },
  { id: "documentation", label: "Dokumentation prüfen",      Icon: FileSearch,     description: "Hinweise zu Doku, Nachweis, Meldung." },
  { id: "comparison",    label: "Fallvergleich",             Icon: GitCompareArrows, description: "Gemeinsamkeiten und Unterschiede zu ähnlichen Fällen." },
  { id: "risk",          label: "Redaktionelle Risiken",     Icon: AlertTriangle,  description: "Nur redaktionelle Risiken – keine Bewertung der Rechtslage." },
  { id: "summary",       label: "Fachliche Zusammenfassung", Icon: Sparkles,       description: "Kurze redaktionelle Zusammenfassung." },
];

export function LegalCopilotPanel({ caseRow, quality, linkedSections, flags, catalog, similarCases }: Props) {
  const [running, setRunning] = useState<Kind | null>(null);
  const [items, setItems] = useState<LegalRecommendation[]>([]);

  async function run(kind: Kind) {
    setRunning(kind);
    try {
      let rec: LegalRecommendation;
      const base = { caseRow, quality, linkedSections, flags, catalog, similarCases };
      switch (kind) {
        case "completeness":   rec = await LegalIntelligenceService.analyzeCompleteness(base); break;
        case "sources":        rec = await LegalIntelligenceService.suggestSources(base); break;
        case "consistency":    rec = await LegalIntelligenceService.checkConsistency(base); break;
        case "documentation":  rec = await LegalIntelligenceService.checkDocumentation(base); break;
        case "comparison":     rec = await LegalIntelligenceService.compareCases(base); break;
        case "risk":           rec = await LegalIntelligenceService.riskIndicators(base); break;
        case "summary":        rec = await LegalIntelligenceService.summarize(base); break;
        case "citation":       return; // Zitation läuft kontextuell an anderer Stelle.
      }
      setItems((prev) => [rec, ...prev]);
      toast.success("Empfehlung erstellt.");
    } catch (err) {
      toast.error(
        isAIError(err) ? err.userMessage :
        err instanceof Error ? err.message : "KI-Aufruf fehlgeschlagen.",
      );
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-sky-400/40 bg-sky-500/5 p-2 text-[11px] text-sky-900 dark:text-sky-200">
        <div className="flex items-center gap-1 font-semibold">
          <ShieldQuestion className="h-3.5 w-3.5" /> Hinweis
        </div>
        <p className="mt-0.5">
          Alle Ausgaben sind redaktionelle Empfehlungen. Keine Rechtsberatung,
          keine automatische Verknüpfung, kein Workflow-Update.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {ACTIONS.map((a) => (
          <Button
            key={a.id}
            variant="outline"
            size="sm"
            className="h-auto justify-start gap-2 py-2 text-left"
            disabled={running !== null}
            onClick={() => run(a.id)}
          >
            <a.Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">
              <span className="block text-xs font-medium">{a.label}</span>
              <span className="block text-[10px] text-muted-foreground">{a.description}</span>
            </span>
            {running === a.id && <span className="text-[10px] text-muted-foreground">…</span>}
          </Button>
        ))}
      </div>

      {running !== null && <Skeleton className="h-14 w-full" />}

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Noch keine juristischen Empfehlungen in dieser Session.
          </p>
        )}
        {items.map((rec) => (
          <RecommendationCard key={rec.id} rec={rec} onDismiss={() => setItems((p) => p.filter((r) => r.id !== rec.id))} />
        ))}
      </div>
    </div>
  );
}

function RecommendationCard({ rec, onDismiss }: { rec: LegalRecommendation; onDismiss: () => void }) {
  const conf = rec.confidence;
  const confColor = conf === "high" ? "text-emerald-600" : conf === "low" ? "text-amber-600" : "text-sky-600";
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale className="h-3.5 w-3.5 text-sky-600" />
          <span className="text-sm font-semibold">{rec.title}</span>
        </div>
        <span className={`text-[10px] uppercase tracking-wide ${confColor}`}>{conf}</span>
      </div>
      <RecommendationBody rec={rec} />
      {rec.reason && <p className="mt-2 text-[11px] text-muted-foreground italic">{rec.reason}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{rec.disclaimer}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onDismiss}>
          Verwerfen
        </Button>
      </div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-[11px] text-muted-foreground">—</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((s, i) => <li key={i}>{s}</li>)}
    </ul>
  );
}

function RecommendationBody({ rec }: { rec: LegalRecommendation }) {
  const p = rec.payload;
  if (p.kind === "completeness") {
    return (
      <div className="space-y-1.5">
        {p.report.summary && <p>{p.report.summary}</p>}
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">Fehlend / erweitern</div>
          {p.report.gaps.length === 0 ? <p className="text-[11px] text-muted-foreground">Keine Lücken erkannt.</p> :
            <ul className="list-disc space-y-0.5 pl-4">
              {p.report.gaps.map((g, i) => (
                <li key={i}><b>{g.topic}</b> <span className="text-muted-foreground">({g.affectedField})</span> – {g.rationale}</li>
              ))}
            </ul>}
        </div>
        {p.report.wellCovered.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">Gut abgedeckt</div>
            <List items={p.report.wellCovered} />
          </div>
        )}
      </div>
    );
  }
  if (p.kind === "sources") {
    return (
      <div className="space-y-1.5">
        {p.report.suggestions.length === 0 && <p className="text-[11px] text-muted-foreground">Keine Vorschläge – ggf. Katalog erweitern.</p>}
        {p.report.suggestions.map((s, i) => (
          <div key={i} className="rounded border border-border/50 bg-muted/30 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{s.name || s.sectionId}</span>
              <span className="text-[10px] text-muted-foreground">
                {s.relevance} · {Math.round(s.confidence * 100)}%
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{s.rationale}</p>
          </div>
        ))}
        {p.report.notes && <p className="text-[11px] italic text-muted-foreground">{p.report.notes}</p>}
      </div>
    );
  }
  if (p.kind === "consistency") {
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase text-muted-foreground">Gesamt: {p.report.overallAssessment}</div>
        {p.report.issues.length === 0 ? <p className="text-[11px] text-muted-foreground">Keine Widersprüche erkannt.</p> :
          <ul className="list-disc space-y-0.5 pl-4">
            {p.report.issues.map((i, idx) => (
              <li key={idx}><b>{i.kind}</b> ({i.fields.join(", ")}) – {i.description}
                {i.suggestion && <div className="text-[11px] text-muted-foreground">→ {i.suggestion}</div>}
              </li>
            ))}
          </ul>}
      </div>
    );
  }
  if (p.kind === "documentation") {
    return (
      <div className="space-y-1.5">
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">Lücken</div>
          {p.report.gaps.length === 0 ? <p className="text-[11px] text-muted-foreground">Keine Lücken.</p> :
            <ul className="list-disc space-y-0.5 pl-4">
              {p.report.gaps.map((g, i) => (
                <li key={i}><b>{g.topic}</b> – {g.description}
                  {g.suggestion && <div className="text-[11px] text-muted-foreground">→ {g.suggestion}</div>}
                </li>
              ))}
            </ul>}
        </div>
        {p.report.strengths.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">Stärken</div>
            <List items={p.report.strengths} />
          </div>
        )}
      </div>
    );
  }
  if (p.kind === "comparison") {
    return (
      <div className="space-y-1.5">
        {p.report.synthesis && <p>{p.report.synthesis}</p>}
        {p.report.entries.map((e, i) => (
          <div key={i} className="rounded border border-border/50 bg-muted/30 p-2">
            <div className="text-xs font-medium">{e.title || e.caseId}</div>
            {e.commonalities.length > 0 && <div className="mt-1"><div className="text-[10px] uppercase text-muted-foreground">Gemeinsamkeiten</div><List items={e.commonalities} /></div>}
            {e.differences.length > 0 && <div className="mt-1"><div className="text-[10px] uppercase text-muted-foreground">Unterschiede</div><List items={e.differences} /></div>}
            {e.missingInCurrent.length > 0 && <div className="mt-1"><div className="text-[10px] uppercase text-muted-foreground">Möglicherweise fehlend hier</div><List items={e.missingInCurrent} /></div>}
            {e.divergingRecommendations.length > 0 && <div className="mt-1"><div className="text-[10px] uppercase text-muted-foreground">Abweichende Empfehlungen</div><List items={e.divergingRecommendations} /></div>}
          </div>
        ))}
      </div>
    );
  }
  if (p.kind === "citation") {
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium">{p.report.name || p.report.sectionId}</div>
        <p>{p.report.rationale}</p>
      </div>
    );
  }
  if (p.kind === "risk") {
    return (
      <div className="space-y-1.5">
        {p.report.indicators.length === 0 && <p className="text-[11px] text-muted-foreground">Keine besonderen Risiken erkannt.</p>}
        {p.report.indicators.map((i) => (
          <div key={i.id} className="rounded border border-border/50 bg-muted/30 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{i.title}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{i.severity}</span>
            </div>
            <p className="mt-0.5 text-[11px]">{i.description}</p>
            {i.recommendation && <p className="mt-0.5 text-[11px] text-muted-foreground">→ {i.recommendation}</p>}
          </div>
        ))}
      </div>
    );
  }
  // summary
  return (
    <div className="space-y-1.5">
      <p>{p.report.summary}</p>
      {p.report.keyPoints.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">Kernpunkte</div>
          <List items={p.report.keyPoints} />
        </div>
      )}
    </div>
  );
}
