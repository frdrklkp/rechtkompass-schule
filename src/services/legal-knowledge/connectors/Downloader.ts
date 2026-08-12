/**
 * Sprint 4.5G – Downloader.
 *
 * HTTPS-Zwang, Whitelist, Timeout, Retry mit Backoff.
 * `fetchImpl` ist injizierbar (Tests, Server-Route).
 */
import type { DownloadedPage } from "./types";
import { OFFICIAL_HOST_WHITELIST, validateOfficialUrl } from "./whitelist";

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "url_rejected"
      | "timeout"
      | "network"
      | "http_error"
      | "unsupported_content",
    public readonly url: string,
    public readonly attempts = 1,
  ) {
    super(message);
    this.name = "DownloadError";
  }
}

export interface DownloaderOptions {
  fetchImpl?: typeof fetch;
  allowedHosts?: readonly string[];
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
}

const DEFAULT_UA =
  "RechtsKompass-LegalSourceConnector/1.0 (+https://rechtkompass-schule.lovable.app)";

export class Downloader {
  private readonly fetchImpl: typeof fetch;
  private readonly allowedHosts: readonly string[];
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly userAgent: string;

  constructor(opts: DownloaderOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.allowedHosts = opts.allowedHosts ?? OFFICIAL_HOST_WHITELIST;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.retries = Math.max(0, opts.retries ?? 2);
    this.retryDelayMs = opts.retryDelayMs ?? 250;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
  }

  async download(url: string): Promise<DownloadedPage> {
    const check = validateOfficialUrl(url, this.allowedHosts);
    if (!check.ok) throw new DownloadError(check.message, "url_rejected", url);

    const started = Date.now();
    let lastError: DownloadError | null = null;

    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(check.url.toString(), {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": this.userAgent,
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
            "Accept-Language": "de-DE,de;q=0.9",
          },
        });
        if (!res.ok) {
          const retriable = res.status >= 500 || res.status === 429;
          lastError = new DownloadError(
            `HTTP ${res.status} für ${url}`,
            "http_error",
            url,
            attempt,
          );
          if (!retriable) throw lastError;
        } else {
          const ct = (res.headers?.get?.("content-type") ?? "").toLowerCase();
          if (ct && !ct.includes("html") && !ct.includes("xml") && !ct.includes("text")) {
            throw new DownloadError(
              `Nicht unterstützter Inhaltstyp (${ct})`,
              "unsupported_content",
              url,
              attempt,
            );
          }
          const html = await res.text();
          return {
            url: check.url.toString(),
            html,
            status: res.status,
            durationMs: Date.now() - started,
            attempts: attempt,
          };
        }
      } catch (err) {
        if (err instanceof DownloadError) {
          lastError = err;
          if (err.code === "unsupported_content" || err.code === "url_rejected") throw err;
          if (err.code === "http_error" && !/HTTP (5\d\d|429)/.test(err.message)) throw err;
        } else {
          const aborted = (err as Error)?.name === "AbortError";
          lastError = new DownloadError(
            aborted ? `Zeitüberschreitung nach ${this.timeoutMs} ms` : `Netzwerkfehler: ${(err as Error)?.message ?? "unbekannt"}`,
            aborted ? "timeout" : "network",
            url,
            attempt,
          );
        }
      } finally {
        clearTimeout(timer);
      }

      if (attempt <= this.retries) await this.sleep(this.retryDelayMs * attempt);
    }

    throw lastError ?? new DownloadError("Abruf fehlgeschlagen", "network", url, this.retries + 1);
  }
}
