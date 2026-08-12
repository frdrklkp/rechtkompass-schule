// Minimalistischer JSON-Schema-Validator (Subset). Ziel: Strukturierte
// LLM-Antworten vor der Übernahme prüfen. Bewusst dependency-frei, damit
// er sowohl client- als auch serverseitig läuft.
//
// Unterstützt: type (string, number, integer, boolean, object, array, null),
// required, properties, items, enum, additionalProperties (boolean).

export interface SchemaValidationResult {
  ok: boolean;
  errors: string[];
}

type Schema = Record<string, unknown>;

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function validate(node: unknown, schema: Schema, path: string, errs: string[]): void {
  const t = schema.type as string | string[] | undefined;
  if (t) {
    const types = Array.isArray(t) ? t : [t];
    const actual = typeOf(node);
    const match = types.some((tt) => {
      if (tt === "integer") return actual === "number" && Number.isInteger(node);
      return actual === tt;
    });
    if (!match) {
      errs.push(`${path || "root"}: expected ${types.join("|")}, got ${actual}`);
      return;
    }
  }

  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((e) => e === node)) {
      errs.push(`${path || "root"}: value not in enum`);
    }
  }

  if (typeOf(node) === "object") {
    const obj = node as Record<string, unknown>;
    const props = (schema.properties as Record<string, Schema>) ?? {};
    const required = (schema.required as string[]) ?? [];
    for (const req of required) {
      if (!(req in obj)) errs.push(`${path || "root"}: missing required "${req}"`);
    }
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) validate(v, props[k], `${path}.${k}`, errs);
      else if (schema.additionalProperties === false) {
        errs.push(`${path || "root"}: unexpected property "${k}"`);
      }
    }
  }

  if (typeOf(node) === "array" && schema.items) {
    const arr = node as unknown[];
    const itemSchema = schema.items as Schema;
    arr.forEach((it, i) => validate(it, itemSchema, `${path}[${i}]`, errs));
  }
}

export function validateAgainstSchema(value: unknown, schema: Schema): SchemaValidationResult {
  const errs: string[] = [];
  try {
    validate(value, schema, "", errs);
  } catch (e) {
    errs.push(`validator crash: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { ok: errs.length === 0, errors: errs };
}

export class SchemaViolationError extends Error {
  errors: string[];
  raw: unknown;
  constructor(errors: string[], raw: unknown) {
    super(`Schema violation: ${errors.slice(0, 3).join("; ")}`);
    this.name = "SchemaViolationError";
    this.errors = errors;
    this.raw = raw;
  }
}
