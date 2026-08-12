/** Deterministic validator: cycles, orphans, ordering, dupes, offsets. */
import type { SectionNode, ValidationIssue, ValidationReport } from "./types";

export function validateTree(root: SectionNode, flat: SectionNode[]): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  const localIds = new Set<string>();
  const paragraphKeys = new Map<string, number>();

  // 1) Cycle detection via DFS
  const visited = new Set<string>();
  const stack = new Set<string>();
  const walk = (node: SectionNode): boolean => {
    if (stack.has(node.localId)) {
      errors.push({ level: "error", code: "cycle", message: `Zyklus erkannt bei ${node.displayPath}`, localId: node.localId, path: node.path });
      return false;
    }
    if (visited.has(node.localId)) return true;
    stack.add(node.localId);
    visited.add(node.localId);
    for (const c of node.children) walk(c);
    stack.delete(node.localId);
    return true;
  };
  walk(root);

  for (const node of flat) {
    if (node.type === "document") continue;

    if (localIds.has(node.localId)) {
      errors.push({ level: "error", code: "duplicate_id", message: `Doppelte ID: ${node.localId}`, localId: node.localId, path: node.path });
    }
    localIds.add(node.localId);

    if (node.type === "paragraph" || node.type === "article") {
      const key = `${node.type}:${node.number ?? ""}`;
      paragraphKeys.set(key, (paragraphKeys.get(key) ?? 0) + 1);
    }

    if (!node.parentLocalId) {
      errors.push({ level: "error", code: "orphan", message: `Kein Elternknoten für ${node.displayPath}`, localId: node.localId, path: node.path });
    }

    if (node.endOffset < node.startOffset) {
      errors.push({ level: "error", code: "invalid_offsets", message: `Ungültige Offsets bei ${node.displayPath}`, localId: node.localId, path: node.path });
    }

    if (!node.normalizedText.trim() && !node.children.length) {
      warnings.push({ level: "warning", code: "empty_section", message: `Leerer Abschnitt: ${node.displayPath}`, localId: node.localId, path: node.path });
    }
  }

  for (const [key, count] of paragraphKeys) {
    if (count > 1) {
      warnings.push({ level: "warning", code: "duplicate_paragraph", message: `${count}× ${key} gefunden` });
    }
  }

  // Ordering check: children order_index must be monotonic (0..n-1)
  const checkOrder = (node: SectionNode) => {
    node.children.forEach((child, idx) => {
      if (child.order !== idx) {
        warnings.push({ level: "warning", code: "order_gap", message: `Reihenfolge inkonsistent bei ${child.displayPath}`, localId: child.localId, path: child.path });
      }
      checkOrder(child);
    });
  };
  checkOrder(root);

  info.push({ level: "info", code: "section_count", message: `${flat.length - 1} Sections erkannt.` });

  return { errors, warnings, info, ok: errors.length === 0 };
}
