# 08 – Folder Structure

```
db/                     SQL-Migrationen (chronologisch benannt) + Schema-Locks
docs/architecture/      Diese Architekturdokumentation (Freeze v1.0)
scripts/                Werkzeuge, u. a. schema-check.mjs
src/
  components/           Präsentationskomponenten (kein Datenzugriff)
    editorial/          Redaktionsspezifische Komponenten (Workflow, Qualität, KI)
    legal-knowledge/    Import-, Delta-, Vergleichs- und Berichtsansichten
    workflow-documents/ Dokumentenbereich der Workflow-Runtime
    ui/                 shadcn/ui-Primitive
  data/                 Statische Stammdaten (Gesetze, Vorlagen)
  hooks/                React-Anbindung an Services (Query-Keys, Mutationen)
  integrations/supabase/ Generierte Clients und Auth-Middleware
  lib/                  Querschnittslogik und schlanke Repositories
  routes/               TanStack-Router-Dateirouten
    api/                Server-Routen (HTTP-Endpunkte, Webhooks, KI-Aufrufe)
  services/             Fachdomänen (Kern der Architektur)
    document-generation/  Vorlagen, Kontext, Platzhalter, Export-Adapter
    editorial/            Redaktionsworkflow, Qualität, KI-Copilot
    legal-copilot/        Geerdete Rechtsauskunft mit Zitaten
    legal-knowledge/      Rechtsquellen, Import, Struktur, Chunks, Retrieval
    legal-workflows/      Workflow Engine, Runtime, Repositories
  styles.css            Tailwind-v4-Theme und semantische Tokens
  router.tsx            Router-Bootstrap
  start.ts / server.ts  Start- und Server-Einstieg
```

## Konventionen innerhalb einer Fachdomäne

| Datei | Zweck |
| --- | --- |
| `types.ts` | Domänentypen, keine Logik |
| `index.ts` | öffentliche Schnittstelle des Moduls |
| `errors.ts` | typisierte Fehlerklassen |
| `telemetry.ts` | Zählpunkte |
| `featureFlags.ts` | Schalter für optionale Pfade |
| `*Service.ts` | Orchestrierung |
| `*Repository.ts` | Port; Adapter mit Präfix `Supabase*` |
| `__tests__/` | Tests direkt am Modul |

Importe innerhalb von `src` erfolgen über den Alias `@/`.
`src/routeTree.gen.ts` ist generiert und wird nicht bearbeitet.
