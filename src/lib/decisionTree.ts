/**
 * Kuratierter Entscheidungsbaum pro Praxisfall.
 *
 * Quelle: practice_cases.decision_tree (jsonb).
 *
 * Erwartete Struktur (fallspezifisch, redaktionell gepflegt):
 *
 * {
 *   "start": "q1",
 *   "steps": {
 *     "q1": {
 *       "question": "…",
 *       "explanation": "optional",
 *       "options": [
 *         { "label": "…", "next": "q2" },
 *         { "label": "…", "result": "r_a" }
 *       ]
 *     }
 *   },
 *   "results": {
 *     "r_a": {
 *       "title": "…",
 *       "color": "gruen" | "gelb" | "rot",
 *       "urgency": "…",
 *       "recommendation": "…",
 *       "responsible": "…",
 *       "documentation": "…",
 *       "warning": "…",
 *       "steps": ["…", "…"]
 *     }
 *   }
 * }
 *
 * Die alten regelbasierten Bäume ({start, steps} mit recommendation: "A"|"B"|"C")
 * bleiben als Fallback erhalten (siehe caseEnrichment.getDecisionTree) und werden
 * NUR intern für Diagnose/Vorschau genutzt – im Lehrer-Frontend nicht mehr prominent.
 */

export type CuratedTreeColor = "gruen" | "gelb" | "rot";

export interface CuratedResult {
  title: string;
  color: CuratedTreeColor;
  urgency: string;
  recommendation: string;
  responsible: string;
  documentation: string;
  warning: string;
  steps: string[];
}

export interface CuratedOption {
  label: string;
  next?: string;
  result?: string;
}

export interface CuratedStep {
  question: string;
  explanation?: string;
  options: CuratedOption[];
}

export type CuratedTreeStatus = "draft" | "review" | "approved";

export interface CuratedTreeMeta {
  status?: CuratedTreeStatus;
  updatedAt?: string;
  version?: number;
}

export interface CuratedDecisionTree {
  start: string;
  steps: Record<string, CuratedStep>;
  results: Record<string, CuratedResult>;
  meta?: CuratedTreeMeta;
}


export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Streng-tolerante Prüfung: liest ein unbekanntes JSON, gibt entweder einen
 * validen kuratierten Baum zurück oder null (mit optionaler Fehlerausgabe).
 */
export function parseCuratedTree(raw: unknown): CuratedDecisionTree | null {
  if (!isRecord(raw)) return null;
  const start = raw.start;
  const steps = raw.steps;
  const results = raw.results;
  if (typeof start !== "string" || !isRecord(steps) || !isRecord(results)) {
    return null;
  }
  // Minimale Formprüfung, damit downstream sicher darauf zugreifen kann.
  const stepsOut: Record<string, CuratedStep> = {};
  for (const [id, step] of Object.entries(steps)) {
    if (!isRecord(step)) return null;
    if (typeof step.question !== "string" || !Array.isArray(step.options)) return null;
    const options: CuratedOption[] = [];
    for (const opt of step.options as unknown[]) {
      if (!isRecord(opt) || typeof opt.label !== "string") return null;
      options.push({
        label: opt.label,
        next: typeof opt.next === "string" ? opt.next : undefined,
        result: typeof opt.result === "string" ? opt.result : undefined,
      });
    }
    stepsOut[id] = {
      question: step.question,
      explanation: typeof step.explanation === "string" ? step.explanation : undefined,
      options,
    };
  }
  const resultsOut: Record<string, CuratedResult> = {};
  for (const [id, r] of Object.entries(results)) {
    if (!isRecord(r)) return null;
    const color = r.color === "gruen" || r.color === "gelb" || r.color === "rot" ? r.color : "gelb";
    resultsOut[id] = {
      title: typeof r.title === "string" ? r.title : "",
      color,
      urgency: typeof r.urgency === "string" ? r.urgency : "",
      recommendation: typeof r.recommendation === "string" ? r.recommendation : "",
      responsible: typeof r.responsible === "string" ? r.responsible : "",
      documentation: typeof r.documentation === "string" ? r.documentation : "",
      warning: typeof r.warning === "string" ? r.warning : "",
      steps: Array.isArray(r.steps) ? r.steps.filter((x) => typeof x === "string") : [],
    };
  }
  const metaRaw = (raw as { meta?: unknown }).meta;
  let meta: CuratedTreeMeta | undefined;
  if (isRecord(metaRaw)) {
    const status =
      metaRaw.status === "draft" || metaRaw.status === "review" || metaRaw.status === "approved"
        ? metaRaw.status
        : undefined;
    meta = {
      status,
      updatedAt: typeof metaRaw.updatedAt === "string" ? metaRaw.updatedAt : undefined,
      version: typeof metaRaw.version === "number" ? metaRaw.version : undefined,
    };
  }
  return { start, steps: stepsOut, results: resultsOut, meta };
}

/**
 * Deterministische Validierung. Verwendet u.a. für Admin-Freigabe.
 */
export function validateCuratedTree(tree: CuratedDecisionTree): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!tree.steps[tree.start]) {
    errors.push({ level: "error", message: "Startknoten existiert nicht", nodeId: tree.start });
  }

  const reachable = new Set<string>();
  const stack = [tree.start];
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id) || !tree.steps[id]) continue;
    reachable.add(id);
    for (const opt of tree.steps[id].options) {
      if (opt.next) stack.push(opt.next);
    }
  }

  for (const [id, step] of Object.entries(tree.steps)) {
    if (!step.question.trim()) {
      errors.push({ level: "error", message: "Leerer Fragetext", nodeId: id });
    }
    if (step.options.length < 2) {
      errors.push({ level: "error", message: "Frage benötigt mindestens zwei Antworten", nodeId: id });
    }
    for (const opt of step.options) {
      if (!opt.next && !opt.result) {
        errors.push({ level: "error", message: `Antwort „${opt.label}“ ohne Ziel`, nodeId: id });
        continue;
      }
      if (opt.next && !tree.steps[opt.next]) {
        errors.push({ level: "error", message: `Antwort verweist auf unbekannten Knoten „${opt.next}“`, nodeId: id });
      }
      if (opt.result && !tree.results[opt.result]) {
        errors.push({ level: "error", message: `Antwort verweist auf unbekanntes Ergebnis „${opt.result}“`, nodeId: id });
      }
    }
    if (!reachable.has(id)) {
      warnings.push({ level: "warning", message: "Unerreichbarer Knoten", nodeId: id });
    }
  }

  // Terminierung / Endlosschleifen-Erkennung durch DFS mit Tiefenlimit.
  const MAX_DEPTH = 20;
  const visit = (id: string, seen: Set<string>, depth: number): void => {
    if (depth > MAX_DEPTH) {
      errors.push({ level: "error", message: "Zu tiefer Pfad – vermutlich Endlosschleife", nodeId: id });
      return;
    }
    if (seen.has(id)) {
      errors.push({ level: "error", message: "Zyklus erkannt", nodeId: id });
      return;
    }
    const step = tree.steps[id];
    if (!step) return;
    for (const opt of step.options) {
      if (opt.result) continue;
      if (opt.next) visit(opt.next, new Set(seen).add(id), depth + 1);
    }
  };
  if (tree.steps[tree.start]) visit(tree.start, new Set(), 0);

  for (const [rid, r] of Object.entries(tree.results)) {
    if (!r.recommendation.trim()) {
      errors.push({ level: "error", message: `Ergebnis „${rid}“ ohne Empfehlung` });
    }
    if (!r.warning.trim()) {
      warnings.push({ level: "warning", message: `Ergebnis „${rid}“ ohne Warnhinweis` });
    }
    if (!r.documentation.trim()) {
      warnings.push({ level: "warning", message: `Ergebnis „${rid}“ ohne Dokumentationshinweis` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Wird der Baum im Lehrer-Frontend prominent gezeigt?
 * Nur wenn strukturell valide und mindestens ein sinnvolles Ergebnis vorhanden.
 */
export function isCuratedTreeReady(raw: unknown): boolean {
  const parsed = parseCuratedTree(raw);
  if (!parsed) return false;
  if (Object.keys(parsed.steps).length === 0) return false;
  if (Object.keys(parsed.results).length === 0) return false;
  return validateCuratedTree(parsed).valid;
}

/**
 * Nur explizit freigegebene, valide Bäume dürfen im Lehrer-Frontend erscheinen.
 * Bäume ohne meta.status oder mit status "draft"/"review" bleiben unsichtbar.
 */
export function isCuratedTreeApproved(raw: unknown): boolean {
  const parsed = parseCuratedTree(raw);
  if (!parsed) return false;
  if (parsed.meta?.status !== "approved") return false;
  if (Object.keys(parsed.steps).length === 0) return false;
  if (Object.keys(parsed.results).length === 0) return false;
  return validateCuratedTree(parsed).valid;
}

export function deriveTreeStatus(
  raw: unknown,
): "none" | "draft" | "review" | "approved" | "invalid" {
  if (raw == null) return "none";
  const parsed = parseCuratedTree(raw);
  if (!parsed) return "invalid";
  if (Object.keys(parsed.steps).length === 0 && Object.keys(parsed.results).length === 0) {
    return "none";
  }
  const report = validateCuratedTree(parsed);
  if (!report.valid && parsed.meta?.status === "approved") return "invalid";
  if (parsed.meta?.status === "approved") return "approved";
  if (parsed.meta?.status === "review") return "review";
  if (!report.valid) return "invalid";
  return "draft";
}

export function emptyCuratedTree(): CuratedDecisionTree {
  return {
    start: "step_1",
    steps: {
      step_1: {
        question: "",
        options: [
          { label: "Antwort A" },
          { label: "Antwort B" },
        ],
      },
    },
    results: {},
    meta: { status: "draft", version: 1, updatedAt: new Date().toISOString() },
  };
}

export function nextStepId(tree: CuratedDecisionTree): string {
  const nums = Object.keys(tree.steps)
    .map((k) => {
      const m = /^step_(\d+)$/.exec(k);
      return m ? parseInt(m[1], 10) : 0;
    });
  return `step_${Math.max(0, ...nums) + 1}`;
}

export function nextResultId(tree: CuratedDecisionTree): string {
  const used = new Set(Object.keys(tree.results));
  const abc = "abcdefghijklmnopqrstuvwxyz";
  for (const ch of abc) {
    const id = `result_${ch}`;
    if (!used.has(id)) return id;
  }
  return `result_${used.size + 1}`;
}

export function stepReferences(
  tree: CuratedDecisionTree,
  targetStepId: string,
): Array<{ stepId: string; optionIndex: number }> {
  const refs: Array<{ stepId: string; optionIndex: number }> = [];
  for (const [id, s] of Object.entries(tree.steps)) {
    s.options.forEach((o, i) => {
      if (o.next === targetStepId) refs.push({ stepId: id, optionIndex: i });
    });
  }
  return refs;
}

export function resultReferences(
  tree: CuratedDecisionTree,
  targetResultId: string,
): Array<{ stepId: string; optionIndex: number }> {
  const refs: Array<{ stepId: string; optionIndex: number }> = [];
  for (const [id, s] of Object.entries(tree.steps)) {
    s.options.forEach((o, i) => {
      if (o.result === targetResultId) refs.push({ stepId: id, optionIndex: i });
    });
  }
  return refs;
}
