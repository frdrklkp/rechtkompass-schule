/**
 * Sprint 4.5G – Registry offizieller Quellen + Connectoren.
 *
 * Die Registry ordnet jeder Quelle Start-URL, Hosts und einen Parser aus dem
 * bestehenden Import-Framework zu. Neue Quellen (KMK, Bundesrecht, DSGVO,
 * Unfallkasse, Bezirksregierung, weitere Bundesländer) lassen sich hier
 * ergänzen, ohne das Importframework zu ändern.
 */
import type { OfficialSourceConnector, OfficialSourceDefinition } from "./types";
import { isWhitelistedHost, validateOfficialUrl } from "./whitelist";

export const OFFICIAL_SOURCES: OfficialSourceDefinition[] = [
  {
    id: "bass-nrw",
    label: "BASS NRW",
    description: "Bereinigte Amtliche Sammlung der Schulvorschriften NRW",
    defaultUrl: "https://bass.schul-welt.de/db.htm",
    parserId: "bass-nrw",
    hosts: ["bass.schul-welt.de"],
    maxPages: 40,
    maxDepth: 3,
  },
  {
    id: "schulgesetz-nrw",
    label: "Schulgesetz NRW",
    description: "SchulG NRW auf recht.nrw.de",
    defaultUrl:
      "https://recht.nrw.de/lmi/owa/br_text_anzeigen?v_id=10000000000000000524",
    parserId: "schulgesetz-nrw",
    hosts: ["recht.nrw.de"],
    maxPages: 25,
    maxDepth: 2,
  },
  {
    id: "apo-bk-nrw",
    label: "APO-BK",
    description: "Ausbildungs- und Prüfungsordnung Berufskolleg NRW",
    defaultUrl:
      "https://bass.schul-welt.de/9584.htm",
    parserId: "apo-bk-nrw",
    hosts: ["bass.schul-welt.de", "recht.nrw.de"],
    maxPages: 40,
    maxDepth: 3,
  },
  {
    id: "vv-schulrecht-nrw",
    label: "Verwaltungsvorschriften",
    description: "Verwaltungsvorschriften zum Schulrecht NRW",
    defaultUrl: "https://bass.schul-welt.de/6043.htm",
    parserId: "vv-nrw",
    hosts: ["bass.schul-welt.de", "recht.nrw.de", "schulministerium.nrw.de"],
    maxPages: 40,
    maxDepth: 3,
  },
  {
    id: "schulministerium-nrw",
    label: "Schulministerium NRW (Erlasse)",
    description: "Erlasse und Bekanntmachungen des MSB NRW",
    defaultUrl: "https://www.schulministerium.nrw.de/schulrecht",
    parserId: "erlass-generic",
    hosts: ["schulministerium.nrw.de", "www.schulministerium.nrw.de"],
    maxPages: 30,
    maxDepth: 2,
  },
  /* --- vorbereitet, aktuell nicht freigeschaltet --- */
  { id: "kmk", label: "KMK (vorbereitet)", defaultUrl: "", parserId: "erlass-generic", hosts: [], maxPages: 20, maxDepth: 2, planned: true },
  { id: "bundesrecht", label: "Bundesrecht (vorbereitet)", defaultUrl: "", parserId: "erlass-generic", hosts: [], maxPages: 20, maxDepth: 2, planned: true },
  { id: "unfallkasse", label: "Unfallkasse NRW (vorbereitet)", defaultUrl: "", parserId: "erlass-generic", hosts: [], maxPages: 20, maxDepth: 2, planned: true },
  { id: "bezirksregierung", label: "Bezirksregierung (vorbereitet)", defaultUrl: "", parserId: "erlass-generic", hosts: [], maxPages: 20, maxDepth: 2, planned: true },
];

export const ACTIVE_OFFICIAL_SOURCES = OFFICIAL_SOURCES.filter((s) => !s.planned);

export function getOfficialSource(id: string): OfficialSourceDefinition | null {
  return OFFICIAL_SOURCES.find((s) => s.id === id) ?? null;
}

/** Parserzuordnung anhand Host und Pfad – deterministisch, ohne KI. */
export function resolveParserIdForUrl(url: string, fallback = "erlass-generic"): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fallback;
  }
  const host = parsed.hostname.toLowerCase();
  const path = `${parsed.pathname}${parsed.search}`.toLowerCase();

  if (/apo[-_ ]?bk/.test(path)) return "apo-bk-nrw";
  if (/verwaltungsvorschrift|(^|\/)vv[-_]/.test(path)) return "vv-nrw";
  if (host.endsWith("bass.schul-welt.de")) return "bass-nrw";
  if (host.endsWith("recht.nrw.de")) return "schulgesetz-nrw";
  if (host.endsWith("schulministerium.nrw.de")) return "erlass-generic";
  return fallback;
}

class RegistryConnector implements OfficialSourceConnector {
  constructor(public readonly definition: OfficialSourceDefinition) {}
  get id() { return this.definition.id; }
  get label() { return this.definition.label; }

  supports(url: string): boolean {
    if (this.definition.planned) return false;
    const check = validateOfficialUrl(url, this.definition.hosts);
    return check.ok && isWhitelistedHost(check.host, this.definition.hosts);
  }

  resolveParserId(url: string): string {
    return resolveParserIdForUrl(url, this.definition.parserId);
  }
}

export const officialConnectors: OfficialSourceConnector[] = ACTIVE_OFFICIAL_SOURCES.map(
  (d) => new RegistryConnector(d),
);

export function findConnectorForUrl(url: string): OfficialSourceConnector | null {
  return officialConnectors.find((c) => c.supports(url)) ?? null;
}

export function getConnector(sourceId: string): OfficialSourceConnector | null {
  return officialConnectors.find((c) => c.id === sourceId) ?? null;
}
