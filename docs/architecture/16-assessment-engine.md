# 16 – Assessment Engine (Sprint 4.6C)

## Zweck

Die Assessment Engine bewertet einen erfassten Sachverhalt (`SituationCase`)
deterministisch, regelbasiert und nachvollziehbar. Sie erzeugt eine Ampelstufe,
einen internen Schweregrad, eine Aussagekraft der Datengrundlage, Gründe,
fehlende Angaben, Konflikte und Grenzen.

Nicht enthalten: KI, Freitextinterpretation, Rechtsauslegung, Normauswahl,
Sofortmaßnahmen, Dokumentgenerierung.

## Modulstruktur (`src/services/assessment-engine/`)

| Datei | Verantwortung |
| --- | --- |
| `types.ts` | Ergebnis-, Regel-, Bedingungs- und Kontextmodell, Anzeigetexte |
| `fieldLabels.ts` | Technische Feldpfade → verständliche Bezeichnungen |
| `AssessmentRuleRegistry.ts` | Registrierung, deterministische Sortierung, Strukturprüfung |
| `AssessmentRuleEvaluator.ts` | Feldzugriff (Punktnotation) und 16 typisierte Operatoren |
| `standardAssessmentRules.ts` | Generisches Standardregelset (12 Regeln) |
| `AssessmentResultAggregator.ts` | Ampel- und Schweregradaggregation |
| `AssessmentConfidenceCalculator.ts` | Score, Stufe, Vollständigkeit, Regelabdeckung |
| `AssessmentConflictResolver.ts` | Erkennung widersprüchlicher Angaben/Ergebnisse |
| `AssessmentValidator.ts` | Prüfung von SituationCase und Regeldefinitionen |
| `AssessmentEventBus.ts` | Lokale Events (keine Analytics) |
| `inputHash.ts` | djb2-Hash über eine stabil sortierte Projektion |
| `AssessmentEngine.ts` | Orchestrierung, Service-API, Kontexteintrag |
| `SituationOverview.ts` | Datengrundlage für die Phase „Analyse“ |

Es gibt keine `eval`- oder `Function`-Auswertung; Regeln sind reine Daten.

## Aggregation

1. mindestens ein roter Treffer → `red`
2. sonst mindestens ein gelber Treffer → `yellow`
3. sonst nur grüne Treffer **und** ausreichende Datengrundlage → `green`
4. sonst (fehlende Grundlage, kein Treffer, blockierender Konflikt) → `unknown`

Regeln mit reinem Konfidenzeffekt (Dokumentation, Nachweise) verändern die
Ampel nicht. Kritische Regeln überstimmen positive Regeln.

## Statusmodell

`notStarted`, `inProgress`, `completed`, `incomplete`, `conflicted`, `failed`.
`completed` bedeutet ausschließlich: die vorhandenen Daten konnten mit den
registrierten Regeln ausgewertet werden – keine rechtlich verbindliche
Entscheidung.

## Stale-Erkennung

`AssessmentResult.evaluatedInputHash` wird gegen den aktuellen `inputHash` des
`SituationCase` verglichen. Bei Abweichung wird das Ergebnis als veraltet
markiert und **nicht** automatisch neu berechnet; die Nutzerin oder der Nutzer
löst die Neuberechnung bewusst aus.

## Navigator-Integration

- Kontextbereich: `context.assessment` (`AssessmentContextEntry`), gespeichert
  über den bestehenden `NavigatorSessionStore`. Keine zweite Persistenz.
- Phase „Analyse“: `AnalysisStepPanel` zeigt die strukturierte Datengrundlage,
  Vollständigkeit, Zählwerte, unbekannte und fehlende Angaben. Keine Ampel.
- Phase „Bewertung“: `AssessmentStepPanel` führt die Engine aus und stellt das
  Ergebnis dar. Zuordnung erfolgt zentral im `NavigatorStepRenderer`.
- Hook: `src/hooks/navigator/useAssessment.ts` – spiegelt ausschließlich
  Engine-Ergebnisse, berechnet selbst nichts.

## UI-Komponenten (`src/components/navigator/assessment/`)

`AssessmentOverview`, `AssessmentTrafficLight`, `AssessmentSummary`,
`AssessmentReasonList`, `AssessmentReasonCard`, `AssessmentConfidencePanel`,
`AssessmentMissingInformationList`, `AssessmentConflictList`,
`AssessmentLimitations`, `AssessmentStatusBadge`, `AssessmentStaleNotice`,
`AssessmentReview`, `AnalysisStepPanel`, `AssessmentStepPanel`.

Barrierearmut: Ampel immer mit Symbol, Textbezeichnung und Bedeutung;
`role="status"` mit `aria-live`; Fokus springt nach der Bewertung auf die
Ergebnisüberschrift; Konfidenz zusätzlich numerisch und als `aria-label`.

## Sprachregelung

Die Konfidenz heißt in der Oberfläche „Aussagekraft der Erfassung“ bzw.
„Bewertungsgrundlage“ – nie „Rechtssicherheit“. Formulierungen wie „rechtlich
sicher“, „unbedenklich“ oder „abschließend geprüft“ werden vermieden.

## Tests

`src/services/assessment-engine/__tests__/assessmentEngine.test.ts`
(Validierung, Regelwerk, Ampellogik, Determinismus, Konfidenz, Konflikte,
Serialisierung, Stale, Events, Analyseübersicht, Session-Persistenz).

Vollständiger Testlauf: `bun test` – 325 Tests grün.
