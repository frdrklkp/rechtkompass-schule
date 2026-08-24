<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

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
