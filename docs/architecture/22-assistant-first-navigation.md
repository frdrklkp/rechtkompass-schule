# 22 – Assistant-first Navigation (Sprint 4.6J.2)

Stand: 2026-08-14

## Produktmodell

Das Teacher-Frontend unterscheidet zwei Absichten statt drei Werkzeuge:

| Absicht | Einstieg | Route | Teacher-Label |
| --- | --- | --- | --- |
| **Nachschlagen** ("Was gilt?") | Intelligente Suche (Hero der Startseite) | `/` → `/faelle/$id` | Suche / Praxisfälle |
| **Fall klären** ("Was tue ich jetzt?") | Karte "Einen Fall klären" | `/assistent` → `/navigator` | "Fall schildern" → "Fall bearbeiten" |

Der Entscheidungsassistent (`/assistent`) ist der **primäre Einstieg** für die
Fallbearbeitung; der Decision Navigator (`/navigator`) ist der
**Bearbeitungsmodus** eines begonnenen Falls. Die Suche bleibt bewusst das
Hero-Element der Startseite – sie deckt den häufigsten Anwendungsfall
(schnelles Nachschlagen) ab und konkurriert nicht mit der Fallbearbeitung.
Auf der Startseite existiert nur EIN Freitextfeld (die Suche); der
Fall-Einstieg ist ein CTA-Button ohne eigenes Eingabefeld.

## Rollen der Module (unverändert)

- **Decision Assistant** (`src/services/assistant`, `src/components/assistant/`):
  freie Fallschilderung → deterministische Strukturierung (Situation Analyzer)
  → Rückfragen → Praxisfall-Matching → Übergabe.
- **Decision Navigator** (`src/services/decision-navigator`,
  `src/components/navigator/`): Phasenablauf gemäß `buildStandardFlow()`
  (Start, Situation, Analyse, Bewertung, Sofortmaßnahmen, Dokumentation,
  Rechtsgrundlagen, Vorlagen, Abschluss), Session-Persistenz, Wiederaufnahme.

An den fachlichen Engines (AssistantOrchestrator, Matching, Situation
Analyzer, Assessment/Action Engine, Legal Context, Documentation Assistant,
Navigator Engine/Session Store, Handoff-Contract) wurde in diesem Sprint
nichts geändert. Ebenso unangetastet: Such-/Ranking-Logik
(`intelligentSearch.ts`, `hybridSearch.ts`, `hybridRanking.ts`) und der
kuratierte Entscheidungsbaum-Datenbestand.

## Handoff (Assistent → Fall bearbeiten)

`AssistantHandoff` verlinkt auf `/navigator?fortsetzen=true`. Die
Navigator-Route setzt bei diesem Parameter die gespeicherte Work-Session
automatisch fort (einmalig, nur wenn eine fortsetzbare Session existiert;
sonst Startansicht). Damit landet der Nutzer nach "Fall bearbeiten" ohne
Zwischenklick direkt in der Phase "Analyse" – Start und Situation gelten als
erledigt, keine Doppeleingabe. Direktaufrufe von `/navigator` ohne Parameter
zeigen weiterhin die Startansicht mit expliziter Auswahl (Deep-Link-sicher,
keine Redirect-Schleifen).

## Direct Structured Entry & Session Resume

- Sekundärer Einstieg auf der Startseite: "Fall direkt strukturiert erfassen"
  → `/navigator` (Startansicht, "Neuen Fall strukturiert erfassen").
- Bestehende Session: Startansicht bietet "Fall fortsetzen" (kein erneuter
  Assistant-Flow nötig).
- Leerer Navigator: Startansicht mit strukturierter Neuerfassung, Demo und
  Querverweis "Lieber frei schildern?" → `/assistent`.
- Der Stand-alone-Navigator bleibt vollständig erhalten (manuelle Erfassung,
  Wiederaufnahme, Admin-/QA-Nutzung, Demo).

## Terminologie

Teacher-facing (Frontend für Lehrkräfte):

| Intern/vorher | Teacher-facing |
| --- | --- |
| Decision Assistant / Entscheidungsassistent (`/assistent`) | "Fall schildern" |
| Decision Navigator / Entscheidungsnavigator (`/navigator`) | "Fall bearbeiten" |
| Kuratierter Entscheidungsbaum auf der Falldetailseite | "Kurz-Check" ("Kurz-Check starten" / "Kurz-Check zu diesem Fall") |
| "Zum Navigator" / "In den Navigator übernehmen" | "Fall bearbeiten" |
| "Im Navigator ansehen" | "In der Fallbearbeitung ansehen" |
| "Navigator verlassen" | "Bearbeitung verlassen" |
| Phase "Übergabe an den Navigator" | "Fall bearbeiten" |
| Status "an den Navigator übergeben" | "zur Fallbearbeitung übergeben" |

Die Umbenennung des Falldetail-Baums in "Kurz-Check" löst die vorherige
Doppelbelegung des Begriffs "Entscheidungsassistent" (Baum vs. `/assistent`).

Admin-/technische Terminologie: unverändert. Modulnamen, Service-Bezeichner,
Admin-Routen (`admin.entscheidungsbaeume`, `admin.entscheidungsassistenten-batch`
usw.) und Code-Kommentare verwenden weiterhin Decision Assistant/Navigator.

## Tests

- `src/components/navigator/__tests__/navigatorLanding.test.tsx` (neu):
  Leerzustand, Assistenten-Querverweis, "Fall fortsetzen", Demo.
- `src/components/assistant/__tests__/assistantUi.test.tsx`: Assertions auf
  neues Wording aktualisiert (Handoff-Ziel `/navigator`, "Fall bearbeiten").
- `scripts/test-all.mjs` sammelt jetzt auch `.test.tsx`-Dateien ein – die
  UI-Tests wurden zuvor still übersprungen (Fund dieses Sprints).
