# 02 – Domain Model

Alle Kernobjekte der Plattform, ihre Verantwortlichkeiten und Beziehungen.
Typen sind in den jeweiligen `types.ts` der Fachdomänen definiert;
Datenbankspalten in `db/*.sql` und `src/integrations/supabase/types.ts`.

## Übersicht der Beziehungen

```
Category 1─n PracticeCase n─n Keyword
                  │
                  ├─1 DecisionTree (practice_cases.decision_tree, jsonb)
                  ├─n QualityReport
                  ├─n GeneratedDocument
                  └─n DocumentTemplate (Zuordnung)

LegalSource 1─n LegalImportVersion 1─n LegalDocument 1─n LegalNode
LegalSource n─n PracticeCase (Rechtsgrundlagen-Verknüpfung)
LegalNode  1─n Chunk 1─1 Embedding

Workflow 1─n WorkflowNode 1─n WorkflowTransition
Workflow 1─n WorkflowSession 1─n SessionEvent / SessionDocument
```

## PracticeCase
Redaktionell kuratierter Praxisfall: Sachverhalt, Ampelbewertung,
Handlungsschritte, Checklisten, Rechtsgrundlagen, Vorlagen, Schlagwörter.
Trägt den redaktionellen Workflow-Status (`draft … published`) und optional
einen kuratierten `decision_tree`. Verantwortlich für: fachliche Aussage
gegenüber der Lehrkraft. Nicht verantwortlich für: Rechtsquellentext.

## Workflow
Datengetriebene Definition eines Entscheidungsvorgangs: Metadaten,
Einstiegsknoten, Versionsstand, Veröffentlichungsstatus. Besitzt Nodes und
Transitions. Verantwortlich für Struktur, nicht für Zustand.

## WorkflowNode
Einzelner Schritt: Frage, Hinweis, Aktion, Checkliste, Dokument oder Ende.
Trägt Titel, Erläuterung, Eingabefelder und Ausgangs-Transitions.

## WorkflowTransition
Gerichtete Kante zwischen zwei Nodes mit optionaler `Condition`.
Bestimmt, welcher Schritt als Nächstes erreichbar ist.

## Condition
Deklarative Bedingung auf dem Session-Kontext (Antworten, Metadaten),
ausgewertet durch die `WorkflowRuleEngine`. Keine ausführbaren Ausdrücke.

## Action
Deklarativer Nebeneffekt eines Knotens (Dokument erzeugen, Checkliste
setzen, Hinweis protokollieren). Wird vom `WorkflowRunner` ausgeführt.

## DecisionTree
Kuratierter, fallspezifischer Entscheidungsbaum in
`practice_cases.decision_tree` (jsonb) mit `meta.status`
(`draft` | `review` | `approved`). Modell, Parser und Validierung in
`src/lib/decisionTree.ts`. Priorität: kuratierter Baum vor regelbasiertem
Fallback.

## LegalSource
Stammdatensatz einer Rechtsquelle (Titel, Kurzname, Typ, Zuständigkeit,
Geltungsbereich, offizielle URL, Fassung, Prüf- und Lebenszyklusstatus).
Lebenszyklus und erlaubte Übergänge: `registry/LegalSourceRegistryTypes.ts`.

## LegalImportVersion
Unveränderliche Momentaufnahme einer Quelle zu einem Importzeitpunkt:
Checksumme, Parser, Fassungsbezeichnung, Statistik. Grundlage jeder
Delta-Berechnung – die Delta Engine arbeitet ausschließlich auf Versionen.

## LegalDocument
Ein importiertes Einzeldokument innerhalb einer Version (z. B. ein
BASS-Runderlass) mit Identifier, Titel, Metadaten und Struktur.

## LegalNode
Knoten der semantischen Dokumentstruktur: Abschnitt, Paragraph, Absatz,
Nummer, Anlage. Trägt Hierarchie, Text, interne und externe Verweise.
Basis für Chunks, Embeddings, Zitate und Versionsvergleich.

## Keyword
Normalisiertes Schlagwort inklusive Synonymen; verbindet Praxisfälle,
Rechtsgrundlagen und Suchanfragen.

## Category
Fachliche Gliederung der Praxisfälle (Bereich, Ampel-Kontext, Visualisierung).

## DocumentTemplate
Vorlage für erzeugte Dokumente: Platzhalter, Metadaten, Zielformat,
Zuordnung zu Fällen bzw. Workflow-Knoten.

## GeneratedDocument
Ergebnis einer Generierung: aufgelöster Inhalt, Format, Quellkontext,
Erzeugungszeitpunkt, Exportartefakte. Revisionsrelevant.

## QualityReport
Ergebnis der regelbasierten Qualitätsprüfung (`services/editorial/quality/`):
Regelverstöße, Score, Veröffentlichungsreife, Alterung.

## ImportHistory
Chronologische Protokollierung aller Importläufe: Quelle, Parser, Dauer,
Status, Delta-Kennzahlen, Bericht. Grundlage für Revisionssicherheit
(`/admin/legal-knowledge/history`, `/admin/import-protokoll`).
