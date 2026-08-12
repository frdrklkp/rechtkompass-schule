import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { hasSchulG53ContextSignals } from "./ai-match-legal-sections";

type ExistingLink = {
  id: string; // legal_section_id
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
  recommendation?: string;
  immediate_actions?: string;
  responsibilities?: string;
  legal_explanation?: string;
  keywords?: string[];
  existing_links?: ExistingLink[];
};

type Verdict = {
  id: string;
  relevance: "primary" | "supporting" | "context" | "irrelevant";
  confidence: number;
  reason: string;
};

function isSchulG53(sec: ExistingLink): boolean {
  const num = (sec.section_number ?? "").toLowerCase().replace(/\s+/g, "");
  const src = (sec.source_short ?? "").toLowerCase();
  return (num === "53" || num === "§53" || num === "n53") && /schulg/.test(src);
}

/**
 * Bewertet BESTEHENDE case_legal_links einzeln auf fachliche Relevanz
 * für den konkreten Sachverhalt. Ergebnis: pro Link ein Verdict, das die
 * zentrale Engine benutzt, um klar irrelevante Zuordnungen zu entfernen.
 * KEIN eigener § 53-Sonderpfad: § 53 wird nur mit gültigen Signalen
 * überhaupt als potenziell relevant eingestuft.
 */
export const Route = createFileRoute("/api/ai-reevaluate-legal-links")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const links = (body.existing_links ?? []).slice(0, 100);
        if (links.length === 0) {
          return new Response(JSON.stringify({ verdicts: [] }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        const validIds = new Set(links.map((l) => l.id));

        const contextText = [
          body.title ?? "",
          body.short_description ?? "",
          body.category ?? "",
          body.subcategory ?? "",
          body.recommendation ?? "",
          body.immediate_actions ?? "",
          body.responsibilities ?? "",
          body.legal_explanation ?? "",
          (body.keywords ?? []).join(" "),
        ].join(" ").trim();
        const schulG53Relevant = hasSchulG53ContextSignals(contextText);

        const system = [
          "Du bist juristischer Redaktionsassistent (RechtKompass Schule NRW).",
          "Aufgabe: Prüfe JEDE bestehende Rechtsgrundlagen-Zuordnung EINZELN auf fachliche Relevanz für DIESEN konkreten Sachverhalt.",
          "Frage nicht: 'Könnte diese Norm irgendwie zum Thema Schule passen?', sondern: 'Ist diese konkrete Rechtsgrundlage für diesen konkreten Sachverhalt fachlich entscheidungserheblich?'",
          "Rollen: 'primary' = unmittelbar entscheidungserheblich; 'supporting' = ergänzend relevant (Verfahren, Zuständigkeit, Dokumentation, Datenschutz); 'context' = rechtlicher Hintergrund ohne unmittelbare Erheblichkeit; 'irrelevant' = kein fachlicher Bezug zu diesem Sachverhalt.",
          "Confidence 0-100 gibt die Sicherheit deiner Einschätzung an (nicht die Wichtigkeit der Norm).",
          "§ 53 SchulG NRW: Nur relevant bei Fehlverhalten, erzieherischer Einwirkung, Ordnungsmaßnahme oder Verhältnismäßigkeit einer Maßnahme. Sonst 'irrelevant'.",
          "Keine Norm 'freundlich' bewerten. Wenn irrelevant, dann 'irrelevant' mit hoher Confidence und knapper Begründung.",
          "Verwende ausschließlich die übergebenen IDs.",
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
          },
          bestehende_zuordnungen: links,
          hinweise: {
            schulg_53_darf_relevant_sein: schulG53Relevant,
          },
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            verdicts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  relevance: { type: "string", enum: ["primary", "supporting", "context", "irrelevant"] },
                  confidence: { type: "number" },
                  reason: { type: "string" },
                },
                required: ["id", "relevance", "confidence", "reason"],
              },
            },
          },
          required: ["verdicts"],
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          const result = await provider.complete({
            model: "anthropic/claude-haiku-4-5",
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) },
            ],
            jsonSchema: { name: "reeval_legal", schema },
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

        const verdicts: Verdict[] = Array.isArray(parsed.verdicts)
          ? parsed.verdicts
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((v: any) => v && typeof v.id === "string" && validIds.has(v.id))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((v: any) => {
                const linkRef = links.find((l) => l.id === v.id);
                let relevance = v.relevance;
                if (!["primary", "supporting", "context", "irrelevant"].includes(relevance)) {
                  relevance = "context";
                }
                // Server-Guard: § 53 ohne Kontext → immer irrelevant.
                if (linkRef && isSchulG53(linkRef) && !schulG53Relevant) {
                  relevance = "irrelevant";
                }
                return {
                  id: v.id,
                  relevance,
                  confidence: Math.max(0, Math.min(100, Number(v.confidence) || 0)),
                  reason: typeof v.reason === "string" ? v.reason.slice(0, 500) : "",
                } as Verdict;
              })
          : [];

        // Alle bestehenden IDs, für die die KI kein Verdict geliefert hat,
        // NICHT als irrelevant behandeln (nur bewertet, was bewertet wurde).
        return new Response(
          JSON.stringify({ verdicts, flags: { schulg53_relevant: schulG53Relevant } }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
