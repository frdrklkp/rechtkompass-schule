/**
 * Sprint 4.6E – Redaktionelle Pflege des Matching-Profils eines Praxisfalls.
 *
 * Die Komponente stellt ausschließlich dar und speichert. Ableitung, Reifegrad,
 * Validierung und Indexstatus stammen unverändert aus der Matching-Grundlage.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SignalPicker, TokenListEditor } from "./TokenListEditor";
import {
  MATCH_LOCATION_LABELS,
  MATCH_PROFILE_STATUS_LABELS,
  MATCH_ROLE_LABELS,
  MATCH_SIGNALS,
  MATCH_SIGNAL_LABELS,
  buildProfilePanelModel,
  type MatchProfileStatus,
  type MatchingProfile,
  type PracticeCaseSource,
} from "@/services/practice-case-matching";
import {
  useMatchingIndex,
  usePracticeCaseSource,
  useSaveMatchingProfile,
} from "@/hooks/matching/usePracticeCaseMatching";

const STATUS_OPTIONS: MatchProfileStatus[] = ["derived", "draft", "review", "approved"];

const SCALE = [1, 2, 3, 4, 5];

function ReadinessBadge({ level }: { level: "ready" | "partial" | "notReady" }) {
  const map = {
    ready: { label: "Matching-bereit", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" },
    partial: { label: "Teilweise bereit", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
    notReady: { label: "Nicht bereit", cls: "border-rose-500/40 bg-rose-500/10 text-rose-700" },
  } as const;
  const v = map[level];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]", v.cls)}>
      {v.label}
    </span>
  );
}

export interface MatchingProfilePanelProps {
  caseId: string;
  /** Optional vorhandener Quelldatensatz (spart einen Ladevorgang). */
  source?: PracticeCaseSource | null;
  /** Wird nach erfolgreichem Speichern aufgerufen (z. B. zum Auffrischen). */
  onSaved?: () => void;
}

export function MatchingProfilePanel({ caseId, source: given, onSaved }: MatchingProfilePanelProps) {
  const sourceQ = usePracticeCaseSource(given ? null : caseId);
  const source = given ?? sourceQ.data ?? null;
  const { index } = useMatchingIndex();
  const save = useSaveMatchingProfile(caseId);

  const model = useMemo(
    () => (source ? buildProfilePanelModel(source, index) : null),
    [source, index],
  );

  const [draft, setDraft] = useState<MatchingProfile | null>(null);
  useEffect(() => {
    if (model) setDraft(model.profile);
  }, [model?.caseId, model?.indexStatus.contentHash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (caseId === "neu") {
    return (
      <p className="text-sm text-muted-foreground">
        Das Matching-Profil steht zur Verfügung, sobald der Praxisfall gespeichert ist.
      </p>
    );
  }
  if (sourceQ.isLoading && !source) {
    return <p className="text-sm text-muted-foreground">Matching-Profil wird geladen …</p>;
  }
  if (!model || !draft) {
    return (
      <p className="text-sm text-muted-foreground">
        Für diesen Praxisfall liegen keine Matching-Daten vor.
      </p>
    );
  }

  const patch = (p: Partial<MatchingProfile>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const derived = model.derivedProfile;

  return (
    <div className="space-y-5">
      {/* Status und Reifegrad */}
      <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-3">
        <div>
          <Label className="mb-1.5 block text-xs">Profilstatus</Label>
          <select
            value={draft.status}
            onChange={(e) => patch({ status: e.target.value as MatchProfileStatus })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {MATCH_PROFILE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Herkunft: {model.curated ? "redaktionell gepflegt" : "automatisch abgeleitet"}
          </p>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Reifegrad</Label>
          <div className="flex items-center gap-2">
            <ReadinessBadge level={model.readiness.level} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {model.readiness.score} / 100
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {model.readiness.indexable ? "Indexierbar" : "Nicht indexierbar"}
          </p>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Indexstatus</Label>
          <p className="text-xs">{model.indexStatus.stateLabel}</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Profil-Hash {model.indexStatus.contentHash}
            {model.indexStatus.indexedHash
              ? ` · Index ${model.indexStatus.indexedHash}`
              : ""}
          </p>
        </div>
      </div>

      {/* Steuerung */}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex items-center gap-2 rounded-md border border-border p-2.5 text-xs">
          <input
            type="checkbox"
            checked={draft.matchingEnabled !== false}
            onChange={(e) => patch({ matchingEnabled: e.target.checked })}
          />
          Für Matching freigegeben
        </label>
        {(["priority", "specificity"] as const).map((key) => (
          <div key={key}>
            <Label className="mb-1.5 block text-xs">
              {key === "priority" ? "Priorität (Reihenfolge)" : "Spezifität (Dokumentation)"}
            </Label>
            <div className="flex gap-1.5">
              {SCALE.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => patch({ [key]: n } as Partial<MatchingProfile>)}
                  className={cn(
                    "h-8 w-8 rounded-md border text-xs tabular-nums",
                    (draft[key] ?? 3) === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Merkmale */}
      <div className="grid gap-4 md:grid-cols-2">
        <TokenListEditor
          label="Kategorien"
          values={draft.categories}
          suggestions={derived.categories}
          onChange={(categories) => patch({ categories })}
        />
        <TokenListEditor
          label="Unterkategorien"
          values={draft.subcategories}
          suggestions={derived.subcategories}
          onChange={(subcategories) => patch({ subcategories })}
        />
        <TokenListEditor
          label="Schlagwörter"
          values={draft.keywords}
          suggestions={derived.keywords}
          onChange={(keywords) => patch({ keywords })}
        />
        <TokenListEditor
          label="Synonyme"
          values={draft.synonyms}
          suggestions={derived.synonyms}
          onChange={(synonyms) => patch({ synonyms })}
        />
        <SignalPicker
          label="Beteiligtenrollen"
          options={Object.keys(MATCH_ROLE_LABELS)}
          optionLabels={MATCH_ROLE_LABELS}
          values={draft.roles}
          suggestions={derived.roles}
          onChange={(roles) => patch({ roles })}
        />
        <SignalPicker
          label="Orte"
          options={Object.keys(MATCH_LOCATION_LABELS)}
          optionLabels={MATCH_LOCATION_LABELS}
          values={draft.locationTypes}
          suggestions={derived.locationTypes}
          onChange={(locationTypes) => patch({ locationTypes })}
        />
      </div>

      <div className="space-y-4">
        <SignalPicker
          label="Erwartete Situationsmerkmale"
          options={MATCH_SIGNALS}
          optionLabels={MATCH_SIGNAL_LABELS}
          values={draft.expectedSignals}
          suggestions={derived.expectedSignals}
          onChange={(expectedSignals) =>
            patch({ expectedSignals: expectedSignals as MatchingProfile["expectedSignals"] })
          }
        />
        <SignalPicker
          label="Verpflichtende Merkmale"
          options={MATCH_SIGNALS}
          optionLabels={MATCH_SIGNAL_LABELS}
          values={draft.requiredSignals}
          onChange={(requiredSignals) =>
            patch({ requiredSignals: requiredSignals as MatchingProfile["requiredSignals"] })
          }
        />
        <SignalPicker
          label="Ausschlussmerkmale"
          options={MATCH_SIGNALS}
          optionLabels={MATCH_SIGNAL_LABELS}
          values={draft.excludedSignals}
          onChange={(excludedSignals) =>
            patch({ excludedSignals: excludedSignals as MatchingProfile["excludedSignals"] })
          }
        />
      </div>

      <div>
        <Label className="mb-1.5 block text-xs">Redaktionelle Notiz</Label>
        <Textarea
          value={draft.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={3}
          placeholder="Warum wurde das Profil so gepflegt?"
        />
      </div>

      {/* Hinweise */}
      {(model.missingRequired.length > 0 || model.issues.length > 0) && (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
          {model.missingRequired.map((m) => (
            <p key={m.id} className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {m.label}: {m.hint}
              </span>
            </p>
          ))}
          {model.issues.map((i) => (
            <p
              key={i.code + i.message}
              className={cn(
                "flex items-start gap-1.5 text-[11px]",
                i.severity === "error" ? "text-rose-700" : "text-muted-foreground",
              )}
            >
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {i.message}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { ...draft, origin: "curated" },
              {
                onSuccess: () => {
                  toast.success("Matching-Profil gespeichert.");
                  onSaved?.();
                },
                onError: (e: unknown) =>
                  toast.error(
                    "Speichern fehlgeschlagen: " +
                      ((e as Error)?.message ?? "unbekannter Fehler"),
                  ),
              },
            )
          }
        >
          <Save className="h-4 w-4" /> Profil speichern
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDraft(model.derivedProfile)}
        >
          <RefreshCw className="h-4 w-4" /> Auf Ableitung zurücksetzen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={save.isPending || !model.curated}
          onClick={() =>
            save.mutate(null, {
              onSuccess: () => {
                toast.success("Kuratiertes Profil entfernt.");
                onSaved?.();
              },
            })
          }
        >
          Kuratierung löschen
        </Button>
        {model.readiness.indexable && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Fall wächst nach Veröffentlichung automatisch
            in den Index
          </span>
        )}
      </div>
    </div>
  );
}
