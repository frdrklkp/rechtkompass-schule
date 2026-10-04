---
name: deploy-verifikation
description: Prüft nach einem Push, ob die RechtKompass-Änderung wirklich live ist - Cloudflare-Deploy, Produktions-Smoke-Test, Runner-Workflows. Nutze diese Skill nach jedem Push mit produktionsrelevanten Änderungen, oder wenn der Nutzer fragt "ist das live?", "warum greift die Änderung nicht?" oder ein Feature in Produktion nicht funktioniert, das lokal läuft.
---

# Deploy-Verifikation

Ein Push ist kein Deploy. Bekannte Falle dieser Codebasis: Cloudflare braucht nach dem Push mehrere Minuten; ein Test gegen die alte Version hat schon zweimal falsche Fehlerbilder erzeugt.

## Ablauf

1. **Push angekommen?** `git ls-remote origin main` = lokaler HEAD. (GitHub-Zugang liegt im macOS-Schlüsselbund; liefert `git credential fill` nichts, den Nutzer pushen lassen - Username `frdrklkp`, Passwort = Fine-grained-Token.)
2. **CI grün?** Öffentliche API, kein Token nötig:
   `curl -s "https://api.github.com/repos/frdrklkp/rechtkompass-schule/actions/runs?per_page=3"` - Runs mit `event=push` prüfen.
3. **Cloudflare-Deploy live?** Mit eingerichtetem Wrangler-Token (`CLOUDFLARE_API_TOKEN` in `.env`):
   `bunx wrangler deployments list --name tanstack-start-ts` - die aktive Version muss NACH dem Push liegen. Ohne Token: 3-5 Minuten warten, im Zweifel den Nutzer auf Workers & Pages → tanstack-start-ts → Deployments schauen lassen. NIE einen Produktionstest vor bestätigtem Deploy als Beweis werten.
4. **Produktions-Smoke-Test** je nach Änderung: Seite per Browser-Tab auf https://www.rechtkompass-schule.de prüfen; API-Routen mit einem Supabase-JWT (generateLink + verifyOtp) direkt aufrufen; Worker-Logs bei Bedarf mit `bunx wrangler tail tanstack-start-ts --format pretty` live mitlesen, während man den Fehlerfall auslöst.
5. **Runner-Workflows:** Dispatch-Test öffentlich sichtbar unter `.../actions/runs?event=repository_dispatch`. Der 5-Minuten-Cron läuft bei GitHub real nur alle paar Stunden - nie auf den Cron warten, immer dispatchen.

## Worker-Eigenheiten (Fundliste dieser Codebasis)

- **Fire-and-forget-fetch stirbt:** Nicht-awaitete Promises werden nach dem Response-Return abgebrochen - Aufrufe vor der Antwort awaiten (mit `AbortSignal.timeout`).
- **Env-Zugriff:** Secrets über `process.env` funktionieren, aber Supabase-Variablen IMMER über die Fallback-Kette in `src/lib/server/supabaseEnv.ts` (rohe `VITE_*`/`SUPABASE_*` sind im Worker teils leer).
- Lange Hintergrundarbeit (> Sekunden) gehört NIE in den Worker, sondern in die Job-Queue + GitHub-Actions-Runner.
- `bun run typecheck | tail` verschluckt den Exit-Code - immer `if bun run typecheck > /dev/null 2>&1` prüfen, vor jedem Push.
