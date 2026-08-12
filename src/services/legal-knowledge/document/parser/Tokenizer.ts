/** Line/token stream with absolute character offsets against the original text. */

export interface TokenLine {
  raw: string;
  text: string;
  startOffset: number;
  endOffset: number;
  lineNumber: number;
  blank: boolean;
}

export function tokenize(input: string): TokenLine[] {
  const lines: TokenLine[] = [];
  let offset = 0;
  let lineNo = 0;
  // Split preserving offsets
  const parts = input.split(/\r?\n/);
  for (const raw of parts) {
    lineNo += 1;
    const start = offset;
    const end = offset + raw.length;
    const text = raw.trim();
    lines.push({
      raw,
      text,
      startOffset: start,
      endOffset: end,
      lineNumber: lineNo,
      blank: text.length === 0,
    });
    offset = end + 1; // newline
  }
  return lines;
}
