# 07 – Coding Principles

Verbindliche Architekturprinzipien für alle künftigen Entwicklungen.

## Single Responsibility
Jede Datei erfüllt genau eine Aufgabe. Erkennbar an der Modulaufteilung:
`Downloader`, `HtmlExtractor`, `LinkExtractor`, `Crawler` sind vier Dateien –
nicht eine „Import-Utility".

## Separation of Concerns
UI, Fachlogik und Persistenz sind getrennt:
`src/routes` + `src/components` (Darstellung) → `src/hooks` (Anbindung) →
`src/services` (Fachlogik) → Repositories/Ports → Supabase.

## Ports & Adapters
Fachdienste definieren Ports (`LegalImportRepositoryPort`,
`WorkflowRepository`, `WorkflowSessionDocumentRepository`,
`ChunkRepository`). Konkrete Adapter (Supabase, Browser, Mock) werden
eingesetzt, nie importiert die Fachlogik den Adapter direkt.

## Single Source of Truth
Jede Information hat genau einen führenden Ort: Rechtsquellentext in
`legal_sources`/Versionen, Entscheidungsbaum in `practice_cases.decision_tree`,
Designtokens in `src/styles.css`, Datenbankstand in `db/schema.lock.json`.

## Dependency Injection
Abhängigkeiten werden übergeben, nicht global gezogen: Provider-Factories
(`EmbeddingProviderFactory`, `AIProviderFactory`), Repository-Parameter,
Feature Flags. Das macht Tests ohne Netzwerk möglich.

## Plugin Architecture
Parser, Connector-Definitionen, Export-Adapter, KI-Provider und Chunk-Strategien
sind Registrierungen in einer Registry, keine `switch`-Ketten im Kern.

## Open/Closed Principle
Erweiterung durch Hinzufügen (neue Registry-Einträge), nicht durch Ändern
bestehender Module. Siehe `09-extension-points.md`.

## Keine Geschäftslogik im Frontend
Komponenten rendern und rufen Services auf. Sie berechnen keine Deltas,
parsen keine Rechtstexte und formulieren keine Datenbankabfragen.

## Parser niemals UI-abhängig
Parser sind reine Funktionen: Text hinein, Struktur heraus. Kein React,
kein `window`, kein Netzwerkzugriff, keine Übersetzungen für die Anzeige.

## Connector niemals Parser ersetzen
Der Connector beschafft Rohinhalte und wählt ein Parserprofil. Er interpretiert
niemals selbst Rechtstexte.

## Verbindliche Architekturregeln

1. Keine direkte Datenbanklogik im UI.
2. Die Workflow Engine kennt keine Parser.
3. Parser kennen keine UI.
4. Der Connector kennt keine Runtime.
5. Die Dokumentengenerierung kennt keine Importlogik.
6. Die Delta Engine arbeitet ausschließlich auf Versionen.
7. Alle Erweiterungen erfolgen über definierte Schnittstellen.

## Technische Konventionen
- TypeScript strict, keine `any`-Durchreichung an Schnittstellen.
- Deutsche Fachbegriffe in der UI, englische Bezeichner im Code.
- Fehler als typisierte Fehlerklassen je Domäne (`errors.ts`).
- Telemetrie über `bumpTelemetry`, keine `console.log`-Instrumentierung.
- Server-only Code in `*.server.ts` bzw. innerhalb von `.handler()`.
- Semantische Designtokens statt fester Farbwerte in Komponenten.
