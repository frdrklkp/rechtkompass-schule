import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { parseCuratedTree, validateCuratedTree } from "@/lib/decisionTree";

/**
 * KI-Entwurfsmaschine für fallspezifische Entscheidungsbäume.
 *
 * Nutzt dieselbe Infrastruktur wie ai-refine-case-field / ai-draft-case:
 * - Anthropic direkt via AIProviderFactory (anthropic/claude-haiku-4-5)
 * - JSON-Schema-basierte Antwort
 * - Reine Wiederverwendung bereits kuratierter Fallinformationen
 *
 * Rückgabe: rohes CuratedDecisionTree-JSON (start/steps/results/meta).
 * Es wird KEIN Datensatz verändert; die Übernahme liegt beim Redakteur.
 *
 * ZWEI KI-Aufrufe statt einem (Fund 2026-08-13): claude-haiku-4-5 (wie auch
 * sonnet-5/opus-5, siehe AIModelRegistry.ts) ist bei diesem Provider fest
 * auf maxOutputTokens=8192 begrenzt - das reichte selbst nach Anhebung von
 * 4096 auf 8192 nicht für komplexere Bäume (6-7 verzweigte Fragen): "steps"
 * allein füllte das Budget, "results" (später im Schema) fehlte komplett.
 * Da 8192 das echte Modell-Maximum ist, hilft ein höherer Wert nicht -
 * stattdessen wird die Generierung aufgeteilt: Aufruf 1 erzeugt nur
 * start+steps+meta, Aufruf 2 erzeugt results NUR für die in Aufruf 1
 * tatsächlich referenzierten Ergebnis-Schlüssel (dynamisch erzwungenes
 * Schema). Beide Aufrufe bleiben so unabhängig von der Baumgröße
 * komfortabel im Budget.
 *
 * Beobachtete Modell-Unzuverlässigkeit nach der Aufteilung (Testläufe
 * 2026-08-13, ca. 1 von 3 Versuchen betroffen): (a) Aufruf 2 liefert
 * "results" gelegentlich als JSON-kodierten String statt als verschachteltes
 * Objekt, obwohl das Tool-Schema ein Objekt verlangt; (b) Aufruf 1 setzt
 * "start" gelegentlich auf den Fragetext statt auf den Step-Schlüssel.
 * Beides sind reine Modell-Ausrutscher, kein struktureller Fehler des
 * Aufteilungs-Ansatzes - bis zu drei Versuche mit vollständiger
 * Baum-Validierung (parseCuratedTree + validateCuratedTree) vor der Rückgabe
 * fangen das zuverlässig ab.
 */

type RequestBody = {
  caseRow?: Record<string, unknown>;
  extraContext?: {
    legalBasis?: string[];
    knowledge?: string[];
  };
};

const STEP_SCHEMA_PROPS = {
  question: { type: "string" },
  explanation: { type: "string" },
  options: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { type: "string" },
        next: { type: "string" },
        result: { type: "string" },
      },
      required: ["label"],
    },
  },
} as const;

const RESULT_SCHEMA_PROPS = {
  title: { type: "string" },
  color: { type: "string", enum: ["gruen", "gelb", "rot"] },
  urgency: { type: "string" },
  recommendation: { type: "string" },
  responsible: { type: "string" },
  documentation: { type: "string" },
  warning: { type: "string" },
  steps: { type: "array", items: { type: "string" } },
} as const;
const RESULT_REQUIRED = [
  "title",
  "color",
  "urgency",
  "recommendation",
  "responsible",
  "documentation",
  "warning",
  "steps",
];

function jsonError(status: number, message: string, detail?: unknown) {
  return new Response(JSON.stringify({ error: message, detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Sammelt alle in step.options[].result referenzierten Ergebnis-Schlüssel. */
function collectResultKeys(steps: Record<string, { options?: Array<{ result?: string }> }>): string[] {
  const keys = new Set<string>();
  for (const step of Object.values(steps)) {
    for (const opt of step.options ?? []) {
      if (opt.result) keys.add(opt.result);
    }
  }
  return [...keys];
}

type Fall = Record<string, unknown>;

/**
 * Ein einzelner Generierungsversuch (beide KI-Aufrufe). Wirft AIError bei
 * Provider-Fehlern; das Ergebnis ist ansonsten roh und ungeprüft - Aufrufer
 * validiert per parseCuratedTree/validateCuratedTree.
 */
async function generateOnce(
  fall: Fall,
  rechtsgrundlagen: string[],
  wissenskarten: string[],
): Promise<Record<string, unknown>> {
  const provider = AIProviderFactory.get("anthropic-native");

  // ---- Aufruf 1: start + steps + meta ----
  const systemSteps = [
    "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
    "Du erzeugst den FRAGE-TEIL eines redaktionellen ENTWURFS eines fallspezifischen Entscheidungsbaums.",
    "Nutze ausschließlich die übergebenen Fallinformationen. Keine Internetrecherche.",
    "Erfinde KEINE Rechtsgrundlagen, KEINE Fakten, KEINE Zuständigkeiten außerhalb der Vorlage.",
    "Sprache: Deutsch, sachlich, klar, handlungsleitend, keine Rechtsberatung.",
    "Der Baum enthält 3–6 Fragen und ist maximal 4 Ebenen tief.",
    "Jede Frage MUSS eine echte fachliche Sachverhaltsvariante dieses konkreten Falls unterscheiden.",
    "Antworten dürfen sich nicht nur sprachlich, sondern müssen sich inhaltlich unterscheiden.",
    "Das Feld 'start' MUSS exakt einem Schlüssel im 'steps'-Objekt entsprechen (z.B. 'frage_1'), NIEMALS der Fragetext selbst.",
    "Jeder Pfad muss in einem Ergebnis enden (Feld 'result' bei der letzten Antwortoption eines Pfades) - NICHT den Ergebnisinhalt selbst ausformulieren, nur einen kurzen, sprechenden Ergebnis-Schlüssel wie 'ergebnis_rot_eskalation' vergeben. Die Ergebnisinhalte werden in einem separaten Schritt erzeugt.",
    "Verschiedene Pfade mit fachlich unterschiedlichem Ausgang bekommen unterschiedliche Ergebnis-Schlüssel.",
    "Verbotene generische Fragen (nicht verwenden): 'Wurde dokumentiert?', 'Besteht Handlungsbedarf?', 'Ist die Situation wichtig?', 'Benötigen Sie Hilfe?', 'Möchten Sie fortfahren?'.",
    "Keine Ja/Nein-Fragen ohne fachliche Relevanz. Keine bloße Wiederholung der Kurzantwort oder der Do's.",
    "Antworte AUSSCHLIESSLICH als JSON gemäß Schema. Keine Erklärungen außerhalb des JSON.",
  ].join(" ");

  const userSteps = {
    fall,
    rechtsgrundlagen,
    wissenskarten,
    hinweis:
      "Erzeuge den Frage-Teil (start, steps) eines fallspezifischen Entscheidungsbaums als JSON. Setze meta.status='draft' und meta.version=1.",
  };

  const stepsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      start: { type: "string" },
      steps: {
        type: "object",
        additionalProperties: {
          type: "object",
          additionalProperties: false,
          properties: STEP_SCHEMA_PROPS,
          required: ["question", "options"],
        },
      },
      meta: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", enum: ["draft"] },
          version: { type: "number" },
        },
        required: ["status", "version"],
      },
    },
    required: ["start", "steps", "meta"],
  };

  let stepsResult: { start: string; steps: Record<string, { options?: Array<{ result?: string }> }>; meta: unknown };
  try {
    const result = await provider.complete({
      model: "anthropic/claude-haiku-4-5",
      messages: [
        { role: "system", content: systemSteps },
        { role: "user", content: JSON.stringify(userSteps) },
      ],
      jsonSchema: { name: "curated_decision_tree_steps", schema: stepsSchema },
      maxTokens: 8192,
    });
    stepsResult = result.json as typeof stepsResult;
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw new AIError({
      code: "invalid_response",
      userMessage: "AI-Antwort (Fragen) konnte nicht als JSON gelesen werden.",
    });
  }

  // Verteidigung gegen beobachtetes Modellverhalten: "start" zeigt auf den
  // Fragetext eines Steps statt auf dessen Schlüssel. Wenn eindeutig genau
  // ein Step-Eintrag mit passender question existiert, korrigieren wir
  // still statt den ganzen (teuren) Versuch zu verwerfen.
  if (!stepsResult.steps[stepsResult.start]) {
    const match = Object.entries(stepsResult.steps).find(
      ([, step]) => (step as { question?: string }).question === stepsResult.start,
    );
    if (match) stepsResult.start = match[0];
  }

  const resultKeys = collectResultKeys(stepsResult.steps);
  if (resultKeys.length === 0) {
    // Baum ohne jeden Endknoten - Validierung im Aufrufer markiert das
    // korrekt als unvollständig statt eine leere KI-Anfrage für Aufruf 2 zu
    // riskieren.
    return { ...stepsResult, results: {} };
  }

  // ---- Aufruf 2: results NUR für die referenzierten Schlüssel ----
  const systemResults = [
    "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
    "Du erzeugst den ERGEBNIS-TEIL eines redaktionellen ENTWURFS eines fallspezifischen Entscheidungsbaums.",
    "Der Frage-Teil (Fragen und Pfade) wurde bereits erzeugt und wird dir als Kontext mitgegeben.",
    "Erzeuge für JEDEN genannten Ergebnis-Schlüssel einen eigenständigen, inhaltlich unterschiedlichen Ergebnis-Eintrag, passend zu dem Pfad, der zu diesem Schlüssel führt.",
    "Nutze ausschließlich die übergebenen Fallinformationen. Keine Internetrecherche. Erfinde KEINE Rechtsgrundlagen, KEINE Fakten, KEINE Zuständigkeiten außerhalb der Vorlage.",
    "Sprache: Deutsch, sachlich, klar, handlungsleitend, keine Rechtsberatung.",
    "Ergebnisse enthalten unterschiedliche Empfehlungen und unterschiedliche Warnhinweise je nach Pfad.",
    "Ergebnis-Farben: 'gruen' (Routine), 'gelb' (erhöhte Sorgfalt), 'rot' (Eskalation/Meldung).",
    "Antworte AUSSCHLIESSLICH als JSON gemäß Schema, wobei jeder Ergebnis-Schlüssel direkt als Objekt eingebettet ist - niemals als String oder als erneut JSON-kodierter Text.",
  ].join(" ");

  const userResults = {
    fall,
    rechtsgrundlagen,
    wissenskarten,
    entscheidungsbaum_fragen: { start: stepsResult.start, steps: stepsResult.steps },
    benoetigte_ergebnis_schluessel: resultKeys,
    hinweis: `Erzeuge genau ein Ergebnis-Objekt für jeden der ${resultKeys.length} genannten Ergebnis-Schlüssel.`,
  };

  const resultsProperties: Record<string, unknown> = {};
  for (const key of resultKeys) {
    resultsProperties[key] = {
      type: "object",
      additionalProperties: false,
      properties: RESULT_SCHEMA_PROPS,
      required: RESULT_REQUIRED,
    };
  }
  const resultsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      results: {
        type: "object",
        additionalProperties: false,
        properties: resultsProperties,
        required: resultKeys,
      },
    },
    required: ["results"],
  };

  let resultsResult: { results: unknown };
  try {
    const result = await provider.complete({
      model: "anthropic/claude-haiku-4-5",
      messages: [
        { role: "system", content: systemResults },
        { role: "user", content: JSON.stringify(userResults) },
      ],
      jsonSchema: { name: "curated_decision_tree_results", schema: resultsSchema },
      maxTokens: 8192,
    });
    resultsResult = result.json as typeof resultsResult;
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw new AIError({
      code: "invalid_response",
      userMessage: "AI-Antwort (Ergebnisse) konnte nicht als JSON gelesen werden.",
    });
  }

  // Verteidigung gegen beobachtetes Modellverhalten: "results" kommt
  // gelegentlich als JSON-kodierter String statt als Objekt zurück.
  let results: Record<string, unknown> = {};
  if (typeof resultsResult.results === "string") {
    try {
      results = JSON.parse(resultsResult.results);
    } catch {
      results = {};
    }
  } else if (resultsResult.results && typeof resultsResult.results === "object") {
    results = resultsResult.results as Record<string, unknown>;
  }

  return {
    start: stepsResult.start,
    steps: stepsResult.steps,
    results,
    meta: stepsResult.meta,
  };
}

const MAX_ATTEMPTS = 3;

export const Route = createFileRoute("/api/ai-draft-decision-tree")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const caseRow = body.caseRow ?? {};
        const extra = body.extraContext ?? {};

        const fall: Fall = {
          title: caseRow.title,
          category: caseRow.category,
          subcategory: caseRow.subcategory,
          short_description: caseRow.short_description,
          short_answer: caseRow.short_answer,
          immediate_actions: caseRow.immediate_actions,
          recommendation: caseRow.recommendation,
          responsibilities: caseRow.responsibilities,
          practice_tip: caseRow.practice_tip,
          common_mistakes: caseRow.common_mistakes,
          checklist: caseRow.checklist,
          documentation: caseRow.documentation,
          legal_explanation: caseRow.legal_explanation,
          faq: caseRow.faq,
        };
        const rechtsgrundlagen = extra.legalBasis ?? [];
        const wissenskarten = extra.knowledge ?? [];

        let lastTree: Record<string, unknown> | null = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const tree = await generateOnce(fall, rechtsgrundlagen, wissenskarten);
            lastTree = tree;
            const parsed = parseCuratedTree(tree);
            const valid = !!parsed && Object.keys(parsed.results).length > 0 && validateCuratedTree(parsed).valid;
            if (valid) {
              return new Response(JSON.stringify({ tree }), {
                headers: { "Content-Type": "application/json" },
              });
            }
          } catch (err) {
            if (err instanceof AIError) {
              if (attempt === MAX_ATTEMPTS) {
                return jsonError(err.status ?? 500, err.userMessage, err.detail);
              }
              continue;
            }
            if (attempt === MAX_ATTEMPTS) {
              return jsonError(502, "KI-Antwort konnte nicht verarbeitet werden.");
            }
          }
        }

        // Alle Versuche erschöpft: bestmöglichen (letzten) Baum zurückgeben,
        // damit der Aufrufer wenigstens den Frage-Teil sieht statt eines
        // Hard-Fails - Validierung/Anzeige im Client markiert ihn korrekt
        // als unvollständig.
        return new Response(JSON.stringify({ tree: lastTree ?? {} }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
