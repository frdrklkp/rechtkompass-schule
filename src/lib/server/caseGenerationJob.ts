/**
 * Sprint 4.6K – Automatische Fallgenerierung durch Lehrkräfte.
 *
 * Orchestriert dieselbe, bereits produktiv genutzte Pipeline wie
 * scripts/_create-and-publish-case.ts (Entwurf -> anlegen -> vernetzen ->
 * Entscheidungsbaum -> Qualitätsoptimierung -> Redaktions-Workflow), jedoch:
 *   - angestoßen aus einem echten HTTP-Request einer Lehrkraft statt einem
 *     manuell gestarteten Admin-Skript,
 *   - mit persistiertem Fortschritt in case_generation_jobs statt Konsolen-
 *     ausgabe, damit das Frontend den Status pollen kann,
 *   - endet bewusst NACH submitForReview - der Fall geht in die normale
 *     redaktionelle Prüfung, wird NICHT automatisch freigegeben/veröffentlicht.
 *
 * Läuft innerhalb von runWithPrivilegedSupabase(...) mit einem frischen,
 * auf den Redaktions-Service-Account authentifizierten Client (siehe
 * privilegedEditorSupabase.ts) - dadurch funktionieren createCase,
 * completePracticeCase, fixCaseQualityTasks und submitForReview unverändert,
 * ohne dass diese Dateien um Client-Parameter erweitert werden mussten.
 */
import { createServiceSupabase } from "@/lib/searchEmbeddings.supabase.server";
import { createPrivilegedEditorSupabase } from "./privilegedEditorSupabase";
import { runWithPrivilegedSupabase } from "./privilegedSupabaseContext";
import { runWithServerFetchOrigin } from "./serverFetchOrigin";
import { ensurePrivilegedWriteOverrideWired } from "./wirePrivilegedWriteOverride";

export type CaseGenerationPhase =
  | "entwurf"
  | "anlegen"
  | "vernetzen"
  | "rechtspruefung"
  | "entscheidungsbaum"
  | "qualitaet"
  | "einreichen"
  | "fertig";

const TARGET_SCORE = 100;
const MAX_QUALITY_ROUNDS = 5;
const DUPLICATE_SCORE_THRESHOLD = 0.75;

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (typeof v === "string" && v.trim()) {
    return v.split(/\r?\n/).map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
  }
  return [];
}

class DuplicateCaseError extends Error {
  constructor(public readonly similarTitle: string, public readonly score: number) {
    super(`Ähnlicher Praxisfall existiert bereits: "${similarTitle}" (Ähnlichkeit ${Math.round(score * 100)}%)`);
  }
}

/**
 * Fund 2026-08-30 (Produktionstest der Fallgenerierung): die Pipeline rief
 * ihre drei KI-Schritte per HTTP über die EIGENE öffentliche Domain auf
 * (`fetch(`${apiOrigin}/api/ai-...`)`). Auf Cloudflare Workers schlägt ein
 * solcher Selbstaufruf über die eigene Zone fehl (error code 522) - lokal
 * unter Bun fiel das nie auf. Statt die drei komplexen Routen-Handler zu
 * duplizieren oder umzubauen, werden sie hier IN-PROCESS mit einem
 * synthetischen Request aufgerufen: identische Logik, identisches
 * Response-Handling, nur ohne Netzwerk-Schleife über Cloudflare.
 */
type RouteWithPost = { options?: { server?: { handlers?: { POST?: (ctx: { request: Request; params: Record<string, never> }) => Promise<Response> | Response } } } };

async function callInternalApi(routeModule: Promise<{ Route: unknown }>, path: string, payload: unknown): Promise<Response> {
  const { Route } = await routeModule;
  const handler = (Route as RouteWithPost).options?.server?.handlers?.POST;
  if (typeof handler !== "function") {
    throw new Error(`Interner API-Aufruf ${path}: POST-Handler nicht gefunden.`);
  }
  const request = new Request(`http://internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await handler({ request, params: {} });
}

const callDraftBatchItem = (payload: unknown) =>
  callInternalApi(import("@/routes/api/ai-draft-batch-item"), "/api/ai-draft-batch-item", payload);
const callValidateLegalClaims = (payload: unknown) =>
  callInternalApi(import("@/routes/api/ai-validate-legal-claims"), "/api/ai-validate-legal-claims", payload);
const callDraftDecisionTree = (payload: unknown) =>
  callInternalApi(import("@/routes/api/ai-draft-decision-tree"), "/api/ai-draft-decision-tree", payload);
const callReviseLegalCase = (payload: unknown) =>
  callInternalApi(import("@/routes/api/ai-revise-legal-case"), "/api/ai-revise-legal-case", payload);
const callMatchLegalSections = (payload: unknown) =>
  callInternalApi(import("@/routes/api/ai-match-legal-sections"), "/api/ai-match-legal-sections", payload);

async function updateJob(
  service: ReturnType<typeof createServiceSupabase>,
  jobId: string,
  patch: { status?: string; phase?: CaseGenerationPhase; caseId?: string; error?: string | null },
): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.phase !== undefined) dbPatch.phase = patch.phase;
  if (patch.caseId !== undefined) dbPatch.case_id = patch.caseId;
  if (patch.error !== undefined) dbPatch.error = patch.error;
  // Sprint 4.6K: case_generation_jobs ist neu und noch nicht in den generierten
  // Supabase-Typen enthalten (Migration db/2026-08-15_case_generation_jobs.sql
  // muss vom Nutzer ausgeführt und die Typen per `bun run schema:update`
  // aktualisiert werden) - Cast folgt derselben Konvention wie an anderen
  // Stellen der Pipeline (z. B. case_legal_links in casePipeline.completion.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (service as any).from("case_generation_jobs").update(dbPatch).eq("id", jobId);
  if (error) console.error(`[caseGenerationJob] Statusupdate für Job ${jobId} fehlgeschlagen:`, error.message);
}

async function runPipeline(jobId: string, sketch: string, apiOrigin: string): Promise<void> {
  const service = createServiceSupabase();

  const {
    createCase,
    updateCase,
    listCategories,
    listKeywords,
    listTemplates,
    listSections,
    listCases,
    listCaseLegalLinks,
    createLegalReviewFlag,
  } = await import("@/lib/coreBuilder");
  const { completePracticeCase } = await import("@/lib/casePipeline.completion");
  const { loadCaseForEvaluation, deriveQualityTasks } = await import("@/lib/qualityEngine");
  const { fixCaseQualityTasks } = await import("@/lib/qualityFixManager");
  const { parseCuratedTree, validateCuratedTree } = await import("@/lib/decisionTree");
  const { EditorialWorkflowService } = await import("@/services/editorial/EditorialWorkflowService");
  const { findSimilar } = await import("@/lib/caseSimilarity");

  // ---- 1) Entwurf ----
  const [cats, kws, tmpls, secs, cases] = await Promise.all([
    listCategories(),
    listKeywords(),
    listTemplates(),
    listSections(),
    listCases(),
  ]);
  const publishedSecs = (secs as Array<Record<string, unknown>>).filter(
    (s) => (s.status ?? "published") === "published" || s.status === undefined,
  );
  const sectionRefs = publishedSecs.map((s) => ({
    id: s.id as string,
    label: `${(s as { legal_sources?: { name?: string } }).legal_sources?.name ?? ""} ${(s.section_number as string) ?? ""} ${(s.title as string) ?? ""}`.trim(),
  }));
  const templateRefs = (tmpls as Array<Record<string, unknown>>).map((t) => ({
    id: t.id as string,
    label: (t.title as string) ?? "",
  }));
  const existingCases = (cases as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string,
    title: (c.title as string) ?? "",
    category: (c.category as string | null) ?? null,
  }));

  const draftRes = await callDraftBatchItem({
    title: "",
    sketch,
    categories: (cats as Array<{ name: string }>).map((c) => c.name),
    keywords: (kws as Array<{ keyword: string }>).map((k) => k.keyword),
    templates: templateRefs,
    sections: sectionRefs,
    cases: existingCases.slice(0, 100).map((c) => ({ id: c.id, label: c.title, category: c.category ?? undefined })),
  });
  if (!draftRes.ok) throw new Error(`Fallentwurf fehlgeschlagen: ${await draftRes.text()}`);
  const { draft } = (await draftRes.json()) as { draft: Record<string, unknown> };
  const draftTitle = (draft.title as string) || sketch.slice(0, 80);

  // ---- Dublettenprüfung (nach dem günstigen Entwurfsaufruf, vor der
  // teuren Vernetzung/Baum-Generierung/Qualitätsoptimierung) ----
  const similar = findSimilar({ title: draftTitle, category: (draft.category as string) ?? null }, existingCases, DUPLICATE_SCORE_THRESHOLD);
  if (similar.length > 0) {
    throw new DuplicateCaseError(similar[0].title, similar[0].score);
  }

  // ---- 2) Anlegen ----
  await updateJob(service, jobId, { phase: "anlegen" });
  const row = await createCase({
    title: draftTitle,
    short_description: (draft.short_description as string) ?? sketch,
    category: (draft.category as string) ?? "",
    subcategory: (draft.subcategory as string) ?? "",
    ampel: (draft.ampel as "gruen" | "gelb" | "rot") ?? "gelb",
    status: "draft",
    short_answer: (draft.short_answer as string) ?? "",
    immediate_actions: (draft.immediate_actions as string) ?? "",
    recommendation: (draft.recommendation as string) ?? "",
    legal_explanation: (draft.legal_explanation as string) ?? "",
    responsibilities: (draft.responsibilities as string) ?? "",
    practice_tip: (draft.practice_tip as string) ?? "",
    checklist: toStringArray(draft.checklist),
    documentation: toStringArray(draft.documentation),
    common_mistakes: toStringArray(draft.common_mistakes),
    faq: Array.isArray(draft.faq) ? (draft.faq as unknown[]) : [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const caseId = row.id as string;
  await updateJob(service, jobId, { caseId });

  // Offene Fragen aus dem Entwurf als Legal-Review-Flags eintragen - sperrt
  // die Veröffentlichung über die bestehende Blocker-Regel
  // "legal.no_open_flags" (src/services/editorial/quality/rules.ts), bis
  // eine Redaktion sie in der Admin-Oberfläche auflöst.
  const openQuestions = Array.isArray(draft.open_questions) ? draft.open_questions : [];
  for (const oq of openQuestions as Array<{ field?: string; question?: string }>) {
    if (!oq || typeof oq.question !== "string" || !oq.question.trim()) continue;
    const field = typeof oq.field === "string" && oq.field.trim() ? oq.field.trim() : "unbekanntes Feld";
    await createLegalReviewFlag(caseId, `[${field}] ${oq.question.trim()}`);
  }

  // ---- 3) Vernetzung ----
  await updateJob(service, jobId, { phase: "vernetzen" });
  await completePracticeCase(caseId, {
    runLegalMatching: true,
    runKeywordMatching: true,
    runTemplateMatching: true,
    runSimilarityCheck: true,
    runQualityEvaluation: true,
    source: "manual",
  });

  let links = await listCaseLegalLinks(caseId);
  if (links.length === 0) {
    await completePracticeCase(caseId, {
      runLegalMatching: true,
      runKeywordMatching: false,
      runTemplateMatching: false,
      runSimilarityCheck: false,
      runQualityEvaluation: false,
      source: "manual",
    });
    links = await listCaseLegalLinks(caseId);
  }
  if (links.length === 0) {
    throw new Error(
      "Für diesen Sachverhalt konnte keine passende Rechtsgrundlage gefunden werden. Der Entwurf bleibt gespeichert und braucht redaktionelle Prüfung - es wird keine Norm erfunden.",
    );
  }

  // ---- 3b) Legal Export Quality Gate: Claim-zu-Quelle-Validierung ----
  // Zweiter, unabhängiger KI-Durchlauf; siehe scripts/_create-and-publish-case.ts
  // für die ausführliche Begründung. Dieser Job veröffentlicht ohnehin nie
  // automatisch (nur "einreichen"), daher genügt hier: Felder reklassifizieren,
  // offene Fragen als Flags eintragen, legal_review_status setzen - eine
  // Redaktion sieht den Befund vor jeder manuellen Freigabe.
  await updateJob(service, jobId, { phase: "rechtspruefung" });

  // Fund 2026-09-01 ("Ziel: generierte Fälle so grün wie möglich"): die
  // Prüfung läuft jetzt als wiederholbare Runde. Fällt Runde 1 nicht grün
  // aus, saniert EINE Nachsanierungsrunde die beanstandeten Felder mit den
  // frischen Befunden (verankern/abstufen/streichen - dieselbe Route wie
  // die Bestands-Textsanierung), danach prüft Runde 2 erneut. Rot bleibt
  // dann nur noch, wo die Wissensbasis die zentrale Rechtsfrage schlicht
  // nicht deckt - und genau so soll es sein.
  const loadSourcesForCase = async () => {
    // Bewusst frisch aus der DB statt aus dem Phase-3-Closure: die
    // Relink-Runde (unten) kann die Verknüpfungen zwischenzeitlich ändern.
    const { data: linkRows } = await (service.from("case_legal_links") as any)
      .select("legal_section_id").eq("case_id", caseId);
    const sectionIds2 = ((linkRows ?? []) as Array<{ legal_section_id: string }>).map((l) => l.legal_section_id).filter(Boolean);
    const { data: fullSectionRows } = sectionIds2.length
      ? await (service.from("legal_sections") as any)
          .select("id, section_number, title, full_text, legal_sources(name)")
          .in("id", sectionIds2)
      : { data: [] };
    return ((fullSectionRows ?? []) as any[]).map((s) => ({
      id: s.id, reference: s.section_number ?? "", title: s.title ?? null,
      full_text: s.full_text ?? null, source_name: s.legal_sources?.name ?? null,
    }));
  };

  // Fund 2026-09-01 (A/B-Test der Nachsanierung): der Fall zitierte § 53
  // SchulG und § 66 VwVfG im Text, verlinkt war aber nur § 1 SchulG - die
  // Sanierung kann nur in VERLINKTEN Quellen verankern. Diese Runde wählt
  // deshalb mit dem VOLLEN Falltext (der die zitierten Normen nennt) neue
  // Kandidaten aus und verlinkt sie - dieselbe Mechanik, die den Bestand
  // saniert hat (scripts/_relink-apo-bk-cases.ts).
  const runRelinkRound = async (): Promise<boolean> => {
    const { filterRelevantSections } = await import("@/routes/api/ai-draft-batch-item");
    const { createLegalLink } = await import("@/lib/coreBuilder");
    const { data: caseRows } = await service.from("practice_cases").select("*").eq("id", caseId).limit(1);
    const c = (caseRows ?? [])[0] as any;
    const { data: linkRows } = await (service.from("case_legal_links") as any)
      .select("legal_section_id").eq("case_id", caseId);
    const linkedIds = new Set(((linkRows ?? []) as any[]).map((l) => l.legal_section_id));

    const queryText = [
      c.title, c.short_description, c.category, c.subcategory,
      c.legal_explanation, c.recommendation, c.immediate_actions, "Berufskolleg",
    ].filter(Boolean).join(" ");
    const candidates = filterRelevantSections(sectionRefs, queryText, 400).map((ref) => {
      const s = publishedSecs.find((x) => x.id === ref.id) as any;
      return {
        id: ref.id,
        source_short: s?.legal_sources?.short_name ?? s?.legal_sources?.name ?? "",
        section_number: (s?.section_number as string) ?? "",
        title: (s?.title as string) ?? "",
      };
    });
    const res = await callMatchLegalSections({
      title: c.title ?? "", short_description: c.short_description ?? "",
      category: c.category ?? "", subcategory: c.subcategory ?? "",
      bildungsgang: "Berufskolleg",
      recommendation: c.recommendation ?? "", immediate_actions: c.immediate_actions ?? "",
      responsibilities: c.responsibilities ?? "",
      sections: candidates,
    });
    if (!res.ok) {
      console.error("[caseGenerationJob] Relink-Runde fehlgeschlagen:", await res.text());
      return false;
    }
    const match = (await res.json()) as { matches: Array<{ id: string; confidence: number; relevance_tier?: string; reason: string }> };
    const toAdd = (match.matches ?? []).filter((m) => !linkedIds.has(m.id) && m.confidence >= 55);
    for (const m of toAdd) {
      const relevance = m.relevance_tier === "primary" ? "high" : m.relevance_tier === "supporting" ? "medium" : "low";
      await createLegalLink(caseId, m.id, m.reason?.slice(0, 500) || undefined, relevance as "low" | "medium" | "high");
    }
    return toAdd.length > 0;
  };

  const toArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : typeof v === "string" && v.trim() ? v.split(/\r?\n/).map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean)
      : [];

  const runRevisionRound = async (): Promise<boolean> => {
    const { splitLegalExplanation } = await import("@/lib/caseEnrichment");
    const sources = await loadSourcesForCase();
    const { data: caseRows } = await service.from("practice_cases").select("*").eq("id", caseId).limit(1);
    const c = (caseRows ?? [])[0] as any;
    const split = splitLegalExplanation(c.legal_explanation);
    const { data: flagRows } = await ((service as any).from("case_legal_review_flags"))
      .select("id, reason").eq("case_id", caseId).is("resolved_at", null);
    const openFlags = ((flagRows ?? []) as Array<{ id: string; reason: string | null }>);

    const res = await callReviseLegalCase({
      title: c.title, category: c.category,
      legal_vorgegeben: split.vorgegeben, legal_einordnung: split.einordnung,
      short_answer: c.short_answer, recommendation: c.recommendation,
      immediate_actions: c.immediate_actions,
      checklist: toArray(c.checklist), practice_tip: c.practice_tip ?? "",
      common_mistakes: toArray(c.common_mistakes), documentation: toArray(c.documentation),
      sources,
      findings: {
        reasoning: c.legal_review_reasoning ?? "",
        open_flags: openFlags.map((f) => f.reason).filter((r): r is string => !!r?.trim()),
      },
    });
    if (!res.ok) {
      console.error("[caseGenerationJob] Nachsanierung fehlgeschlagen:", await res.text());
      return false;
    }
    const rev = (await res.json()) as {
      legal_explanation: { changed: boolean; vorgegeben?: string; einordnung?: string };
      short_answer: { changed: boolean; text?: string };
      recommendation: { changed: boolean; text?: string };
      immediate_actions: { changed: boolean; text?: string };
      practice_tip: { changed: boolean; text?: string };
      checklist: { changed: boolean; items?: string[] };
      common_mistakes: { changed: boolean; items?: string[] };
      documentation: { changed: boolean; items?: string[] };
    };
    const patch: Record<string, unknown> = {};
    if (rev.legal_explanation.changed && rev.legal_explanation.vorgegeben && rev.legal_explanation.einordnung) {
      patch.legal_explanation = `RECHTLICH VORGEGEBEN: ${rev.legal_explanation.vorgegeben}\n\nRECHTLICHE EINORDNUNG: ${rev.legal_explanation.einordnung}`;
    }
    if (rev.short_answer.changed && rev.short_answer.text?.trim()) patch.short_answer = rev.short_answer.text.trim();
    if (rev.recommendation.changed && rev.recommendation.text?.trim()) patch.recommendation = rev.recommendation.text.trim();
    if (rev.immediate_actions.changed && rev.immediate_actions.text?.trim()) patch.immediate_actions = rev.immediate_actions.text.trim();
    if (rev.practice_tip.changed && rev.practice_tip.text?.trim()) patch.practice_tip = rev.practice_tip.text.trim();
    if (rev.checklist.changed && rev.checklist.items) patch.checklist = rev.checklist.items;
    if (rev.common_mistakes.changed && rev.common_mistakes.items) patch.common_mistakes = rev.common_mistakes.items;
    if (rev.documentation.changed && rev.documentation.items) patch.documentation = rev.documentation.items;
    if (Object.keys(patch).length === 0) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateCase(caseId, patch as any);
    // In die Sanierung eingeflossene Flags gelten als adressiert - die
    // anschließende Prüfrunde legt für weiterhin Offenes frische an.
    if (openFlags.length) {
      await ((service as any).from("case_legal_review_flags"))
        .update({ resolved_at: new Date().toISOString() })
        .eq("case_id", caseId).is("resolved_at", null);
    }
    return true;
  };

  const runLegalReviewRound = async (): Promise<{ color: "gruen" | "gelb" | "rot" | null; changes: number }> => {
    const { parseTieredItem, splitLegalExplanation } = await import("@/lib/caseEnrichment");
    const sources = await loadSourcesForCase();
    // Jede Runde leitet die offenen Fragen vollständig neu her - alte,
    // ungelöste Flags dieses (frisch generierten) Falls vorher auflösen,
    // damit Mehrfachrunden keine Duplikate stapeln.
    await ((service as any).from("case_legal_review_flags"))
      .update({ resolved_at: new Date().toISOString() })
      .eq("case_id", caseId).is("resolved_at", null);

    const { data: caseRows2 } = await service.from("practice_cases").select("*").eq("id", caseId).limit(1);
    const caseRow2 = (caseRows2 ?? [])[0] as any;
    const split = splitLegalExplanation(caseRow2.legal_explanation);

    const checklistItems = toArray(caseRow2.checklist).map((text, i) => ({ id: `checklist-${i}`, ...parseTieredItem(text) }));
    const practiceTipItems = toArray(caseRow2.practice_tip).map((text, i) => ({ id: `practice_tip-${i}`, ...parseTieredItem(text) }));
    const commonMistakesItems = toArray(caseRow2.common_mistakes).map((text, i) => ({ id: `common_mistakes-${i}`, ...parseTieredItem(text) }));
    const documentationItems = toArray(caseRow2.documentation).map((text, i) => ({ id: `documentation-${i}`, ...parseTieredItem(text) }));

    const valRes = await callValidateLegalClaims({
      title: caseRow2.title, category: caseRow2.category,
      legal_vorgegeben: split.vorgegeben, legal_einordnung: split.einordnung,
      short_answer: caseRow2.short_answer,
      recommendation: caseRow2.recommendation,
      checklist: checklistItems, practice_tip: practiceTipItems, common_mistakes: commonMistakesItems,
      documentation: documentationItems,
      sources,
    });
    let roundColor: "gruen" | "gelb" | "rot" | null = null;
    let roundChanges = 0;
    if (valRes.ok) {
      const val = (await valRes.json()) as {
        legal_explanation_revision: { changed: boolean; vorgegeben?: string; einordnung?: string };
        short_answer_revision: { changed: boolean; text?: string };
        consistency_conflicts: string[];
        source_summaries: Array<{ id: string; kind: "wortlaut" | "zusammengefasst"; text: string; preciseReference?: string }>;
        item_verdicts: Array<{ id: string; verdict: string; new_label?: string; note?: string }>;
        new_open_questions: string[];
        quality_color: "gruen" | "gelb" | "rot";
        quality_reasoning: string;
        release_gate_flags: Array<{ claimId: string; flagType: string; message: string }>;
        claims: Array<{ id: string; section: string; text: string; classification: string; isCentral: boolean; sourceId?: string | null }>;
      };
      roundColor = val.quality_color;
      roundChanges =
        val.item_verdicts.filter((v) => v.verdict !== "bestaetigt").length +
        (val.legal_explanation_revision.changed ? 1 : 0) +
        (val.short_answer_revision.changed ? 1 : 0);
      const verdictById = new Map(val.item_verdicts.map((v) => [v.id, v]));
      const openQuestionTexts: string[] = [...val.new_open_questions];

      function applyVerdicts(items: Array<{ id: string; label: string | null; text: string }>): string[] {
        const out: string[] = [];
        for (const it of items) {
          const v = verdictById.get(it.id);
          if (!v || v.verdict === "bestaetigt") {
            out.push(it.label ? `[${it.label}] ${it.text}` : it.text);
          } else if (v.verdict === "herabgestuft") {
            out.push(`[${v.new_label ?? it.label ?? "Organisatorisch empfohlen"}] ${it.text}`);
          } else if (v.verdict === "offene_frage") {
            openQuestionTexts.push(v.note?.trim() || it.text);
          }
        }
        return out;
      }

      const updatePayload: Record<string, unknown> = {
        checklist: applyVerdicts(checklistItems),
        practice_tip: applyVerdicts(practiceTipItems).map((s) => `- ${s}`).join("\n"),
        common_mistakes: applyVerdicts(commonMistakesItems),
        documentation: applyVerdicts(documentationItems),
        legal_review_status: val.quality_color,
        legal_review_reasoning: val.quality_reasoning,
      };
      if (val.legal_explanation_revision.changed) {
        updatePayload.legal_explanation =
          `RECHTLICH VORGEGEBEN: ${val.legal_explanation_revision.vorgegeben}\n\nRECHTLICHE EINORDNUNG: ${val.legal_explanation_revision.einordnung}`;
      }
      if (val.short_answer_revision.changed && val.short_answer_revision.text) {
        updatePayload.short_answer = val.short_answer_revision.text;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateCase(caseId, updatePayload as any);

      for (const s of val.source_summaries) {
        await (service.from("case_legal_links") as any)
          .update({
            content_summary: s.text,
            content_summary_kind: s.kind,
            precise_reference: s.preciseReference ?? null,
          })
          .eq("case_id", caseId)
          .eq("legal_section_id", s.id);
      }

      for (const q of openQuestionTexts) {
        if (!q.trim()) continue;
        await createLegalReviewFlag(caseId, q.trim());
      }
      for (const c of val.consistency_conflicts) {
        await createLegalReviewFlag(caseId, `[Konsistenzkonflikt] ${c}`);
      }

      // Legal Export Release Blocker, Regel 20/21: konkrete, strukturierte
      // Flags statt generischer Meldungen.
      const claimById = new Map(val.claims.map((c) => [c.id, c]));
      for (const flag of val.release_gate_flags) {
        const claim = claimById.get(flag.claimId);
        const reviewText = claim
          ? [
              `[${flag.flagType}] Claim: ${claim.text}`,
              `Status: ${claim.classification}`,
              `Quelle: ${claim.sourceId ?? "keine"}`,
              `Problem: ${flag.message}`,
            ].join(" | ")
          : `[${flag.flagType}] ${flag.message}`;
        await createLegalReviewFlag(caseId, reviewText);
      }
    }
    return { color: roundColor, changes: roundChanges };
  };

  const first = await runLegalReviewRound();
  if (first.color && first.color !== "gruen") {
    await runRelinkRound();
    // Konvergenzschleife (A/B-Funde 2026-09-01): (a) jede Prüfrunde benotet
    // den Zustand VOR ihren eigenen Korrekturen - die Note hinkt dem Inhalt
    // eine Runde hinterher; (b) die Prüfrunde kann Labels nur abschwächen,
    // Verschärfungen (z.B. "sollte 'Rechtlich problematisch' sein") kann
    // nur die Nachsanierungsrunde über die offenen Flags umsetzen. Deshalb
    // Nachsanieren und Prüfen im Wechsel, bis grün erreicht ist oder eine
    // Runde nichts mehr bewegt. Deckel: 3 Zyklen.
    for (let cycle = 0; cycle < 3; cycle++) {
      const revised = await runRevisionRound();
      const review = await runLegalReviewRound();
      if (!review.color || review.color === "gruen") break;
      if (!revised && review.changes === 0) break;
    }
  }

  // ---- 4) Entscheidungsbaum ----
  await updateJob(service, jobId, { phase: "entscheidungsbaum" });
  const { data: freshRow } = await service.from("practice_cases").select("*").eq("id", caseId).limit(1);
  const caseRow = (freshRow ?? [])[0];
  const treeRes = await callDraftDecisionTree({ caseRow });
  if (!treeRes.ok) throw new Error(`Entscheidungsbaum-Generierung fehlgeschlagen: ${await treeRes.text()}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { tree } = (await treeRes.json()) as { tree: any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await updateCase(caseId, { decision_tree: tree } as any);

  // ---- 5) Qualitätsoptimierung ----
  await updateJob(service, jobId, { phase: "qualitaet" });
  let ev = await loadCaseForEvaluation(caseId);
  for (let round = 1; round <= MAX_QUALITY_ROUNDS && ev.score < TARGET_SCORE; round++) {
    const fixable = deriveQualityTasks(ev).filter((t) => t.fixable);
    if (fixable.length === 0) break;
    await fixCaseQualityTasks(fixable);
    ev = await loadCaseForEvaluation(caseId);
  }

  // Baum-Freigabe, falls strukturell vollständig (Voraussetzung dafür, dass
  // der Entscheidungsassistent später im Frontend erscheint).
  const { data: treeRowFresh } = await service.from("practice_cases").select("decision_tree").eq("id", caseId).limit(1);
  const currentTree = (treeRowFresh ?? [])[0]?.decision_tree as Record<string, unknown> | undefined;
  if (currentTree) {
    const currentParsed = parseCuratedTree(currentTree);
    const currentTreeOk =
      !!currentParsed &&
      Object.keys(currentParsed.steps).length > 0 &&
      Object.keys(currentParsed.results).length > 0 &&
      validateCuratedTree(currentParsed).valid;
    if (currentTreeOk) {
      const meta = (currentTree.meta as Record<string, unknown>) ?? {};
      await updateCase(caseId, {
        decision_tree: { ...currentTree, meta: { ...meta, status: "approved", version: meta.version ?? 1 } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
  }

  // ---- 6) Redaktions-Workflow: einreichen (NICHT freigeben/veröffentlichen) ----
  await updateJob(service, jobId, { phase: "einreichen" });
  await EditorialWorkflowService.submitForReview({ caseId });

  await updateJob(service, jobId, { status: "succeeded", phase: "fertig" });
}

export async function processCaseGenerationJob(jobId: string, sketch: string, apiOrigin: string): Promise<void> {
  ensurePrivilegedWriteOverrideWired();
  const service = createServiceSupabase();
  try {
    const editorClient = await createPrivilegedEditorSupabase();
    await runWithServerFetchOrigin(apiOrigin, () =>
      runWithPrivilegedSupabase(editorClient, () => runPipeline(jobId, sketch, apiOrigin)),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler bei der Fallgenerierung.";
    console.error(`[caseGenerationJob] Job ${jobId} fehlgeschlagen:`, message);
    await updateJob(service, jobId, { status: "failed", error: message });
  }
}
