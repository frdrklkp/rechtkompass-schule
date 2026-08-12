# 03 – Import Architecture

Der Importprozess ist eine strikt lineare Kette. Jede Stufe hat genau eine
Verantwortung und kennt nur ihre direkte Eingabe.

```
Quelle → Connector → Downloader → HTML Extractor → Link Extractor → Crawler
→ Parser → Normalizer → Validator → Delta Engine → Versionierung
→ Repository → Dashboard → Historie
```

## Stufen und Verantwortlichkeiten

### Quelle
Offizielle Rechtsquelle (BASS NRW, Recht.NRW, APO-BK, Verwaltungsvorschriften)
oder manuell eingefügter Text. Definiert in `connectors/registry.ts`.

### Connector (`connectors/OfficialSourceConnectorService.ts`)
Orchestriert den Abruf einer registrierten Quelle. Prüft die Whitelist
(`whitelist.ts`), wählt Einstiegspunkte und Parserprofil, meldet Fortschritt.
Der Connector ersetzt niemals einen Parser und kennt keine Runtime.

### Downloader (`connectors/Downloader.ts`)
Ausschließlich HTTPS. Timeouts, begrenzte Retries mit Backoff, Größenlimits,
keine Skriptausführung. Liefert rohes HTML/Text.

### HTML Extractor (`connectors/HtmlExtractor.ts`)
Reines Parsing ohne DOM-Ausführung: Entfernen von Navigation, Skripten und
Layout; Extraktion des inhaltlichen Textkörpers.

### Link Extractor (`connectors/LinkExtractor.ts`)
Ermittelt Folgelinks, normalisiert relative URLs, filtert gegen Whitelist und
Dateitypen.

### Crawler (`connectors/OfficialSourceCrawler.ts`)
Breitensuche über die extrahierten Links mit Tiefen- und Mengenbegrenzung,
Deduplizierung und Fortschrittsmeldung (Found → Loaded → Processed →
Validated → Delta).

### Parser (`import/parsers/*`)
Deterministische, quellspezifische Plugins: `bassNrwParser`,
`apoBkNrwParser`, `verwaltungsvorschriftNrwParser`, `schulgesetzNrwParser`.
Erzeugen aus Rohtext eine Dokument- und Knotenstruktur. Parser sind rein,
UI-frei und ohne Netzwerkzugriff.

### Normalizer (`import/LegalImportNormalizer.ts`)
Vereinheitlicht Whitespace, Nummerierungen, Zitierweisen und Metadaten;
erzeugt stabile Identifier.

### Validator (`import/LegalImportValidator.ts`)
Struktur- und Plausibilitätsprüfung: Pflichtfelder, Hierarchie,
Referenzintegrität, leere Knoten. Ergebnis: Fehler, Warnungen, Hinweise.

### Delta Engine (`import/hashing.ts` + Versionsvergleich)
Berechnet je Knoten stabile Inhalts-Hashes (djb2) und vergleicht die neue
Fassung ausschließlich gegen die zuletzt gespeicherte Version. Ergebnis:
neu / geändert / entfernt / unverändert, je Kategorie (Dokumente,
Paragraphen, Absätze, Anlagen).

### Versionierung (`import/LegalImportVersioner.ts`)
Legt eine neue, unveränderliche `LegalImportVersion` an, verknüpft sie mit der
Vorgängerfassung und schreibt Checksumme sowie Statistik fort.

### Repository (`import/LegalImportRepositoryPort.ts`, `browserRepository.ts`,
`repositories/*`)
Port/Adapter-Grenze zur Persistenz. Die Importkette kennt nur den Port.

### Dashboard
Aggregierte Kennzahlen (`import-experience/store.ts`,
`/admin/legal-knowledge`): Dokumente, Paragraphen, Anlagen, geänderte
Inhalte, letzte erfolgreiche Aktualisierung.

### Historie
Vollständige Protokollierung jedes Laufs inklusive Importbericht
(`/admin/legal-knowledge/history`, `/admin/import-protokoll/$id`).

## Import Experience (UX-Schicht, Sprint 4.5H)
`import-experience/` liegt **hinter** der Importkette und verändert sie nicht:
- `previewModel.ts` – strukturierte Vorschau (Allgemein / Übersicht / Delta)
- `progress.ts` – Phasenmodell der Fortschrittsanzeige
- `report.ts` – revisionssicherer Importbericht (Markdown + Hash)
- `errors.ts` – verständliche Fehlerbeschreibung mit Handlungsempfehlung
- `store.ts` – lokale Kennzahlen-, Snapshot- und Berichtsablage

## Sicherheitsregeln
Nur HTTPS, nur gelistete Domains, keine Skriptausführung, feste Timeouts,
begrenzte Retries, Übernahme erst nach ausdrücklicher Bestätigung.
