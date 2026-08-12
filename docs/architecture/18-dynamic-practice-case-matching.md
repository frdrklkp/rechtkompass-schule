# 18 – Dynamic Practice Case Matching

Sprint 4.6E. Deterministische Zuordnung veröffentlichter Praxisfälle zu einem
strukturierten Sachverhalt. Keine KI, keine Embeddings, keine fest verdrahteten Fälle.

## Schichten

| Schicht | Ort | Aufgabe |
| --- | --- | --- |
| Quelldaten | `src/lib/practiceCaseMatchingRepo.ts` | `practice_cases`, `case_keywords`, `case_legal_links`, `faq.meta` → `PracticeCaseSource` |
| Profil | `PracticeCaseMatchProfileMapper` | Ableitung aus Falldaten, Überlagerung durch kuratiertes Profil (`faq.meta.matching_profile`) |
| Reifegrad | `MatchReadinessCalculator` | 5 Pflicht- und 5 Kürprüfungen, Score 0–100, `indexable` |
| Validierung | `MatchProfileValidator` | Fehlende Kategorie, Signalkonflikte, Duplikate, Versionsabweichung |
| Index | `PracticeCaseIndexBuilder`, `PracticeCaseIndexOperations` | reproduzierbarer Index, Vorschau, Teilübernahme, Einzelfall-Reindexierung, Verifikation |
| Scoring | `PracticeCaseMatchScorer`, `weights.ts` | Kategorie 30, Schlagwörter 25, Merkmale 15, Rollen 12, Unterkategorie 10, Ort 8 |
| Fassade | `PracticeCaseMatchingEngine` | Index halten, Merkmale extrahieren, Treffer ermitteln, Stale-Erkennung |
| Audit | `PracticeCaseAudit.ts` | Zeilen je Fall, Bestandskennzahlen, `inventoryHash`, Filter |
| Ansicht | `matchingViewModel.ts` | Gegenüberstellung kuratiert / abgeleitet, Indexstatus |
| React | `src/hooks/matching/usePracticeCaseMatching.ts` | `useMatchingDashboard`, `useMatchingIndex`, `useSaveMatchingProfile` |

## Redaktionelle Oberfläche

- **Fall-Editor** (`/admin/faelle/$id`, Schritt 9 „Matching-Profil“):
  `MatchingProfilePanel` pflegt Status, Kategorien, Unterkategorien, Schlagwörter,
  Synonyme, Rollen, Orte, erwartete/verpflichtende/ausschließende Merkmale,
  Priorität, Spezifität, Freigabe und Notiz. Angezeigt werden Reifegrad,
  Indexierbarkeit sowie Profil- und Indexhash.
- **`/admin/praxisfall-matching`**:
  - *Bestandsaudit* – Live-Kennzahlen (Fälle, veröffentlicht, matching-bereit,
    im Index, veraltet, Verknüpfungen), Verteilungen nach Profilstatus und
    Reifegrad, Filter (Status, Reifegrad, Indexzustand, Kategorie,
    Indexierbarkeit, Fehler, Suche), Detailansicht mit Prüfungen und Hashes,
    Einzelfall-Reindexierung, eingebettete Profilpflege.
  - *Indexsteuerung* – Vorschau mit Bestätigungsdialog (neu / geändert /
    unverändert / entfernt, Hash vorher–nachher), vollständige Übernahme,
    „nur veraltete übernehmen“, Zurücksetzen, Verifikation gegen den
    Quellbestand, JSON-Auditbericht.
  - *Matching-Test* – Demo-Situation des Situation Analyzers, editierbare
    Merkmale, Treffer mit Score, Konfidenz, Dimensionen und Match-Gründen,
    getrennte Liste ausgeschlossener Fälle mit Ausschlussgrund.

## Wachstum ohne Codeänderung

Kennzahlen und Index entstehen ausschließlich aus `PracticeCaseSource`. Ein neuer
veröffentlichter Fall mit Titel, Kategorie, Kurzbeschreibung und mindestens drei
Schlagwörtern erscheint nach „Bestand neu laden“ in der Vorschau als `added` und
nach Übernahme im Index. Test: „Neue veröffentlichte Fälle wachsen ohne
Codeänderung in den Index“.

## Persistenz

- Kuratiertes Profil: `practice_cases.faq.meta.matching_profile` (übrige
  Meta-Felder bleiben unverändert).
- Index: LocalStorage (`PRACTICE_CASE_INDEX_STORAGE_KEY`), versioniert über
  `MATCHING_INDEX_VERSION` und `MATCHING_PROFILE_VERSION`.

## Tests

`bun test src/services` – 363 Tests, davon 17 in
`src/services/practice-case-matching/__tests__/matchingAdmin.test.ts`
(Audit, Kennzahlen, Hash-Reproduzierbarkeit, Filter, Vorschau, Teilübernahme,
Einzelfall-Reindexierung, Verifikation, Bericht, Ansichtsmodell).
