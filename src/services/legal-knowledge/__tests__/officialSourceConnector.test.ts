/**
 * Sprint 4.5G – Tests: Official Source Connector.
 *
 * Deckt ab: Whitelist, URL-Validierung, Downloader (Timeout/Retry/HTTPS),
 * HTML-Extraktion, Link-Erkennung, rekursive Navigation, Dubletten,
 * Parserauswahl, Delta, Vorschau, Aktualisierung, Netzwerkfehler.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* Kleiner Assertion-/Mock-Helfer, damit dieselbe Testsyntax wie in den
   übrigen Suites (node:test) genutzt werden kann. */
type AnyFn = (...args: any[]) => any;
const vi = {
  fn<T extends AnyFn>(impl?: T) {
    const calls: any[][] = [];
    const f = ((...args: any[]) => {
      calls.push(args);
      return impl ? (impl as AnyFn)(...args) : undefined;
    }) as T & { mock: { calls: any[][] } };
    (f as any).mock = { calls };
    return f;
  },
};
function matcher(actual: any, negate = false) {
  const ok = (cond: boolean, msg: string) => assert.ok(negate ? !cond : cond, msg);
  return {
    toBe: (e: any, m?: string) => ok(Object.is(actual, e), m ?? `erwartet ${String(e)}, war ${String(actual)}`),
    toEqual: (e: any) => (negate ? assert.notDeepStrictEqual(actual, e) : assert.deepStrictEqual(actual, e)),
    toContain: (e: any) => ok(
      typeof actual === "string" ? actual.includes(e) : Array.isArray(actual) && actual.includes(e),
      `enthält ${String(e)}?`,
    ),
    toHaveLength: (n: number) => ok(actual?.length === n, `Länge ${actual?.length} !== ${n}`),
    toBeGreaterThan: (n: number) => ok(actual > n, `${actual} > ${n}?`),
    toBeGreaterThanOrEqual: (n: number) => ok(actual >= n, `${actual} >= ${n}?`),
    toBeNull: () => ok(actual === null, `${String(actual)} ist nicht null`),
    toBeDefined: () => ok(actual !== undefined, "undefined"),
    toBeInstanceOf: (C: any) => ok(actual instanceof C, `nicht Instanz von ${C?.name}`),
    toHaveBeenCalled: () => ok((actual?.mock?.calls?.length ?? 0) > 0, "nicht aufgerufen"),
    toHaveBeenCalledTimes: (n: number) => ok(actual?.mock?.calls?.length === n, `Aufrufe: ${actual?.mock?.calls?.length} !== ${n}`),
    toMatchObject: (e: Record<string, any>) => {
      for (const [k, v] of Object.entries(e)) ok(actual?.[k] === v, `${k}: ${String(actual?.[k])} !== ${String(v)}`);
    },
  };
}
function expect(actual: any) {
  const base = matcher(actual) as ReturnType<typeof matcher> & {
    not: ReturnType<typeof matcher>;
    rejects: { toMatchObject: (e: any) => Promise<void>; toBeInstanceOf: (C: any) => Promise<void> };
  };
  base.not = matcher(actual, true);
  base.rejects = {
    async toMatchObject(e: any) {
      try { await actual; assert.fail("Promise hat nicht abgelehnt"); }
      catch (err) { if (err instanceof assert.AssertionError) throw err; matcher(err).toMatchObject(e); }
    },
    async toBeInstanceOf(C: any) {
      try { await actual; assert.fail("Promise hat nicht abgelehnt"); }
      catch (err) { if (err instanceof assert.AssertionError) throw err; matcher(err).toBeInstanceOf(C); }
    },
  };
  return base;
}

import {
  OFFICIAL_HOST_WHITELIST,
  isWhitelistedHost,
  validateOfficialUrl,
  canonicalizeUrl,
} from "../connectors/whitelist";
import { Downloader, DownloadError } from "../connectors/Downloader";
import {
  contentHash,
  detectVersionHint,
  extractTitle,
  htmlToText,
  stripDangerousMarkup,
} from "../connectors/HtmlExtractor";
import { extractLinks } from "../connectors/LinkExtractor";
import { crawlOfficialSource } from "../connectors/OfficialSourceCrawler";
import {
  ACTIVE_OFFICIAL_SOURCES,
  getOfficialSource,
  findConnectorForUrl,
  resolveParserIdForUrl,
} from "../connectors/registry";
import {
  OfficialSourceConnectorService,
  OfficialSourceConnectorError,
  mergeDocuments,
} from "../connectors/OfficialSourceConnectorService";
import { deriveStatus, stateFromPreview } from "../connectors/updateMonitor";
import { InMemoryLegalImportRepository, buildSnapshot } from "../import";
import { bassNrwParser } from "../import/parsers/bassNrwParser";
import { schulgesetzNrwParser } from "../import/parsers/schulgesetzNrwParser";
import { apoBkNrwParser } from "../import/parsers/apoBkNrwParser";
import { verwaltungsvorschriftNrwParser } from "../import/parsers/verwaltungsvorschriftNrwParser";

const PARSERS = [
  bassNrwParser,
  schulgesetzNrwParser,
  apoBkNrwParser,
  verwaltungsvorschriftNrwParser,
];

/* ---------------- Whitelist & URL ---------------- */

describe("Whitelist & URL-Validierung", () => {
  it("akzeptiert offizielle Hosts", () => {
    expect(isWhitelistedHost("bass.schul-welt.de")).toBe(true);
    expect(isWhitelistedHost("RECHT.NRW.DE")).toBe(true);
    expect(isWhitelistedHost("www.schulministerium.nrw.de")).toBe(true);
  });

  it("weist fremde Domains ab", () => {
    expect(isWhitelistedHost("evil.example.com")).toBe(false);
    expect(isWhitelistedHost("bass.schul-welt.de.evil.com")).toBe(false);
    const res = validateOfficialUrl("https://evil.example.com/a");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("host_not_allowed");
  });

  it("erzwingt HTTPS", () => {
    const res = validateOfficialUrl("http://recht.nrw.de/x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("insecure_protocol");
  });

  it("lehnt ungültige URLs und Zugangsdaten ab", () => {
    expect(validateOfficialUrl("keine-url").ok).toBe(false);
    const creds = validateOfficialUrl("https://user:pw@recht.nrw.de/x");
    expect(creds.ok).toBe(false);
  });

  it("kanonisiert URLs für Dublettenerkennung", () => {
    expect(canonicalizeUrl("https://recht.nrw.de/a/?b=2&a=1#frag")).toBe(
      "https://recht.nrw.de/a?a=1&b=2",
    );
  });

  it("enthält nur offizielle Quellen in der Registry", () => {
    for (const src of ACTIVE_OFFICIAL_SOURCES) {
      const res = validateOfficialUrl(src.defaultUrl, OFFICIAL_HOST_WHITELIST);
      expect(res.ok).toBe(true, `${src.id}: ${src.defaultUrl}`);
    }
  });
});

/* ---------------- Downloader ---------------- */

function mockResponse(html: string, status = 200, contentType = "text/html") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    text: async () => html,
  } as unknown as Response;
}

describe("Downloader", () => {
  it("lädt eine erlaubte Seite", async () => {
    const fetchImpl = vi.fn(async () => mockResponse("<html><body>Hallo</body></html>"));
    const d = new Downloader({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const page = await d.download("https://recht.nrw.de/doc");
    expect(page.status).toBe(200);
    expect(page.html).toContain("Hallo");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("blockt nicht freigegebene Domains vor dem Netzwerkaufruf", async () => {
    const fetchImpl = vi.fn();
    const d = new Downloader({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(d.download("https://evil.example.com")).rejects.toMatchObject({
      code: "url_rejected",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("wiederholt bei Netzwerkfehlern und liefert danach das Ergebnis", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("ECONNRESET");
      return mockResponse("<html>ok</html>");
    });
    const d = new Downloader({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retries: 2,
      sleep: async () => {},
    });
    const page = await d.download("https://recht.nrw.de/x");
    expect(page.attempts).toBe(3);
  });

  it("meldet Timeout als eigenen Fehlercode", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const d = new Downloader({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retries: 1,
      timeoutMs: 5,
      sleep: async () => {},
    });
    await expect(d.download("https://recht.nrw.de/x")).rejects.toMatchObject({ code: "timeout" });
  });

  it("bricht bei 404 ohne Retry ab, wiederholt aber bei 503", async () => {
    const notFound = vi.fn(async () => mockResponse("", 404));
    const d1 = new Downloader({ fetchImpl: notFound as unknown as typeof fetch, retries: 2, sleep: async () => {} });
    await expect(d1.download("https://recht.nrw.de/x")).rejects.toBeInstanceOf(DownloadError);
    expect(notFound).toHaveBeenCalledTimes(1);

    const flaky = vi.fn(async () => mockResponse("", 503));
    const d2 = new Downloader({ fetchImpl: flaky as unknown as typeof fetch, retries: 2, sleep: async () => {} });
    await expect(d2.download("https://recht.nrw.de/x")).rejects.toMatchObject({ code: "http_error" });
    expect(flaky).toHaveBeenCalledTimes(3);
  });

  it("lehnt Nicht-HTML-Inhalte ab", async () => {
    const fetchImpl = vi.fn(async () => mockResponse("%PDF", 200, "application/pdf"));
    const d = new Downloader({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(d.download("https://recht.nrw.de/x")).rejects.toMatchObject({
      code: "unsupported_content",
    });
  });
});

/* ---------------- HTML-Extraktion ---------------- */

describe("HTML Extractor", () => {
  it("entfernt Skripte, Styles und Event-Handler", () => {
    const html = `<div onclick="alert(1)"><script>alert('x')</script><style>b{}</style>Text</div>`;
    const safe = stripDangerousMarkup(html);
    expect(safe).not.toContain("script");
    expect(safe).not.toContain("onclick");
    expect(htmlToText(html)).toBe("Text");
  });

  it("extrahiert Titel und Text mit Absätzen", () => {
    const html = `<html><head><title>Seitentitel</title></head><body><h1>§ 1 Auftrag</h1><p>Absatz eins</p><p>Absatz zwei</p></body></html>`;
    expect(extractTitle(html)).toBe("§ 1 Auftrag");
    const text = htmlToText(html);
    expect(text).toContain("Absatz eins");
    expect(text).toContain("Absatz zwei");
  });

  it("erkennt Versionsangaben", () => {
    expect(detectVersionHint("Stand: 01.08.2024")).toBe("01.08.2024");
    expect(detectVersionHint("Zuletzt geändert durch Gesetz vom 12.03.2023")).toBe("12.03.2023");
    expect(detectVersionHint("ohne Datum")).toBeNull();
  });

  it("erzeugt stabile Inhalts-Hashes", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
  });
});

/* ---------------- Link-Erkennung ---------------- */

describe("Link-Erkennung", () => {
  const base = "https://bass.schul-welt.de/db.htm";
  const html = `
    <a href="/1234.htm">Relativ</a>
    <a href='https://bass.schul-welt.de/5678.htm'>Absolut</a>
    <a href="unter/seite.htm">Unterseite</a>
    <a href="/anlage.pdf">Anlage</a>
    <a href="https://evil.example.com/x">Fremd</a>
    <a href="mailto:a@b.de">Mail</a>
    <a href="javascript:alert(1)">JS</a>
    <a href="/impressum">Impressum</a>
    <a href="/1234.htm#kapitel">Dublette mit Anker</a>
  `;

  it("erkennt relative, absolute und Unterseiten-Links", () => {
    const links = extractLinks(html, { baseUrl: base, allowedHosts: ["bass.schul-welt.de"] });
    const urls = links.map((l) => l.url);
    expect(urls).toContain("https://bass.schul-welt.de/1234.htm");
    expect(urls).toContain("https://bass.schul-welt.de/5678.htm");
    expect(urls).toContain("https://bass.schul-welt.de/unter/seite.htm");
  });

  it("markiert Anlagen und filtert Fremd-, Mail-, JS- und Navigationslinks", () => {
    const links = extractLinks(html, { baseUrl: base, allowedHosts: ["bass.schul-welt.de"] });
    expect(links.find((l) => l.url.endsWith("anlage.pdf"))?.attachment).toBe(true);
    const urls = links.map((l) => l.url);
    expect(urls.some((u) => u.includes("evil.example.com"))).toBe(false);
    expect(urls.some((u) => u.includes("mailto"))).toBe(false);
    expect(urls.some((u) => u.includes("javascript"))).toBe(false);
    expect(urls.some((u) => u.includes("impressum"))).toBe(false);
  });

  it("entfernt Dubletten über Anker-Normalisierung", () => {
    const links = extractLinks(html, { baseUrl: base, allowedHosts: ["bass.schul-welt.de"] });
    expect(links.filter((l) => l.url === "https://bass.schul-welt.de/1234.htm")).toHaveLength(1);
  });
});

/* ---------------- Crawler ---------------- */

function fakeSite(pages: Record<string, string>) {
  return vi.fn(async (url: string | URL) => {
    const key = String(url);
    const html = pages[key];
    if (html === undefined) throw new Error(`404 ${key}`);
    return mockResponse(html);
  });
}

const BASS_DEF = getOfficialSource("bass-nrw")!;

const PAGE_INDEX = `<html><body><h1>BASS Übersicht</h1>
  <p>Bereinigte Amtliche Sammlung der Schulvorschriften. Stand: 01.08.2024</p>
  <a href="/a.htm">Teil A</a><a href="/b.htm">Teil B</a><a href="/db.htm">Selbstverweis</a>
  ${"<p>Fülltext zur Erreichung der Mindestlänge.</p>".repeat(10)}
</body></html>`;

const PAGE_A = `<html><body><h1>BASS 12-05 Nr. 1</h1>
  <p>§ 1 Geltungsbereich</p><p>(1) Diese Vorschrift gilt für alle Schulen des Landes Nordrhein-Westfalen.</p>
  <a href="/b.htm">Weiter zu B</a><a href="/a.htm">zurück</a>
  ${"<p>Ergänzender Text zum Geltungsbereich.</p>".repeat(6)}
</body></html>`;

const PAGE_B = `<html><body><h1>BASS 12-05 Nr. 2</h1>
  <p>§ 2 Zuständigkeit</p><p>(1) Zuständig ist die Schulleitung.</p>
  <a href="/a.htm">zurück zu A</a>
  ${"<p>Ergänzender Text zur Zuständigkeit.</p>".repeat(6)}
</body></html>`;

describe("Crawler", () => {
  it("folgt Links rekursiv und verhindert Endlosschleifen", async () => {
    const fetchImpl = fakeSite({
      "https://bass.schul-welt.de/db.htm": PAGE_INDEX,
      "https://bass.schul-welt.de/a.htm": PAGE_A,
      "https://bass.schul-welt.de/b.htm": PAGE_B,
    });
    const result = await crawlOfficialSource({
      definition: BASS_DEF,
      startUrl: "https://bass.schul-welt.de/db.htm",
      downloader: new Downloader({ fetchImpl: fetchImpl as unknown as typeof fetch, allowedHosts: BASS_DEF.hosts }),
      maxPages: 20,
      maxDepth: 3,
    });
    expect(result.visited).toHaveLength(3);
    expect(result.documents).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("erkennt inhaltliche Dubletten", async () => {
    const fetchImpl = fakeSite({
      "https://bass.schul-welt.de/db.htm": PAGE_INDEX,
      "https://bass.schul-welt.de/a.htm": PAGE_A,
      "https://bass.schul-welt.de/b.htm": PAGE_A.replace('href="/b.htm"', 'href="/a.htm"'),
    });
    const result = await crawlOfficialSource({
      definition: BASS_DEF,
      startUrl: "https://bass.schul-welt.de/db.htm",
      downloader: new Downloader({ fetchImpl: fetchImpl as unknown as typeof fetch, allowedHosts: BASS_DEF.hosts }),
      maxDepth: 3,
    });
    expect(result.duplicates).toBeGreaterThanOrEqual(1);
  });

  it("respektiert maxPages und meldet Abbruch", async () => {
    const fetchImpl = fakeSite({
      "https://bass.schul-welt.de/db.htm": PAGE_INDEX,
      "https://bass.schul-welt.de/a.htm": PAGE_A,
      "https://bass.schul-welt.de/b.htm": PAGE_B,
    });
    const result = await crawlOfficialSource({
      definition: BASS_DEF,
      startUrl: "https://bass.schul-welt.de/db.htm",
      downloader: new Downloader({ fetchImpl: fetchImpl as unknown as typeof fetch, allowedHosts: BASS_DEF.hosts }),
      maxPages: 2,
      maxDepth: 3,
    });
    expect(result.visited).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("verarbeitet Netzwerkfehler einzelner Seiten weiter", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const key = String(url);
      if (key.endsWith("a.htm")) throw new Error("ECONNRESET");
      if (key.endsWith("db.htm")) return mockResponse(PAGE_INDEX);
      return mockResponse(PAGE_B);
    });
    const result = await crawlOfficialSource({
      definition: BASS_DEF,
      startUrl: "https://bass.schul-welt.de/db.htm",
      downloader: new Downloader({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        allowedHosts: BASS_DEF.hosts,
        retries: 0,
      }),
      maxDepth: 3,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.documents.length).toBeGreaterThanOrEqual(2);
  });

  it("meldet Fortschritt in Phasen", async () => {
    const phases: string[] = [];
    const fetchImpl = fakeSite({ "https://bass.schul-welt.de/db.htm": PAGE_INDEX });
    await crawlOfficialSource({
      definition: BASS_DEF,
      startUrl: "https://bass.schul-welt.de/db.htm",
      downloader: new Downloader({ fetchImpl: fetchImpl as unknown as typeof fetch, allowedHosts: BASS_DEF.hosts }),
      maxDepth: 0,
      onProgress: (p) => phases.push(p.phase),
    });
    expect(phases).toContain("downloading");
    expect(phases).toContain("extracting");
    expect(phases).toContain("parsing");
  });
});

/* ---------------- Parserauswahl ---------------- */

describe("Parserauswahl", () => {
  it("ordnet Hosts und Pfade deterministisch zu", () => {
    expect(resolveParserIdForUrl("https://bass.schul-welt.de/1234.htm")).toBe("bass-nrw");
    expect(resolveParserIdForUrl("https://recht.nrw.de/lmi/owa/br_text_anzeigen?v_id=1")).toBe("schulgesetz-nrw");
    expect(resolveParserIdForUrl("https://bass.schul-welt.de/apo-bk/anlage-a.htm")).toBe("apo-bk-nrw");
    expect(resolveParserIdForUrl("https://recht.nrw.de/verwaltungsvorschrift/x")).toBe("vv-nrw");
    expect(resolveParserIdForUrl("https://www.schulministerium.nrw.de/erlass")).toBe("erlass-generic");
  });

  it("findet den passenden Connector zur URL", () => {
    const c = findConnectorForUrl("https://bass.schul-welt.de/db.htm");
    expect(c?.id).toBeDefined();
    expect(findConnectorForUrl("https://evil.example.com")).toBeNull();
  });
});

/* ---------------- Service: Vorschau, Delta, Aktualisierung ---------------- */

describe("OfficialSourceConnectorService", () => {
  function service(fetchImpl: unknown, repository = new InMemoryLegalImportRepository()) {
    return {
      repository,
      svc: new OfficialSourceConnectorService({
        parsers: PARSERS,
        repository,
        downloader: new Downloader({
          fetchImpl: fetchImpl as typeof fetch,
          allowedHosts: BASS_DEF.hosts,
          retries: 0,
        }),
      }),
    };
  }

  const site = {
    "https://bass.schul-welt.de/db.htm": PAGE_INDEX,
    "https://bass.schul-welt.de/a.htm": PAGE_A,
    "https://bass.schul-welt.de/b.htm": PAGE_B,
  };

  it("erstellt eine vollständige Importvorschau", async () => {
    const { svc } = service(fakeSite(site));
    const preview = await svc.preview({ sourceId: "bass-nrw", url: "https://bass.schul-welt.de/db.htm", maxDepth: 3 });
    expect(preview.parser.id).toBe("bass-nrw");
    expect(preview.stats.documents).toBe(3);
    expect(preview.stats.paragraphs).toBeGreaterThanOrEqual(2);
    expect(preview.delta.added).toBeGreaterThan(0);
    expect(preview.validation.errorCount).toBe(0);
    expect(preview.versionConflict).toBe(false);
  });

  it("weist nicht freigegebene URLs ab", async () => {
    const { svc } = service(fakeSite(site));
    await expect(
      svc.preview({ sourceId: "bass-nrw", url: "https://evil.example.com/x" }),
    ).rejects.toBeInstanceOf(OfficialSourceConnectorError);
  });

  it("meldet fehlende Dokumente", async () => {
    const { svc } = service(fakeSite({ "https://bass.schul-welt.de/db.htm": "<html><body>zu kurz</body></html>" }));
    await expect(svc.preview({ sourceId: "bass-nrw" })).rejects.toMatchObject({ code: "no_documents" });
  });

  it("erkennt beim erneuten Abruf nur die Änderungen (Aktualisierung)", async () => {
    const repository = new InMemoryLegalImportRepository();
    const first = service(fakeSite(site), repository);
    const p1 = await first.svc.preview({ sourceId: "bass-nrw", url: "https://bass.schul-welt.de/db.htm", maxDepth: 3 });
    await repository.saveSnapshot(buildSnapshot(p1.document));

    const unchanged = service(fakeSite(site), repository);
    const p2 = await unchanged.svc.preview({ sourceId: "bass-nrw", url: "https://bass.schul-welt.de/db.htm", maxDepth: 3 });
    expect(p2.delta.added).toBe(0);
    expect(p2.delta.updated).toBe(0);
    expect(p2.delta.unchanged).toBeGreaterThan(0);

    const changedSite = {
      ...site,
      "https://bass.schul-welt.de/b.htm": PAGE_B.replace(
        "Zuständig ist die Schulleitung.",
        "Zuständig ist die Schulaufsicht.",
      ),
    };
    const changed = service(fakeSite(changedSite), repository);
    const p3 = await changed.svc.preview({ sourceId: "bass-nrw", url: "https://bass.schul-welt.de/db.htm", maxDepth: 3 });
    expect(p3.delta.added + p3.delta.updated).toBeGreaterThan(0);
  });

  it("führt geladene Dokumente ohne Trennverlust zusammen", () => {
    const merged = mergeDocuments([
      { url: "u1", title: "T1", text: "A", contentHash: "1", links: [], versionHint: null, charCount: 1, attachment: false },
      { url: "u2", title: "", text: "B", contentHash: "2", links: [], versionHint: null, charCount: 1, attachment: false },
    ]);
    expect(merged).toBe("T1\n\nA\n\nB");
  });
});

/* ---------------- Update Monitor ---------------- */

describe("Legal Update Monitor", () => {
  it("leitet den Ampelstatus deterministisch ab", () => {
    expect(deriveStatus({ added: 0, updated: 0, removed: 0, versionConflict: false, installedVersion: "v1", onlineVersion: "v1" })).toBe("current");
    expect(deriveStatus({ added: 2, updated: 0, removed: 0, versionConflict: false, installedVersion: "v1", onlineVersion: "v1" })).toBe("updates_available");
    expect(deriveStatus({ added: 2, updated: 0, removed: 0, versionConflict: false, installedVersion: "v1", onlineVersion: "v2" })).toBe("import_required");
    expect(deriveStatus({ added: 0, updated: 0, removed: 0, versionConflict: true, installedVersion: "v1", onlineVersion: "v1" })).toBe("import_required");
    expect(deriveStatus({ added: 1, updated: 0, removed: 0, versionConflict: false, installedVersion: null, onlineVersion: "v1" })).toBe("import_required");
  });

  it("baut den Quellenstatus aus einer Vorschau", async () => {
    const repository = new InMemoryLegalImportRepository();
    const svc = new OfficialSourceConnectorService({
      parsers: PARSERS,
      repository,
      downloader: new Downloader({
        fetchImpl: fakeSite({
          "https://bass.schul-welt.de/db.htm": PAGE_INDEX,
          "https://bass.schul-welt.de/a.htm": PAGE_A,
          "https://bass.schul-welt.de/b.htm": PAGE_B,
        }) as unknown as typeof fetch,
        allowedHosts: BASS_DEF.hosts,
      }),
    });
    const preview = await svc.preview({ sourceId: "bass-nrw", url: "https://bass.schul-welt.de/db.htm", maxDepth: 3 });
    const state = stateFromPreview(preview, null, "2026-07-30T00:00:00.000Z");
    expect(state.sourceId).toBe("bass-nrw");
    expect(state.lastCheckedAt).toBe("2026-07-30T00:00:00.000Z");
    expect(state.onlineVersion).toBe(preview.document.version.label);
    expect(state.status).toBe("import_required");
  });
});
