# 20 – Legal Context Integration (Sprint 4.6G)

**Status:** Umgesetzt (Navigator-Phase „Rechtsgrundlagen“ produktiv)
**Datum:** 2026-07-20

## Ziel

Beantwortung der Frage: *„Welche geprüften Rechtsgrundlagen sind mit diesem
Fall verknüpft, wie aktuell sind sie und warum werden sie angezeigt?“*

Die Rechtsgrundlagen stammen ausschließlich aus vorhandenen kuratierten
Verknüpfungen (`practice_cases → case_legal_links → legal_sections →
legal_sources`). Kein Sprachmodell wählt Rechtsnormen aus oder erfindet sie.

## Schichten

### Fachlogik (`src/services/legal-context/`)

| Baustein | Aufgabe |
|---|---|
| `LegalContextResolver` | Löst die Kette links → sections → sources auf; erzeugt Issues statt stiller Lücken |
| `LegalContextFreshnessChecker` | Bewertet Aktualität (`current`, `aging`, `outdated`, `unknown`) aus `last_reviewed_at`/`last_verified_at` |
| `LegalContextRanker` | Stabile Sortierung: Relevanz → Quellenart → Referenznummer |
| `LegalContextExplainer` | Herkunftsnachweise ausschließlich aus vorhandenen Datenfeldern |
| `LegalContextService` | Orchestriert Auflösung; `inputHash` (djb2) erkennt veraltete Stände; `restore` rehydriert gespeicherte Einträge |

`original_text` aus `legal_sections` wird als pass-through Feld
(`originalText`) bis in die UI gereicht – unverändert, ohne KI-Umschreibung.

### React-Anbindung (`src/hooks/legal-context/useLegalContext.ts`)

- Liest den bestätigten Praxisfall aus `context[ASSISTANT_SELECTED_CASE_KEY]`.
- Löst über TanStack Query auf (Schlüssel `["legal-context", caseId]`,
  `staleTime: 60s`) – identischer Schlüssel in Assistent und Navigator
  (geteilter Cache).
- Erstbefüllung schreibt das Ergebnis in `context[LEGAL_CONTEXT_KEY]`;
  Abweichungen werden **nicht** automatisch überschrieben, sondern als
  „veraltet“ gemeldet (redaktionelle Kontrolle, manueller Refresh).
- Gespeicherte Einträge überstehen Reloads (`restore`).

### Navigator-UI (`src/components/navigator/legal/`)

- `LegalContextStepPanel` – Container, Hook-Anbindung, generischer Fallback
  ohne Praxisfall (transparent, keine erfundenen Normen).
- `LegalContextHeader` – Fallbezug und Herkunft (Provenance).
- `LegalReferenceGroup`/`LegalReferenceCard` – Gruppierung Zentral /
  Ergänzend / Kontext; Begründung, Relevanz, Freshness, offizielle Quelle,
  Originaltext-Toggle, technische Details (IDs, Hash) nur eingeklappt.
- `LegalFreshnessBadge` – Aktualität als Icon **und** Text (keine reine
  Farbcodierung).
- `LegalIssues` – sichtbare Meldung von Resolver-Problemen (fehlende
  Abschnitte, unverifizierte Quellen).
- `LegalStaleNotice` – Veraltungshinweis mit manuellem Refresh.
- `LegalLimitations` – Grenzen der Anzeige (keine Rechtsberatung, amtliche
  Fassung maßgeblich).

`NavigatorStepRenderer` rendert die Phase `rechtsgrundlagen` produktiv;
`isStepAvailable("rechtsgrundlagen") === true`.

### Assistenten-Vorschau

`AssistantLegalPreview` zeigt in der `AssistantConfirmation` Anzahl und die
Top-3-Referenzen (Quelle, Referenz, Freshness) des bestätigten Praxisfalls.
Der Controller (`useDecisionAssistant`) nutzt denselben Query-Schlüssel wie
der Navigator – die Vorschau kostet keinen zusätzlichen Datenabruf. Ohne
bestätigten Praxisfall wird keine Vorschau angezeigt (keine Täuschung).

## Invarianten

1. **Keine freie Rechtsauswahl:** ausschließlich kuratierte Links; fehlende
   Daten erzeugen Issues/Leerstände, niemals Platzhalter-Normen.
2. **Originaltext unverändert:** `original_text` pass-through; fehlender Text
   wird verständlich gemeldet.
3. **Redaktionelle Kontrolle:** Stale-Erkennung via `inputHash`; Übernahme
   nur manuell (Refresh) oder durch Dismiss.
4. **Kein LLM** in Auflösung, Ranking, Freshness oder Erklärung.
5. **Persistenz** über den Navigator-Kontext (`LEGAL_CONTEXT_KEY`), Reload-
   fest via `restore`.

## Tests

- `src/services/legal-context/__tests__/` – Service-Integration (12 Tests).
- `src/components/navigator/legal/__tests__/legalContextUi.test.tsx` –
  UI/Integration durch den echten Hook (SSR-Rendering): Verfügbarkeit,
  Fallback, Laden, Gruppierung, Freshness, Issues, Originaltext, Stale,
  Reload-Wiederherstellung, Leerstand, Grenzen.
- `src/components/assistant/__tests__/assistantUi.test.tsx` – Vorschau in
  der Bestätigung (Anzahl, Einträge, kein Praxisfall → keine Vorschau).
- `navigatorVisibility.test.ts` – Phase „rechtsgrundlagen“ als verfügbar.
