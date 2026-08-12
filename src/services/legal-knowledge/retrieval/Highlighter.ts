/**
 * Erstellt Treffer-Highlights und Text-Exzerpte.
 * Rein deterministisch (Regex-basiert).
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const Highlighter = {
  extract(text: string, keywords: string[], maxHighlights: number): string[] {
    if (!text || keywords.length === 0) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const kw of keywords) {
      if (out.length >= maxHighlights) break;
      const re = new RegExp(`([^.!?\\n]{0,80}\\b${escapeRegex(kw)}\\b[^.!?\\n]{0,80})`, "i");
      const match = text.match(re);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        out.push(match[1].trim());
      }
    }
    return out;
  },

  excerpt(text: string, keywords: string[], maxChars: number): string {
    if (!text) return "";
    if (text.length <= maxChars) return text.trim();
    // Suche erstes Vorkommen eines Keywords, sonst Anfang.
    let idx = -1;
    for (const kw of keywords) {
      const i = text.toLowerCase().indexOf(kw.toLowerCase());
      if (i >= 0) { idx = i; break; }
    }
    if (idx < 0) return text.slice(0, maxChars).trim() + "…";
    const start = Math.max(0, idx - Math.floor(maxChars / 3));
    const end = Math.min(text.length, start + maxChars);
    const clip = text.slice(start, end).trim();
    return (start > 0 ? "…" : "") + clip + (end < text.length ? "…" : "");
  },
};
