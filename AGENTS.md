## Deploy

Das Projekt ist seit 24.08.2026 **nicht mehr mit Lovable verbunden**. Deploys
laufen über **Cloudflare Workers Builds** (Worker `tanstack-start-ts`, Git-
Verknüpfung zum GitHub-Repo): Jeder Push auf `main` startet in Cloudflare
einen Build (`bun run build`) und ein `wrangler deploy`; andere Branches
werden als Vorschau-Version hochgeladen. Es gibt keinen Deploy-Workflow in
GitHub Actions. Geheimnisse (API-Schlüssel) liegen ausschließlich als
Worker-Secrets in Cloudflare und werden mit `wrangler secret put` gepflegt -
nicht im Build-Befehl, nicht in Build-Variablen (Fund 04.10.2026: der
Deploy-Befehl schrieb nach jedem Build veraltete Schlüssel zurück).

Keine veröffentlichte Git-Historie umschreiben (kein Force-Push, kein Rebase
oder Squash bereits gepushter Commits); `main` muss immer baubar bleiben,
weil jeder Push sofort live geht.

## Rechtsquellen-Datenqualität

Nach jedem BASS-Reimport (`scripts/_import-bass-all.ts`) und nach jedem
größeren Batch neuer Praxisfälle:

```bash
bun run scripts/_check-legal-data-health.ts
```

Prüft (1) ob `legalCitationExtractor.ts` §/Artikel-Erwähnungen im Fließtext
übersieht, (2) ob kuratierte `case_legal_links` zum tatsächlichen Fließtext
passen, (3) ob `legal_sources` mit gleichem Titel intern widersprüchliche
Paragrafen-Fassungen enthalten (Dubletten-Import). Hintergrund: mehrere
reale Bugs dieser Art wurden 2026-08-18/19 nur durch Nutzer-Screenshots
gefunden, nicht durch systematische Prüfung - dieses Skript bündelt die
Ad-hoc-Audits, mit denen sie gefunden wurden.

Manche gemeldeten Zahlen sind eine bekannte, akzeptierte Restmenge (z.B.
APO-BK-Anlagen ohne eindeutige Nummerierung), kein Fehler - siehe
Kommentar im Skript. Bei Check 3: Titel-Gleichheit ist eine Heuristik und
kann bei kaputt importierten Titeln (z.B. gescrapte Social-Share-Buttons
statt echtem Dokumenttitel) unrelated Dokumente fälschlich als "Dublette"
zusammenfassen - im Zweifel den Titel selbst prüfen, bevor man Inhalte
zusammenführt.
