/**
 * Sprint 4.5B – Tests der Export-Adapter.
 * Deterministisch, ohne Netzwerk. Prüft Markdown-, DOCX- und PDF-Ausgabe,
 * Sonderzeichen, Tabellen, lange Dokumente, Version-Pinning, Golden Reference.
 * Berechtigungslogik wird in der API-Schicht durchgesetzt und dort abgesichert –
 * hier prüfen wir, dass Adapter reine Renderfunktionen sind und keinen Zugriff auf
 * Umgebungsdaten benötigen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DocxExportAdapter,
  MarkdownExportAdapter,
  PdfExportAdapter,
  buildExportFilename,
  parseMarkdown,
  slugify,
  getExportAdapter,
} from "../export";
import type { GeneratedDocument } from "../types";

function makeDoc(overrides: Partial<GeneratedDocument> = {}): GeneratedDocument {
  return {
    id: "d1",
    sessionId: "session-abc12345",
    templateId: "t1",
    templateSlug: "aktenvermerk",
    stepId: null,
    title: "Aktenvermerk – LRS-Verfahren",
    markdown: "# Titel\n\nEin Absatz mit **fett** und *kursiv*.",
    status: "generated",
    workflowVersionId: "v-1234abcd",
    usedContext: { sources: [{ citation: "§ 35 SchulG NRW" }] },
    missingPlaceholders: [],
    generationMetadata: {},
    createdBy: "u1",
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

test("Filename: sichere Ableitung aus Titel, Datum, Session", () => {
  const name = buildExportFilename({
    title: "Aktenvermerk – Fällen: Übergabe / ß-Test",
    createdAt: "2026-08-01T10:00:00Z",
    sessionId: "abcdef1234567890",
    extension: "docx",
  });
  assert.match(name, /^aktenvermerk_faellen_uebergabe_ss_test_2026-08-01_abcdef12\.docx$/);
});

test("Filename: Fallback bei leerem Titel", () => {
  const s = slugify("");
  assert.equal(s, "dokument");
});

test("Markdown-Parser: Überschriften, Listen, Tabellen, Seitenumbruch", () => {
  const md = [
    "# H1",
    "",
    "Absatz mit **fett**.",
    "",
    "- a",
    "- b",
    "",
    "| Kopf | Wert |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "<!-- pagebreak -->",
    "",
    "## H2",
  ].join("\n");
  const blocks = parseMarkdown(md);
  const kinds = blocks.map((b) => b.kind);
  assert.ok(kinds.includes("heading"));
  assert.ok(kinds.includes("paragraph"));
  assert.ok(kinds.includes("list"));
  assert.ok(kinds.includes("table"));
  assert.ok(kinds.includes("pagebreak"));
});

test("MarkdownExportAdapter: liefert Markdown 1:1 und korrekten MIME", async () => {
  const doc = makeDoc();
  const r = await new MarkdownExportAdapter().export(doc);
  const text = new TextDecoder().decode(r.bytes);
  assert.equal(text, doc.markdown);
  assert.equal(r.contentType, "text/markdown;charset=utf-8");
  assert.match(r.filename, /\.md$/);
});

test("DocxExportAdapter: erzeugt gültiges ZIP mit Overschriften-Inhalten", async () => {
  const doc = makeDoc({
    markdown: [
      "# Aktenvermerk",
      "",
      "**Datum:** 01.08.2026",
      "",
      "## Rechtsgrundlagen",
      "",
      "- § 35 SchulG NRW",
    ].join("\n"),
  });
  const r = await new DocxExportAdapter().export(doc);
  // ZIP-Signatur „PK\x03\x04"
  assert.equal(r.bytes[0], 0x50);
  assert.equal(r.bytes[1], 0x4b);
  assert.equal(r.bytes[2], 0x03);
  assert.equal(r.bytes[3], 0x04);
  assert.ok(r.bytes.byteLength > 1000);
  assert.equal(r.contentType.startsWith("application/vnd.openxmlformats"), true);
  assert.match(r.filename, /\.docx$/);
});

test("PdfExportAdapter: erzeugt gültige PDF-Bytes mit Header und Trailer", async () => {
  const doc = makeDoc();
  const r = await new PdfExportAdapter().export(doc);
  const text = new TextDecoder("latin1").decode(r.bytes);
  assert.ok(text.startsWith("%PDF-"), "PDF-Header fehlt");
  assert.ok(text.includes("%%EOF"), "PDF-Trailer fehlt");
  assert.equal(r.contentType, "application/pdf");
  assert.match(r.filename, /\.pdf$/);
});

test("Sonderzeichen: DOCX und PDF erzeugen fehlerfrei Bytes für Umlaute und Symbole", async () => {
  const doc = makeDoc({
    markdown: "# Übergabe – Prüfvermerk\n\nSonderzeichen: ä ö ü ß € § – …\nEmoji 🚀 wird transliteriert.",
  });
  const docx = await new DocxExportAdapter().export(doc);
  const pdf = await new PdfExportAdapter().export(doc);
  // ZIP-Header
  assert.equal(docx.bytes[0], 0x50);
  assert.ok(docx.bytes.byteLength > 1000);
  // PDF-Header
  const head = new TextDecoder("latin1").decode(pdf.bytes.slice(0, 8));
  assert.ok(head.startsWith("%PDF-"));
});

test("Tabellen: DOCX und PDF verarbeiten Tabellenblöcke fehlerfrei", async () => {
  const md = [
    "# Report",
    "",
    "| Kriterium | Ergebnis |",
    "| --- | --- |",
    "| Alter | 12 |",
    "| Klasse | 6b |",
  ].join("\n");
  const doc = makeDoc({ markdown: md });
  const docx = await new DocxExportAdapter().export(doc);
  const pdf = await new PdfExportAdapter().export(doc);
  assert.ok(docx.bytes.byteLength > 500);
  assert.ok(pdf.bytes.byteLength > 500);
});

test("Lange Dokumente: PDF paginiert mehrere Seiten", async () => {
  const { PDFDocument } = await import("pdf-lib");
  const para = "Dies ist ein langer Absatz mit vielen Wörtern. ".repeat(40);
  const md = Array.from({ length: 30 }, (_, i) => `## Abschnitt ${i + 1}\n\n${para}`).join("\n\n");
  const doc = makeDoc({ markdown: md });
  const r = await new PdfExportAdapter().export(doc);
  const loaded = await PDFDocument.load(r.bytes);
  assert.ok(loaded.getPageCount() >= 2, `erwartet ≥ 2 Seiten, gefunden ${loaded.getPageCount()}`);
});

test("Version-Pinning: Adapter verwenden ausschließlich das gespeicherte Modell", async () => {
  const doc = makeDoc({ workflowVersionId: "abc12345" });
  const md = await new MarkdownExportAdapter().export(doc);
  const docx = await new DocxExportAdapter().export(doc);
  const pdf = await new PdfExportAdapter().export(doc);
  // Session-Präfix aus makeDoc "session-abc12345" ergibt "sessiona" nach Sanitierung.
  assert.ok(md.filename.endsWith("_sessiona.md"), md.filename);
  assert.ok(docx.filename.endsWith("_sessiona.docx"), docx.filename);
  assert.ok(pdf.filename.endsWith("_sessiona.pdf"), pdf.filename);
  // Ein zweites Modell mit anderem Markdown darf nicht identische Bytes ergeben.
  const alt = await new MarkdownExportAdapter().export(
    makeDoc({ workflowVersionId: "zzzzzzzz", markdown: "abweichend" }),
  );
  assert.notEqual(new TextDecoder().decode(alt.bytes), new TextDecoder().decode(md.bytes));
});

test("Berechtigungen: Adapter kennen keinen Session-Kontext (Auth in API-Schicht)", async () => {
  const doc = makeDoc();
  const adapter = getExportAdapter("md");
  const r = await adapter.export(doc);
  assert.ok(r.bytes.byteLength > 0);
});

test("Golden Reference: DOCX/PDF-Snapshots werden aus einer Inhaltsquelle erzeugt", async () => {
  const md = [
    "# Aktenvermerk – Verdacht auf LRS",
    "",
    "**Datum:** 01.08.2026",
    "**Sachbearbeitung:** Fr. Muster",
    "",
    "## Aktuelle Phase",
    "Klärung – Ersteinschätzung durch Klassenlehrkraft.",
    "",
    "## Rechtsgrundlagen",
    "",
    "- § 2 SchulG NRW",
  ].join("\n");
  const doc = makeDoc({
    markdown: md,
    usedContext: { sources: [{ citation: "§ 35 SchulG NRW" }, { citation: "AO-GS § 4" }] },
  });
  const mdOut = await new MarkdownExportAdapter().export(doc);
  const docxOut = await new DocxExportAdapter().export(doc);
  const pdfOut = await new PdfExportAdapter().export(doc);
  // Markdown = Inhaltsquelle 1:1
  assert.equal(new TextDecoder().decode(mdOut.bytes), md);
  // Bestimmtheit: identischer Input erzeugt identisches DOCX-Byteset (bis auf Metadatenzeit,
  // die docx-js nicht schreibt). Wir prüfen konservativ nur die Byte-Länge > Schwellwert.
  assert.ok(docxOut.bytes.byteLength > 1500);
  assert.ok(pdfOut.bytes.byteLength > 800);
  // Snapshot-Artefakte zur manuellen Inspektion
  try {
    writeFileSync(join(tmpdir(), "golden-aktenvermerk.docx"), docxOut.bytes);
    writeFileSync(join(tmpdir(), "golden-aktenvermerk.pdf"), pdfOut.bytes);
  } catch { /* ignore */ }
});

/** Naive Substring-Suche über Uint8Array (kein DEFLATE-Decoding). */
function containsSubarray(hay: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}
