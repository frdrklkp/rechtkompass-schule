# 09 – Extension Points

Alle Erweiterungen erfolgen additiv über bestehende Schnittstellen. Kein
Eingriff in bestehende Module ist erforderlich.

## Neuer Parser
1. Datei unter `src/services/legal-knowledge/import/parsers/` anlegen.
2. Die Parser-Signatur des Importframeworks implementieren (Rohtext →
   Dokumente/Knoten), rein und UI-frei.
3. Im Parser-Register des Importframeworks eintragen.
4. Tests unter `src/services/legal-knowledge/__tests__/` ergänzen.
Bestehende Parser bleiben unberührt.

## Neuer Connector / neue Rechtsquelle
1. Domain in `connectors/whitelist.ts` freigeben (nur HTTPS).
2. Quelldefinition in `connectors/registry.ts` ergänzen: Einstiegs-URLs,
   Crawl-Grenzen, Parserprofil, Anzeigename.
3. Der Ablauf Downloader → Extractor → Crawler bleibt unverändert.
Ohne Whitelist-Eintrag ist keine Domain erreichbar.

## Neues Exportformat
1. Adapter in `src/services/document-generation/export/` anlegen, der das
   gemeinsame Adapter-Interface aus `export/types.ts` erfüllt.
2. In der Export Registry (`export/index.ts`) registrieren.
3. Markdown bleibt die Zwischenform – keine Änderung an Templates,
   Context Builder oder Placeholder Resolver.

## Neuer Workflow-Node-Typ
1. Typ in `legal-workflows/types.ts` ergänzen.
2. Auswertungsregel im `WorkflowRuleEngine`/`WorkflowRunner` als eigener
   Handler hinzufügen.
3. Darstellung in der Runtime-UI und Bearbeitung im Designer ergänzen.
4. `WorkflowValidator` um die Prüfregeln des neuen Typs erweitern.

## Neuer Dokumenttyp
Neue Vorlage mit Platzhaltern anlegen (`/admin/vorlagen`) und – falls nötig –
den Kontextausschnitt im `ContextBuilder` ergänzen. Kein Codeeingriff in die
Exportkette.

## Neues Dashboard / neue Kennzahl
Kennzahl in der zuständigen Fachdomäne als Aggregationsfunktion bereitstellen
(z. B. `*Statistics.ts`), Hook ergänzen, Kachel in der Adminroute rendern.
Dashboards lesen nur.

## Neuer KI-Provider
Provider gemäß `providers/types.ts` implementieren und in der jeweiligen
Factory registrieren (`EmbeddingProviderFactory`, AI-Provider-Registry).
Fallback-Reihenfolge bleibt konfigurativ.

## Neue Chunk-Strategie
`ChunkStrategy` implementieren und in `chunks/extensions.ts` registrieren.
