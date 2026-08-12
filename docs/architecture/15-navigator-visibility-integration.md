# 15 – Navigator Visibility & Integration (Sprint 4.6B.1)

Rein additive Integrationsstufe. Es wurde keine neue Fachlogik, keine zweite Engine,
keine zweite Session-Speicherung und keine neue Persistenzschicht eingeführt.

## Sichtbare Einstiegspunkte

| Ort | Bezeichnung | Datei |
| --- | --- | --- |
| Teacher App – Startseite | „Entscheidungsnavigator“ (Karte, führt zu `/navigator`) | `src/routes/index.tsx` |
| Core Builder – Dashboard | „Entscheidungsnavigator testen“ (Vorschau-Link) | `src/routes/admin.index.tsx` |

## Abgrenzung Teacher App / Core Builder

Der Navigator ist ausschließlich Teil der Teacher App. Der Core Builder enthält lediglich
einen Vorschau-Link; es wurde keine Navigator-Fachlogik in den Redaktionsbereich verschoben.

## Navigator-Startseite (`/navigator`)

`src/components/navigator/NavigatorLanding.tsx` zeigt Titel, Modulerklärung,
Entwicklungsstatus, den vollständigen Phasenüberblick sowie die Aktionen
„Neue Bearbeitung starten“, „Demo starten“, „Bearbeitung fortsetzen“ (nur bei
fortsetzbarer Session) und „Zurücksetzen“ (mit Bestätigung).
Beim Öffnen der Route wird **keine** Bearbeitung automatisch gestartet.

## Demo-Session

- Getrennte Kennung: `NAVIGATOR_SESSION_IDS.demo` (`navigator-demo`), echte Bearbeitung `aktueller-vorgang`
  (`src/services/decision-navigator/navigatorSessions.ts`).
- Kontext-Flag `navigatorDemo: true`, Titel „Allgemeine schulische Situation – Demo“.
- Neutrale Beispieldaten über `buildDemoSituationCase` (`src/services/situation-analyzer/demoSituation.ts`),
  erzeugt ausschließlich über den bestehenden `SituationAnalyzerService`. Keine realen Namen,
  keine Bewertung, jederzeit editierbar, sichtbar als Demo gekennzeichnet.

## Step Renderer

`src/components/navigator/NavigatorStepRenderer.tsx` ist die einzige Stelle, an der eine Phase
einer Oberfläche zugeordnet wird (`NAVIGATOR_STEP_VIEWS`). Verfügbar: `start`, `situation`.
Alle übrigen Phasen liefern `NavigatorStepPlaceholder`.
`src/components/navigator/NavigatorStepper.tsx` zeigt alle neun Phasen mit Status
(abgeschlossen / aktuell / offen / übersprungen / noch nicht verfügbar), `aria-current="step"`
und Symbolen – Status wird nicht allein über Farbe vermittelt.

## Einbindung des Situation Analyzers

Der Schritt „Situation“ rendert unverändert `SituationStepPanel` → `useSituationAnalyzer` →
`SituationAnalyzerService`. Änderungen werden über `patchContext` unter
`context.situation` (`SITUATION_CONTEXT_KEY`) abgelegt; die Engine speichert den Zustand über
den `NavigatorSessionStore`. React-Komponenten mutieren das Fallmodell nicht.

## Weiter-Navigation

„Weiter“ ist im Schritt „Situation“ deaktiviert, solange
`context.situation.status !== "complete"`. Der deaktivierte Zustand wird mit einem sichtbaren
Hinweistext begründet. Der Schrittwechsel erfolgt ausschließlich über die
`DecisionNavigatorEngine`; der `SituationAnalyzerService` entscheidet nur über Validität.

## Session-Steuerung

`src/components/navigator/NavigatorSessionControls.tsx`: Pausieren, Fortsetzen,
Navigator verlassen (pausiert, ohne Datenverlust), Neu starten, Abbrechen, Demo zurücksetzen.
Neu starten, Abbrechen und Zurücksetzen erfordern eine Bestätigung.

## Fehlerzustände

`readNavigatorSession` klassifiziert gespeicherte Sessions als
`none | unreadable | invalid_state | incompatible` und liefert jeweils eine verständliche
Meldung mit Handlungsoption (fortsetzen, neu starten, zurücksetzen). Fehlender bzw. gesperrter
LocalStorage wird über `isNavigatorStorageAvailable()` erkannt und auf der Startseite gemeldet.
Gespeicherte Daten werden niemals stillschweigend gelöscht; es werden keine Stacktraces angezeigt.

## Tests

`src/services/decision-navigator/__tests__/navigatorVisibility.test.ts` (12 Tests):
Sessionerkennung, Start, Demo-Trennung und Demo-Vorbefüllung, Abdeckung aller Phasen im
Step Renderer, Verfügbarkeits-Kennzeichnung, Speicherung und Wiederherstellung von
`context.situation`, Weiter-Gating, Pause/Resume/Restart über die Engine, inkompatible und
beschädigte Sessions, Speicherverfügbarkeit. Alle bestehenden Tests bleiben grün (143 Tests),
Typecheck ohne Fehler.

## Manueller Browser-Test

Durchgeführt (Chromium, 1280 px): Startseite öffnen → Demo starten → neun Phasen sichtbar →
Situation öffnen → Angaben erfassen bzw. als unbekannt markieren → Vollständigkeit sichtbar →
Situation abschließen → „Weiter“ freigegeben → Analyse zeigt transparenten Platzhalter →
Seite neu laden → Landing bietet „Demo fortsetzen“ → Bearbeitung inklusive aller Angaben
wiederhergestellt. Keine Konsolenfehler.
