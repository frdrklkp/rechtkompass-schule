// Versionsliste + redaktioneller Feld-Diff.
// Zeigt fachliche Änderungen ("Titel geändert", "FAQ ergänzt", ...).
// Technische Rohansicht nur für Admins.

import { useMemo, useState } from "react";
import type { CaseVersionRow } from "@/services/editorial";
import { useEditorialRole } from "@/hooks/editorial/useEditorialRole";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Redaktionell relevante Felder mit deutschem Klartext-Label.
const FIELD_LABELS: Array<{ key: string; label: string }> = [
  { key: "title", label: "Titel" },
  { key: "short_description", label: "Kurzbeschreibung" },
  { key: "long_description", label: "Ausführliche Beschreibung" },
  { key: "recommendation", label: "Handlungsempfehlung" },
  { key: "legal_explanation", label: "Rechtliche Einordnung" },
  { key: "immediate_actions", label: "Sofortmaßnahmen" },
  { key: "responsibilities", label: "Zuständigkeiten" },
  { key: "practice_tip", label: "Praxistipp" },
  { key: "short_answer", label: "Kurzantwort" },
  { key: "checklist", label: "Checkliste" },
  { key: "documentation", label: "Dokumentationshinweise" },
  { key: "common_mistakes", label: "Häufige Fehler" },
  { key: "faq", label: "FAQ" },
  { key: "category", label: "Kategorie" },
  { key: "subcategory", label: "Unterkategorie" },
];

type ChangeKind = "added" | "removed" | "changed" | "unchanged";

interface FieldDiff {
  key: string;
  label: string;
  kind: ChangeKind;
  summary: string;
  before: string;
  after: string;
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join("\n");
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function itemCount(v: unknown): number | null {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v as object).length;
  return null;
}

function computeDiff(
  key: string,
  label: string,
  before: unknown,
  after: unknown,
): FieldDiff {
  const beforeEmpty = isEmpty(before);
  const afterEmpty = isEmpty(after);
  const beforeText = toText(before);
  const afterText = toText(after);
  const changed = beforeText !== afterText;

  let kind: ChangeKind = "unchanged";
  let summary = "keine Änderung";

  if (!changed) {
    return { key, label, kind, summary, before: beforeText, after: afterText };
  }

  const beforeCount = itemCount(before);
  const afterCount = itemCount(after);

  if (beforeEmpty && !afterEmpty) {
    kind = "added";
    summary =
      afterCount != null ? `${label} ergänzt (${afterCount})` : `${label} ergänzt`;
  } else if (!beforeEmpty && afterEmpty) {
    kind = "removed";
    summary = `${label} entfernt`;
  } else if (beforeCount != null && afterCount != null) {
    kind = "changed";
    if (afterCount > beforeCount) {
      summary = `${label} erweitert (${beforeCount} → ${afterCount})`;
    } else if (afterCount < beforeCount) {
      summary = `${label} gekürzt (${beforeCount} → ${afterCount})`;
    } else {
      summary = `${label} überarbeitet`;
    }
  } else {
    kind = "changed";
    const oldLen = beforeText.length;
    const newLen = afterText.length;
    if (newLen > oldLen * 1.15) summary = `${label} erweitert`;
    else if (newLen < oldLen * 0.85) summary = `${label} gekürzt`;
    else summary = `${label} überarbeitet`;
  }

  return { key, label, kind, summary, before: beforeText, after: afterText };
}

const KIND_TONE: Record<ChangeKind, string> = {
  added:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  removed:
    "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  changed:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  unchanged: "border-border bg-muted/30 text-muted-foreground",
};

const KIND_LABEL: Record<ChangeKind, string> = {
  added: "Ergänzt",
  removed: "Entfernt",
  changed: "Geändert",
  unchanged: "—",
};

export function VersionList({
  versions,
  currentVersionId,
}: {
  versions: CaseVersionRow[];
  currentVersionId?: string | null;
}) {
  const role = useEditorialRole();
  const [compareA, setCompareA] = useState<string | null>(
    versions[1]?.id ?? null,
  );
  const [compareB, setCompareB] = useState<string | null>(
    versions[0]?.id ?? null,
  );
  const [showRaw, setShowRaw] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const a = useMemo(
    () => versions.find((v) => v.id === compareA),
    [versions, compareA],
  );
  const b = useMemo(
    () => versions.find((v) => v.id === compareB),
    [versions, compareB],
  );

  const diffs = useMemo<FieldDiff[]>(() => {
    const snapA = (a?.snapshot ?? {}) as Record<string, unknown>;
    const snapB = (b?.snapshot ?? {}) as Record<string, unknown>;
    return FIELD_LABELS.map(({ key, label }) =>
      computeDiff(key, label, snapA[key], snapB[key]),
    );
  }, [a, b]);

  const visibleDiffs = showUnchanged
    ? diffs
    : diffs.filter((d) => d.kind !== "unchanged");
  const changeCount = diffs.filter((d) => d.kind !== "unchanged").length;

  if (!versions.length) {
    return (
      <p className="text-sm text-muted-foreground">Keine Versionen vorhanden.</p>
    );
  }

  return (
    <div className="space-y-4">
      <ul
        className="divide-y divide-border rounded-md border border-border bg-card"
        aria-label="Versionsverlauf"
      >
        {versions.map((v) => (
          <li
            key={v.id}
            className="flex items-center justify-between px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium">v{v.version_no}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {new Date(v.created_at).toLocaleString("de-DE")}
              </span>
              {v.id === currentVersionId && (
                <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  aktuell
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {v.created_by ? v.created_by.slice(0, 8) : "—"}
            </span>
          </li>
        ))}
      </ul>

      <div className="rounded-md border border-border bg-card p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Vergleich:</span>
          <label className="sr-only" htmlFor="cmp-a">
            Vergleichsversion A
          </label>
          <select
            id="cmp-a"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            value={compareA ?? ""}
            onChange={(e) => setCompareA(e.target.value)}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version_no}
              </option>
            ))}
          </select>
          <span aria-hidden="true">→</span>
          <label className="sr-only" htmlFor="cmp-b">
            Vergleichsversion B
          </label>
          <select
            id="cmp-b"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            value={compareB ?? ""}
            onChange={(e) => setCompareB(e.target.value)}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version_no}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">
            {changeCount === 0
              ? "Keine redaktionellen Änderungen"
              : `${changeCount} redaktionelle Änderung${changeCount === 1 ? "" : "en"}`}
          </span>
          <button
            type="button"
            onClick={() => setShowUnchanged((v) => !v)}
            className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
            aria-pressed={showUnchanged}
          >
            {showUnchanged ? "Nur Änderungen" : "Alle Felder"}
          </button>
        </div>

        {visibleDiffs.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Keine redaktionellen Änderungen zwischen v{a?.version_no ?? "?"} und
            v{b?.version_no ?? "?"}.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleDiffs.map((d) => (
              <li
                key={d.key}
                className="rounded-md border border-border bg-background p-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                      KIND_TONE[d.kind],
                    )}
                  >
                    {KIND_LABEL[d.kind]}
                  </span>
                  <span className="text-xs font-medium">{d.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {d.summary}
                  </span>
                </div>
                {d.kind !== "unchanged" && (
                  <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                    <div className="rounded border border-border bg-muted/30 p-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        v{a?.version_no ?? "?"}
                      </div>
                      <div className="line-clamp-4 whitespace-pre-wrap break-words text-muted-foreground">
                        {d.before || "—"}
                      </div>
                    </div>
                    <div className="rounded border border-border bg-muted/10 p-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        v{b?.version_no ?? "?"}
                      </div>
                      <div className="line-clamp-4 whitespace-pre-wrap break-words">
                        {d.after || "—"}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {role.isAdmin && (
        <details
          className="rounded-md border border-border bg-muted/30 p-3"
          open={showRaw}
          onToggle={(e) =>
            setShowRaw((e.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary className="flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground">
            {showRaw ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            JSON-Rohansicht (Admin)
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-[10px]">
            {JSON.stringify({ a: a?.snapshot, b: b?.snapshot }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
