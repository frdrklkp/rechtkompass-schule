# 06 – Admin Platform (Core Builder)

Alle Bereiche liegen unter `/admin/*` (Routen in `src/routes/admin.*.tsx`) und
sind rollenbasiert abgesichert (Supabase Auth + RLS, `src/lib/adminAuth.ts`,
`src/hooks/editorial/useEditorialRole.ts`).

## Dashboard
`/admin`, `/admin/editorial`, `/admin/legal-knowledge`
Kennzahlen zu Fällen, Redaktionsstatus, Qualität, Rechtsquellen, importierten
Dokumenten, Paragraphen, Anlagen, geänderten Inhalten und letzter
erfolgreicher Aktualisierung. Reine Lesesicht.

## Praxisfälle
`/admin/faelle`, `/admin/faelle/$id`, `/admin/faelle/neu`, `/admin/fallmanager`
Pflege von Sachverhalt, Ampel, Handlungsschritten, Checklisten,
Rechtsgrundlagen, Vorlagen, Schlagwörtern sowie des fallspezifischen
Entscheidungsbaums (Tab „Entscheidungsbaum", `DecisionTreeAdminEditor`).
Ergänzend: `/admin/kategorien`, `/admin/schlagwoerter`,
`/admin/verknuepfungen`.

## Workflow Designer
`/admin/editorial/workflows`, `/admin/editorial/workflows/$id`
Anlegen und Bearbeiten von Workflow-Definitionen mit Knoten, Übergängen,
Bedingungen und Aktionen; Live-Validierung und Veröffentlichung.
Verwandt: `/admin/entscheidungsbaeume`,
`/admin/entscheidungsassistenten-batch`.

## Legal Knowledge
`/admin/legal-knowledge` mit Unterbereichen:
`sources`, `sources/$id`, `suche` (hybride Retrieval-Konsole),
`pruefbedarf`, `veraltet`, `quellen-connector` (Official Source Connector und
Update Monitor). Ergänzend `/admin/rechtsgrundlagen`, `/admin/suchindex`,
`/admin/knowledge-graph`, `/admin/copilot`.

## Import
`/admin/legal-knowledge/import` (vierstufiger Assistent: Quelle → Vorschau →
Delta → Bestätigung) und `/admin/import`, `/admin/import-uebersicht`.
Fortschrittsanzeige, strukturierte Vorschau, Delta Explorer,
Versionsvergleich, Pflichtbestätigung vor Übernahme.

## Historie
`/admin/legal-knowledge/history`, `/admin/import-protokoll`,
`/admin/import-protokoll/$id`, `/admin/aenderungen`, `/admin/quellenwaechter`
Lückenlose Protokollierung aller Läufe inklusive Importbericht.

## Versionen
`/admin/legal-knowledge/versions`
Fassungsverwaltung je Rechtsquelle, Vergleich installierter und neuer Fassung,
Nachverfolgung ersetzter Quellen.

## Qualität
`/admin/qualitaet`, `/admin/qualitaetsmanager`,
`/admin/editorial/qualitaet`, `/admin/editorial/legal-quality`,
`/admin/editorial/reviews`, `/admin/editorial/publishing`
Regelbasierte Prüfung, Veröffentlichungsreife, Alterung, Review-Workflow.

## Dokumente
`/admin/vorlagen` (Vorlagenpflege) sowie die erzeugten Dokumente je Fall und
Workflow-Sitzung (`CaseDocumentsPanel`, `WorkflowDocumentsSection`).
Ergänzend: `/admin/ki-entwurfsmaschine/*` für KI-gestützte Entwürfe und
Excel-Import, `/admin/einstellungen`, `/admin/suchtest`,
`/admin/legal-testmatrix`.
