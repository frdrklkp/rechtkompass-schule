/**
 * Sprint 4.5A – Deterministische Auflösung von Markdown-Platzhaltern.
 *
 * Grammatik:
 *   {{ path.to.value }}                  -> Ersetzen, wenn vorhanden.
 *   {{#each list}}...{{@item}}...{{/each}} -> Schleife über Array.
 *   {{ai:key}}                           -> Freitext-Slot; hier NICHT aufgelöst.
 *
 * Kein Erfinden: fehlende Werte werden markiert und im Report gemeldet.
 */
import { MISSING_MARK, type MissingPlaceholder } from "./types";

export interface ResolveInput {
  template: string;
  context: Record<string, unknown>;
  /** Bereits aufgelöste KI-Slots ({{ai:key}} -> Text). */
  aiValues?: Record<string, string>;
}

export interface ResolveOutput {
  markdown: string;
  missing: MissingPlaceholder[];
  usedKeys: string[];
}

function getPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toLocaleDateString("de-DE");
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return v.map((x) => (typeof x === "object" && x !== null ? JSON.stringify(x) : String(x))).join(", ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const EACH_RE = /\{\{#each\s+([a-zA-Z0-9_.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
const AI_RE = /\{\{\s*ai:([a-zA-Z0-9_.-]+)\s*\}\}/g;
const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function resolveEach(template: string, context: Record<string, unknown>, missing: MissingPlaceholder[], used: Set<string>): string {
  return template.replace(EACH_RE, (_m, path: string, inner: string) => {
    used.add(path);
    const list = getPath(context, path);
    if (!Array.isArray(list) || list.length === 0) {
      missing.push({ key: path, reason: "empty" });
      return `- ${MISSING_MARK}`;
    }
    return list
      .map((item) => {
        const itemCtx = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item };
        return inner
          .replace(/\{\{\s*@item\s*\}\}/g, stringify(item))
          .replace(VAR_RE, (_mm, key: string) => {
            const v = getPath(itemCtx, key);
            if (v == null || v === "") {
              missing.push({ key: `${path}[].${key}`, reason: v == null ? "unknown" : "empty" });
              return MISSING_MARK;
            }
            return stringify(v);
          });
      })
      .join("");
  });
}

export const PlaceholderResolver = {
  resolve({ template, context, aiValues = {} }: ResolveInput): ResolveOutput {
    const missing: MissingPlaceholder[] = [];
    const used = new Set<string>();

    // 1. Loops zuerst.
    let out = resolveEach(template, context, missing, used);

    // 2. KI-Slots (nur ausdrücklich markiert).
    out = out.replace(AI_RE, (_m, key: string) => {
      used.add(`ai:${key}`);
      const v = aiValues[key];
      if (!v || v.trim() === "") {
        missing.push({ key: `ai:${key}`, reason: "ai_disabled" });
        return MISSING_MARK;
      }
      return v;
    });

    // 3. Einfache Variablen.
    out = out.replace(VAR_RE, (_m, key: string) => {
      used.add(key);
      const v = getPath(context, key);
      if (v == null) {
        missing.push({ key, reason: "unknown" });
        return MISSING_MARK;
      }
      const s = stringify(v);
      if (s === "") {
        missing.push({ key, reason: "empty" });
        return MISSING_MARK;
      }
      return s;
    });

    return { markdown: out, missing, usedKeys: [...used] };
  },
};
