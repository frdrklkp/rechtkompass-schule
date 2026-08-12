import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";

type SectionRef = {
  id: string;
  source_short?: string;
  section_number?: string;
  title?: string;
  summary?: string;
};

type RequestBody = {
  title?: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  bildungsgang?: string;
  keywords?: string[];
  recommendation?: string;
  immediate_actions?: string;
  responsibilities?: string;
  sections?: SectionRef[];
  confirmed_patterns?: Array<{ category: string; section_id: string; count: number }>;
};

/**
 * Erkennt, ob der Sachverhalt fachlichen Bezug zu § 53 SchulG NRW hat
 * (Fehlverhalten, erzieherische Einwirkungen, Ordnungsmaßnahmen, Verhältnismäßigkeit,
 * Ausschluss/Verweis). NUR wenn ein solcher Bezug erkennbar ist, darf § 53
 * überhaupt als Match berücksichtigt werden. Keyword-Matching allein reicht nicht,
 * daher wird der GESAMTE Fallkontext gegen mehrere Signalgruppen geprüft.
 */
export function hasSchulG53ContextSignals(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /fehlverhalt|pflichtverletz|regelverstoß|regelverstoss|unterrichtsstörung|st(ö|oe)rung des unterrichts/.test(t) ||
    /ordnungsmaß|ordnungsmass|disziplin|verweis|ausschluss|schulverweis|ausschluss vom unterricht/.test(t) ||
    /erzieherisch(e|en)? einwirk|erzieherische ma(ss|ß)nahme/.test(t) ||
    /verh(ä|ae)ltnism(ä|ae)ßig|verh(ä|ae)ltnismass/.test(t) ||
    /androhung.*maßnahme|klassenkonferenz.*maßnahme/.test(t)
  );
}

/**
 * Erkennt einen Abschnitts-Label als "§ 53 SchulG NRW".
 * Reagiert auch auf "SchulG § 53", "n 53 SchulG" und ähnliche Schreibweisen.
 */
function isSchulG53Section(sec: SectionRef): boolean {
  const num = (sec.section_number ?? "").toLowerCase().replace(/\s+/g, "");
  const src = (sec.source_short ?? "").toLowerCase();
  return (
    (num === "53" || num === "§53" || num === "n53") &&
    /schulg/.test(src)
  );
}

export const Route = createFileRoute("/api/ai-match-legal-sections")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const sections = (body.sections ?? []).slice(0, 400);
        if (sections.length === 0) {
          return new Response(
            JSON.stringify({ matches: [], detected_signals: [], missing_area: null, flags: {} }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        const sectionById = new Map(sections.map((s) => [s.id, s]));
        const validIds = new Set(sections.map((s) => s.id));

        // Fallkontext für die §-53-Relevanzprüfung.
        const contextText = [
          body.title ?? "",
          body.short_description ?? "",
          body.category ?? "",
          body.subcategory ?? "",
          body.recommendation ?? "",
          body.immediate_actions ?? "",
          body.responsibilities ?? "",
          (body.keywords ?? []).join(" "),
        ]
          .join(" ")
          .trim();
        const schulG53Relevant = hasSchulG53ContextSignals(contextText);

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Aufgabe: analysiere den Sachverhalt vollständig und ordne systematisch mehrere passende Rechtsabschnitte aus dem übergebenen Katalog zu.",
          "STRENG: Du darfst KEINE Rechtsgrundlagen erfinden. Verwende NUR IDs aus 'verfuegbare_rechtsgrundlagen'. Alles andere wird verworfen.",
          "SUCHSTRATEGIE (Ziel: mindestens drei belastbare Treffer, sofern fachlich vorhanden):",
          " 1) Primär: die unmittelbar einschlägige Norm.",
          " 2) Ergänzend: Verfahrensvorschriften (z. B. Anhörung, VwVfG), Zuständigkeits-, Dokumentations-, Datenschutz- oder Aufsichtsvorschriften.",
          " 3) Kontextuell: nur wenn sie einen tatsächlichen fachlichen Mehrwert besitzen.",
          "KEINE künstliche Auffüllung. Wenn weniger als drei Normen fachlich belastbar sind, gib nur so viele zurück, wie fachlich passen.",
          "§ 53 SchulG NRW ist KEIN Standard-Fallback. Ordne § 53 SchulG NRW ausschließlich zu, wenn der Sachverhalt fachlich einen der folgenden Bezüge hat: Fehlverhalten eines Schülers, erzieherische Einwirkungen, Ordnungsmaßnahmen, Verhältnismäßigkeit einer Maßnahme, Ausschluss vom Unterricht oder ähnliche Disziplinarreaktion. Keyword-Übereinstimmung allein reicht NICHT.",
          "Für jede Zuordnung: id, confidence (0-100), relevance_stars (1-5), relevance_tier ('primary' | 'supporting' | 'contextual'), signals (kurze Stichworte), reason (max. 2 Sätze, sachlich).",
          "Berücksichtige 'bestaetigte_muster' als schwaches Signal.",
          "Wenn du für einen erkennbaren Rechtsbereich keinen passenden Abschnitt findest, setze 'missing_area' auf einen kurzen Hinweis.",
          "Gib 'detected_signals' als flache Liste kurzer Begriffe zurück.",
        ].join(" ");

        const user = {
          sachverhalt: {
            title: body.title ?? "",
            short_description: body.short_description ?? "",
            category: body.category ?? "",
            subcategory: body.subcategory ?? "",
            bildungsgang: body.bildungsgang ?? "",
            recommendation: body.recommendation ?? "",
            immediate_actions: body.immediate_actions ?? "",
            responsibilities: body.responsibilities ?? "",
            keywords: body.keywords ?? [],
          },
          verfuegbare_rechtsgrundlagen: sections,
          bestaetigte_muster: body.confirmed_patterns ?? [],
          hinweise: {
            schulg_53_darf_zugeordnet_werden: schulG53Relevant,
            begruendung_schulg_53: schulG53Relevant
              ? "Sachverhalt enthält Signale für Fehlverhalten / Ordnungsmaßnahmen / erzieherische Einwirkungen."
              : "Sachverhalt enthält KEINE Signale für Fehlverhalten / Ordnungsmaßnahmen / erzieherische Einwirkungen. § 53 SchulG NRW NICHT zuordnen.",
            zielanzahl_rechtsgrundlagen: 3,
            keine_kuenstliche_auffuellung: true,
          },
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            matches: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  confidence: { type: "number" },
                  relevance_stars: { type: "number" },
                  relevance_tier: { type: "string", enum: ["primary", "supporting", "contextual"] },
                  signals: { type: "array", items: { type: "string" } },
                  reason: { type: "string" },
                },
                required: ["id", "confidence", "relevance_stars", "signals", "reason"],
              },
            },
            detected_signals: { type: "array", items: { type: "string" } },
            missing_area: { type: "string" },
          },
          required: ["matches", "detected_signals"],
        };

        let parsed: any;
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          const result = await provider.complete({
            model: "anthropic/claude-haiku-4-5",
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) },
            ],
            jsonSchema: { name: "legal_match", schema },
          });
          parsed = result.json;
        } catch (err) {
          if (err instanceof AIError) {
            return new Response(
              JSON.stringify({ error: err.userMessage, detail: err.detail }),
              { status: err.status ?? 500, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({ error: "AI-Antwort konnte nicht als JSON gelesen werden." }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        // Server-seitige Filterung: nur bekannte IDs, und §-53-Guard.
        let rejectedDefault53 = false;
        const cleanMatches = Array.isArray(parsed.matches)
          ? parsed.matches
              .filter((m: any) => m && typeof m.id === "string" && validIds.has(m.id))
              .filter((m: any) => {
                const sec = sectionById.get(m.id);
                if (!sec) return false;
                if (isSchulG53Section(sec) && !schulG53Relevant) {
                  rejectedDefault53 = true;
                  return false;
                }
                return true;
              })
              .map((m: any) => ({
                id: m.id,
                confidence: Math.max(0, Math.min(100, Number(m.confidence) || 0)),
                relevance_stars: Math.max(1, Math.min(5, Number(m.relevance_stars) || 1)),
                relevance_tier:
                  m.relevance_tier === "primary" || m.relevance_tier === "supporting" || m.relevance_tier === "contextual"
                    ? m.relevance_tier
                    : Number(m.relevance_stars) >= 4
                      ? "primary"
                      : Number(m.relevance_stars) >= 3
                        ? "supporting"
                        : "contextual",
                signals: Array.isArray(m.signals) ? m.signals.filter((s: any) => typeof s === "string").slice(0, 10) : [],
                reason: typeof m.reason === "string" ? m.reason.slice(0, 500) : "",
              }))
          : [];

        return new Response(
          JSON.stringify({
            matches: cleanMatches,
            detected_signals: Array.isArray(parsed.detected_signals)
              ? parsed.detected_signals.filter((s: any) => typeof s === "string").slice(0, 20)
              : [],
            missing_area: typeof parsed.missing_area === "string" ? parsed.missing_area : null,
            flags: {
              rejected_default_53: rejectedDefault53,
              schulg53_relevant: schulG53Relevant,
              target_min_sources: 3,
              coverage_gap: cleanMatches.length < 3,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
