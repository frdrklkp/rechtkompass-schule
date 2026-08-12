# 04 – Workflow Engine

Modul: `src/services/legal-workflows/`. Die Engine ist datengetrieben:
Redaktionelle Definitionen bestimmen das Verhalten, nicht der Code.

## Bausteine

| Baustein | Datei | Verantwortung |
| --- | --- | --- |
| Workflow | `types.ts`, `WorkflowBuilder.ts` | Definition, Metadaten, Einstiegsknoten |
| Node | `types.ts` | Einzelschritt (Frage, Hinweis, Aktion, Checkliste, Dokument, Ende) |
| Transition | `types.ts` | Gerichtete Kante mit optionaler Bedingung |
| Condition | `WorkflowRuleEngine.ts` | Deklarative Auswertung auf dem Session-Kontext |
| Action | `WorkflowRunner.ts` | Deklarativer Nebeneffekt eines Knotens |
| Engine | `WorkflowEngine.ts` | Auswahl des nächsten Knotens, Regelanwendung |
| State | `WorkflowStateMachine.ts` | Sitzungszustände und erlaubte Übergänge |
| Navigation | `WorkflowNavigator.ts` | Vor/Zurück, Sprungpunkte, Pfadverlauf |
| Runtime | `WorkflowRunner.ts`, `WorkflowContextBuilder.ts` | Ausführung einer Sitzung |
| Validator | `WorkflowValidator.ts` | Zyklen, Sackgassen, unerreichbare Knoten |
| Fortschritt | `WorkflowProgressCalculator.ts` | Fortschritt und verbleibende Schritte |
| Statistik | `WorkflowStatistics.ts` | Auswertung über Sitzungen |
| Export | `WorkflowExportService.ts` | Ausgabe einer Definition |
| Repository | `WorkflowRepository.ts`, `Supabase*Repository.ts` | Persistenz-Port und Adapter |

## Designer und Editor
`src/lib/workflowDesigner.functions.ts` und
`/admin/editorial/workflows/*` (u. a. `StepEditorDialog`) erzeugen und
bearbeiten Definitionen. Der Designer validiert über denselben
`WorkflowValidator` wie die Runtime, führt aber nie einen Workflow aus.
Der fallspezifische Entscheidungsbaum-Editor
(`src/components/DecisionTreeAdminEditor.tsx`) folgt demselben Prinzip.

## Ablauf eines vollständigen Entscheidungsworkflows

1. **Start** – `POST /api/workflow-sessions` legt eine Sitzung zur
   veröffentlichten Workflow-Version an; `WorkflowContextBuilder` erzeugt den
   Anfangskontext (Fall, Nutzerangaben, Metadaten).
2. **Knoten laden** – Die Engine liefert den Einstiegsknoten.
3. **Antwort** – Die Runtime schreibt die Eingabe in den Kontext und
   protokolliert ein Ereignis (`/api/workflow-sessions/$id/events`).
4. **Bedingungsprüfung** – Die `WorkflowRuleEngine` wertet die Transitions des
   aktuellen Knotens aus und wählt die erste zutreffende Kante.
5. **Aktionen** – Der `WorkflowRunner` führt deklarative Aktionen aus
   (Checkliste aktualisieren, Dokument vormerken, Hinweis setzen).
6. **Zustandsübergang** – Die `WorkflowStateMachine` prüft den Übergang
   (`active`, `paused`, `cancelled`, `completed`) und schreibt ihn fort.
7. **Navigation** – Der Navigator erlaubt Rückschritte ohne Datenverlust;
   der Fortschritt wird neu berechnet.
8. **Abschluss** – Am Endknoten werden Ergebnis, Checklisten und Dokumente
   festgeschrieben; die Dokumentengenerierung kann angestoßen werden.

## Grenzen
Die Workflow Engine kennt keine Parser, keine Importlogik und keine
UI-Komponenten. Sie kommuniziert ausschließlich über Typen, Ports und
API-Routen.
