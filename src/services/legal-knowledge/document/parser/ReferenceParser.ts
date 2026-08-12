/** Extract structured references from a text span. Deterministic, no resolution. */
import { REFERENCE_PATTERNS } from "./Patterns";
import type { SectionReference } from "../types";

export function extractReferences(text: string, baseOffset = 0): SectionReference[] {
  const out: SectionReference[] = [];

  // Paragraph refs (§ 53 Abs. 2 Satz 1 Nr. 3)
  const p = new RegExp(REFERENCE_PATTERNS.paragraph.source, REFERENCE_PATTERNS.paragraph.flags);
  let m: RegExpExecArray | null;
  while ((m = p.exec(text))) {
    const value: Record<string, string> = { paragraph: m[1] };
    if (m[2]) value.absatz = m[2];
    if (m[3]) value.satz = m[3];
    if (m[4]) value.nummer = m[4];
    out.push({
      raw: m[0],
      refType: "paragraph",
      refValue: value,
      startOffset: baseOffset + m.index,
      endOffset: baseOffset + m.index + m[0].length,
      confidence: 0.95,
    });
  }

  const a = new RegExp(REFERENCE_PATTERNS.article.source, REFERENCE_PATTERNS.article.flags);
  while ((m = a.exec(text))) {
    const value: Record<string, string> = { article: m[1] };
    if (m[2]) value.absatz = m[2];
    out.push({
      raw: m[0],
      refType: "article",
      refValue: value,
      startOffset: baseOffset + m.index,
      endOffset: baseOffset + m.index + m[0].length,
      confidence: 0.9,
    });
  }

  const an = new RegExp(REFERENCE_PATTERNS.annex.source, REFERENCE_PATTERNS.annex.flags);
  while ((m = an.exec(text))) {
    out.push({
      raw: m[0],
      refType: "annex",
      refValue: { annex: m[1] },
      startOffset: baseOffset + m.index,
      endOffset: baseOffset + m.index + m[0].length,
      confidence: 0.9,
    });
  }

  return out;
}
