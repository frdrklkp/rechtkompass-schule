# 14 – Situation Analyzer (Sprint 4.6B)

Additive Ergänzung zur Architecture Freeze v1.0. Bestehende Architekturdokumente bleiben unverändert.

## Zweck

Der Situation Analyzer erfasst einen geschilderten schulischen Sachverhalt strukturiert und
überführt ihn in ein einheitliches, vollständig serialisierbares Fallmodell (`SituationCase`).
Er füllt die Phase „Situation“ des Decision Navigators fachlich aus.

## Abgrenzung zur späteren Assessment Engine

Der Analyzer **bewertet nicht**. Er erzeugt keine Ampel, keine Gefahrenbewertung, keine
rechtliche Einordnung, keine Handlungsempfehlung und keine Dokumente. Er nutzt keine KI.
Alle Angaben stammen ausschließlich vom Nutzer (`source: user`) oder aus Schema-Vorgaben
(`source: systemDefault`). Die Bewertung erfolgt in einem späteren Sprint durch eine getrennte
Assessment Engine, die den `SituationCase` als Eingabe liest.

## Modulstruktur

```
src/services/situation-analyzer/
  types.ts                             Fall-, Frage-, Antwort-, Event- und Validierungstypen
  standardSituationSchema.ts           generisches Standardschema (12 Abschnitte)
  SituationSchemaRegistry.ts           Registrierung und Auflösung von Schemata
  SituationQuestionResolver.ts         Sichtbarkeit und Pflichtstatus (deterministisch)
  SituationValidator.ts                fachlich neutrale Validierung
  SituationCompletenessCalculator.ts   Erfassungsvollständigkeit und Unsicherheiten
  SituationCaseMapper.ts               Erzeugung, Projektion, Serialisierung
  SituationAnalyzerEventBus.ts         lokaler Event-Bus
  SituationAnalyzerService.ts          einziger Mutationspunkt
  index.ts                             Barrel-Export
```

UI: `src/components/navigator/situation/*`, Anbindung über
`src/hooks/navigator/useSituationAnalyzer.ts`.

## SituationCase Model

`schemaVersion`, `schemaId`, `caseId`, `navigatorId`, `workflowId`, `title`, `rawDescription`,
`category`, `incident`, `participants`, `witnesses`, `evidence`, `dangerInformation`,
`measuresTaken`, `documentationStatus`, `responsiblePersonsInformed`, `answers`,
`uncertainties`, `completeness`, `createdAt`, `updatedAt`, `status`.

Unbekannte Angaben werden nicht als leerer String abgebildet, sondern über den
`KnowledgeState` (`known | unknown | notApplicable | notAnswered`).

Teilmodelle: `SituationIncident`, `SituationParticipant` (offene Rollenunion),
`SituationWitness` (optionaler Verweis auf einen Beteiligten), `SituationEvidence`
(nur Metadaten, keine Uploads), `SituationMeasure`, `SituationDangerInformation`
(reine Tatsachenangaben), `SituationDocumentationStatus`.

## Question Model

Deklarative Fragen mit `id`, `section`, `title`, `description`, `type`, `required`, `visible`,
`order`, `options`, `defaultValue`, `validation`, `dependsOn`, `requiredWhen`, `metadata`.

Fragetypen: `text`, `textarea`, `boolean`, `singleChoice`, `multiChoice`, `date`, `time`,
`dateTime`, `participant`, `participants`, `location`, `evidence`, `measures`, `information`.
Die Typunion ist offen erweiterbar.

## Antwortstatus

`answerStatus`: `answered | unknown | notApplicable | notAnswered`.
`source`: `user | systemDefault | imported | derived` – regulär genutzt werden `user` und
`systemDefault`.

## Bedingungsauflösung

`SituationQuestionResolver` wertet typisierte Operatoren aus: `equals`, `notEquals`,
`includes`, `exists`, `isTrue`, `isFalse`. Kein `eval`, keine frei ausführbaren Ausdrücke.
Eine Bedingung gilt nur als erfüllt, wenn die referenzierte Frage ausdrücklich beantwortet ist.
`dependsOn` steuert die Sichtbarkeit, `requiredWhen` den bedingten Pflichtstatus. Nicht
sichtbare Fragen sind niemals verpflichtend.

## Validierung

`SituationValidator` prüft Pflichtfragen, bedingte Pflichtfragen, Datums- und Zeitformate,
Antworttyp gegen Fragetyp, Längen- und Auswahlregeln, eindeutige Beteiligten-IDs sowie gültige
Zeugen-Verweise. Es erfolgt keine fachliche oder rechtliche Beurteilung.

## Vollständigkeitsberechnung

`SituationCompletenessCalculator` betrachtet ausschließlich sichtbare, relevante Fragen
(ohne reine Hinweistexte) und liefert `totalRelevantQuestions`, `answeredQuestions`,
`unknownQuestions`, `notApplicableQuestions`, `missingRequiredQuestions`,
`completionPercentage`, `isComplete`. Ausdrücklich als `unknown` markierte Angaben gelten als
bearbeitet, werden aber separat ausgewiesen. Keine Risiko- oder Qualitätsbewertung.

## Events

`SituationAnalysisStarted`, `SituationDescriptionUpdated`, `SituationAnswerChanged`,
`SituationParticipantAdded/Removed`, `SituationWitnessAdded/Removed`,
`SituationEvidenceAdded/Removed`, `SituationMeasureAdded/Removed`,
`SituationValidationFailed`, `SituationCompleted`, `SituationReset`.
Verarbeitung ausschließlich lokal, keine Analytics, keine Persistenz.

## Navigator-Integration

Erreicht der Navigator den Schritt `situation`, rendert `DecisionNavigator` das
`SituationStepPanel`. Gespeichert wird ausschließlich über `engine.patchContext()` im
Kontextbereich `context.situation`. Die `DecisionNavigatorEngine`, der `standardFlow` und das
State Model bleiben unverändert. Der Analyzer navigiert nicht selbst; „Weiter“ wird erst
freigegeben, wenn die gespeicherte Situation den Status `complete` trägt – also alle sichtbaren
Pflichtangaben beantwortet oder ausdrücklich als unbekannt bzw. nicht zutreffend markiert
wurden und die Validierung fehlerfrei ist.

## Session-Wiederherstellung

Persistenz erfolgt allein über den bestehenden `NavigatorSessionStore` (LocalStorage im
Browser). Beim Wiedereinstieg wird `context.situation` über `SituationCaseMapper.fromUnknown()`
geprüft. Ungültige oder inkompatible Daten führen zu einem `SituationDataError` mit
verständlicher Meldung; die Daten werden nicht still gelöscht, stattdessen bietet die UI einen
kontrollierten Neustart der Situationserfassung an.

## Erweiterungspunkte

- Weitere Schemata über `SituationSchemaRegistry.register()`.
- Weitere Fragetypen über die offene `SituationQuestionType`-Union plus Renderer.
- Weitere Bedingungsoperatoren im `SituationQuestionResolver`.
- Übergabe des `SituationCase` an eine spätere Assessment Engine, ohne den Analyzer zu ändern.
