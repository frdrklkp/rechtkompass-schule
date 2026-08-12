/** Read-only navigation helpers on a DocumentTree. */
import type { DocumentTree, SectionNode } from "./types";

export class DocumentNavigator {
  private byPath = new Map<string, SectionNode>();
  private byLocalId = new Map<string, SectionNode>();

  constructor(private readonly tree: DocumentTree) {
    for (const n of tree.flat) {
      this.byPath.set(n.path, n);
      this.byLocalId.set(n.localId, n);
    }
  }

  findByPath(path: string): SectionNode | null {
    return this.byPath.get(path) ?? null;
  }

  findByLocalId(id: string): SectionNode | null {
    return this.byLocalId.get(id) ?? null;
  }

  breadcrumb(node: SectionNode): string[] {
    return node.breadcrumb;
  }

  next(node: SectionNode): SectionNode | null {
    const idx = this.tree.flat.indexOf(node);
    return idx >= 0 && idx < this.tree.flat.length - 1 ? this.tree.flat[idx + 1] : null;
  }

  prev(node: SectionNode): SectionNode | null {
    const idx = this.tree.flat.indexOf(node);
    return idx > 0 ? this.tree.flat[idx - 1] : null;
  }

  search(term: string): SectionNode[] {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return this.tree.flat.filter((n) => {
      if (n.type === "document") return false;
      return (
        (n.label && n.label.toLowerCase().includes(q)) ||
        (n.number && n.number.toLowerCase().includes(q)) ||
        n.normalizedText.toLowerCase().includes(q)
      );
    });
  }
}
