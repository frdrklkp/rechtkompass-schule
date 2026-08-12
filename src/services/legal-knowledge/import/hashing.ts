/**
 * Sprint 4.5C – Deterministische Hashing- und Traversal-Helpers.
 * Kein Kryptomodul-Zwang: djb2 reicht als stabiler Struktur-Hash. Wir hashen
 * die semantisch relevanten Felder eines Knotens (Kind, Nummer, Überschrift,
 * Text) und ignorieren volatile Metadaten.
 */
import type { LegalNode } from "./types";

function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  // Hex, unsigned.
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashNode(node: LegalNode): string {
  const payload = JSON.stringify([
    node.kind,
    node.number ?? null,
    node.heading ?? null,
    (node.text ?? "").replace(/\s+/g, " ").trim(),
  ]);
  return djb2(payload);
}

/** Alle Knoten (inkl. Root) in Tiefensuche zurückgeben. */
export function flatten(root: LegalNode): LegalNode[] {
  const out: LegalNode[] = [];
  const stack: LegalNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n);
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return out;
}

/** Deterministischer lokaler ID-Generator (Pfad-basiert, keine Zufallswerte). */
export function assignLocalIds(root: LegalNode, prefix = "n"): void {
  root.localId = root.localId || `${prefix}0`;
  const walk = (node: LegalNode, path: string) => {
    node.localId = node.localId || path;
    node.children.forEach((c, i) => walk(c, `${path}.${i + 1}`));
  };
  walk(root, root.localId);
}
