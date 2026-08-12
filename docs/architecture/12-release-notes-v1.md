# 12 – Release Notes v1.0 (Architecture Freeze)

**Version:** 1.0
**Meilenstein:** M1 – Architecture Freeze
**Stand:** nach Sprint 4.5H
**Charakter dieses Release:** Dokumentation und Einfrieren. Keine
funktionalen Änderungen, keine Refactorings.

## Enthaltene Funktionen

### Teacher App
Fallübersicht und Fallsuche, Ampelbewertung, Handlungsnavigator,
interaktive Checklisten, Rechtsgrundlagen-Ansicht, Entscheidungsassistent,
Kollegen-Ansicht in nicht-juristischer Sprache, Dokumentenbereich,
Vorgangsübersicht, Onboarding, mobile Navigation.

### Entscheidungsassistent
Fallspezifische, kuratierte Entscheidungsbäume in
`practice_cases.decision_tree` mit Priorität vor dem regelbasierten Fallback,
Statusmodell draft/review/approved, deterministische Validierung
(Zyklen, Sackgassen, Erreichbarkeit), Admin-Editor mit Direktaktionen,
Mini-Map, Vorschau und KI-Entwurf, Batch-Generierung inklusive
Eignungsprüfung und Sammelfreigabe.

### Editorial Platform
Rollenmodell und RLS, linearer Redaktionsworkflow von Entwurf bis
Veröffentlichung, Versionierung von Fällen, Reviews, Ereignisprotokoll,
Workspace-Dashboard, Qualitätsmanager mit 28 Regeln, Alterung und
Veröffentlichungsreife.

### AI Layer
Providerunabhängige Plattform mit Factory und Fallback,
Editorial Copilot mit Feldassistenz und Command Bar (keine
Auto-Speicherung), Grounded Legal Copilot mit Retrieval-Bindung,
Halluzinationsschutz, Zitaten und Vertrauensindikator, KI-Entwurfsmaschine
inklusive Excel-Import.

### Legal Knowledge
Rechtsquellenregister mit Lebenszyklus und Prüfstatus, Ingestion-Pipeline,
semantische Dokumentstruktur mit Parser und Referenzauflösung,
Chunk Engine mit Smart Splitting an rechtlichen Grenzen,
Embedding-Plattform auf pgvector mit Batch-Jobs, Deduplizierung und
Kostenschätzung, hybride Suche mit Ranking, Highlighting und Zitaten.

### Import System
Importframework mit Parser-Plugins für BASS NRW, APO-BK,
Verwaltungsvorschriften und Schulgesetz NRW, Normalisierung, Validierung,
Delta-Erkennung über Inhalts-Hashes, unveränderliche Versionierung,
Repository-Port, Importprotokoll und Historie.

### Official Source Connector und Update Monitor
Whitelist-basierter Abruf offizieller Quellen, HTTPS-Zwang, Timeouts,
Retries mit Backoff, HTML- und Link-Extraktion ohne Skriptausführung,
BFS-Crawler mit Fortschrittsmeldung, Ampelstatus für Aktualisierungsbedarf.

### Import Experience (Sprint 4.5H)
Strukturierte Importvorschau (Allgemein, Dokumentübersicht, Delta mit
Farbcodierung), Delta Explorer, Versionsvergleich, phasenbasierte
Fortschrittsanzeige, Importbericht als PDF und Markdown, erweiterte
Dashboard-Kennzahlen, Pflichtbestätigung vor Übernahme, verständliche
Fehlermeldungen mit Handlungsempfehlung.

### Workflow Platform
Datengetriebene Workflow Engine mit Zustandsautomat, Regelauswertung,
Navigation und Validierung; Runtime mit Sitzungen, Ereignissen, Checklisten
und Dokumenten; redaktioneller Designer; Workflow-Empfehlungen.

### Document Generation
Vorlagenverwaltung, Kontextaufbau, Platzhalterauflösung, Markdown als
Zwischenform, Export nach PDF und DOCX, Export Registry, Dokumentversand,
Registrierung erzeugter Dokumente.

## Qualitätsziele (verbindlich ab v1.0)

- **Wartbarkeit** – kleine Module mit einer Verantwortung, einheitliche
  Dateikonventionen je Domäne.
- **Erweiterbarkeit** – Erweiterung durch Registrierung statt Änderung
  (`09-extension-points.md`).
- **Nachvollziehbarkeit** – Telemetrie, Ereignisprotokolle, Importberichte,
  lesbare Änderungsübersichten.
- **Revisionssicherheit** – unveränderliche Versionen, Checksummen,
  lückenlose Historie, Bestätigung vor Übernahme.
- **Performance** – Delta-basierte Schreibvorgänge, Batch-Verarbeitung,
  Vektorindex, Begrenzung von Crawl-Tiefe und Datenmengen.
- **Testbarkeit** – Ports und Mock-Adapter, deterministische Parser,
  Fachlogik ohne UI-Abhängigkeit.
- **Modularität** – klare Domänengrenzen; keine Querabhängigkeiten zwischen
  Engine, Parser, Connector und Dokumentengenerierung.

## Abschlussbericht Milestone M1

- ✓ Architektur vollständig dokumentiert (`docs/architecture/01`–`12`)
- ✓ Version 1.0 eingefroren
- ✓ Keine funktionalen Änderungen
- ✓ Keine Refactorings
- ✓ Typecheck grün
- ✓ Alle Tests grün (114/114)
- ✓ Plattform bereit für Phase 2 – Decision Navigator

## Ausblick Phase 2

Der Decision Navigator setzt ausschließlich auf den hier dokumentierten
Erweiterungspunkten auf: neue Workflow-Node-Typen, ergänzende
Retrieval-Signale und zusätzliche Dashboards – ohne Eingriff in Engine,
Importframework, Parser, Delta Engine oder Connector.
