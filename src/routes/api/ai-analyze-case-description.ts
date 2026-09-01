/**
 * Fall-schildern-Neubau 2026-09-01: Ein Endpunkt trägt den ganzen leichten
 * Prozess "Schildern -> maximal 3 Rückfragen -> klares Ergebnis".
 *
 * Runde 0: freie Schilderung analysieren; NUR wenn eine entscheidungs-
 * erhebliche Information fehlt, bis zu 3 gezielte Rückfragen stellen
 * (status "needs_clarification"), sonst sofort Treffer liefern.
 * Runde >= 1 (Rückfragen beantwortet): MUSS mit status "ready" enden.
 *
 * Kandidaten werden serverseitig aus den veröffentlichten Praxisfällen
 * geladen und lexikalisch auf die Top-Auswahl vorgefiltert (gleiche Idee
 * wie filterRelevantSections in ai-draft-batch-item.ts); die KI wählt
 * daraus ausschließlich echte IDs (kein Erfinden von Treffern).
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";
import { createServiceSupabase } from "@/lib/searchEmbeddings.supabase.server";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { completeWithValidation, CompletionValidationError } from "@/services/editorial/ai/runtime/completionGuard";

const MIN_DESCRIPTION_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CANDIDATES = 40;
const MIN_SIMILARITY = 40;

type Clarification = { question: string; answer: string };

type RequestBody = {
  description?: string;
  clarifications?: Clarification[];
  round?: number;
};

type CandidateRow = {
  id: string;
  title: string;
  short_description: string | null;
  short_answer: string | null;
  category: string | null;
  subcategory: string | null;
  traffic_light: string | null;
  ampel: string | null;
};

/** traffic_light speichert teils englische Werte (yellow/green/red) - auf die Frontend-Ampel normalisieren. */
function normalizeAmpel(value: string | null): string | null {
  if (!value) return null;
  const map: Record<string, string> = { green: "gruen", yellow: "gelb", red: "rot" };
  return map[value] ?? value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9§\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4);
}

/** Lexikalischer Vorfilter: Token-Überlappung Schilderung vs. Fall-Metadaten. */
function prefilterCandidates(rows: CandidateRow[], queryText: string): CandidateRow[] {
  const queryTokens = new Set(tokenize(queryText));
  if (queryTokens.size === 0) return rows.slice(0, MAX_CANDIDATES);
  const scored = rows.map((row) => {
    const hay = [
      row.title,
      row.short_description ?? "",
      row.short_answer ?? "",
      row.category ?? "",
      row.subcategory ?? "",
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
      if (hay.includes(token)) score += 1;
    }
    return { row, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .filter((s) => s.score > 0)
    .map((s) => s.row);
}

export const Route = createFileRoute("/api/ai-analyze-case-description")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return jsonResponse({ error: "Ungültiges JSON" }, 400);
        }

        const description = (body.description ?? "").trim();
        if (description.length < MIN_DESCRIPTION_LENGTH) {
          return jsonResponse(
            { error: `Die Schilderung muss mindestens ${MIN_DESCRIPTION_LENGTH} Zeichen umfassen.` },
            400,
          );
        }
        if (description.length > MAX_DESCRIPTION_LENGTH) {
          return jsonResponse(
            { error: `Die Schilderung darf höchstens ${MAX_DESCRIPTION_LENGTH} Zeichen umfassen.` },
            400,
          );
        }
        const round = Math.max(0, Math.min(2, Number(body.round) || 0));
        const clarifications = (body.clarifications ?? [])
          .filter((c) => c && typeof c.question === "string" && typeof c.answer === "string")
          .slice(0, 3)
          .map((c) => ({ question: c.question.slice(0, 300), answer: c.answer.slice(0, 300) }));

        const service = createServiceSupabase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rows, error: loadError } = await (service as any)
          .from("practice_cases")
          .select(
            "id, title, short_description, short_answer, category, subcategory, traffic_light, ampel",
          )
          .eq("workflow_status", "published");
        if (loadError) {
          return jsonResponse({ error: "Praxisfälle konnten nicht geladen werden." }, 500);
        }

        const clarificationText = clarifications.map((c) => `${c.question} ${c.answer}`).join(" ");
        const candidates = prefilterCandidates(
          (rows ?? []) as CandidateRow[],
          `${description} ${clarificationText}`,
        );
        const validIds = new Set(candidates.map((c) => c.id));

        const system = [
          "Du bist der Einstiegsassistent des RechtKompass Schule (Berufskolleg, NRW).",
          "Eine Lehrkraft schildert einen Vorfall in eigenen Worten. Deine Aufgabe in EINEM Durchgang:",
          "1) Verstehe die Schilderung und fasse sie in 1-2 nüchternen Sätzen zusammen (summary).",
          "2) Ordne ein Themenfeld zu (category_guess, kurz).",
          "3) Prüfe, ob unter 'kandidaten' passende Praxisfälle sind. STRENG: nur IDs aus der Liste, nichts erfinden. Maximal 3 Treffer, similarity 0-100, reason max. 2 Sätze in Ansprache 'Ihr Fall ...'.",
          round === 0
            ? "4) NUR WENN eine Information fehlt, die ENTSCHEIDET, welcher Fall bzw. welche rechtliche Einordnung passt (z.B. Minderjährigkeit, Beteiligung des Ausbildungsbetriebs, einmalig vs. wiederholt), stelle bis zu 3 Rückfragen (status 'needs_clarification', je Frage 2-4 knappe Antwortoptionen). Ist die Schilderung auch ohne diese Information gut zuzuordnen, stelle KEINE Rückfragen und liefere sofort status 'ready' mit Treffern. Frage NIE nach Details, die nur für eine Dokumentation interessant wären (Datum, Uhrzeit, Namen, Zeugen, Nachweise)."
            : "4) Die Rückfragen wurden beantwortet (siehe 'rueckfragen_beantwortet'). Du MUSST jetzt status 'ready' liefern und darfst KEINE weiteren Rückfragen stellen. Antworten wie 'Weiß nicht' sind hinzunehmen; ordne dann nach bestem verfügbaren Stand zu.",
          "Wenn kein Kandidat wirklich passt (similarity unter 40), liefere status 'ready' mit leerer matches-Liste - das ist ein ehrliches, gültiges Ergebnis.",
        ].join(" ");

        const user = {
          schilderung: description,
          rueckfragen_beantwortet: clarifications,
          kandidaten: candidates.map((c) => ({
            id: c.id,
            title: c.title,
            short_description: c.short_description ?? "",
            category: c.category ?? "",
            subcategory: c.subcategory ?? "",
          })),
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["needs_clarification", "ready"] },
            summary: { type: "string" },
            category_guess: { type: "string" },
            clarifying_questions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  question: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                },
                required: ["id", "question", "options"],
              },
            },
            matches: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  similarity: { type: "number" },
                  reason: { type: "string" },
                },
                required: ["id", "similarity", "reason"],
              },
            },
          },
          required: ["status", "summary", "category_guess", "clarifying_questions", "matches"],
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          parsed = await completeWithValidation(
            async () => {
              const result = await provider.complete({
                model: "anthropic/claude-haiku-4-5",
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: JSON.stringify(user) },
                ],
                jsonSchema: { name: "case_description_analysis", schema },
                maxTokens: 4000,
              });
              return result.json;
            },
            schema,
          );
        } catch (err) {
          if (err instanceof CompletionValidationError) {
            return jsonResponse(
              { error: "Die KI-Antwort war fehlerhaft strukturiert (auch nach Wiederholung).", detail: err.errors.join("; ") },
              502,
            );
          }
          if (err instanceof AIError) {
            return jsonResponse({ error: err.userMessage, detail: err.detail }, err.status ?? 500);
          }
          return jsonResponse({ error: "Die KI-Antwort konnte nicht gelesen werden." }, 502);
        }

        // Nach Runde 0 sind keine weiteren Rückfragen mehr zulässig.
        const askedEnough = round >= 1;
        const clarifyingQuestions =
          parsed.status === "needs_clarification" && !askedEnough
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (parsed.clarifying_questions as any[])
                .filter((q) => q && typeof q.question === "string")
                .slice(0, 3)
                .map((q, i) => ({
                  id: typeof q.id === "string" && q.id ? q.id : `frage-${i + 1}`,
                  question: q.question.slice(0, 300),
                  options: (Array.isArray(q.options) ? q.options : [])
                    .filter((o: unknown) => typeof o === "string" && (o as string).trim())
                    .slice(0, 4)
                    .map((o: string) => o.slice(0, 120)),
                }))
                .filter((q) => q.options.length >= 2)
            : [];

        const byId = new Map(candidates.map((c) => [c.id, c]));
        const matches = (Array.isArray(parsed.matches) ? parsed.matches : [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((m: any) => m && typeof m.id === "string" && validIds.has(m.id))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((m: any) => {
            const ref = byId.get(m.id)!;
            return {
              id: m.id,
              similarity: Math.max(0, Math.min(100, Math.round(Number(m.similarity) || 0))),
              reason: typeof m.reason === "string" ? m.reason.slice(0, 400) : "",
              title: ref.title,
              short_answer: ref.short_answer ?? "",
              category: ref.category ?? "",
              subcategory: ref.subcategory ?? "",
              // traffic_light ist kanonisch, ampel nur Fallback (siehe casesFromDb.ts).
              ampel: normalizeAmpel(ref.traffic_light ?? ref.ampel ?? null),
            };
          })
          .filter((m: { similarity: number }) => m.similarity >= MIN_SIMILARITY)
          .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
          .slice(0, 3);

        return jsonResponse({
          status: clarifyingQuestions.length > 0 ? "needs_clarification" : "ready",
          summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 500) : "",
          category_guess: typeof parsed.category_guess === "string" ? parsed.category_guess.slice(0, 120) : "",
          clarifying_questions: clarifyingQuestions,
          matches,
        });
      },
    },
  },
});
