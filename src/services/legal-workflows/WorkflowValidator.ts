/**
 * Deterministische Validierung eines Workflow-Templates.
 * Prüft: Referenzintegrität, Zyklen, unerreichbare Schritte, leere Phasen,
 * fehlende Pflichtfelder, doppelte Slugs.
 */
import type {
  WorkflowTemplate,
  WorkflowValidationIssue,
  WorkflowValidationReport,
} from "./types";

export const WorkflowValidator = {
  validate(tpl: WorkflowTemplate): WorkflowValidationReport {
    const issues: WorkflowValidationIssue[] = [];
    const stepIds = new Set<string>();
    const stepById = new Map<string, { phaseId: string; dependsOn: string[]; title: string }>();

    if (!tpl.title?.trim()) issues.push({ code: "template.title_missing", message: "Titel fehlt." });
    if (!tpl.phases.length) issues.push({ code: "template.no_phases", message: "Keine Phasen definiert." });

    for (const phase of tpl.phases) {
      if (!phase.steps.length && phase.isRequired) {
        issues.push({ code: "phase.empty", message: `Pflichtphase „${phase.title}" enthält keine Schritte.`, ref: phase.id });
      }
      for (const step of phase.steps) {
        if (stepIds.has(step.id)) {
          issues.push({ code: "step.duplicate_id", message: `Doppelte Step-ID ${step.id}.`, ref: step.id });
        }
        stepIds.add(step.id);
        stepById.set(step.id, { phaseId: phase.id, dependsOn: step.dependsOn ?? [], title: step.title });
        if (!step.title?.trim()) {
          issues.push({ code: "step.title_missing", message: "Schritt ohne Titel.", ref: step.id });
        }
      }
    }

    // Dependency-Refs prüfen
    for (const [id, s] of stepById) {
      for (const dep of s.dependsOn) {
        if (!stepById.has(dep)) {
          issues.push({ code: "dep.unknown_target", message: `Abhängigkeit ${id} → ${dep} unbekannt.`, ref: id });
        }
      }
    }

    // Zyklen via DFS
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const cycles: string[][] = [];
    const stack: string[] = [];
    function dfs(id: string) {
      color.set(id, GRAY);
      stack.push(id);
      const node = stepById.get(id);
      if (node) {
        for (const dep of node.dependsOn) {
          const c = color.get(dep) ?? WHITE;
          if (c === WHITE && stepById.has(dep)) dfs(dep);
          else if (c === GRAY) {
            const idx = stack.indexOf(dep);
            if (idx >= 0) cycles.push([...stack.slice(idx), dep]);
          }
        }
      }
      color.set(id, BLACK);
      stack.pop();
    }
    for (const id of stepById.keys()) if ((color.get(id) ?? WHITE) === WHITE) dfs(id);
    for (const c of cycles) {
      issues.push({ code: "dep.cycle", message: `Zyklus: ${c.join(" → ")}`, ref: c[0] });
    }

    // Erreichbarkeit: Startknoten sind Steps ohne Dependencies. Von dort BFS.
    const roots: string[] = [];
    for (const [id, s] of stepById) if (s.dependsOn.length === 0) roots.push(id);
    if (!roots.length && stepById.size > 0) {
      issues.push({ code: "dep.no_start", message: "Kein Startschritt (alle Schritte haben Abhängigkeiten)." });
    }
    const forward = new Map<string, string[]>();
    for (const [id, s] of stepById) {
      for (const dep of s.dependsOn) {
        if (!forward.has(dep)) forward.set(dep, []);
        forward.get(dep)!.push(id);
      }
    }
    const reachable = new Set<string>(roots);
    const queue = [...roots];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nxt of forward.get(cur) ?? []) if (!reachable.has(nxt)) {
        reachable.add(nxt);
        queue.push(nxt);
      }
    }
    for (const id of stepById.keys()) if (!reachable.has(id)) {
      issues.push({ code: "step.unreachable", message: `Schritt „${stepById.get(id)!.title}" ist nicht erreichbar.`, ref: id });
    }

    // Sackgassen: Pflichtschritt ohne Nachfolger und ohne "Abschluss"-Charakter markieren wir nicht als Fehler,
    // aber isolierte Pflichtschritte in Nicht-Endphasen sind verdächtig.
    // Hier nur „völlig isoliert" (weder Vorgänger noch Nachfolger und einziger Schritt): kein Issue nötig.

    return {
      valid: issues.length === 0,
      issues,
      reachableStepIds: [...reachable],
      cycles,
    };
  },
};
