# 05 – Document Generation

Modul: `src/services/document-generation/`.

## Ablauf

```
DocumentTemplate → ContextBuilder → PlaceholderResolver
→ Markdown (kanonische Zwischenform) → Export Registry → PDF | DOCX | Markdown
→ GeneratedDocument (Repository)
```

## Bausteine

### Templates (`DocumentTemplateRepository.ts`, `src/lib/templatesRepo.ts`)
Redaktionell gepflegte Vorlagen mit Platzhaltern, Metadaten und Zielformat.
Zuordnung zu Praxisfällen und Workflow-Knoten über die Admin-Oberfläche
(`/admin/vorlagen`, `TemplateAssignmentDialog`).

### Context Builder (`ContextBuilder.ts`)
Sammelt alle Daten, die eine Vorlage benötigt: Fall, Kategorie,
Rechtsgrundlagen, Workflow-Sitzung, Antworten, Nutzer- und Schulangaben.
Ergebnis ist ein flaches, serialisierbares Kontextobjekt.

### Placeholder Resolver (`PlaceholderResolver.ts`)
Ersetzt Platzhalter deterministisch. Unbekannte Platzhalter werden gemeldet,
nicht stillschweigend entfernt. Keine Codeausführung in Vorlagen.

### Markdown (`export/MarkdownExportAdapter.ts`, `export/MarkdownParser.ts`)
Markdown ist die kanonische Zwischenform. Alle weiteren Formate werden daraus
abgeleitet, damit Inhalt und Layout getrennt bleiben.

### PDF (`export/PdfExportAdapter.ts`)
Erzeugt ein seitenbasiertes Dokument aus der Markdown-Zwischenform.
Importberichte nutzen zusätzlich `src/lib/importReportPdf.ts`.

### DOCX (`export/DocxExportAdapter.ts`)
Erzeugt ein Office-kompatibles Dokument aus derselben Zwischenform.

### Export Registry (`export/index.ts`, `export/types.ts`)
Registrierung der Adapter über ein gemeinsames Interface. Neue Formate werden
ergänzt, ohne bestehende Adapter zu ändern (Open/Closed).
Dateinamen werden zentral in `export/filename.ts` gebildet.

### Service und Persistenz
`DocumentGenerationService.ts` orchestriert den Ablauf.
`WorkflowSessionDocumentRepository.ts` (Port) und
`SupabaseWorkflowSessionDocumentRepository.ts` (Adapter) speichern erzeugte
Dokumente. Auslieferung über
`/api/workflow-sessions/$id/documents/$docId/export` und
`/api/generate-case-document`.

### Importberichte
Der Importbericht (`legal-knowledge/import-experience/report.ts`) wird als
Markdown erzeugt, mit einem Inhalts-Hash versehen und über dieselben
Export-Adapter als PDF bzw. Markdown bereitgestellt. Die
Dokumentengenerierung kennt dabei keine Importlogik – sie erhält fertigen
Markdown-Inhalt.
