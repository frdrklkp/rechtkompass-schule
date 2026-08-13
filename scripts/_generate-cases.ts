/**
 * Server-seitiges Batch-Skript für die KI-Entwurfsmaschine.
 *
 * Repliziert 1:1 die Logik aus admin.ki-entwurfsmaschine.index.tsx
 * (runBatch), aber headless per Skript statt über die Admin-UI, damit
 * Hunderte Fälle ohne manuelle Klicks erzeugt werden können.
 *
 * Erreicht "echte" Adminrechte (assertAdminWrite/RLS/SECURITY-DEFINER-RPCs)
 * über einen Magic-Link, den wir uns per Service-Role selbst ausstellen -
 * kein Passwort wird je eingegeben oder gesehen, aber die Session ist eine
 * ECHTE Supabase-Auth-Session für das bestehende Test-Admin-Konto.
 *
 * Aufruf: bun run scripts/_generate-cases.ts <anzahl> [--dry]
 */

// --- Browser-Polyfills, bevor irgendein @/lib-Modul importiert wird ---
(globalThis as any).window = globalThis;
const _store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => _store.get(k) ?? null,
  setItem: (k: string, v: string) => { _store.set(k, v); },
  removeItem: (k: string) => { _store.delete(k); },
  clear: () => { _store.clear(); },
  key: (i: number) => [..._store.keys()][i] ?? null,
  get length() { return _store.size; },
};

// Bibliotheks-Code wie caseMatching.ts/legalMatching.engine.ts ruft intern
// relative URLs ("/api/ai-match-templates") - im Browser relativ zur
// aktuellen Seite, in Bun ohne Basis-URL ungültig ("fetch() URL is invalid").
// Globalen fetch so umbiegen, dass er relative Pfade gegen den Dev-Server auflöst.
const _API_ORIGIN = "http://127.0.0.1:8080";
const _origFetch = globalThis.fetch.bind(globalThis);
(globalThis as any).fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === "string" && input.startsWith("/")) {
    return _origFetch(_API_ORIGIN + input, init);
  }
  return _origFetch(input as any, init);
};

import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "admin@rechtkompass.local";
const API_BASE = "http://127.0.0.1:8080";
const TARGET = Number(process.argv[2] ?? 10);
const DRY = process.argv.includes("--dry");
const IDEAS_PER_BATCH = 15;

async function bootstrapSession(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
  if (error) throw new Error(`generateLink fehlgeschlagen: ${error.message}`);

  const { supabase } = await import("../src/integrations/supabase/client");
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: data.properties!.hashed_token,
    type: "magiclink",
  });
  if (verifyErr) throw new Error(`verifyOtp fehlgeschlagen: ${verifyErr.message}`);

  const { canWrite } = await import("../src/lib/adminAuth");
  for (let i = 0; i < 25; i++) {
    if (canWrite()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Admin-Session nach 5s nicht bereit (canWrite() blieb false)");
}

type Idea = { title: string; sketch: string; topic?: string };
type BatchDraft = Record<string, unknown> & {
  title?: string;
  category?: string;
  keyword_ids?: string[];
  keyword_hints?: string[];
  template_ids?: string[];
  legal_links?: Array<{ legal_section_id: string; relevance?: "low" | "medium" | "high"; explanation?: string }>;
};

/**
 * Anthropics erzwungenes Tool-Use-JSON hält sich nicht 100% zuverlässig an
 * Array-Felder im Schema (Fund beim Testlauf, 2026-08-13: "checklist" kam
 * gelegentlich als String statt als Array zurück) - defensiv normalisieren
 * statt blind .filter()/.join() auf einem möglicherweise falschen Typ aufzurufen.
 */
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (typeof v === "string" && v.trim()) return v.split(/\r?\n/).map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
  return [];
}

const TOPICS = [
  "Datenschutz", "Ordnungsmaßnahmen", "Prüfungen", "Fehlzeiten", "Elternkommunikation",
  "Gewalt", "Mobbing", "KI im Unterricht", "Klassenfahrten", "Aufsicht",
  "Leistungsbewertung", "Berufskolleg allgemein",
];

async function main() {
  console.log(`Bootstrapping Admin-Session (${ADMIN_EMAIL})...`);
  await bootstrapSession();
  console.log("Session bereit.\n");

  const {
    createCase, createKeyword, listCategories, listKeywords, listTemplates, listSections, listCases, updateCase,
  } = await import("../src/lib/coreBuilder");
  const { completePracticeCase } = await import("../src/lib/casePipeline.completion");
  const { computeCompleteness } = await import("../src/lib/caseCompleteness");
  const { findSimilar } = await import("../src/lib/caseSimilarity");
  const { EditorialWorkflowService } = await import("../src/services/editorial/EditorialWorkflowService");

  console.log("Lade Wissensbasis...");
  const [cats, kws, tmpls, secs, cases] = await Promise.all([
    listCategories(), listKeywords(), listTemplates(), listSections(), listCases(),
  ]);
  const publishedSecs = (secs as Array<Record<string, unknown>>).filter(
    (s) => (s.status ?? "published") === "published" || s.status === undefined,
  );
  const kwByName = new Map(kws.map((k) => [k.keyword.toLowerCase(), k.id]));
  const existingCases: Array<{ id: string; title: string; category: string | null }> =
    (cases as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string, title: (c.title as string) ?? "", category: (c.category as string) ?? null,
    }));
  console.log(
    `Kategorien: ${cats.length}, Schlagwörter: ${kws.length}, Vorlagen: ${tmpls.length}, ` +
    `Rechtsgrundlagen: ${publishedSecs.length}, bestehende Fälle: ${existingCases.length}\n`,
  );

  const sectionRefs = publishedSecs.map((s) => ({
    id: s.id as string,
    label: `${(s as { legal_sources?: { name?: string } }).legal_sources?.name ?? ""} ${(s.section_number as string) ?? ""} ${(s.title as string) ?? ""}`.trim(),
  }));
  const templateRefs = (tmpls as Array<Record<string, unknown>>).map((t) => ({
    id: t.id as string, label: (t.title as string) ?? "",
  }));

  const stats = { created: 0, duplicates: 0, errors: 0, submittedForReview: 0, leftAsDraft: 0, scores: [] as number[] };

  while (stats.created < TARGET) {
    const remaining = TARGET - stats.created;
    const count = Math.min(IDEAS_PER_BATCH, remaining + 5); // etwas Puffer für Duplikate
    console.log(`\n=== Fordere ${count} Ideen an (${stats.created}/${TARGET} erledigt) ===`);
    const ideasRes = await fetch(`${API_BASE}/api/ai-draft-topics`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count, topics: TOPICS, existingTitles: existingCases.map((e) => e.title).slice(0, 200) }),
    });
    if (!ideasRes.ok) { console.error("ai-draft-topics fehlgeschlagen:", await ideasRes.text()); break; }
    const { ideas: rawIdeas } = (await ideasRes.json()) as { ideas: Idea[] };
    if (!rawIdeas?.length) { console.error("Keine Ideen erhalten, breche ab."); break; }
    // Anthropics erzwungenes Tool-Use-JSON liefert vereinzelt eine Idee ohne
    // "title" zurück (Fund beim Neustart nach Rechner-Neustart, 2026-08-13) -
    // hat zuvor das ganze Skript abgeschossen (label-Berechnung außerhalb des
    // Try/Catch je Idee). Defensiv vorab herausfiltern statt crashen.
    const ideas = rawIdeas.filter((i) => typeof i?.title === "string" && i.title.trim().length > 0);
    if (ideas.length < rawIdeas.length) {
      console.log(`  [warnung] ${rawIdeas.length - ideas.length} Idee(n) ohne Titel übersprungen`);
    }

    for (const idea of ideas) {
      if (stats.created >= TARGET) break;
      const label = idea.title.slice(0, 70);
      try {
        const preSim = findSimilar({ title: idea.title }, existingCases, 0.6);
        if (preSim.length > 0) {
          console.log(`  [dup] "${label}" ~ "${preSim[0].title}"`);
          stats.duplicates++;
          continue;
        }

        const draftRes = await fetch(`${API_BASE}/api/ai-draft-batch-item`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: idea.title, sketch: idea.sketch, topic: idea.topic ?? "",
            categories: cats.map((c) => c.name), keywords: kws.map((k) => k.keyword),
            templates: templateRefs, sections: sectionRefs,
            cases: existingCases.slice(0, 100).map((c) => ({ id: c.id, label: c.title, category: c.category ?? undefined })),
          }),
        });
        if (!draftRes.ok) throw new Error(await draftRes.text());
        const { draft } = (await draftRes.json()) as { draft: BatchDraft };

        const postSim = findSimilar({ title: draft.title ?? idea.title, category: draft.category }, existingCases, 0.65);
        if (postSim.length > 0) {
          console.log(`  [dup nach Entwurf] "${draft.title ?? label}" ~ "${postSim[0].title}"`);
          stats.duplicates++;
          continue;
        }

        if (DRY) {
          console.log(`  [dry-run] würde erstellen: "${draft.title ?? label}"`);
          stats.created++;
          continue;
        }

        const draftKeywordIds = Array.isArray(draft.keyword_ids) ? (draft.keyword_ids as string[]) : [];
        const draftKeywordHints = toStringArray(draft.keyword_hints);
        const draftLegalLinks = Array.isArray(draft.legal_links)
          ? (draft.legal_links as Array<{ legal_section_id: string; relevance?: "low" | "medium" | "high"; explanation?: string }>)
          : [];
        const draftTemplateIds = Array.isArray(draft.template_ids) ? (draft.template_ids as string[]) : [];
        const draftChecklist = toStringArray(draft.checklist);
        const draftDocumentation = toStringArray(draft.documentation);
        const draftCommonMistakes = toStringArray(draft.common_mistakes);
        const draftFaq = Array.isArray(draft.faq) ? (draft.faq as Array<{ q: string; a: string }>) : [];
        const draftRelatedHints = toStringArray(draft.related_hints);

        const keywordIds = new Set<string>();
        for (const id of draftKeywordIds) {
          if (kws.some((k) => k.id === id)) keywordIds.add(id);
        }
        for (const hint of draftKeywordHints) {
          const existing = kwByName.get(hint.toLowerCase());
          if (existing) { keywordIds.add(existing); continue; }
          try {
            const created = await createKeyword(hint);
            kws.push(created);
            kwByName.set(created.keyword.toLowerCase(), created.id);
            keywordIds.add(created.id);
          } catch { /* Kollision o.ä. - ignorieren, Pipeline matcht ggf. später erneut */ }
        }

        const validLinks = draftLegalLinks.filter((l) => publishedSecs.some((s) => s.id === l.legal_section_id));
        const validTemplateIds = draftTemplateIds.filter((id) => (tmpls as Array<{ id: string }>).some((t) => t.id === id));

        const completeness = computeCompleteness({
          short_description: draft.short_description as string, legal_explanation: draft.legal_explanation as string,
          responsibilities: draft.responsibilities as string, practice_tip: draft.practice_tip as string,
          common_mistakes: draftCommonMistakes, checklist: draftChecklist,
          documentation: draftDocumentation, faq: draftFaq,
          keyword_count: keywordIds.size, legal_link_count: validLinks.length, template_count: validTemplateIds.length,
        });

        const meta = {
          source: "ki-entwurfsmaschine-batch-script",
          topic: idea.topic ?? "",
          batch_started_at: new Date().toISOString().slice(0, 10),
          bildungsgang: draft.bildungsgang ?? "", zielgruppe: draft.zielgruppe ?? "",
          schwierigkeit: draft.schwierigkeit ?? "", bearbeitungsdauer: draft.bearbeitungsdauer ?? "",
          template_ids: validTemplateIds, risks: draft.risks ? [draft.risks] : [],
          escalation: draft.escalation ?? "", faq_items: draftFaq,
          keyword_hints: draftKeywordHints, related_hints: draftRelatedHints,
          completeness_score: completeness.score, completeness_ampel: completeness.ampel,
          completeness_missing: completeness.missing,
        };

        const row = await createCase({
          title: (draft.title as string) ?? idea.title,
          short_description: (draft.short_description as string) ?? idea.sketch,
          category: (draft.category as string) ?? "", subcategory: (draft.subcategory as string) ?? "",
          ampel: (draft.ampel as "gruen" | "gelb" | "rot") ?? "gelb", status: "draft",
          short_answer: (draft.short_answer as string) ?? "", immediate_actions: (draft.immediate_actions as string) ?? "",
          recommendation: (draft.recommendation as string) ?? "", legal_explanation: (draft.legal_explanation as string) ?? "",
          responsibilities: (draft.responsibilities as string) ?? "", practice_tip: (draft.practice_tip as string) ?? "",
          checklist: draftChecklist,
          documentation: draftDocumentation,
          common_mistakes: draftCommonMistakes,
          faq: { meta } as any,
        } as any);
        const caseId = row.id;

        const pipelineReport = await completePracticeCase(caseId, {
          source: "ai_case_machine",
          runLegalMatching: true, runKeywordMatching: true, runTemplateMatching: true,
          runSimilarityCheck: true, runQualityEvaluation: true,
          preserveManualContent: true, removeClearlyIrrelevantLegalLinks: true,
        });
        if (pipelineReport.status === "aborted") {
          throw new Error(pipelineReport.errors[0]?.message ?? "Pipeline abgebrochen");
        }

        // Entscheidungsbaum (per Nutzeranforderung: "angelegter Entscheidungsbaum").
        try {
          const freshRes = await (await import("../src/integrations/supabase/client")).supabase
            .from("practice_cases").select("*").eq("id", caseId).maybeSingle();
          const caseRow = freshRes.data ?? {};
          const treeRes = await fetch(`${API_BASE}/api/ai-draft-decision-tree`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caseRow }),
          });
          if (treeRes.ok) {
            const { tree } = (await treeRes.json()) as { tree: unknown };
            if (tree) await updateCase(caseId, { decision_tree: tree } as any);
          }
        } catch (e) {
          console.log(`  [Entscheidungsbaum übersprungen] ${e instanceof Error ? e.message : e}`);
        }

        existingCases.push({ id: caseId, title: (draft.title as string) ?? idea.title, category: (draft.category as string) ?? null });

        const score = pipelineReport.quality?.score ?? completeness.score;
        const blockers = pipelineReport.quality?.hardBlockers.length ?? 0;
        const ready = pipelineReport.quality?.publicationReady ?? false;
        stats.scores.push(score);
        stats.created++;

        if (ready) {
          try {
            await EditorialWorkflowService.submitForReview({ caseId });
            stats.submittedForReview++;
            console.log(`  [ok] "${draft.title ?? label}" Score ${score}/100 (${blockers} Blocker) -> zur Redaktionsprüfung eingereicht`);
          } catch (e) {
            stats.leftAsDraft++;
            console.log(`  [ok, aber submit fehlgeschlagen] "${draft.title ?? label}" Score ${score}/100: ${e instanceof Error ? e.message : e}`);
          }
        } else {
          stats.leftAsDraft++;
          console.log(`  [draft] "${draft.title ?? label}" Score ${score}/100 (${blockers} Blocker) - bleibt Entwurf`);
        }
      } catch (e) {
        stats.errors++;
        console.log(`  [error] "${label}": ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  console.log("\n=== Zusammenfassung ===");
  console.log(`Erstellt: ${stats.created}/${TARGET}`);
  console.log(`Duplikate übersprungen: ${stats.duplicates}`);
  console.log(`Fehler: ${stats.errors}`);
  console.log(`Zur Redaktionsprüfung eingereicht (Score>=90, 0 Blocker): ${stats.submittedForReview}`);
  console.log(`Als Entwurf verblieben: ${stats.leftAsDraft}`);
  if (stats.scores.length > 0) {
    const avg = stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length;
    console.log(`Durchschnittlicher Qualitäts-Score: ${avg.toFixed(1)}/100`);
    console.log(`Score-Verteilung: min ${Math.min(...stats.scores)}, max ${Math.max(...stats.scores)}`);
  }
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
