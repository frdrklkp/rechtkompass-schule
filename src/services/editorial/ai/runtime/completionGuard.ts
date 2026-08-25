// Fund 2026-08-21: alle vier direkt aufrufenden ai-*-Routen
// (ai-draft-batch-item.ts, ai-match-legal-sections.ts,
// ai-validate-legal-claims.ts, ai-draft-decision-tree.ts) riefen
// provider.complete() ohne jede Validierung des Ergebnisses auf - der
// bestehende Schema-Validator (schemaValidator.ts) existierte zwar, war
// aber nur hinter AIModelRouter.runTask() verdrahtet, das diese vier
// Routen nicht nutzen. Live gefunden: ein Praxisfall-Entwurf enthielt in
// `short_description` einen wörtlichen Rest von Tool-Call-Pseudosyntax
// ("</description>\n<parameter name=\"short_answer\">...") - zwei Felder
// waren im Modell-Output ineinander verschmolzen, das eigentlich
// erforderliche `short_answer`-Feld blieb leer. `validateAgainstSchema`
// allein hätte das NICHT gefangen: es prüft nur, ob ein required Key
// existiert, nicht ob ein String-Wert leer ist oder verdächtige
// Fragmente enthält. Dieser Wrapper ergänzt genau diese zwei Prüfungen
// und wiederholt den Aufruf einmal, bevor er endgültig aufgibt.

import { validateAgainstSchema, type SchemaValidationResult } from "./schemaValidator";
import { withRetry } from "./retry";

// Muster, die auf in JSON-Strings ausgelaufene Tool-Call-Syntax hindeuten -
// darf in echtem Fließtext praktisch nie vorkommen.
const LEAK_PATTERNS = [
  /<\/?parameter\b/i,
  /<\/?invoke\b/i,
  /<\/?function_calls?\b/i,
  /<\/?antml:/i,
  /<\/?tool_use\b/i,
];

function findLeakedArtifacts(node: unknown, path: string, errs: string[]): void {
  if (typeof node === "string") {
    for (const pat of LEAK_PATTERNS) {
      if (pat.test(node)) {
        errs.push(`${path || "root"}: enthält verdächtiges Tool-Call-Fragment (${pat})`);
        break;
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => findLeakedArtifacts(v, `${path}[${i}]`, errs));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      findLeakedArtifacts(v, path ? `${path}.${k}` : k, errs);
    }
  }
}

function findEmptyRequired(node: unknown, schema: Record<string, unknown>, path: string, errs: string[]): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  const obj = node as Record<string, unknown>;
  const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
  const required = (schema.required as string[]) ?? [];
  for (const key of required) {
    const v = obj[key];
    if (typeof v === "string" && v.trim().length === 0) {
      errs.push(`${path ? `${path}.${key}` : key}: erforderliches Feld ist leer`);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (props[k]) findEmptyRequired(v, props[k], path ? `${path}.${k}` : k, errs);
  }
}

export function validateCompletionOutput(
  value: unknown,
  schema: Record<string, unknown>,
): SchemaValidationResult {
  const base = validateAgainstSchema(value, schema);
  const extra: string[] = [];
  findEmptyRequired(value, schema, "", extra);
  findLeakedArtifacts(value, "", extra);
  return { ok: base.ok && extra.length === 0, errors: [...base.errors, ...extra] };
}

/**
 * Fund 2026-08-21: bei umfangreichen Schemas liefert das Modell ein als
 * Array-von-Strings deklariertes Feld reproduzierbar gelegentlich als EINEN
 * zusammengefassten String mit Zeilenumbrüchen/'-'-Aufzählung statt
 * einzelner Array-Elemente - inhaltlich vollständig nutzbar, nur falsch
 * verpackt (live beobachtet bei ai-draft-batch-item.ts: checklist/
 * common_mistakes/documentation, auch nach mehreren Prompt-Präzisierungen
 * weiterhin reproduzierbar). Statt die gesamte, sonst valide Antwort deshalb
 * zu verwerfen und einen weiteren KI-Aufruf zu erzwingen, wird GENAU dieser
 * eine, sicher verlustfreie Fall repariert - mit derselben Bullet-Erkennung,
 * die an anderer Stelle bereits für denselben Zweck verwendet wird
 * (caseEnrichment.ts toBullets). Jede andere Typabweichung bleibt ein
 * echter, nicht automatisch reparierter Validierungsfehler.
 */
function splitToBulletArray(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  const lines = s.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  const source = lines.length > 1 ? lines : [s];
  const items: string[] = [];
  for (const line of source) {
    const cleaned = line.replace(/^\s*([-*•–—]|\d+[.)])\s+/, "").trim();
    if (cleaned) items.push(cleaned);
  }
  return items;
}

function coerceStringArrays(value: unknown, schema: Record<string, unknown>): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const obj = value as Record<string, unknown>;
  const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
  for (const [key, propSchema] of Object.entries(props)) {
    const items = propSchema?.items as Record<string, unknown> | undefined;
    if (propSchema?.type === "array" && items?.type === "string" && typeof obj[key] === "string") {
      obj[key] = splitToBulletArray(obj[key] as string);
    }
  }
}

/**
 * Fund 2026-08-25 (ai-validate-legal-claims.ts, Retro-Validierungslauf):
 * bei `consistency_conflicts` (type: array of string) lieferte das Modell
 * reproduzierbar - auch nach dem eingebauten Retry - ein Array von OBJEKTEN
 * statt Strings (z. B. mit Feldern wie "aussage_1"/"aussage_2"/"widerspruch"),
 * offenbar weil das Feld inhaltlich einen strukturierten Vergleich zweier
 * Aussagen beschreibt und das Modell diese Struktur ins JSON durchreicht.
 * Statt die sonst valide, inhaltlich brauchbare Antwort zu verwerfen, wird
 * jedes Objekt-Element verlustfrei in einen lesbaren "Feld: Wert"-String
 * aufgelöst - derselbe Reparatur-statt-Verwerfen-Ansatz wie bei
 * coerceStringArrays oben, nur für die Elementebene statt die Feldebene.
 */
function objectToReadableString(node: unknown, depth = 0): string {
  if (typeof node === "string") return node.trim();
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (node == null || depth > 3) return "";
  if (Array.isArray(node)) {
    return node
      .map((v) => objectToReadableString(v, depth + 1))
      .filter(Boolean)
      .join("; ");
  }
  if (typeof node === "object") {
    return Object.entries(node as Record<string, unknown>)
      .map(([k, v]) => {
        const text = objectToReadableString(v, depth + 1);
        return text ? `${k}: ${text}` : "";
      })
      .filter(Boolean)
      .join(" – ");
  }
  return "";
}

function coerceObjectArrayItems(value: unknown, schema: Record<string, unknown>): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const obj = value as Record<string, unknown>;
  const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
  for (const [key, propSchema] of Object.entries(props)) {
    const items = propSchema?.items as Record<string, unknown> | undefined;
    if (propSchema?.type === "array" && items?.type === "string" && Array.isArray(obj[key])) {
      obj[key] = (obj[key] as unknown[]).map((item) =>
        typeof item === "string" ? item : objectToReadableString(item),
      );
    }
  }
}

export class CompletionValidationError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(`KI-Antwort ungültig: ${errors.slice(0, 3).join("; ")}`);
    this.name = "CompletionValidationError";
    this.errors = errors;
  }
}

/**
 * Führt `call()` aus (typischerweise ein provider.complete(...).then(r =>
 * r.json)) und validiert das Ergebnis gegen `schema`. Bei Verstoß wird
 * `call()` bis zu `maxAttempts`-mal (Default 2) erneut versucht - deckt
 * genau den seltenen, aber realen Fall ab, dass das Modell bei einem
 * langen Schema zwei Felder im JSON-Output ineinander verschmilzt.
 */
export async function completeWithValidation<T>(
  call: () => Promise<T>,
  schema: Record<string, unknown>,
  maxAttempts = 2,
): Promise<T> {
  return withRetry(
    async () => {
      const result = await call();
      coerceStringArrays(result, schema);
      coerceObjectArrayItems(result, schema);
      const check = validateCompletionOutput(result, schema);
      if (!check.ok) throw new CompletionValidationError(check.errors);
      return result;
    },
    { maxAttempts, isRetryable: () => true, initialDelayMs: 200 },
  );
}
