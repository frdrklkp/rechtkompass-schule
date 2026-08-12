# 19 – Assistant-to-Matching-to-Navigator Integration (Sprint 4.6F)

Status: abgeschlossen · Architektur v1.0-konform · 395/395 Tests grün

## 1. Ziel und Einordnung

Der Entscheidungsassistent (`/assistent`) ist der primäre Einstieg für Lehrkräfte.
Er führt von einer freien Fallschilderung in vier Schritten zur Übergabe an den
Decision Navigator:

```text
Beschreibung → Struktur → Treffer → Rückfragen → Übergabe
 (freier Text)  (Findings)  (Matching)  (Verfeinerung)  (Navigator ab „analyse")
```

Verbindliche Prinzipien (gelten für die gesamte Kette):

- **Deterministisch, keine KI.** Strukturierung, Abgleich und Rückfragenplanung
  sind regelbasiert und reproduzierbar.
- **Keine erfundenen Tatsachen.** Es werden ausschließlich Angaben übernommen,
  die die Schilderung wörtlich hergibt (jede Angabe trägt eine Belegstelle).
  Nicht ableitbare Aspekte werden gezielt erfragt, niemals ergänzt.
- **Keine Rechtsauslegung.** Der Abgleich ordnet Praxisfälle zu; er bewertet
  nicht rechtlich.
- **Keine zweite Fachlogik.** Situation Analyzer, Practice Case Matching und
  Decision Navigator bleiben die einzigen Engines; der Assistent orchestriert
  sie nur.
- **Nachvollziehbarkeit.** Sitzungszustand, Verlauf und Ereignisse sind
  einsehbar; Abbrechen löscht keine Angaben.

## 2. Bausteine und Datenfluss

| Baustein | Ort | Aufgabe |
| --- | --- | --- |
| `AssistantDescriptionAnalyzer` | `src/services/assistant/descriptionAnalysis.ts` | Lexikonbasierte Extraktion: Kategorie, Ort, Rollen, Flags (Wiederholung, Zeugen, Gefahr, …) mit Belegstellen |
| `AssistantSituationBuilder` | `src/services/assistant/AssistantSituationBuilder.ts` | Überführt Findings in einen `SituationCase` (ausschließlich über `SituationAnalyzerService`) |
| `PracticeCaseMatchingEngine` | `src/services/practice-case-matching/` | Gewichteter, erklärbarer Abgleich (Sprint 4.6E) |
| `AssistantCoverageCalculator` | `src/services/assistant/AssistantCoverage.ts` | Abdeckungsgrad (high/medium/low/none, 0–100) aus Trefferlage + Erfassungsgrad |
| `AssistantQuestionPlanner` | `src/services/assistant/AssistantQuestionPlanner.ts` | Gezielte Rückfragen aus fehlenden Pflichtangaben, offenen Aspekten und Matching-Grenzen |
| `AssistantOrchestrator` | `src/services/assistant/AssistantOrchestrator.ts` | Fassade: Sitzung, Phasen, Status, Veraltung, Übergabekontext |
| `AssistantNavigatorHandoff` | `src/services/assistant/AssistantNavigatorHandoff.ts` | Startet die Navigator-Engine am Zielschritt |
| `useDecisionAssistant` | `src/hooks/assistant/useDecisionAssistant.ts` | React-Anbindung (Fallbestand, Aktionen, Fehlerzustände) |
| UI-Komponenten | `src/components/assistant/` | Reine Darstellung, keine Fachlogik |

```text
Freie Schilderung
  └─ AssistantOrchestrator.structure()
       ├─ DescriptionAnalyzer.analyze()  → Findings + offene Aspekte
       └─ SituationBuilder.build()       → SituationCase (SituationAnalyzerService)
  └─ orchestrator.runMatching()
       ├─ MatchingEngine.match()         → PracticeCaseMatchResult (inputHash/indexHash)
       └─ CoverageCalculator.calculate() → AssistantCoverage
  └─ orchestrator.answerQuestion()/markQuestionUnknown()
       └─ Antworten fließen in denselben SituationCase zurück (Stale-Erkennung)
  └─ orchestrator.buildHandoffContext(source?) + completeHandoff()
       └─ startNavigatorFromAssistant()  → Navigator läuft ab Schritt „analyse"
```

## 3. Sitzungsmodell

`AssistantSession` (`src/services/assistant/types.ts`):

- **Phasen:** `beschreibung → struktur → treffer → rueckfragen → uebergabe`
- **Status:** `idle | running | paused | handedOff | cancelled`
- Persistenz über `AssistantSessionStorePort`
  (`LocalStorageAssistantSessionStore` zur Laufzeit, `InMemory…` in Tests).
  `isCompatibleAssistantSession` schützt vor inkompatiblen Altständen.
- `answeredQuestionIds` verhindert wiederholte Rückfragen – auch nach Reload.
- **Veraltung (`staleReason`):** `index_changed` (Fallbestand geändert) oder
  `situation_changed` (Angaben geändert) erzwingen einen erneuten Abgleich;
  die UI bietet „Abgleich erneuern" an.
- **Ereignisse:** `AssistantEventBus` protokolliert `DescriptionStructured`,
  `MatchingRequested`, `FollowUpAnswered`, `HandoffPrepared`, `AssistantReset`.

## 4. Übergabevertrag (Assistant → Navigator)

`buildHandoffContext(selected?)` erzeugt den Navigator-Kontext:

| Schlüssel | Inhalt |
| --- | --- |
| `situation` | Der vollständige `SituationCase` – unverändert, keine Doppeleingabe |
| `navigatorTitle` | Titel des Sachverhalts (erster Satz der Schilderung) |
| `assistantHandoff` | Sitzungsbezug: sessionId, description, coverage, selectedCaseId, Zeitpunkt |
| `assistantSessionReference` | Kompakte Referenz (startedAt, answeredQuestionIds, coverageLevel) |
| `selectedPracticeCase` | `null` oder: caseId, title, **version** (`updatedAt`), **curated** (`hasDecisionTree`), legalSectionIds, templateIds, matchLevel, matchScore |
| `practiceCaseMatch` | Das vollständige Abgleichergebnis (falls vorhanden) |

`startNavigatorFromAssistant()` startet die `DecisionNavigatorEngine` über die
regulären Schrittwechsel bis `ASSISTANT_HANDOFF_STEP_ID = "analyse"`. Dadurch
gelten „Start" und „Situation" als abgeschlossen und werden nicht erneut
abgefragt. Es entsteht keine zweite Navigatorlogik und keine zweite
Persistenzschicht.

**Varianten:** Mit bestätigtem Praxisfall (kuratiert oder generisch) und ohne
Praxisfall (allgemeiner Ablauf) – beide sind gleichwertig möglich; die UI bietet
„Ohne Praxisfall fortfahren" explizit an.

## 5. Oberfläche (`/assistent`)

- `DecisionAssistant` (Container) orchestriert ausschließlich die Anzeige:
  `AssistantStatus` (Schritt/Fortschritt), `AssistantInput`,
  `AssistantSituationSummary` (Findings mit Belegstelle, offene Aspekte),
  `AssistantMatchSummary` + `AssistantCandidateCard` (bester Treffer,
  Alternativen, Kuratierungs- und Abdeckungskennzeichnung, technische Details
  aufklappbar), `AssistantQuestionCard` (boolean/singleChoice/text +
  „Weiß ich nicht"), `AssistantConfirmation` (Übergabe prüfen),
  `AssistantHandoff` (Abschluss), `AssistantSessionControls`
  (Pausieren/Fortsetzen/Abbrechen/Zurücksetzen mit Bestätigung),
  `AssistantConversation` (Verlauf), `AssistantErrorState` (verständliche
  Fehler mit Handlungsoption).
- Die bisherige Fallsuche bleibt als aufklappbarer Fallback (`<details>`)
  auf derselben Route erhalten.
- Null-Treffer-Lage: verständliche Erklärung, keine erfundenen Inhalte,
  Rückfragen oder allgemeiner Ablauf.

## 6. Verifikation

- **Integrationstests** (`src/services/assistant/__tests__/assistantIntegration.test.ts`,
  15 Tests): Strukturierung mit Belegstellen, Validierung, bester Treffer +
  Sortierung + Schwellen, Null-Treffer-Verhalten, Rückfragen inkl.
  Stale-Erkennung (`situation_changed`, `index_changed`), „Weiß ich nicht",
  JSON-Roundtrip/Wiederherstellung, Pausieren/Fortsetzen/Abbrechen/Zurücksetzen,
  Übergabekontext mit und ohne Fall (Version, Kuratierung, Verknüpfungen,
  Match-Angaben), Navigator-Start am Analyseschritt, Ereignisprotokoll.
- **UI-Smoke-Tests** (`src/components/assistant/__tests__/assistantUi.test.tsx`,
  17 Tests, SSR-Rendering): alle Zustände inkl. Null-Treffer, Veraltung,
  Übergabe, Abschluss, Ladezustand sowie Head-Metadaten der Route.
- **Gesamtlauf:** 395/395 Tests grün, `tsgo --noEmit` fehlerfrei.

## 7. Bekannte Grenze (PRE-FLIGHT 2)

Der authentifizierte Speicherpfad des Matching-Profils
(`saveCuratedMatchingProfile` in `src/lib/practiceCaseMatchingRepo.ts`,
Admin-Oberfläche `/admin/praxisfall-matching`) schreibt über den Browser-
Supabase-Client mit dem JWT der angemeldeten Person; RLS erzwingt die Rolle
`editor`+ (`practice_cases_role_update_editor`, Migration
`2026-07-24_sprint_1_2_role_based_rls.sql`). Es gibt bewusst **keine**
Umgehung über den Admin-Client.

Eine manuelle Verifikation mit angemeldeter Editor-Session war in dieser
Umgebung nicht möglich (`LOVABLE_BROWSER_AUTH_STATUS=no_supabase`, keine
Test-Zugangsdaten). Der Pfad ist durch die RLS-Migration und die
Service-Tests abgedeckt, gilt aber als **nicht manuell verifiziert**.
Nachholbedarf: einmaliges Speichern eines Matching-Profils als Editor im
laufenden System (Erwartung: Update erfolgreich; als `teacher`: RLS-Fehler).
