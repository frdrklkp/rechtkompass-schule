/**
 * Sprint 4.5C – Vorbereitete Parser-Stubs für weitere Quellenarten.
 *
 * Jede Quelle erhält einen eigenen Parser, aber die Signatur bleibt identisch.
 * Die Stubs erkennen ihre Quelle heuristisch und delegieren die eigentliche
 * Strukturierung an spätere Sprints. Wichtig: sie beweisen, dass das Framework
 * neue Quellen ohne Änderung des Orchestrators aufnehmen kann.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";

function flatBody(input: LegalImportInput, kind: LegalNode["kind"] = "text"): LegalNode {
  const paragraphs = input.raw
    .split(/\r?\n\s*\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    localId: "",
    kind: "document",
    children: paragraphs.map<LegalNode>((text, i) => ({
      localId: "",
      kind,
      number: `Abs. ${i + 1}`,
      text,
      children: [],
    })),
  };
}

function makeStub(opts: {
  id: string;
  label: string;
  kind: LegalImportParser["kind"];
  detect: (input: LegalImportInput) => boolean;
  title: string;
  shortName?: string | null;
  authority?: string | null;
}): LegalImportParser {
  return {
    id: opts.id,
    label: opts.label,
    kind: opts.kind,
    canParse: opts.detect,
    parse(input): NormalizedLegalDocument {
      return {
        source: {
          key: opts.id,
          kind: opts.kind,
          title: input.hint?.detectedTitle ?? opts.title,
          shortName: opts.shortName ?? null,
          jurisdiction: "NRW",
          authority: opts.authority ?? null,
          officialUrl: input.hint?.officialUrl ?? null,
          language: "de",
        },
        version: { label: input.hint?.detectedVersion ?? "Unbekannte Fassung" },
        root: flatBody(input),
        rawText: input.raw,
      };
    },
  };
}

// Sprint 4.5D – Der frühere BASS-Stub wurde durch einen produktionsreifen
// Parser (`bassNrwParser`) ersetzt. Der Export bleibt aus Kompatibilitätsgründen
// bestehen und delegiert nun an den echten Parser.
export { bassNrwParser as bassParser } from "./bassNrwParser";
import { bassNrwParser } from "./bassNrwParser";

// Sprint 4.5E – Produktionsreife Parser ersetzen die Stubs. Die
// Kompatibilitäts-Exports bleiben stabil.
export { apoBkNrwParser as apoBkParser } from "./apoBkNrwParser";
import { apoBkNrwParser } from "./apoBkNrwParser";
export { verwaltungsvorschriftNrwParser as verwaltungsvorschriftParser } from "./verwaltungsvorschriftNrwParser";
import { verwaltungsvorschriftNrwParser } from "./verwaltungsvorschriftNrwParser";
export { vwvfgNrwParser } from "./vwvfgNrwParser";
import { vwvfgNrwParser } from "./vwvfgNrwParser";
export { grundgesetzParser } from "./grundgesetzParser";
import { grundgesetzParser } from "./grundgesetzParser";
export { dsgvoParser } from "./dsgvoParser";
import { dsgvoParser } from "./dsgvoParser";

export const erlassParser = makeStub({
  id: "erlass-generic",
  label: "Runderlass",
  kind: "circular",
  title: "Runderlass",
  shortName: "RdErl.",
  authority: "MSB NRW",
  detect: (i) => /(Runderlass|RdErl\.)/i.test(i.raw),
});

export const faqParser = makeStub({
  id: "faq-generic",
  label: "FAQ",
  kind: "faq",
  title: "FAQ",
  detect: (i) => /^\s*(Frage|F:|Q:)/im.test(i.raw) && /^\s*(Antwort|A:)/im.test(i.raw),
});

export const courtDecisionParser = makeStub({
  id: "court-decision",
  label: "Gerichtsentscheidung",
  kind: "court_decision",
  title: "Gerichtsentscheidung",
  detect: (i) => /(Az\.:|Aktenzeichen|Urteil vom|Beschluss vom)/i.test(i.raw),
});

export const preparedParsers = [
  bassNrwParser,
  apoBkNrwParser,
  verwaltungsvorschriftNrwParser,
  vwvfgNrwParser,
  grundgesetzParser,
  dsgvoParser,
  erlassParser,
  faqParser,
  courtDecisionParser,
];
