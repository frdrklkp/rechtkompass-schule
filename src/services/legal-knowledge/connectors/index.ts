/** Sprint 4.5G – Barrel-Export der Official-Source-Connector-Schicht. */
export * from "./types";
export * from "./whitelist";
export * from "./HtmlExtractor";
export * from "./LinkExtractor";
export { Downloader, DownloadError } from "./Downloader";
export type { DownloaderOptions } from "./Downloader";
export { crawlOfficialSource } from "./OfficialSourceCrawler";
export type { CrawlOptions } from "./OfficialSourceCrawler";
export {
  OFFICIAL_SOURCES,
  ACTIVE_OFFICIAL_SOURCES,
  officialConnectors,
  getOfficialSource,
  getConnector,
  findConnectorForUrl,
  resolveParserIdForUrl,
} from "./registry";
export {
  OfficialSourceConnectorService,
  OfficialSourceConnectorError,
  mergeDocuments,
} from "./OfficialSourceConnectorService";
export type {
  ConnectorPreview,
  ConnectorPreviewStats,
  ConnectorServiceDeps,
} from "./OfficialSourceConnectorService";
export * from "./updateMonitor";
