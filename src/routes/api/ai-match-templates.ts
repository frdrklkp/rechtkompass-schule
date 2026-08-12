import { createFileRoute } from "@tanstack/react-router";

type TemplateRef = {
  id: string;
  title: string;
  type?: string;
  description?: string;
};

type RequestBody = {
  title?: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  recommendation?: string;
  immediate_actions?: string;
  responsibilities?: string;
  legal_explanation?: string;
  keywords?: string[];
  legal_sections?: Array<{ source_short?: string; section_number?: string; title?: string }>;
  templates?: TemplateRef[];
  already_linked?: string[];
};

export const Route = createFileRoute("/api/ai-match-templates")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const templates = (body.templates ?? []).slice(0, 300);
        if (templates.length === 0) {
          return new Response(JSON.stringify({ matches: [], missing_area: null }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        const validIds = new Set(templates.map((t) => t.id));
        const linked = new Set((body.already_linked ?? []).map((x) => x));

        const system = [
          "Du bist Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Aufgabe: ordne dem Praxisfall passende Dokumentvorlagen aus dem Katalog zu.",
          "STRENG: verwende ausschließlich IDs aus 'verfuegbare_vorlagen'. Keine erfundenen Vorlagen.",
          "Bewerte den tatsächlichen Einsatzzweck (Gesprächsprotokoll, Aktennotiz, Elterninformation, Anhörung, Meldung, Ordnungsmaßnahme, Unfallmeldung, Datenschutz).",
          "Je Vorschlag: id, confidence (0-100 ganzzahlig), reason (max. 2 Sätze), signals (kurze Stichworte aus dem Sachverhalt).",
          "Nur wirklich passende Vorlagen (typisch 1-4). Konfidenz nur hoch, wenn Handlungsempfehlung oder Sofortmaßnahmen die Vorlage zwingend nahelegen.",
          "Wenn eine typische Vorlage fehlt, setze 'missing_area' auf kurzen Hinweis (z. B. 'Datenschutzmeldung fehlt im Katalog').",
        ].join(" ");

        const user = {
          sachverhalt: {
            title: body.title ?? "",
            short_description: body.short_description ?? "",
            category: body.category ?? "",
            subcategory: body.subcategory ?? "",
            recommendation: body.recommendation ?? "",
            immediate_actions: body.immediate_actions ?? "",
            responsibilities: body.responsibilities ?? "",
            legal_explanation: body.legal_explanation ?? "",
            keywords: body.keywords ?? [],
            rechtsgrundlagen: body.legal_sections ?? [],
          },
          verfuegbare_vorlagen: templates,
          bereits_zugeordnet: body.already_linked ?? [],
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
                  reason: { type: "string" },
                  signals: { type: "array", items: { type: "string" } },
                },
                required: ["id", "confidence", "reason", "signals"],
              },
            },
            missing_area: { type: "string" },
          },
          required: ["matches"],
        };

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: "template_match", strict: false, schema },
            },
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          return new Response(
            JSON.stringify({ error: `AI Gateway ${res.status}: ${text.slice(0, 500)}` }),
            { status: res.status, headers: { "Content-Type": "application/json" } },
          );
        }

        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = json.choices?.[0]?.message?.content ?? "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch {
          return new Response(
            JSON.stringify({ error: "AI-Antwort konnte nicht als JSON gelesen werden.", raw: content }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        const cleaned = Array.isArray(parsed.matches)
          ? parsed.matches
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((m: any) => m && typeof m.id === "string" && validIds.has(m.id))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((m: any) => ({
                id: m.id,
                confidence: Math.max(0, Math.min(100, Number(m.confidence) || 0)),
                reason: typeof m.reason === "string" ? m.reason.slice(0, 400) : "",
                signals: Array.isArray(m.signals)
                  ? m.signals.filter((s: unknown) => typeof s === "string").slice(0, 8)
                  : [],
                already_linked: linked.has(m.id),
              }))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .sort((a: any, b: any) => b.confidence - a.confidence)
          : [];

        return new Response(
          JSON.stringify({
            matches: cleaned,
            missing_area: typeof parsed.missing_area === "string" ? parsed.missing_area : null,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
