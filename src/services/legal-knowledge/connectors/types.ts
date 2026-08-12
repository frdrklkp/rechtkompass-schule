/**
 * Sprint 4.5G – Official Source Connector: Domänentypen.
 *
 * Die Connector-Schicht liegt ausschließlich VOR dem bestehenden
 * Import-Framework (Parser → Normalizer → Validator → Delta → Repository).
 * Sie kennt weder Delta-Logik noch Repositories.
 */

export interface OfficialSourceDefinition {
  /** Stabile Kennung, z. B. "bass-nrw". */
  id: string;
  label: string;
  description?: string;
  /** Vorbelegte Start-URL (immer HTTPS, immer Whitelist-Host). */
  defaultUrl: string;
  /** Parser aus dem bestehenden Framework. */
  parserId: string;
  /** Zusätzlich erlaubte Hosts für diese Quelle (Teilmenge der Whitelist). */
  hosts: string[];
  maxPages: number;
  maxDepth: number;
  /** Optionales Muster, das interne Dokumentlinks kennzeichnet. */
  documentLinkPattern?: RegExp;
  /** Vorbereitete, noch nicht freigeschaltete Quelle (z. B. KMK, Bundesrecht). */
  planned?: boolean;
}

export interface DownloadedPage {
  url: string;
  html: string;
  status: number;
  durationMs: number;
  attempts: number;
}

export interface ExtractedDocument {
  url: string;
  title: string;
  text: string;
  /** Stabiler Hash des extrahierten Textes (Dublettenerkennung). */
  contentHash: string;
  links: string[];
  versionHint: string | null;
  charCount: number;
  attachment: boolean;
}

export type CrawlPhase =
  | "idle"
  | "discovering"
  | "downloading"
  | "extracting"
  | "parsing"
  | "validating"
  | "delta"
  | "ready"
  | "failed";

export interface CrawlProgress {
  phase: CrawlPhase;
  found: number;
  downloaded: number;
  processed: number;
  validated: number;
  deltaReady: boolean;
  message?: string;
  /** 0..1 */
  ratio: number;
}

export interface CrawlPageError {
  url: string;
  message: string;
}

export interface CrawlResult {
  startUrl: string;
  sourceId: string;
  documents: ExtractedDocument[];
  duplicates: number;
  visited: string[];
  errors: CrawlPageError[];
  durationMs: number;
  truncated: boolean;
}

export interface OfficialSourceConnector {
  id: string;
  label: string;
  /** Prüft, ob die URL zu dieser Quelle gehört (Whitelist + Host/Pfad). */
  supports(url: string): boolean;
  /** Parserzuordnung ohne Änderung am Import-Framework. */
  resolveParserId(url: string): string;
  definition: OfficialSourceDefinition;
}
