/** Sprint 4.5B – sichere Dateinamen-Ableitung aus Dokumenttitel, Datum, Session. */

export interface FilenameInput {
  title: string;
  createdAt: string | Date;
  sessionId: string;
  extension: "md" | "docx" | "pdf";
}

/**
 * Baut einen sicheren Dateinamen: `<slug>_<yyyy-mm-dd>_<session8>.<ext>`.
 * Unicode-Umlaute werden transliteriert; alles außerhalb [a-z0-9-_] wird zu `_`.
 */
export function buildExportFilename({ title, createdAt, sessionId, extension }: FilenameInput): string {
  const slug = slugify(title || "dokument");
  const date = toIsoDate(createdAt);
  const sid = (sessionId || "session").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "session";
  return `${slug}_${date}_${sid}.${extension}`;
}

const TRANSLIT: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss",
  á: "a", à: "a", â: "a", ã: "a", å: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o",
  ú: "u", ù: "u", û: "u",
  ñ: "n", ç: "c",
};

export function slugify(input: string): string {
  const mapped = Array.from(input)
    .map((c) => TRANSLIT[c] ?? c)
    .join("");
  const ascii = mapped.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const trimmed = cleaned.slice(0, 80) || "dokument";
  return trimmed.toLowerCase();
}

function toIsoDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "0000-00-00";
  const yyyy = dt.getUTCFullYear().toString().padStart(4, "0");
  const mm = (dt.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = dt.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
