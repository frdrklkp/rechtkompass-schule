# 23 – Automatische Fallgenerierung durch Lehrkräfte (Sprint 4.6K)

Stand: 2026-08-15

## Produktmodell

Wenn der Entscheidungsassistent (`/assistent`) für eine geschilderte Situation
keinen ausreichend passenden Praxisfall findet ("Kein ausreichend passender
Praxisfall"), kann die Lehrkraft dort direkt einen neuen Praxisfall aus ihrer
eigenen Schilderung erstellen lassen. Der Fall entsteht asynchron im
Hintergrund (Entwurf → Anlegen → Vernetzung mit Rechtsgrundlagen →
Entscheidungsbaum → Qualitätsoptimierung, ca. 1–3 Minuten) und geht danach in
die normale redaktionelle Prüfung (`workflow_status = 'in_review'`). Er wird
**nicht automatisch freigegeben oder veröffentlicht** – dieselbe Person, die
ihn angefragt hat, kann ihn währenddessen bereits ansehen; alle anderen sehen
ihn erst nach redaktioneller Freigabe.

Damit die Fallgenerierung überhaupt einer Person zugeordnet werden kann
(Tageslimit, Sichtbarkeit des eigenen Falls), meldet sich die Lehrkraft kurz
per E-Mail-Anmeldelink an (kein Passwort, keine Registrierungsseite). Vor
Sprint 4.6K gab es auf der öffentlichen Seite keinerlei Anmeldung – nur der
Redaktions-/Admin-Bereich hatte einen eigenen Login.

## Warum ein privilegierter Server-Kontext nötig war

Die bestehende Fall-Pipeline (`coreBuilder.ts`, `casePipeline.completion.ts`,
`legalMatching.engine.ts`, `templateMatching.ts`, `qualityEngine.ts`,
`qualityFixManager.ts`, `EditorialWorkflowService.ts`) ist durchgehend auf den
**Browser-Singleton-Client** (`@/integrations/supabase/client`) und
`assertAdminWrite()` (Browser-Auth-Snapshot) ausgelegt – sie wird bisher
ausschließlich aus der Admin-Oberfläche oder aus Node-Skripten aufgerufen, die
eine Admin-Browsersitzung simulieren (`scripts/_create-and-publish-case.ts`
u. a.). Ein echter HTTP-Request einer Lehrkraft läuft aber serverseitig im
selben, langlebigen Serverprozess wie alle anderen gleichzeitigen Requests –
den Prozess-globalen Singleton für einen Job umzuauthentifizieren hätte
gleichzeitige Requests anderer Nutzer:innen beeinträchtigen können.

Lösung: ein **AsyncLocalStorage-Kontext**, den nur serverseitiger Code sieht,
ohne dass die Pipeline-Dateien selbst geändert werden mussten:

- `src/lib/server/privilegedSupabaseContext.ts` – `runWithPrivilegedSupabase(client, fn)`
  hält einen fertig authentifizierten Supabase-Client im Kontext des
  aktuellen Async-Aufrufs.
- `src/integrations/supabase/contextAwareClient.ts` – Proxy, der sich für
  jeden normalen (Browser-)Aufruf identisch zum Singleton verhält, innerhalb
  des Kontexts aber transparent umleitet. Die Pipeline-Dateien importieren
  `supabase` jetzt von hier statt von `./client` (reine Importzeilen-Änderung,
  keine Logikänderung).
- `src/lib/adminAuth.ts` – `assertAdminWrite()`/`canWrite()` prüfen einen
  registrierbaren Override-Callback, der nur innerhalb des privilegierten
  Kontexts `true` liefert.
- `src/lib/server/wirePrivilegedWriteOverride.ts` – verdrahtet beides einmalig,
  wird ausschließlich aus serverseitigem Code importiert.

**Wichtige Randbedingung:** `vite.config.ts` blockt per `importProtection`
jeden Import aus `**/server/**` im Client-Bundle mit einem Build-Fehler. Da
`coreBuilder.ts` & Co. weiterhin auch von der Browser-Admin-UI verwendet
werden, dürfen sie NICHT direkt aus `src/lib/server/**` importieren – deshalb
die Zwischenschicht über Override-Callbacks statt eines direkten Imports von
`getPrivilegedSupabase()`.

Serverseitige Identität: kein neuer Dienst-Account nötig. Der bestehende
`admin@rechtkompass.local` (Rolle `admin`, erfüllt `public.is_editor()`) wird
auf einem **frischen Client pro Job** angemeldet – kein geteilter Zustand
zwischen gleichzeitigen Jobs.

**Fund beim ersten Mehrfach-Batch-Test:** Ursprünglich per Magic-Link
(`auth.admin.generateLink` + `verifyOtp`, wie in den Admin-Batch-Skripten).
Bei mehreren, kurz nacheinander gestarteten Fallgenerierungen (realistisches
Szenario: mehrere Lehrkräfte gleichzeitig) invalidiert ein neu erzeugter
Magic-Link offenbar jeden vorherigen, noch nicht eingelösten Link derselben
E-Mail-Adresse – gleichzeitige Anfragen scheiterten reproduzierbar mit
"Email link is invalid or has expired". Umgestellt auf Passwort-Anmeldung
(`signInWithPassword`, Secret `CASE_GENERATION_SERVICE_PASSWORD`): verifiziert
per zwei gleichzeitigen Anmeldeversuchen, dass beide unabhängig einen
gültigen Token erhalten – kein Race Condition mehr.

## Fund beim ersten Live-Test: relative fetch()-Aufrufe

Mehrere Bausteine der Pipeline rufen ihre eigenen KI-Matching-Endpunkte mit
**relativen** URLs auf (`fetch("/api/ai-match-legal-sections")` in
`legalMatching.ts`, ebenso in `caseMatching.ts`, `keywordMatching.ts`,
`templateMatching.ts`, `legalMatching.engine.ts`) – das funktioniert nur im
Browser (Auflösung gegen `window.location`). Im Serverprozess wirft das
native `fetch()` sofort, was in `casePipeline.completion.ts` still als "0
Rechtsgrundlagen zugeordnet" statt als echter Fehler ankam (kein Crash, nur
ein leeres Ergebnis – bei den ersten beiden Testläufen fälschlich als "keine
passende Rechtsgrundlage vorhanden" interpretiert). Behoben durch denselben
AsyncLocalStorage-Ansatz: `src/lib/server/serverFetchOrigin.ts` patcht
`globalThis.fetch` einmalig pro Prozess, schreibt aber nur innerhalb des
eigenen Kontexts relative Pfade auf eine absolute Basis um; jeder Request
außerhalb bleibt unverändert. Nach dieser Korrektur lief die komplette
Pipeline einschließlich Rechtsgrundlagen-Verknüpfung, Entscheidungsbaum,
Qualitätsoptimierung und `submitForReview` erfolgreich durch (Live-Test
2026-08-15, ca. 3 Minuten Laufzeit, 3 Rechtsgrundlagen verknüpft,
`workflow_status = 'in_review'`).

## Datenmodell

`case_generation_jobs` (`db/2026-08-15_case_generation_jobs.sql`):

| Spalte | Zweck |
| --- | --- |
| `requested_by` | `auth.uid()` der anfragenden Person (echte Zuordnung, nicht der Service-Account) |
| `sketch` | Freitext-Schilderung, wie im Assistenten eingegeben |
| `status` | `pending` \| `running` \| `succeeded` \| `failed` |
| `phase` | `entwurf` \| `anlegen` \| `vernetzen` \| `entscheidungsbaum` \| `qualitaet` \| `einreichen` \| `fertig` |
| `case_id` | gesetzt, sobald der Fall angelegt ist (auch bei späterem Scheitern sichtbar) |
| `error` | Klartext-Fehlermeldung bei `status = 'failed'` |

RLS: `SELECT` nur für `requested_by = auth.uid()` oder Redaktion
(`is_editor()`/`is_reviewer()`/`is_admin()`); `INSERT`/`UPDATE`/`DELETE` für
`authenticated` vollständig blockiert – alle Schreibzugriffe laufen
ausschließlich über den Service-Role-Client im Server-Job.

`practice_cases` hat keine eigene "erstellt von"-Spalte. Sichtbarkeit des
eigenen, noch nicht veröffentlichten Falls für die anfragende Lehrkraft läuft
über eine `EXISTS`-Subquery gegen `case_generation_jobs`.

**Fund beim Live-Test der Sichtbarkeit:** Die ursprünglich angenommene
Policy (`status = 'published' OR is_editor()`, vermeintlich aus Sprint 1.2)
existierte so nicht. Tatsächlich aktiv war eine viel weiter gefasste,
dokumentiert-bewusste Policy aus `db/2026-07-24_sprint_1_2_role_based_rls.sql`
(`__apply_role_rls` mit `_select_anon=true`): `FOR SELECT TO anon,
authenticated USING (true)` – **jede** Zeile von `practice_cases` war für
**jeden**, auch anonym, lesbar; die Trennung "veröffentlicht vs. Entwurf"
existierte bislang nur clientseitig (`fetchPublishedCases`/`fetchCaseById`,
`src/lib/casesFromDb.ts`). Ein Testlauf mit einer echten, unbeteiligten
zweiten Lehrkraft (Rolle `teacher`, kein Editor) bestätigte: sie konnte den
fremden `in_review`-Fall über denselben Mechanismus lesen, den auch die
anfragende Lehrkraft nutzt – die ursprüngliche, additive Policy aus
`db/2026-08-15_case_generation_own_visibility.sql` war dadurch wirkungslos
(die Blanket-Policy machte sie schlicht redundant).

Nach Rücksprache: `db/2026-08-15_practice_cases_select_scope.sql` ersetzt die
Blanket-Policy durch zwei enger gefasste (ersetzt zugleich die frühere
additive Policy):

- `anon`: nur `status = 'published'`.
- `authenticated`: `status = 'published' OR is_editor() OR` eigene Anfrage
  (`case_generation_jobs.requested_by = auth.uid()`).

Damit sind draft/in_review/archivierte Fälle systemweit vor direktem
Datenbankzugriff geschützt (nicht nur die neu generierten) – ein bewusst
größerer Eingriff als ursprünglich für dieses Feature geplant, da die
Fallgenerierung der anfragenden Lehrkraft erstmals einen echten,
funktionierenden Link auf einen ungeprüften Entwurf in die Hand gibt.
`service_role` (Reindex, Admin-Batches) ist von RLS ohnehin nicht betroffen.

**Zweiter, schwerwiegenderer Fund beim Verifizieren dieser Policy:** Ein
Live-Test mit zwei echten `role='teacher'`-Accounts zeigte, dass eine
unbeteiligte Lehrkraft den fremden `in_review`-Fall TROTZ der neuen Policy
weiterhin lesen konnte. Ursache (per temporärer Diagnosefunktion
`__debug_practice_cases_policies()` gegen `pg_policies` ermittelt, da
PostgREST `pg_policies` sonst nicht exponiert): sechs verwaiste
RLS-Policies aus alten Pilot-/Zwischenständen waren nie entfernt worden und
liefen parallel zu allen später hinzugefügten, korrekt eingegrenzten
Policies (Sprint 3.2, diese Migration) - darunter `"cases write pilot"`
(`FOR ALL TO public USING(true) WITH CHECK(true)`), das JEDEM,
auch unauthentifizierten Aufrufern, beliebige Schreibzugriffe auf
`practice_cases` erlaubte. Postgres verknüpft mehrere Policies für
denselben Befehl/dieselbe Rolle mit OR, wodurch jede einzelne
`USING(true)`-Policy sämtliche enger gefassten Policies wirkungslos machte,
unabhängig davon wie viele es gab oder wie korrekt sie waren. Bereinigt durch
`db/2026-08-15_practice_cases_drop_legacy_policies.sql`. Vermutlich betrifft
dasselbe Muster (alte `__apply_role_rls`-Pilot-Policies nie entfernt) auch
andere Tabellen, die über denselben Migrationspfad liefen
(`document_templates`, `legal_sections`, `case_templates`, `keywords`,
`case_keywords`, `case_related_cases` u. a.) - eine breitere Policy-Audit
über alle 55 Tabellen wird empfohlen, war aber nicht Teil dieses Sprints.

## Ablauf (`src/lib/server/caseGenerationJob.ts`)

Entwurf (`/api/ai-draft-batch-item`) → Dublettenprüfung (`findSimilar` gegen
den Entwurfstitel, Schwelle 0,75 – bewusst NACH dem günstigen Entwurfsaufruf,
aber VOR der teuren Vernetzung/Baum-Generierung) → `createCase` → `completePracticeCase`
(zweiter Versuch bei 0 Rechtsgrundlagen, dann harter Abbruch – **keine Norm
wird erfunden**, derselbe Grundsatz wie in der Admin-Batchverarbeitung) →
Entscheidungsbaum (`/api/ai-draft-decision-tree`) → Qualitätsoptimierung
(`fixCaseQualityTasks`, bis zu 5 Runden) → Baum-Freigabe bei struktureller
Vollständigkeit → `EditorialWorkflowService.submitForReview` (bewusst
**kein** `decideReview`/`publish` – das bleibt Redaktionsaufgabe).

`/api/case-generation-jobs` (POST): `requireApiAuth`, Mindest-/Maximallänge
der Schilderung, Tageslimit (5 pro Person, service-role-Zählung über
`created_at`), Job-Zeile anlegen, Verarbeitung anstoßen. Cloudflare-Hinweis:
falls dieses Projekt künftig über das konfigurierte `nitro`-Preset
`cloudflare-module` läuft, wird Hintergrundarbeit ohne `waitUntil` nach dem
Response ggf. abgebrochen – der Handler prüft daher defensiv auf ein
`request.waitUntil`, ohne sich aktuell darauf zu verlassen (der real
betriebene Prozess ist ein langlebiger Bun-Server, `nohup bun run dev`).
`/api/case-generation-jobs/$id` (GET): nutzt einen an den Aufrufer-Token
gebundenen Client statt Service-Role – Sichtbarkeit entscheidet ausschließlich
die RLS-Policy, keine zusätzliche App-Logik.

## Frontend

- `useAuthSession()` (`src/lib/adminAuth.ts`) – rollenneutraler Sitzungszugriff
  über denselben Snapshot-Store wie `useAdminAuth()`, ohne dessen
  Rollen-Einschränkung.
- `AssistantEmailSignIn` – Anmeldeformular (E-Mail → `signInWithMagicLink`),
  erscheint im "Kein ausreichend passender Praxisfall"-Zustand, wenn niemand
  angemeldet ist.
- `AssistantCaseGenerationOffer` + `useCaseGenerationJob` (Hook: startet den
  Job, pollt `/api/case-generation-jobs/$id` alle 3 Sekunden) – Button,
  Fortschrittsanzeige (Phasenbeschriftung auf Deutsch), Ergebnislink zu
  `/faelle/$id`.
- `faelle.$id.tsx` – Banner "Dieser Fall befindet sich in der redaktionellen
  Prüfung", sobald `workflowStatus` gesetzt und ungleich `published` ist
  (nur für die anfragende Person oder Redaktion überhaupt sichtbar, dank RLS).

## Bekannte Einschränkung: Selbstregistrierung

`signInWithMagicLink` schlägt für **neue** E-Mail-Adressen mit einer
generischen "invalid email"-Fehlermeldung fehl, während dieselbe Anfrage für
ein bereits existierendes Konto weiter kommt (dort: "email rate limit
exceeded" nach mehreren Testaufrufen) – ein klares Indiz, dass
Selbstregistrierung (Sign-ups) im Supabase-Projekt aktuell deaktiviert ist.
Das ist eine Projekteinstellung im Supabase-Dashboard
(Authentication → Settings), keine Codeeinschränkung. Bis sie aktiviert wird,
funktioniert die Anmeldung nur für bereits existierende Konten (z. B.
`admin@rechtkompass.local`) – reguläre Lehrkräfte können sich noch nicht
selbst registrieren.

## Tests

- `src/components/assistant/__tests__/assistantUi.test.tsx`: `AssistantMatchSummary`
  rendert das neue Erstellen-Angebot serverseitig ohne Absturz; dokumentiert
  bewusst, dass `useSyncExternalStore`s `getServerSnapshot()` im SSR-Render
  immer "nicht bereit" liefert (kein Aufblitzen falscher Anmeldeansicht) –
  Button und Anmeldeformular wurden daher live im Browser verifiziert, nicht
  per SSR-Assertion.
- Job-Pipeline und Redaktions-Workflow: kein Unit-Test (folgt der bestehenden
  Konvention für Orchestrierungscode ohne Mocking-Infrastruktur, z. B.
  `scripts/_create-and-publish-case.ts`), stattdessen Live-Verifikation
  (POST → Polling bis `succeeded`, anschließende Kontrolle von
  `workflow_status`, `case_legal_links`, `case_reviews` in der DB).
- RLS-Sichtbarkeit: Live-Test mit zwei echten `role='teacher'`-Accounts (per
  Service-Role-API angelegt, kein Self-Service-Signup nötig) – die
  anfragende Lehrkraft sieht ihren eigenen `in_review`-Fall, eine
  unbeteiligte zweite Lehrkraft nicht (nach Anwendung von
  `db/2026-08-15_practice_cases_select_scope.sql`; davor war Letzteres der
  oben beschriebene Fund).
- Dublettenprüfung: derselbe Live-Test bestätigte inzident, dass eine
  nahezu identische Fallschilderung korrekt mit "Ähnlicher Praxisfall
  existiert bereits" abgelehnt wird, bevor die teure Pipeline startet.
- `bun run schema:check` bestätigt Live-Schema/Code-Synchronität nach den
  beiden neuen Migrationen.
