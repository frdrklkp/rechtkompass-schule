# 10 – Architecture Decision Records

Format je ADR: Kontext – Entscheidung – Begründung – Konsequenzen.
Status aller ADRs: **akzeptiert, eingefroren mit v1.0**.

## ADR-001 – Workflow Engine
**Kontext:** Entscheidungspfade unterscheiden sich je Fall und ändern sich
redaktionell laufend.
**Entscheidung:** Eine datengetriebene Workflow Engine statt hartcodierter
Abläufe.
**Begründung:** Redaktion ändert Abläufe ohne Deployment; ein Ausführungspfad
für alle Fälle; testbar ohne UI.
**Konsequenzen:** Definitionen müssen validiert und versioniert werden.

## ADR-002 – Workflow Designer
**Kontext:** Definitionen sind JSON-Strukturen, die Redakteure nicht direkt
bearbeiten können.
**Entscheidung:** Ein eigener Designer mit Live-Validierung, Mini-Map und
Vorschau.
**Begründung:** Fehlerquote sinkt, IDs bleiben verborgen, fachliche Sicht statt
technischer Sicht.
**Konsequenzen:** Designer und Runtime müssen denselben Validator nutzen.

## ADR-003 – Delta Engine
**Kontext:** Rechtsquellen werden regelmäßig neu geladen, ändern sich aber nur
punktuell.
**Entscheidung:** Knotenweise Inhalts-Hashes und Vergleich gegen die zuletzt
gespeicherte Version.
**Begründung:** Nachvollziehbarkeit, minimale Schreiblast, verständliche
Änderungsübersicht.
**Konsequenzen:** Hashfunktion und Identifier müssen stabil bleiben.

## ADR-004 – Versionierung
**Kontext:** Rechtsanwendung erfordert Aussagen über den Stand zu einem
Zeitpunkt.
**Entscheidung:** Unveränderliche Importversionen mit Checksumme und
Vorgängerbezug.
**Begründung:** Revisionssicherheit, Vergleichbarkeit, Rückverfolgbarkeit.
**Konsequenzen:** Speicherbedarf; Löschen ist ein fachlicher Vorgang.

## ADR-005 – Importframework
**Kontext:** Mehrere Quellenformate mit unterschiedlicher Struktur.
**Entscheidung:** Eine lineare Kette mit klar getrennten Stufen statt
quellspezifischer Importskripte.
**Begründung:** Wiederverwendung von Normalisierung, Validierung, Delta und
Versionierung; jede Stufe einzeln testbar.
**Konsequenzen:** Neue Quellen erfordern nur einen Parser.

## ADR-006 – Connector Layer
**Kontext:** Automatischer Abruf offizieller Quellen birgt Sicherheitsrisiken.
**Entscheidung:** Eigene Connector-Schicht mit Whitelist, HTTPS-Zwang,
Timeouts, Retries und reinem HTML-Parsing.
**Begründung:** Klar begrenzte Angriffsfläche; Beschaffung getrennt von
Interpretation.
**Konsequenzen:** Neue Domains müssen bewusst freigegeben werden.

## ADR-007 – Plugin Parser
**Kontext:** Jede Quelle hat eigene Gliederungslogik.
**Entscheidung:** Parser als registrierte Plugins mit einheitlicher Signatur.
**Begründung:** Open/Closed – neue Quellen ohne Eingriff in den Kern.
**Konsequenzen:** Die Parser-Signatur ist ab v1.0 stabil zu halten.

## ADR-008 – Repository Pattern
**Kontext:** Persistenz soll in Tests, Browser und Server austauschbar sein.
**Entscheidung:** Repositories kapseln jeden Datenzugriff.
**Begründung:** Kein Supabase-Wissen in der Fachlogik; Tests ohne Datenbank.
**Konsequenzen:** Mapping zwischen Zeilen und Domänenobjekten ist explizit.

## ADR-009 – Ports & Adapters
**Kontext:** Externe Systeme (Datenbank, KI, Dateiformate, Netzwerk) ändern
sich schneller als die Fachlogik.
**Entscheidung:** Fachkern definiert Ports; Infrastruktur liefert Adapter.
**Begründung:** Austauschbarkeit, Testbarkeit, klare Abhängigkeitsrichtung.
**Konsequenzen:** Etwas mehr Schnittstellencode – bewusst akzeptiert.

## ADR-010 – Grounded AI
**Kontext:** Rechtsauskünfte dürfen nicht halluziniert werden.
**Entscheidung:** Antworten ausschließlich aus abgerufenen Quellen, mit
`GroundingEngine`, `HallucinationGuard` und Pflichtzitaten; KI-Vorschläge in der
Redaktion niemals mit Auto-Save.
**Begründung:** Fachliche Verlässlichkeit und Prüfbarkeit.
**Konsequenzen:** Ohne Treffer gibt es keine Antwort, sondern einen Hinweis.
