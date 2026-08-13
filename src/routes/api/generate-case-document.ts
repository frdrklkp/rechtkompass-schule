import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";


type LegalSectionRef = {
  id: string;
  section_number: string | null;
  title: string | null;
  full_text: string | null;
  summary: string | null;
  practice_relevance: string | null;
  official_url: string | null;
  source_short: string | null;
  source_title: string | null;
};

type UsedSources = {
  case: { id: string; title: string };
  template: { id: string | null; title: string; body: string };
  legal_sections: Array<{
    id: string;
    label: string;
    official_url: string | null;
  }>;
  keywords: string[];
  missing: string[];
  fields_used: string[];
};

function coerceStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function coerceArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

export const Route = createFileRoute("/api/generate-case-document")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { case_id?: string; template_id?: string | null };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const caseId = body.case_id;
        if (!caseId) return new Response("case_id fehlt", { status: 400 });

        let supabase;
        try {
          const { createPublicSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          supabase = createPublicSupabase();
        } catch (err) {
          const message = err instanceof Error ? err.message : "unbekannter Fehler";
          console.error("[generate-case-document] Supabase-Client-Init fehlgeschlagen:", message);
          return new Response(
            JSON.stringify({
              error: "Der Dokumententwurf konnte derzeit nicht erstellt werden. Bitte versuchen Sie es erneut.",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }


        // 1. Praxisfall
        const { data: caseRowTyped, error: caseErr } = await supabase
          .from("practice_cases")
          .select("*")
          .eq("id", caseId)
          .maybeSingle();
        const caseRow: any = caseRowTyped;

        if (caseErr || !caseRow) {
          return new Response(
            JSON.stringify({ error: caseErr?.message ?? "Praxisfall nicht gefunden" }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        // 2. Vorlage
        let templateRow: any = null;
        if (body.template_id) {
          const r = await supabase
            .from("document_templates")
            .select("*")
            .eq("id", body.template_id)
            .maybeSingle();
          templateRow = r.data;
        }

        // 3. Rechtsgrundlagen via case_legal_links -> legal_sections -> legal_sources
        const { data: links } = await supabase
          .from("case_legal_links")
          .select("legal_section_id, explanation, relevance")
          .eq("case_id", caseId);
        const sectionIds = (links ?? [])
          .map((l: any) => l.legal_section_id)
          .filter((x: string | null): x is string => !!x);
        let sections: LegalSectionRef[] = [];
        if (sectionIds.length > 0) {
          const { data: secs } = await supabase
            .from("legal_sections")
            .select(
              "id, section_number, title, full_text, summary, practice_relevance, official_url, source_id",
            )
            .in("id", sectionIds);
          const sourceIds = Array.from(
            new Set((secs ?? []).map((s: any) => s.source_id).filter(Boolean)),
          ) as string[];
          const sourceMap = new Map<string, { short: string | null; title: string | null }>();
          if (sourceIds.length > 0) {
            const { data: srcs } = await supabase
              .from("legal_sources")
              .select("id, short_name, name")
              .in("id", sourceIds);
            (srcs ?? []).forEach((s: any) =>
              sourceMap.set(s.id, { short: s.short_name ?? null, title: s.name ?? null }),
            );
          }
          sections = (secs ?? []).map((s: any) => {
            const src = sourceMap.get(s.source_id) ?? { short: null, title: null };
            return {
              id: s.id,
              section_number: s.section_number,
              title: s.title,
              full_text: s.full_text,
              summary: s.summary,
              practice_relevance: s.practice_relevance,
              official_url: s.official_url,
              source_short: src.short,
              source_title: src.title,
            };
          });
        }

        // 4. Schlagwörter
        const { data: kwLinks } = await supabase
          .from("case_keywords")
          .select("keyword_id")
          .eq("case_id", caseId);
        const kwIds = (kwLinks ?? [])
          .map((l: any) => l.keyword_id)
          .filter((x: string | null): x is string => !!x);
        let keywords: string[] = [];
        if (kwIds.length > 0) {
          const { data: kws } = await supabase
            .from("keywords")
            .select("keyword")
            .in("id", kwIds);
          keywords = (kws ?? []).map((k: any) => k.keyword).filter(Boolean);
        }

        // 5. Fehlende Angaben bestimmen
        const missing: string[] = [];
        if (!coerceStr(caseRow.short_description)) missing.push("Sachverhalt nicht dokumentiert");
        if (!coerceStr(caseRow.recommendation)) missing.push("Handlungsempfehlung fehlt");
        if (!coerceStr(caseRow.immediate_actions)) missing.push("Sofortmaßnahmen fehlen");
        if (!coerceStr(caseRow.responsibilities)) missing.push("Zuständigkeiten fehlen");
        if (sections.length === 0) missing.push("Keine Rechtsgrundlage zugeordnet");
        if (keywords.length === 0) missing.push("Keine Schlagwörter zugeordnet");

        // 6. Prompt
        const templateBody = coerceStr(templateRow?.body) || "";
        const templateTitle = coerceStr(templateRow?.title) || "Fallspezifisches Dokument";

        const legalCatalog = sections.map((s) => {
          const label = [
            s.source_short ?? s.source_title ?? "",
            s.section_number ?? "",
            s.title ?? "",
          ]
            .filter(Boolean)
            .join(" ")
            .trim();
          return {
            id: s.id,
            label,
            summary: s.summary ?? "",
            practice_relevance: s.practice_relevance ?? "",
            official_url: s.official_url ?? "",
          };
        });

        const caseContext = {
          title: coerceStr(caseRow.title),
          category: coerceStr(caseRow.category),
          subcategory: coerceStr(caseRow.subcategory),
          short_description: coerceStr(caseRow.short_description),
          short_answer: coerceStr(caseRow.short_answer),
          immediate_actions: coerceStr(caseRow.immediate_actions),
          recommendation: coerceStr(caseRow.recommendation),
          legal_explanation: coerceStr(caseRow.legal_explanation),
          responsibilities: coerceStr(caseRow.responsibilities),
          practice_tip: coerceStr(caseRow.practice_tip),
          documentation_notes: coerceStr(caseRow.documentation_notes),
          checklist: Array.isArray(caseRow.checklist) ? caseRow.checklist : [],
          action_steps: Array.isArray(caseRow.action_steps) ? caseRow.action_steps : [],
          common_mistakes: coerceArr(caseRow.common_mistakes),
          documentation: coerceArr(caseRow.documentation),
          keywords,
        };

        const system = [
          "Du bist Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Aufgabe: erzeuge einen konkreten, bearbeitbaren Dokumententwurf für einen konkreten Praxisfall auf Basis einer vorgegebenen Dokumentvorlage.",
          "STRENGE REGELN:",
          "- Erfinde NIEMALS Tatsachen: keine Namen, Daten, Uhrzeiten, Orte, Zeugen, Kontaktdaten, Diagnosen.",
          "- Fehlende Angaben werden IMMER als eckiger Platzhalter markiert, z. B. [Datum ergänzen], [Beteiligte Personen ergänzen], [Uhrzeit ergänzen].",
          "- Rechtsgrundlagen NUR aus der Liste 'verfuegbare_rechtsgrundlagen'. Keine weiteren Paragraphen zitieren. Kein pauschales § 53 SchulG NRW.",
          "- Wenn keine passende Rechtsgrundlage vorhanden ist, verwende exakt: [Rechtsgrundlage nach fachlicher Prüfung ergänzen].",
          "- Strukturiere entlang der übergebenen Vorlagenstruktur. Ergänze KEINE Abschnitte, die nicht in der Vorlage stehen, es sei denn, die Vorlage ist leer.",
          "- Nutze vorhandene Fallangaben (Sachverhalt, Handlungsempfehlung, Sofortmaßnahmen, Zuständigkeiten) wörtlich oder sprachlich sauber paraphrasiert, aber ohne neue Tatsachen zu ergänzen.",
          "- Sprache: nüchtern, sachlich, verwaltungsdeutsch, ohne Wertungen.",
          "- Verwende KEINE Markdown-Formatierung (keine **, __, #, Backticks) - reiner Fließtext, wird unformatiert als reiner Text angezeigt.",
          "- Antworte NUR mit JSON gemäß Schema.",
        ].join("\n");

        const user = {
          vorlage: {
            titel: templateTitle,
            struktur: templateBody || "(keine Struktur vorgegeben – strukturiere sinnvoll für den Vorlagentitel)",
          },
          praxisfall: caseContext,
          verfuegbare_rechtsgrundlagen: legalCatalog,
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            placeholders: { type: "array", items: { type: "string" } },
            used_legal_section_ids: { type: "array", items: { type: "string" } },
            notes: { type: "string" },
          },
          required: ["title", "content", "placeholders", "used_legal_section_ids"],
        };

        const generationModel = "anthropic/claude-haiku-4-5";
        let parsed: any;
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          const result = await provider.complete({
            model: generationModel,
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) },
            ],
            jsonSchema: { name: "case_document", schema },
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

        // Nachbereitung + Grounding
        const validSectionIds = new Set(sections.map((s) => s.id));
        const usedIds = Array.isArray(parsed.used_legal_section_ids)
          ? parsed.used_legal_section_ids.filter(
              (x: unknown): x is string => typeof x === "string" && validSectionIds.has(x),
            )
          : [];

        const content = coerceStr(parsed.content).trim();
        const title = coerceStr(parsed.title).trim() || `${templateTitle} – ${caseContext.title}`;

        // Platzhalter aus dem Text extrahieren (alles in eckigen Klammern)
        const placeholderMatches = Array.from(content.matchAll(/\[([^\]]+)\]/g)).map((m) =>
          m[1].trim(),
        );
        const placeholders = Array.from(new Set(placeholderMatches));

        // Qualitätsprüfung
        const openIssues: string[] = [];
        if (placeholders.length > 0) openIssues.push(`Offene Platzhalter: ${placeholders.length}`);
        if (sections.length === 0) openIssues.push("Keine Rechtsgrundlage zugeordnet");
        if (missing.includes("Sachverhalt nicht dokumentiert"))
          openIssues.push("Sachverhalt im Praxisfall ergänzen");
        // Guard: verhindere frei erfundene Paragraphen jenseits der zugeordneten Sektionen.
        const paragraphMatches = Array.from(content.matchAll(/§\s*\d+[a-z]?/gi)).map((m) =>
          m[0].replace(/\s+/g, " "),
        );
        const allowedParagraphs = new Set(
          sections
            .map((s) => (s.section_number ?? "").replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .map((n) => n.toLowerCase()),
        );
        const unknownParagraphs = paragraphMatches
          .filter((p) => !allowedParagraphs.has(p.toLowerCase()))
          .slice(0, 5);
        if (unknownParagraphs.length > 0) {
          openIssues.push(
            `Nicht zugeordnete Paragraphen im Text: ${unknownParagraphs.join(", ")} – fachlich prüfen`,
          );
        }

        let quality: "green" | "yellow" | "red" = "green";
        if (openIssues.length > 0) quality = "yellow";
        if (
          sections.length === 0 ||
          unknownParagraphs.length > 0 ||
          missing.includes("Sachverhalt nicht dokumentiert")
        )
          quality = "red";

        const usedSources: UsedSources = {
          case: { id: caseRow.id, title: caseContext.title },
          template: {
            id: templateRow?.id ?? null,
            title: templateTitle,
            body: templateBody,
          },
          legal_sections: sections
            .filter((s) => usedIds.length === 0 || usedIds.includes(s.id))
            .map((s) => ({
              id: s.id,
              label: [s.source_short ?? "", s.section_number ?? "", s.title ?? ""]
                .filter(Boolean)
                .join(" ")
                .trim(),
              official_url: s.official_url,
            })),
          keywords,
          missing,
          fields_used: Object.entries(caseContext)
            .filter(([, v]) => (typeof v === "string" ? v.length > 0 : Array.isArray(v) ? v.length > 0 : false))
            .map(([k]) => k),
        };

        return new Response(
          JSON.stringify({
            title,
            content,
            quality,
            open_issues: openIssues,
            placeholders,
            used_sources: usedSources,
            generation_metadata: {
              model: generationModel,
              generated_at: new Date().toISOString(),
              template_id: templateRow?.id ?? null,
              used_legal_section_ids: usedIds,
              unknown_paragraphs_in_text: unknownParagraphs,
              notes: coerceStr(parsed.notes),
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
