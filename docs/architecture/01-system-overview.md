# 01 – System Overview (Architecture Freeze v1.0)

Stand: Milestone M1, nach Sprint 4.5H. Dieses Dokument beschreibt die
Gesamtarchitektur von **RechtsKompass Schule** zum Zeitpunkt des Architecture
Freeze. Es dokumentiert den Ist-Zustand; es beschreibt keine geplanten
Änderungen.

## 1. Technische Plattform

| Ebene | Technologie |
| --- | --- |
| Framework | TanStack Start v1 (React 19, SSR + Server Functions) |
| Build | Vite 7 |
| Sprache | TypeScript (strict) |
| Styling | Tailwind CSS v4 (`src/styles.css`, semantische Tokens) + shadcn/ui |
| Datenhaltung | Supabase (PostgreSQL, RLS, pgvector) |
| Serverlogik | `createServerFn` + Server-Routen unter `src/routes/api/` |
| KI | Provider-abstrahiert (Gateway-Provider + Mock-Provider) |
| Laufzeit | Edge Worker (workerd) |

## 2. Hauptmodule

### 2.1 Teacher App
Die öffentliche Anwendungsseite für Lehrkräfte und Schulleitungen.
Routen: `/`, `/faelle`, `/faelle/$id`, `/fall/$id`, `/rechtsgrundlagen`,
`/assistent`, `/kollege`, `/dokumente`, `/vorgaenge`, `/workflows/*`.
Verantwortlich für: Fallsuche, Ampel-/Handlungslogik-Darstellung, Checklisten,
Entscheidungsassistent, Dokumentenzugriff. Enthält **keine** Geschäftslogik –
sie konsumiert Services und Hooks.

### 2.2 Core Builder (Admin-Plattform)
Der redaktionelle Arbeitsbereich unter `/admin/*`. Er umfasst Praxisfälle,
Kategorien, Schlagwörter, Vorlagen, Qualitätsmanagement, Editorial-Workflow,
Legal Knowledge Center, Import, Historie, Versionen und Dashboards.
Details: `06-admin-platform.md`.

### 2.3 Workflow Engine
`src/services/legal-workflows/` – datengetriebene Entscheidungs-Engine.
Kernbausteine: `WorkflowEngine`, `WorkflowStateMachine`, `WorkflowNavigator`,
`WorkflowRuleEngine`, `WorkflowValidator`, `WorkflowProgressCalculator`.
Die Engine kennt weder UI noch Parser noch Importlogik.

### 2.4 Workflow Runtime
Ausführungsschicht für laufende Sitzungen: `WorkflowRunner`,
`WorkflowContextBuilder`, Session-Repositories und die API-Routen
`src/routes/api/workflow-sessions*`. UI: `/workflows/session/$sessionId`.
Sie hält Sitzungszustand, Antworten, Ereignisse, Checklisten und Dokumente.

### 2.5 Workflow Designer
Redaktioneller Editor für Workflow-Definitionen
(`src/lib/workflowDesigner.functions.ts`, `/admin/editorial/workflows/*`).
Erzeugt und validiert Definitionen; führt sie nie aus.

### 2.6 Legal Knowledge
`src/services/legal-knowledge/` mit den Teildomänen:
`registry` (Rechtsquellen-Stammdaten und Lebenszyklus), `document`
(semantische Dokumentstruktur, Parser, Referenzauflösung), `chunks`
(Chunk Engine), `embeddings` (Vektorindex, Jobs, Provider), `retrieval`
(hybride Suche, Ranking, Zitate) und `ingestion` (Rohinhalt-Aufnahme).

### 2.7 Import System
`src/services/legal-knowledge/import/` – Importframework mit
Parser-Plugins (`parsers/`), Normalizer, Validator, Delta-/Hashing-Logik,
Versionierung und einem Repository-Port. Ergänzt um die UX-Schicht
`import-experience/` (Vorschau, Delta Explorer, Fortschritt, Bericht).
Details: `03-import-architecture.md`.

### 2.8 Official Source Connector
`src/services/legal-knowledge/connectors/` – Whitelist-basierter Abruf
offizieller Quellen (BASS NRW, Recht.NRW u. a.):
`whitelist`, `registry`, `Downloader` (HTTPS, Timeouts, Retries),
`HtmlExtractor`, `LinkExtractor`, `OfficialSourceCrawler` (BFS),
`OfficialSourceConnectorService`. Serverproxy: `/api/legal-source-crawl`.

### 2.9 Update Monitor
`connectors/updateMonitor.ts` – vergleicht die installierte Fassung mit der
online verfügbaren Fassung und liefert einen Ampelstatus für das Dashboard.

### 2.10 Document Generation
`src/services/document-generation/` – Templates, `ContextBuilder`,
`PlaceholderResolver`, `DocumentGenerationService` und Export-Adapter
(Markdown, PDF, DOCX). Details: `05-document-generation.md`.

### 2.11 AI Layer
Drei getrennte, providerunabhängige Einsatzfelder:
- **Editorial AI** (`src/services/editorial/ai/`): Vorschläge für Redaktion,
  nie Auto-Save.
- **Legal Copilot** (`src/services/legal-copilot/`): geerdete Antworten
  ausschließlich auf Basis gefundener Quellen (`GroundingEngine`,
  `HallucinationGuard`, `CitationInjector`).
- **Embedding-Provider** (`legal-knowledge/embeddings/providers/`).
Alle Provider hinter Factories; Mock-Provider für Tests.

### 2.12 Dashboard
Kennzahlen- und Statusflächen: `/admin`, `/admin/legal-knowledge`,
`/admin/editorial`, `/admin/qualitaet`. Reine Lesesicht auf aggregierte
Kennzahlen der Fachdienste.

## 3. Datenfluss

```
Offizielle Quelle
  → Connector (Whitelist, Download, HTML/Link-Extraktion, Crawl)
  → Import System (Parser → Normalizer → Validator → Delta → Versionierung)
  → Repository (Supabase)
  → Legal Knowledge (Dokumentstruktur → Chunks → Embeddings)
  → Retrieval (hybride Suche)
  → Legal Copilot / Teacher App / Core Builder

Redaktion (Core Builder)
  → PracticeCase / Workflow-Definition / Template
  → Editorial Workflow (draft → review → published)
  → Teacher App

Nutzerinteraktion (Teacher App)
  → Workflow Runtime (Session, Antworten, Ereignisse)
  → Document Generation (Kontext → Platzhalter → Export)
  → GeneratedDocument
```

Querschnitt: Telemetrie (`telemetry.ts` je Domäne), Feature Flags
(`featureFlags.ts`), Fehlerobjekte (`errors.ts`).

## 4. Schichtenregel

UI → Hooks → Services → Repositories/Ports → Supabase.
Kein Sprung über Schichten hinweg; insbesondere kein direkter
Datenbankzugriff aus Komponenten.
