# 11 – Testing Strategy

Testrunner: Vitest (`bunx vitest run`). Tests liegen als `__tests__/`
unmittelbar bei der jeweiligen Fachdomäne.

## Unit Tests
Reine Funktionen und einzelne Bausteine: Hashing, Normalisierung,
Validierungsregeln, Ranking, Fortschrittsberechnung, Platzhalterauflösung,
Entscheidungsbaum-Validierung. Kein Netzwerk, keine Datenbank, kein DOM.

## Integration Tests
Zusammenspiel mehrerer Bausteine innerhalb einer Domäne, z. B. die
Importkette Parser → Normalizer → Validator → Delta → Versionierung gegen
Mock-Repositories, oder Retrieval über Mock-Embedding-Provider.

## Parser Tests
Je Parser feste Eingabetexte mit erwarteter Struktur
(`bassImporter.test.ts`, `apoBkAndVvImporters.test.ts`). Geprüft werden
Hierarchie, Identifier, Anlagen und Verweise. Parser müssen deterministisch
sein: gleiche Eingabe → identische Ausgabe inklusive Hashes.

## Import Tests
`legalImportFramework.test.ts`, `importExperience.test.ts`,
`officialSourceConnector.test.ts`: Delta-Erkennung (neu/geändert/entfernt/
unverändert), Versionsfortschreibung, Whitelist-Durchsetzung, Retry-Verhalten,
Vorschaumodell, Delta Explorer, Versionsvergleich, Importbericht,
Dashboard-Kennzahlen, Fehlerdarstellung und Fortschrittsphasen.

## Workflow Tests
`legal-workflows/__tests__/`: Zustandsübergänge, Bedingungsauswertung,
Navigation vor/zurück, Fortschritt sowie Validierung auf Zyklen, Sackgassen
und unerreichbare Knoten.

## UI Tests
Komponentennahe Prüfungen der Darstellungslogik sowie manuelle bzw.
Playwright-gestützte Durchläufe der Kernpfade (Fallansicht, Assistent,
Import-Assistent, Dokumentenerzeugung). Der Adminbereich erfordert eine
angemeldete Sitzung.

## Regression Tests
Jeder Sprint erweitert die Suite; bestehende Tests müssen grün bleiben.
Zusätzlich sichert `scripts/schema-check.mjs` den Datenbankstand gegen
`db/schema.lock.json` ab.

## Qualitätsanspruch
- Kein Merge mit rotem Typecheck oder roten Tests.
- Jede neue Fachlogik bringt Tests mit; Fehlerkorrekturen bringen einen
  Regressionstest mit.
- Deterministische Tests: keine Zufallswerte, keine Echtzeitabhängigkeit,
  keine externen Netzwerkaufrufe.
- Externe Systeme werden über Ports gemockt, nicht über Monkey-Patching.
- Stand bei Freeze v1.0: 114 Tests grün, Typecheck sauber.
