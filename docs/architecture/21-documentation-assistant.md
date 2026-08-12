# 21 – Dokumentationsassistent (Sprint 4.6H)

Stand: Sprint 4.6H, abgeschlossen. Gilt zusammen mit Dokument 05
(Document Generation), 14 (Situation Analyzer), 16 (Assessment Engine),
17 (Action Engine) und 20 (Legal Context Integration).

## 1. Ziel und Grundprinzip

Nach Bearbeitung eines Falls kann eine Lehrkraft passende Dokumentationen
vorbereiten (Gesprächsnotiz, Aktenvermerk, Vorfallsdokumentation u. a.).

Grundprinzip: **Dokumente entstehen ausschließlich aus bereits vorhandenen
strukturierten Falldaten.** Es werden keine Tatsachen, Namen, Zeiten oder
Rechtsnormen erzeugt oder ergänzt. Kein Sprachmodell formuliert Rechtstexte.
Fehlende Angaben werden deterministisch als `⟨fehlend⟩` markiert.

Pipeline:

```text
Assistent → SituationCase → AssessmentResult → ActionPlan → LegalContext
        → DocumentationContext → DocumentTemplate → Generierung
        → Vorschau → Bestätigung → Export (MD/DOCX/PDF)
```

## 2. Bausteine

Alle Fachlogik liegt in `src/services/documentation-assistant/`.

| Baustein | Aufgabe |
| --- | --- |
| `types.ts` | Typen, Kontext-Schlüssel (`documentation`), Schema-Version, Textbausteine, Limitationen |
| `DocumentationContextBuilder.ts` | Bildet Situation, Bewertung, Maßnahmen, Rechtskontext und Praxisfall auf einen flachen Platzhalterkontext ab. Deterministische Label-Maps, keine KI |
| `DocumentationTemplateResolver.ts` | Deterministische Vorlagenauflösung in drei Stufen (Praxisfall → Kategorie → allgemein), injizierbarer Fetcher |
| `DocumentationReadinessChecker.ts` | Prüft je Vorlage, ob alle Platzhalter befüllbar sind (`ready`/`incomplete`/`blocked`) |
| `DocumentationStaleChecker.ts` | djb2-Hash über alle fachlichen Eingaben; erkennt veraltete Stände und Entwürfe |
| `DocumentationAssistantService.ts` | Orchestrierung: `prepare`, `generateDraft`, `updateDraft`, `removeDraft`, `restore`, `markExported` |
| `DocumentationEventBus.ts` | Nachvollziehbarkeit (Prepared, DraftGenerated, DraftUpdated, DraftRemoved, Exported, StaleDetected) |

Wiederverwendet werden ohne Änderung: `PlaceholderResolver`,
`GeneratedDocument` und die Export-Registry (`MarkdownExportAdapter`,
`DocxExportAdapter`, `PdfExportAdapter`) aus
`src/services/document-generation/`.

## 3. Vorlagenauflösung

1. **Praxisfall** – Vorlagen aus `case_templates` des bestätigten Falls.
2. **Kategorie** – `document_type` entspricht der Fallkategorie.
3. **Allgemein** – ohne Typ bzw. `generic`/`allgemein`/`general`/`universal`.

Vorlagen anderer Kategorien werden nicht angeboten. Vorlagen ohne Inhalt
werden mit Begründung als `skipped` ausgewiesen. Sortierung: Stufe, dann
Titel (de-DE) – stabil und reproduzierbar.

## 4. Readiness und fehlende Angaben

Der Readiness-Checker liest die Platzhalter der Vorlage (einfache Variablen,
`{{#each}}`-Blöcke, `{{ai:*}}`-Slots) und vergleicht sie mit dem Kontext:

- `ready` – alle Angaben liegen vor
- `incomplete` – Angaben fehlen; Erstellung bleibt möglich, Lücken werden im
  Dokument als `⟨fehlend⟩` markiert
- `blocked` – kein erfasster Sachverhalt; keine Erstellung
- `unknown` – keine Vorlagen bzw. noch nicht vorbereitet

`{{ai:*}}`-Slots gelten grundsätzlich als manuell auszufüllende Lücke
(`reason: "ai_disabled"`) – es wird nie automatisch formuliert.

## 5. Entwürfe, Bearbeitung, Veraltung

- Entwürfe (`DocumentationDraft`) tragen Vorlage, Markdown, Status
  (`generated`/`edited`), fehlende Platzhalter und den Eingabe-Hash.
- Manuelle Änderungen am Entwurf werden **nicht** in den `SituationCase`
  zurückgeschrieben.
- Neugenerierung erzeugt einen neuen Entwurf; frühere Entwürfe bleiben erhalten.
- Ändert sich Situation, Bewertung, Maßnahmenplan, Rechtskontext, Praxisfall
  oder eine Vorlage, ändert sich der Hash; Stand und betroffene Entwürfe werden
  als veraltet gekennzeichnet (kein automatisches Überschreiben).

## 6. Persistenz

Der gesamte Stand liegt als `DocumentationContextEntry` im Navigator-Kontext
unter `context.documentation` (JSON-serialisierbar, reload-fest). `restore`
prüft Schema-Version und Struktur und meldet ungültige Stände transparent,
statt stillschweigend zurückzufallen.

## 7. UI-Integration

- `src/hooks/documentation/useDocumentation.ts` – React-Anbindung; spiegelt
  ausschließlich Service-Ergebnisse, überwacht Veraltung, kapselt Export.
- `src/components/navigator/documentation/` – `DocumentationStepPanel`
  (Container inkl. blockiertem Zustand), `DocumentationView` (Vorlagen,
  Readiness, fehlende Angaben, Entwürfe, Export), `documentationPresentation.ts`
  (Beschriftungen, keine Fachlogik).
- `src/components/navigator/NavigatorStepRenderer.tsx` – Phase
  `dokumentation` produktiv.
- Assistent (`useDecisionAssistant`, `AssistantConfirmation`) zeigt die Anzahl
  verfügbarer Vorlagen und den Button „Dokumentation vorbereiten“.

## 8. Grenzen (im UI ausgewiesen)

- Dokumente werden ausschließlich aus den erfassten Angaben erzeugt.
- Fehlende Angaben werden als `⟨fehlend⟩` markiert und nicht ergänzt.
- Änderungen am Entwurf verändern die erfassten Falldaten nicht.
- Jedes Dokument ist vor Verwendung fachlich zu prüfen.

## 9. Tests

`src/services/documentation-assistant/__tests__/documentationAssistant.test.ts`
– 47 Tests: Kontextaufbau (Situation, Bewertung, Maßnahmen, Rechtskontext,
Praxisfall, fehlende Daten), Vorlagenauflösung inkl. Fallbacks und Leerstand,
Readiness inkl. KI-Slots, Erzeugung über den bestehenden `PlaceholderResolver`,
`⟨fehlend⟩`-Markierung, Entwurfspflege ohne Rückschreibung, Export über MD,
DOCX und PDF, Veraltung je Eingabequelle, Hash-Reproduzierbarkeit, Persistenz
und Reload sowie Ereignisprotokoll.
