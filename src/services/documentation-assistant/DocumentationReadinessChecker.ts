/**
 * Sprint 4.6H – Deterministische Prüfung, ob eine Vorlage mit dem aktuellen
 * Dokumentationskontext vollständig befüllt werden kann.
 *
 * Fehlende Pflichtangaben werden vor der Generierung angezeigt; die
 * Erstellung bleibt bei „incomplete“ möglich (Lücken werden im Dokument
 * markiert), bei „blocked“ (kein Sachverhalt) ist sie ausgeschlossen.
 */
import type {
  DocumentationMissingField,
  DocumentationReadiness,
  DocumentationTemplateReadiness,
  DocumentationTemplateRef,
} from "./types";

const EACH_RE = /\{\{#each\s+([a-zA-Z0-9_.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
const AI_RE = /\{\{\s*ai:([a-zA-Z0-9_.-]+)\s*\}\}/g;
const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function getPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isMissing(value: unknown): "unknown" | "empty" | null {
  if (value == null) return "unknown";
  if (typeof value === "string" && value.trim() === "") return "empty";
  if (Array.isArray(value) && value.length === 0) return "empty";
  return null;
}

/**
 * Ermittelt alle benötigten Platzhalter einer Vorlage und prüft sie gegen
 * den Kontext. KI-Slots ({{ai:key}}) werden nie automatisch gefüllt und
 * gelten immer als fehlende, manuell zu ergänzende Angabe.
 */
export function checkTemplateReadiness(
  template: DocumentationTemplateRef,
  context: Record<string, unknown>,
  hasSituation: boolean,
): DocumentationTemplateReadiness {
  if (!hasSituation) {
    return { templateId: template.id, readiness: "blocked", missingFields: [] };
  }

  const missing: DocumentationMissingField[] = [];
  const seen = new Set<string>();
  const add = (key: string, reason: DocumentationMissingField["reason"]) => {
    const id = `${key}:${reason}`;
    if (seen.has(id)) return;
    seen.add(id);
    missing.push({ key, reason });
  };

  let body = template.markdownBody;

  // 1. Listenblöcke: Liste muss vorhanden und nicht leer sein; Item-Felder prüfen.
  body = body.replace(EACH_RE, (_m, path: string, inner: string) => {
    const list = getPath(context, path);
    const state = isMissing(list);
    if (state || !Array.isArray(list)) {
      add(path, state ?? "unknown");
      return "";
    }
    for (const item of list) {
      const itemCtx =
        typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
      for (const im of inner.matchAll(new RegExp(VAR_RE.source, "g"))) {
        const key = im[1];
        if (key === "@item") continue;
        const value = getPath(itemCtx, key);
        const itemState = isMissing(value);
        if (itemState) add(`${path}[].${key}`, itemState);
      }
    }
    return "";
  });

  // 2. KI-Slots (niemals automatisch befüllt).
  for (const m of body.matchAll(new RegExp(AI_RE.source, "g"))) {
    add(`ai:${m[1]}`, "ai_disabled");
  }

  // 3. Einfache Variablen.
  for (const m of body.matchAll(new RegExp(VAR_RE.source, "g"))) {
    const key = m[1];
    const state = isMissing(getPath(context, key));
    if (state) add(key, state);
  }

  const readiness: DocumentationReadiness = missing.length > 0 ? "incomplete" : "ready";
  return { templateId: template.id, readiness, missingFields: missing };
}

/** Gesamtstatus über alle Vorlagen hinweg. */
export function overallReadiness(
  hasSituation: boolean,
  readiness: DocumentationTemplateReadiness[],
): DocumentationReadiness {
  if (!hasSituation) return "blocked";
  if (readiness.length === 0) return "unknown";
  if (readiness.some((r) => r.readiness === "ready")) return "ready";
  return "incomplete";
}
