# 17 – Action Engine & priorisierte Handlungsschritte (Sprint 4.6D)

Die Action Engine übersetzt ein `AssessmentResult` zusammen mit dem zugrunde liegenden
`SituationCase` deterministisch und regelbasiert in nachvollziehbare, priorisierte
Handlungsschritte.

## Zweck und Abgrenzung

Die Engine
- erzeugt Handlungsschritte ausschließlich aus registrierten Regeln,
- gruppiert sie nach Dringlichkeit (Jetzt, Heute, Später, Optional),
- schlägt mögliche schulische Zuständigkeiten als Rolle vor,
- erkennt Abhängigkeiten, Blockierungen und Widersprüche,
- verwaltet den Bearbeitungsstand einzelner Maßnahmen,
- erkennt veraltete Pläne und berechnet Maßnahmen-Deltas bei Neugenerierung.

Die Engine
- nutzt **keine** KI und keine Freitextinterpretation,
- nimmt **keine** rechtliche Auslegung und keine Rechtsfolgenbewertung vor,
- erzeugt **keine** Dokumente,
- weist **keine** konkreten Personen zu, sondern nur Rollen,
- löst Widersprüche **nicht** automatisch auf, sondern macht sie sichtbar.

## Modulübersicht (`src/services/action-engine/`)

| Datei | Aufgabe |
| --- | --- |
| `types.ts` | Basistypen: `ActionItem`, `ActionPlan`, `ActionInput`, `ActionRule`, Gruppen, Prioritäten, Rollen, Statuswerte, `ACTION_CONTEXT_KEY`, `ACTION_SCHEMA_VERSION` |
| `ActionRuleEvaluator.ts` | Auswertung der Regelbedingungen über Feldpfade in Punktnotation (kein `eval`) |
| `ActionRuleRegistry.ts` | Registrierung, Sortierung und Auflösung der Regeln |
| `standardActionRules.ts` | 12 fachneutrale Standardregeln |
| `ActionResultAggregator.ts` | Zusammenführung der Regeltreffer zu einem Plan (Deduplizierung, Gruppierung, Priorisierung) |
| `ActionDependencyResolver.ts` | Auflösung von Abhängigkeiten, Setzen von `blocked` inkl. verständlicher Begründung |
| `ActionConflictDetector.ts` | Erkennung widersprüchlicher Zuständigkeiten und Maßnahmen |
| `ActionProgressCalculator.ts` | Bearbeitungsstand, Pflichtanteil, Prozentwert, Planstatus |
| `ActionValidator.ts` | Eingabeprüfung (Situation, Bewertung, Hashes) mit verständlichen Meldungen |
| `ActionEventBus.ts` | Beobachtbare Zustandsänderungen ohne UI-Kopplung |
| `ActionEngine.ts` | Orchestrierung: Generierung, Neugenerierung mit Delta, Statuswechsel, Serialisierung |

## Datenmodell (Kern)

- `ActionItem`: `actionKey`, `title`, `description`, `group`, `priority`,
  `estimatedEffort`, `required`, `responsibleRole`, `alternativeResponsibleRoles`,
  `status`, `blockedReason`, `reason[]` (Regel-ID plus verständlicher Text),
  `sourceFields[]`, `completionData`, `carryOverReviewRequired`.
- `ActionPlan`: `planId`, `navigatorId`, `workflowId`, `caseId`, `status`,
  `actions[]`, `conflicts[]`, `progress`, `generatedAt`, `assessmentId`,
  `assessmentHash`, `schemaVersion`.
- `ActionInput`: `situation`, `assessment`, `actionContext`, `assessmentIsStale`.

Zeitgruppen: `now` (Jetzt), `today` (Heute), `later` (Später), `optional` (Optional).
Statuswerte einer Maßnahme: `open`, `inProgress`, `completed`, `skipped`, `blocked`,
`notApplicable`, `cancelled`.

## Standardregeln

`STANDARD_ACTION_RULES` enthält 12 Regeln, jeweils mit Bedingungen, erzeugten
Maßnahmen und begründendem Text:

`action.acute_danger`, `action.situation_ongoing`, `action.assessment_yellow`,
`action.assessment_unknown`, `action.witnesses_present`, `action.evidence_present`,
`action.measures_taken`, `action.documentation_missing`, `action.assessment_green`,
`action.follow_up`, `action.emergency_services_involved`, `action.repeated_incident`.

Regeln sind austauschbar und erweiterbar: neue Regeln werden ausschließlich über die
Registry ergänzt; Engine, UI und Persistenz bleiben unverändert.

## Navigator-Integration

- Phase 5 „Sofortmaßnahmen“ wird in `NavigatorStepRenderer` auf `ActionStepPanel`
  abgebildet (`src/components/navigator/actions/`).
- `src/hooks/navigator/useActionPlan.ts` spiegelt ausschließlich Engine-Ergebnisse;
  React-Komponenten mutieren den Plan nicht.
- Der Plan wird über `patchContext` unter `context.actions` (`ACTION_CONTEXT_KEY`)
  gespeichert; die Persistenz erfolgt über den bestehenden `NavigatorSessionStore`.
- `ActionCard` zeigt Status, Rolle, Priorität, Aufwand, Pflichtcharakter, Begründung
  („Warum wird dieser Schritt angezeigt?“) sowie Aktionen Erledigt, Überspringen,
  Trifft nicht zu, Wieder öffnen. Status wird nie allein über Farbe vermittelt.

## Stale-Erkennung und Delta

Der Plan speichert `assessmentId` und `assessmentHash` (djb2 über die Situationsangaben).
Ändert sich Situation oder Bewertung, gilt der Plan als veraltet; er bleibt sichtbar
und wird mit einem Hinweis versehen. Bei Neugenerierung berechnet die Engine ein
`ActionPlanDelta` (neu, entfallen, inhaltlich geändert). Bearbeitungsstände werden
übernommen; inhaltlich geänderte Maßnahmen werden mit `carryOverReviewRequired`
zur erneuten Prüfung markiert. Es werden keine Daten stillschweigend verworfen.

## Demo-Situation

`src/services/situation-analyzer/demoSituation.ts` erzeugt über den
`SituationAnalyzerService` einen vollständigen, validen und jederzeit editierbaren
Beispielfall (neutrale Demoangaben, keine realen Personen). Damit ist die Demo ohne
Pflichtfeld-Nacharbeit bis Analyse, Bewertung und Sofortmaßnahmen durchklickbar.
Im Entwicklungsmodus wirft eine Prüfschranke `DemoSituationError`, falls die
Demoangaben unvollständig oder ungültig würden.

## Tests

- `src/services/action-engine/__tests__/actionEngine.test.ts` (13 Tests):
  Regelauswertung, Gruppierung, Abhängigkeiten, Konflikte, Statuswechsel,
  Fortschritt, Stale-Erkennung, Delta, Serialisierung.
- `src/services/situation-analyzer/__tests__/demoSituation.test.ts` (9 Tests):
  Erzeugung über Services, Validität und Vollständigkeit, strukturierte Angaben,
  Serialisierung, Navigator-Integration, Kette Situation → Assessment → Actions.
- Gesamtstand: 346 Tests grün, Typecheck ohne Fehler.

## Manuelle Browser-Abnahme

Durchgeführt (Chromium, 1280 px): Demo starten → Situation vollständig vorbefüllt
(Erfassung abgeschlossen, offene Angaben ausgewiesen) → „Weiter“ freigegeben →
Analyse → Bewertung ausführen → Sofortmaßnahmen → „Handlungsschritte erzeugen“ →
6 Maßnahmen in Zeitgruppen mit Begründungen und Widerspruchshinweis → Maßnahme als
erledigt markiert → Seite neu laden → „Demo fortsetzen“ stellt Plan und
Bearbeitungsstand wieder her → Situation geändert und erneut abgeschlossen →
Maßnahmenphase zeigt Veraltet-Hinweis. Keine Konsolenfehler.
