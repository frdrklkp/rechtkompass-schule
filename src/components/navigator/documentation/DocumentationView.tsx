/**
 * Sprint 4.6H – Darstellung der Dokumentationsphase: Status, Vorlagen mit
 * Readiness, Entwürfe mit Vorschau, Bearbeitung und Export.
 * Rein darstellend – alle Aktionen werden als Callbacks übergeben.
 */
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type {
  DocumentationContextEntry,
  DocumentationDraft,
  DocumentationMissingField,
  DocumentationReadiness,
  DocumentationTemplateRef,
} from "@/services/documentation-assistant";
import { missingFieldLabel, READINESS_BADGE_CLASS } from "./documentationPresentation";

export interface DocumentationViewProps {
  entry: DocumentationContextEntry;
  overall: DocumentationReadiness;
  readinessByTemplate: Map<string, DocumentationReadiness>;
  isStale: boolean;
  staleDraftIds: Set<string>;
  preparing: boolean;
  onRefresh: () => void;
  onGenerate: (templateId: string) => void;
  onUpdateDraft: (draftId: string, markdown: string) => void;
  onRemoveDraft: (draftId: string) => void;
  onExport: (draftId: string, format: "md" | "docx" | "pdf") => void;
}

const OVERALL_LABEL: Record<DocumentationReadiness, string> = {
  ready: "Alle Vorlagen können vollständig befüllt werden.",
  incomplete: "Einige Angaben fehlen noch.",
  blocked: "Die Dokumentation ist derzeit nicht möglich.",
  unknown: "Der Status wird ermittelt.",
};

export function DocumentationView(props: DocumentationViewProps) {
  const { entry } = props;
  return (
    <section className="space-y-4" aria-label="Dokumentation">
      {/* Status */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">Dokumentation</h3>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${READINESS_BADGE_CLASS[props.overall]}`}
          >
            {OVERALL_LABEL[props.overall]}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {entry.templates.length} passende Vorlage{entry.templates.length === 1 ? "" : "n"} ·{" "}
          {entry.drafts.length} Entwurf{entry.drafts.length === 1 ? "" : "e"} · Stand{" "}
          {new Date(entry.updatedAt).toLocaleString("de-DE")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Dokumente werden ausschließlich aus den erfassten Angaben erzeugt. Es werden keine
          Tatsachen ergänzt und keine Rechtsaussagen formuliert.
        </p>
      </div>

      {/* Veraltungshinweis */}
      {props.isStale && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground"
        >
          <p className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            Die Angaben zum Fall haben sich geändert. Bitte prüfen Sie die Entwürfe.
          </p>
          <button
            type="button"
            onClick={props.onRefresh}
            disabled={props.preparing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {props.preparing ? "Aktualisiere …" : "Aktualisieren"}
          </button>
        </div>
      )}

      {/* Vorlagen */}
      {entry.templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-sm text-foreground/85">
          Für diesen Vorgang ist derzeit keine passende Dokumentvorlage hinterlegt.
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Verfügbare Vorlagen">
          {entry.templates.map((t) => {
            const readiness = entry.readiness.find((r) => r.templateId === t.id);
            return (
              <TemplateCard
                key={t.id}
                template={t}
                readiness={readiness?.readiness ?? "unknown"}
                missing={readiness?.missingFields ?? []}
                onGenerate={() => props.onGenerate(t.id)}
              />
            );
          })}
        </ul>
      )}

      {/* Entwürfe */}
      {entry.drafts.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Entwürfe</h4>
          {entry.drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              isStale={props.staleDraftIds.has(d.id)}
              onUpdate={(md) => props.onUpdateDraft(d.id, md)}
              onRemove={() => props.onRemoveDraft(d.id)}
              onExport={(format) => props.onExport(d.id, format)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateCard(props: {
  template: DocumentationTemplateRef;
  readiness: DocumentationReadiness;
  missing: DocumentationMissingField[];
  onGenerate: () => void;
}) {
  const { template, readiness, missing } = props;
  const blocked = readiness === "blocked";
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            {template.title}
          </p>
          {template.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
          )}
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${READINESS_BADGE_CLASS[readiness]}`}
        >
          {readiness === "ready"
            ? "Vollständig"
            : readiness === "incomplete"
              ? `${missing.length} Angabe${missing.length === 1 ? "" : "n"} fehlt`
              : readiness === "blocked"
                ? "Nicht möglich"
                : "Wird geprüft"}
        </span>
      </div>
      {missing.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground" aria-label="Fehlende Angaben">
          {missing.slice(0, 5).map((m) => (
            <li key={`${m.key}:${m.reason}`}>• {missingFieldLabel(m)}</li>
          ))}
          {missing.length > 5 && <li>• … und {missing.length - 5} weitere</li>}
        </ul>
      )}
      <div className="mt-3">
        <button
          type="button"
          onClick={props.onGenerate}
          disabled={blocked}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Entwurf erzeugen
        </button>
      </div>
    </li>
  );
}

function DraftCard(props: {
  draft: DocumentationDraft;
  isStale: boolean;
  onUpdate: (markdown: string) => void;
  onRemove: () => void;
  onExport: (format: "md" | "docx" | "pdf") => void;
}) {
  const { draft } = props;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [text, setText] = useState(draft.markdown);
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{draft.title}</p>
        <div className="flex items-center gap-1.5">
          {draft.status === "edited" && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              Bearbeitet
            </span>
          )}
          {props.isStale && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Angaben geändert
            </span>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Erzeugt am {new Date(draft.createdAt).toLocaleString("de-DE")}
        {draft.missingPlaceholders.length > 0 &&
          ` · ${draft.missingPlaceholders.length} Stelle${draft.missingPlaceholders.length === 1 ? "" : "n"} offen (⟨fehlend⟩)`}
      </p>

      {mode === "view" ? (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-xs text-foreground">
          {draft.markdown}
        </pre>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="mt-3 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Entwurf bearbeiten"
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {mode === "view" ? (
          <>
            <button
              type="button"
              onClick={() => {
                setText(draft.markdown);
                setMode("edit");
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Bearbeiten
            </button>
            {(["pdf", "docx", "md"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => props.onExport(f)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> {f.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={props.onRemove}
              className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Löschen
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                props.onUpdate(text);
                setMode("view");
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Übernehmen
            </button>
            <button
              type="button"
              onClick={() => {
                setText(draft.markdown);
                setMode("view");
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Verwerfen
            </button>
          </>
        )}
      </div>
    </article>
  );
}
