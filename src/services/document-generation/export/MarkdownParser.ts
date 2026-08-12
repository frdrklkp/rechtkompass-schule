/**
 * Sprint 4.5B – schlanker Markdown-Parser für Export-Adapter.
 * Produziert eine Zwischen-AST; jede Adapter-Implementierung rendert daraus.
 * Keine erneute Inhaltsgenerierung – reine Darstellungs-Transformation.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; inline: Inline[] }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "hr" }
  | { kind: "pagebreak" }
  | { kind: "blank" };

const PAGE_BREAK_RE = /^\s*(?:<!--\s*pagebreak\s*-->|\f|\\pagebreak)\s*$/i;

/** Deterministic markdown parse. Supports headings, paragraphs, lists, tables, HR, page breaks, strong, em, code. */
export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length === 0) return;
    const text = buf.join(" ").trim();
    if (text) out.push({ kind: "paragraph", inline: parseInline(text) });
    buf.length = 0;
  };

  const para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];

    if (PAGE_BREAK_RE.test(line)) {
      flushParagraph(para);
      out.push({ kind: "pagebreak" });
      i++;
      continue;
    }
    if (/^\s*$/.test(line)) {
      flushParagraph(para);
      i++;
      continue;
    }
    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph(para);
      out.push({ kind: "hr" });
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushParagraph(para);
      out.push({ kind: "heading", level: h[1].length as 1, inline: parseInline(h[2].trim()) });
      i++;
      continue;
    }
    // Table: header line followed by separator
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|\-]+\|?\s*$/.test(lines[i + 1])) {
      flushParagraph(para);
      const header = splitTableRow(line);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      out.push({ kind: "table", header, rows });
      continue;
    }
    // List
    const li = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      flushParagraph(para);
      const ordered = /^\s*\d+\./.test(line);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(parseInline(m[2]));
        i++;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flushParagraph(para);
  return out;
}

function splitTableRow(line: string): Inline[][] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => parseInline(c.trim()));
}

/** Inline parser: **strong**, *em* / _em_, `code`. Escapes are best-effort. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const pushText = () => {
    if (buf) {
      out.push({ kind: "text", text: buf });
      buf = "";
    }
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "*" && src[i + 1] === "*") {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        pushText();
        out.push({ kind: "strong", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && src[i + 1] !== ch) {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1) {
        pushText();
        out.push({ kind: "em", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i) {
        pushText();
        out.push({ kind: "code", text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  pushText();
  return out;
}

/** Reduce inline tree to plain text (for filenames, PDF text runs, etc.). */
export function inlineToText(inline: Inline[]): string {
  return inline
    .map((n) => {
      switch (n.kind) {
        case "text":
        case "code":
          return n.text;
        case "strong":
        case "em":
          return inlineToText(n.children);
      }
    })
    .join("");
}
