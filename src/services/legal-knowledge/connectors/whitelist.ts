/**
 * Sprint 4.5G – Domain-Whitelist und URL-Validierung.
 * Nur HTTPS, nur offizielle Hosts. Keine beliebigen Domains.
 */

export const OFFICIAL_HOST_WHITELIST: readonly string[] = [
  "bass.schul-welt.de", // alte Domain, Stand 2026-08 nicht mehr erreichbar (siehe bass.schule.nrw)
  "bass.schule.nrw",
  "recht.nrw.de",
  "www.recht.nrw.de",
  "schulministerium.nrw.de",
  "www.schulministerium.nrw.de",
];

export type UrlRejectionReason =
  | "invalid_url"
  | "insecure_protocol"
  | "host_not_allowed"
  | "credentials_not_allowed";

export type UrlValidationResult =
  | { ok: true; url: URL; host: string }
  | { ok: false; reason: UrlRejectionReason; message: string };

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

export function isWhitelistedHost(
  host: string,
  allowed: readonly string[] = OFFICIAL_HOST_WHITELIST,
): boolean {
  const h = normalizeHost(host);
  return allowed.some((a) => {
    const base = normalizeHost(a);
    return h === base || h.endsWith(`.${base}`);
  });
}

export function validateOfficialUrl(
  raw: string,
  allowed: readonly string[] = OFFICIAL_HOST_WHITELIST,
): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return { ok: false, reason: "invalid_url", message: "Keine gültige URL." };
  }
  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: "insecure_protocol",
      message: "Nur HTTPS-Verbindungen sind zulässig.",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: "credentials_not_allowed",
      message: "URLs mit Zugangsdaten sind nicht zulässig.",
    };
  }
  if (!isWhitelistedHost(url.hostname, allowed)) {
    return {
      ok: false,
      reason: "host_not_allowed",
      message: `Domain nicht freigegeben: ${normalizeHost(url.hostname)}`,
    };
  }
  return { ok: true, url, host: normalizeHost(url.hostname) };
}

/** Kanonisiert eine URL für die Dublettenerkennung (Anker weg, Query sortiert). */
export function canonicalizeUrl(raw: string, base?: string): string | null {
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    u.hash = "";
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    u.search = "";
    for (const [k, v] of params) u.searchParams.append(k, v);
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return null;
  }
}
