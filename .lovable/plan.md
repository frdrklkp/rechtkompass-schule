# Sprint 4.3D — Editorial Workflow Designer

Ein webbasierter Designer, der neue Workflows ohne SQL-Migrationen erlaubt. Engine, Runtime, Repository und API bleiben unverändert; der Designer erzeugt ausschließlich Daten über die vorhandenen Domain-Modelle (`WorkflowTemplate` … `WorkflowRule`) und die vorhandenen Mapper/Services.

## Architekturprinzipien

- **Keine Parallelstrukturen.** Der Designer nutzt `WorkflowTemplateService`, `SupabaseWorkflowTemplateRepository`, `WorkflowMapper`, `WorkflowValidator`, `WorkflowRuleEngine`, `WorkflowExportService` und die bestehende Runtime `workflows.session.$sessionId.tsx` für Preview.
- **UI kennt keine Tabellen.** Alle Reads/Writes gehen über eine schmale, neue Server-Function-Schicht, die intern das Template-Repository verwendet. Keine direkten SQL/Supabase-Aufrufe aus Komponenten.
- **Immutable Versionierung bleibt.** Publish erzeugt weiterhin über `WorkflowTemplateService.publish()` einen Snapshot; laufende Sessions sind an ihren Version-Snapshot gepinnt und werden nicht angefasst.
- **Rollen.** Nur `editor`+ dürfen bearbeiten (bestehendes `useEditorialRole` / `is_editor`); Lesezugriff für Admin/Reviewer; Runtime-User haben keinen Zugriff auf den Designer.

## Neue Seiten

```
src/routes/admin.editorial.workflows.index.tsx     Liste + Filter/Suche/Aktionen
src/routes/admin.editorial.workflows.$id.tsx       Editor (Tabs: Übersicht, Phasen, Regeln, Rechtsgrundlagen, Vorschau, Verlauf)
src/routes/admin.editorial.workflows.neu.tsx       Neuer Entwurf (leeres Template)
```

Preview verlinkt in die bestehende Runtime (`/workflows/session/$sessionId`) über eine kurzlebige Preview-Session, die aus dem Draft-Snapshot erzeugt wird.

## Neue Komponenten (`src/components/workflow-designer/`)

- `WorkflowListTable.tsx` — sortierbare, virtualisierte Tabelle.
- `WorkflowMetaForm.tsx` — Titel/Slug/Kategorie/Icon/Tier/Beschreibung (Autosave via `useAutosave`).
- `PhaseBoard.tsx` + `PhaseCard.tsx` — Drag & Drop (`@dnd-kit`), Phase CRUD.
- `StepList.tsx` + `StepCard.tsx` + `StepEditor.tsx` — Schritt-CRUD, Metadaten, Rollen.
- `DependencyGraph.tsx` — DAG-Editor (SVG-basiert, Node/Edge Add/Remove, Zyklus-Check inline via `WorkflowValidator`).
- `ChecklistEditor.tsx` — Items sortierbar.
- `RoleAssignmentEditor.tsx` — Multi-Select + `can_edit`/`can_complete`.
- `DocumentSuggestionEditor.tsx` — Template-Slug Autocomplete gegen bestehende Vorlagen.
- `LegalReferenceEditor.tsx` — Autocomplete gegen `legal_sources` / `legal_sections` inkl. `citation_hint`.
- `RuleBuilder.tsx` — Wenn/Dann Builder mit Dropdowns (keine Freitextausdrücke).
- `ValidationSummary.tsx` — Warnungen/Fehler aus `WorkflowValidator`.
- `WorkflowVersionList.tsx` — bestehende Versionen (read-only Snapshots).
- `JsonImportExport.tsx` — Wrapper um `WorkflowExportService`.

## Serverfunktionen (`src/lib/workflowDesigner.functions.ts`)

Dünner RPC-Layer, ausschließlich in `_authenticated` erreichbar, editor-guarded:

- `listTemplatesForDesigner()` — inkl. Draft-Status, letzte Änderung, Version.
- `getDesignerTemplate(id)` — voller Draft (Domain-Modell).
- `saveDesignerTemplate(patch)` — Autosave über `TemplateRepository.saveDraft`.
- `duplicateTemplate(id, newSlug?)` — Deep-Copy inkl. Phasen/Steps/Rules/Docs.
- `publishTemplate(id)` — delegiert an `WorkflowTemplateService.publish`.
- `archiveTemplate(id)` — `service.archive`.
- `importTemplateJson(json)` / `exportTemplateJson(id)` — `WorkflowExportService`.
- `acquireEditorLock(id)` / `heartbeatLock(id)` / `releaseLock(id)` — kurzer TTL-Lock in einer neuen leichtgewichtigen Tabelle `workflow_editor_locks` (nur wenn nötig; falls Reuse einer bestehenden Locking-Struktur möglich, diese nutzen).

Alle Funktionen loggen über `workflowTelemetry` (`workflow_created`, `workflow_updated`, `workflow_published`, `workflow_archived`, `workflow_duplicated`, `workflow_validation_failed`, `workflow_imported`, `workflow_exported`, `editor_opened`, `editor_closed`).

## Datenmodell

Neue Tabellen werden **nur** ergänzt, wenn zwingend nötig:

- `workflow_editor_locks(template_id pk, user_id, acquired_at, expires_at)` mit `GRANT`s + RLS (nur eigener Lock lesbar/schreibbar; Editor kann Lock stehlen nach TTL). Nur falls kein vorhandenes Konstrukt wiederverwendbar ist.

Alle sonstigen Änderungen laufen gegen die bestehenden Tabellen aus `db/2026-07-30_workflow_platform.sql`.

## Preview

`PreviewButton` ruft `createDesignerPreviewSession(templateId)` — nutzt vorhandene `WorkflowEngine.startSession()` mit `mode: "preview"`-Flag (nur clientseitig markiert) und leitet in die bestehende `workflows.session.$sessionId.tsx` weiter. Keine zweite Runtime.

## Validierung

`WorkflowValidator` liefert Warnungen/Fehler; Publish-Button ist bei `errors.length > 0` gesperrt. Fehlerkategorien: fehlende Titel/Phasen/Schritte, unerreichbare Schritte, Zyklen, fehlende Rollen/Dokumente/Regeln (Warnungen).

## Tests

`src/services/legal-workflows/__tests__/designer.test.ts` deckt ab:

- CRUD auf Template/Phase/Step/Checklist/Role/Document/Rule (In-Memory-Repo)
- Duplicate Deep-Copy
- Import/Export Roundtrip mit Golden Reference (`buildPilotWorkflow`)
- Cycle Detection, Unreachable Steps
- Publish erzeugt Version, Snapshot-Vergleich
- Autosave Konflikt (zwei Writer, letzter mit stale `updatedAt` wird abgelehnt)
- Permissions: Non-Editor 403

## Abschlussbericht

Wird nach Fertigstellung als `docs/sprint-4.3D-designer.md` abgelegt und in der Chat-Antwort zusammengefasst mit den geforderten Bestätigungen (Engine/Runtime/API/Repo unverändert, Designer vollständig, Versionierung stabil, Golden Reference editierbar, Typecheck/Tests grün).

## Nicht Teil dieses Sprints

Keine KI-Funktionen, keine Runtime/Engine/Session-Änderungen, keine Dokumentgenerierung.

---

**Umfang:** ~14 neue Dateien (Routes + Designer-Komponenten), 1 neue Server-Function-Datei, 1 optionale Migration für Editor-Locks, 1 Testdatei. Erwartete Größe: ~2500–3500 LOC.
