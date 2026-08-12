# Maintenance Release M1.1 – Plattformstabilisierung

Status: abgeschlossen · Typecheck grün · Tests 252/252 grün
Keine neuen Features, keine Refactorings, keine Architektur-, Daten- oder UI-Änderungen.

## 1. Ursache der Router-Typfehler

Die betroffenen Admin-Routen definierten ihre Search-Parameter mit einem
handgeschriebenen Validator der Form:

```ts
validateSearch: (s: z.input<typeof searchSchema>) => searchSchema.parse(s)
```

TanStack Router leitet aus dem Parametertyp des Validators die *Eingabeform*
der Search-Parameter ab. Da einige Felder (`z.coerce.*`, Felder mit
`.default()` in der aktuellen Zod-Version) im `z.input`-Typ als **erforderlich**
erscheinen, hat der Router die Search-Parameter der Route als Pflichtangabe
eingestuft (`MakeRequiredSearchParams`). Folgen:

- `<Link to="/admin/editorial/faelle">` ohne `search`-Prop → TS2741
- Kindrouten wie `/admin/editorial/faelle/$id` erbten die Pflicht vom
  Layout-Elternteil (`admin.editorial.faelle.tsx`), obwohl sie selbst kein
  `validateSearch` besitzen – daher auch dort Fehler.
- `search={{}}` bzw. `search={(prev) => …}` wurden gegen den *Output*-Typ
  geprüft, während `prev` den *Input*-Typ trug → TS2322 (`ParamsReducerFn`).

Die Router-Typen waren also korrekt; die Validatoren haben Input- und
Output-Typ nicht getrennt.

## 2. Korrektur (Router / Search-Parameter)

- Abhängigkeit `@tanstack/zod-adapter` ergänzt (offizieller Adapter der
  eingesetzten TanStack-Router-Version).
- Validatoren auf `validateSearch: zodValidator(searchSchema)` umgestellt.
  Der Adapter meldet Input- und Output-Typ getrennt an den Router:
  Links/`navigate()` dürfen Search weglassen oder teilweise setzen, gelesene
  Werte bleiben vollständig typisiert.
- Search-Reducer (`navigate({ to: ".", search: (prev) => … })`) werden von
  TypeScript wegen der Union `true | ParamsReducerFn | Objekt` nicht
  kontextuell typisiert. Statt `any` wird der Parameter mit dem aus der Route
  abgeleiteten Typ `ReturnType<typeof Route.useSearch>` annotiert.
- Kein `any`, kein `@ts-ignore`, keine eslint-Ausnahmen, keine Dummy-Werte.
- Laufzeitverhalten identisch: dieselben Zod-Schemata, dieselben Defaults,
  dieselben URLs.

Betroffene Dateien:

- `src/routes/admin.editorial.faelle.tsx`
- `src/routes/admin.editorial.qualitaet.tsx`
- `src/routes/admin.editorial.reviews.tsx`
- `src/routes/admin.editorial.legal-quality.tsx`
- `src/routes/admin.legal-knowledge.sources.tsx` (handgeschriebener Validator
  auf ein Zod-Schema mit identischen Defaults umgestellt)
- `package.json` (neue Dev-/Runtime-Abhängigkeit `@tanstack/zod-adapter`)

Mitgeprüft und unverändert korrekt (Fehler entfielen automatisch, da sie aus
der geerbten Pflicht-Search der Elternroute stammten):
`admin.editorial.faelle.$id.tsx`, `admin.editorial.index.tsx`,
`admin.editorial.publishing.tsx`, `admin.legal-knowledge.sources.$id.tsx`, `admin.legal-knowledge.veraltet.tsx`,
`admin.legal-knowledge.pruefbedarf.tsx`, `admin.import-uebersicht.tsx`,
`faelle.tsx`.

## 3. Ursache des Testfehlers

Test: `router runTask: verwendet Mock ohne Key`
(`src/services/editorial/ai/__tests__/providerPlatform.test.ts`)

Ohne `LOVABLE_API_KEY` liefert `AIProviderFactory.get("lovable-gateway")`
korrekt den `MockProvider`. Der Test rief anschließend die Route
`improve.title` auf, deren Modelle ausschließlich Gateway-Modelle
(`google/gemini-2.5-flash`) sind. Der Router prüft vor dem Aufruf
`provider.supportsModel(model)` – der Mock-Provider unterstützt dieses Modell
nicht, daher der Abbruch mit
„Provider lovable-gateway unterstützt Modell … nicht.“

Die Produktivlogik ist damit korrekt (der Router darf ein Modell nicht an
einen Provider senden, der es nicht beherrscht). Fehlerhaft waren die
**Testdaten**: es fehlte eine mock-fähige Route.

## 4. Korrektur (Test)

Der Test registriert nun – wie der bereits vorhandene Nachbartest zu
`overrideRoute` – `mock/echo` als Fallback-Modell für `improve.title`,
und stellt die ursprüngliche Route am Ende wieder her. Es wurde
ausschließlich die Testdatei geändert; kein Test entfernt, keine Prüfung
deaktiviert, keine Produktivlogik angefasst.

Betroffene Datei: `src/services/editorial/ai/__tests__/providerPlatform.test.ts`

## 5. Warum keine Architekturänderung nötig war

Beide Defekte lagen ausschließlich auf der Typ- bzw. Testdatenebene:

- Der Router-Fehler betraf die Deklaration der Search-Validatoren, nicht das
  Routing-Modell, die Datenflüsse oder Modulgrenzen.
- Der Testfehler betraf die Testfixture, nicht die Provider-Plattform.

Workflow Engine, Runtime, Designer, AI Copilot, Dokumentengenerierung,
Exportsystem, Legal Knowledge, Importframework, Parser, Delta Engine,
Connector Layer, Update Monitor, Dashboard, Datenmodell, Datenbank und API
bleiben unverändert. Der Architecture Freeze v1.0 bleibt gültig.

## 6. Regressionsnachweis

- `tsgo --noEmit` → 0 Fehler (vorher 22)
- `bun test` → 252 pass / 0 fail (vorher 251/1)
