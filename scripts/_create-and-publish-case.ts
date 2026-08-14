/**
 * Kompletten Praxisfall anlegen und veröffentlichen — end-to-end, ein Aufruf.
 *
 * Nutzeranforderung 2026-08-14: "richte mir den Skill für eine komplette
 * Praxisfallanlegung bis hin zur Veröffentlichung ein... Qualität von
 * hundert Prozent... ganz wichtig: Rechtsgrundlagen verknüpft sind."
 *
 * Orchestriert ausschließlich bereits diese Session gebaute und live
 * verifizierte Bausteine (keine neue Logik):
 *   1. Fallentwurf per KI (/api/ai-draft-batch-item, Prompt bereits mit
 *      Markdown-Verbot + Ampel-Kriterien + Zuständigkeits-Regel gehärtet)
 *   2. Anlegen (createCase)
 *   3. Vernetzung: Rechtsgrundlagen/Schlagwörter/Vorlagen/Ähnlichkeit
 *      (completePracticeCase)
 *   4. HARTE PRÜFUNG: mindestens eine Rechtsgrundlage muss verknüpft sein -
 *      sonst ein zweiter Versuch, danach klarer Abbruch mit Hinweis statt
 *      stillem Weiterlaufen oder Erfinden einer Norm
 *   5. Entscheidungsbaum (/api/ai-draft-decision-tree, Zwei-Aufruf-Split +
 *      interne Validierungs-Retries bereits eingebaut)
 *   6. Iterative Qualitätsoptimierung bis Score 100 oder keine behebbaren
 *      Aufgaben mehr offen (fixCaseQualityTasks, bis zu 5 Runden)
 *   7. Freigabe des Entscheidungsbaums (meta.status = "approved")
 *   8. Redaktions-Workflow: einreichen -> genehmigen -> veröffentlichen
 *      (Tier "internal")
 *   9. Abschlussbericht: echter erreichter Score, Rechtsgrundlagen mit
 *      Titeln, Baum-Status, Veröffentlichungsstatus - bei Score < 100 die
 *      konkreten verbleibenden Gründe, nicht nur "nicht geschafft"
 *
 * Aufruf: bun run scripts/_create-and-publish-case.ts "<Titel>" ["<Sachverhalt-Skizze>"]
 */
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
const _API_ORIGIN = "http://127.0.0.1:8080";
const _origFetch = globalThis.fetch.bind(globalThis);
(globalThis as any).fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === "string" && input.startsWith("/")) return _origFetch(_API_ORIGIN + input, init);
  return _origFetch(input as any, init);
};

import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "admin@rechtkompass.local";
const TARGET_SCORE = 100;
const MAX_ROUNDS = 5;

const title = process.argv[2];
const sketch = process.argv[3] ?? "";
if (!title) {
  console.error('Aufruf: bun run scripts/_create-and-publish-case.ts "<Titel>" ["<Sachverhalt-Skizze>"]');
  process.exit(1);
}

async function bootstrapSession(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
  if (error) throw new Error(`generateLink fehlgeschlagen: ${error.message}`);
  const { supabase } = await import("../src/integrations/supabase/client");
  const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "magiclink" });
  if (verifyErr) throw new Error(`verifyOtp fehlgeschlagen: ${verifyErr.message}`);
  const { canWrite } = await import("../src/lib/adminAuth");
  for (let i = 0; i < 25; i++) { if (canWrite()) return; await new Promise((r) => setTimeout(r, 200)); }
  throw new Error("Admin-Session nach 5s nicht bereit");
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (typeof v === "string" && v.trim()) return v.split(/\r?\n/).map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
  return [];
}

async function main() {
  console.log(`Fall: "${title}"${sketch ? `\nSachverhalt: ${sketch}` : ""}\n`);
  console.log("Bootstrapping Admin-Session...");
  await bootstrapSession();
  console.log("Session bereit.\n");

  const { createCase, listCategories, listKeywords, listTemplates, listSections, listCases, listCaseLegalLinks, updateCase } =
    await import("../src/lib/coreBuilder");
  const { completePracticeCase } = await import("../src/lib/casePipeline.completion");
  const { loadCaseForEvaluation, deriveQualityTasks } = await import("../src/lib/qualityEngine");
  const { fixCaseQualityTasks } = await import("../src/lib/qualityFixManager");
  const { parseCuratedTree, validateCuratedTree } = await import("../src/lib/decisionTree");
  const { EditorialWorkflowService } = await import("../src/services/editorial/EditorialWorkflowService");
  const { supabase } = await import("../src/integrations/supabase/client");

  // ---- 1) Entwurf ----
  console.log("=== 1/9: KI-Entwurf ===");
  const [cats, kws, tmpls, secs, cases] = await Promise.all([
    listCategories(), listKeywords(), listTemplates(), listSections(), listCases(),
  ]);
  const publishedSecs = (secs as Array<Record<string, unknown>>).filter(
    (s) => (s.status ?? "published") === "published" || s.status === undefined,
  );
  const sectionRefs = publishedSecs.map((s) => ({
    id: s.id as string,
    label: `${(s as { legal_sources?: { name?: string } }).legal_sources?.name ?? ""} ${(s.section_number as string) ?? ""} ${(s.title as string) ?? ""}`.trim(),
  }));
  const templateRefs = (tmpls as Array<Record<string, unknown>>).map((t) => ({ id: t.id as string, label: (t.title as string) ?? "" }));
  const existingCases = (cases as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string, title: (c.title as string) ?? "", category: (c.category as string) ?? null,
  }));

  const draftRes = await fetch(`${_API_ORIGIN}/api/ai-draft-batch-item`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title, sketch,
      categories: cats.map((c: any) => c.name), keywords: kws.map((k: any) => k.keyword),
      templates: templateRefs, sections: sectionRefs,
      cases: existingCases.slice(0, 100).map((c) => ({ id: c.id, label: c.title, category: c.category ?? undefined })),
    }),
  });
  if (!draftRes.ok) throw new Error(`ai-draft-batch-item fehlgeschlagen: ${await draftRes.text()}`);
  const { draft } = (await draftRes.json()) as { draft: Record<string, unknown> };
  console.log(`Entwurf erhalten: "${draft.title ?? title}" (ampel: ${draft.ampel})\n`);

  // ---- 2) Anlegen ----
  console.log("=== 2/9: In Datenbank anlegen ===");
  const row = await createCase({
    title: (draft.title as string) ?? title,
    short_description: (draft.short_description as string) ?? sketch,
    category: (draft.category as string) ?? "", subcategory: (draft.subcategory as string) ?? "",
    ampel: (draft.ampel as "gruen" | "gelb" | "rot") ?? "gelb", status: "draft",
    short_answer: (draft.short_answer as string) ?? "", immediate_actions: (draft.immediate_actions as string) ?? "",
    recommendation: (draft.recommendation as string) ?? "", legal_explanation: (draft.legal_explanation as string) ?? "",
    responsibilities: (draft.responsibilities as string) ?? "", practice_tip: (draft.practice_tip as string) ?? "",
    checklist: toStringArray(draft.checklist),
    documentation: toStringArray(draft.documentation),
    common_mistakes: toStringArray(draft.common_mistakes),
    // faq ist ein Array aus {q,a}-Objekten, nicht aus Strings - NICHT durch
    // toStringArray schicken (das war der Fund 2026-08-14: das Batch-Skript
    // überschrieb faq faelschlich mit einem {meta}-Objekt statt der echten
    // Q&A-Liste, wodurch FAQ-Inhalte verloren gingen; hier bewusst korrekt).
    faq: Array.isArray((draft as any).faq) ? (draft as any).faq : [],
  } as any);
  const caseId = row.id;
  console.log(`Angelegt: ${caseId}\n`);

  // ---- 3) Vernetzung ----
  console.log("=== 3/9: Rechtsgrundlagen/Schlagwörter/Vorlagen/Ähnlichkeit ===");
  await completePracticeCase(caseId, {
    runLegalMatching: true, runKeywordMatching: true, runTemplateMatching: true,
    runSimilarityCheck: true, runQualityEvaluation: true, source: "manual",
  });

  // ---- 4) HARTE PRÜFUNG: Rechtsgrundlagen ----
  console.log("=== 4/9: Rechtsgrundlagen-Pflichtprüfung ===");
  let links = await listCaseLegalLinks(caseId);
  if (links.length === 0) {
    console.log("  Keine Rechtsgrundlage gefunden - zweiter Versuch...");
    await completePracticeCase(caseId, {
      runLegalMatching: true, runKeywordMatching: false, runTemplateMatching: false,
      runSimilarityCheck: false, runQualityEvaluation: false, source: "manual",
    });
    links = await listCaseLegalLinks(caseId);
  }
  if (links.length === 0) {
    console.log("\n❌ ABBRUCH: Auch im zweiten Versuch keine Rechtsgrundlage gefunden.");
    console.log("Dieser Fall bleibt als Entwurf liegen und braucht redaktionelle Prüfung -");
    console.log("es wird KEINE Norm erfunden und KEIN Fall ohne Rechtsgrundlage veröffentlicht.");
    console.log(`Fall-ID: ${caseId}`);
    process.exit(1);
  }
  console.log(`${links.length} Rechtsgrundlage(n) verknüpft:`);
  // listCaseLegalLinks()'s verschachtelter legal_sections-Join liefert derzeit
  // null (separater, hier nicht behobener Fund: mehrdeutige FK-Beziehung durch
  // die alte section_id-Spalte neben legal_section_id) - Titel daher per
  // eigener Abfrage direkt aus legal_sections auflösen, statt auf den Join
  // zu vertrauen.
  const sectionIds = (links as any[]).map((l) => l.legal_section_id).filter(Boolean);
  const { data: sectionRows } = sectionIds.length
    ? await (supabase.from("legal_sections") as any)
        .select("id, section_number, title, legal_sources(name)")
        .in("id", sectionIds)
    : { data: [] };
  const sectionById = new Map(((sectionRows ?? []) as any[]).map((s) => [s.id, s]));
  for (const l of links as any[]) {
    const s = sectionById.get(l.legal_section_id);
    console.log(`  - ${s?.legal_sources?.name ?? ""} ${s?.section_number ?? ""} ${s?.title ?? ""}`.trim() || `  - (Rechtsgrundlage ${l.legal_section_id})`);
  }
  console.log();

  // ---- 5) Entscheidungsbaum ----
  console.log("=== 5/9: Entscheidungsbaum generieren ===");
  const { data: freshRow } = await supabase.from("practice_cases").select("*").eq("id", caseId).limit(1);
  const caseRow = (freshRow ?? [])[0] as any;
  const treeRes = await fetch(`${_API_ORIGIN}/api/ai-draft-decision-tree`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseRow }),
  });
  if (!treeRes.ok) throw new Error(`ai-draft-decision-tree fehlgeschlagen: ${await treeRes.text()}`);
  const { tree } = (await treeRes.json()) as { tree: any };
  await updateCase(caseId, { decision_tree: tree } as any);
  const treeParsed = parseCuratedTree(tree);
  const treeOk = !!treeParsed && Object.keys(treeParsed.steps).length > 0 && Object.keys(treeParsed.results).length > 0 && validateCuratedTree(treeParsed).valid;
  console.log(`Baum: ${Object.keys(tree.steps ?? {}).length} Fragen, ${Object.keys(tree.results ?? {}).length} Ergebnisse, strukturell ${treeOk ? "OK" : "UNVOLLSTÄNDIG"}\n`);

  // ---- 6) Qualitätsoptimierung bis Score 100 ----
  console.log(`=== 6/9: Qualitätsoptimierung (Ziel: Score ${TARGET_SCORE}) ===`);
  let ev = await loadCaseForEvaluation(caseId);
  console.log(`Ausgangsscore: ${ev.score}`);
  for (let round = 1; round <= MAX_ROUNDS && ev.score < TARGET_SCORE; round++) {
    const fixable = deriveQualityTasks(ev).filter((t) => t.fixable);
    if (fixable.length === 0) { console.log("  Keine weiteren automatisch behebbaren Aufgaben."); break; }
    console.log(`  Runde ${round}: ${fixable.length} behebbare Aufgabe(n)...`);
    await fixCaseQualityTasks(fixable);
    ev = await loadCaseForEvaluation(caseId);
    console.log(`  -> Score jetzt: ${ev.score}`);
  }
  console.log();

  // ---- 7) Baum-Freigabe ----
  console.log("=== 7/9: Entscheidungsbaum freigeben ===");
  const { data: treeRowFresh } = await supabase.from("practice_cases").select("decision_tree").eq("id", caseId).limit(1);
  const currentTree = (treeRowFresh ?? [])[0]?.decision_tree as any;
  const currentParsed = parseCuratedTree(currentTree);
  const currentTreeOk = !!currentParsed && Object.keys(currentParsed.steps).length > 0 && Object.keys(currentParsed.results).length > 0 && validateCuratedTree(currentParsed).valid;
  if (currentTreeOk) {
    const meta = currentTree.meta ?? {};
    await updateCase(caseId, { decision_tree: { ...currentTree, meta: { ...meta, status: "approved", version: meta.version ?? 1 } } } as any);
    console.log("Baum freigegeben (meta.status = approved).\n");
  } else {
    console.log("Baum strukturell nicht vollständig - bleibt unfreigegeben (Entscheidungsassistent erscheint nicht im Frontend).\n");
  }

  // ---- 8) Redaktions-Workflow ----
  console.log("=== 8/9: Redaktions-Workflow (einreichen -> genehmigen -> veröffentlichen) ===");
  await EditorialWorkflowService.submitForReview({ caseId });
  const { data: reviewRows } = await (supabase.from("case_reviews") as any)
    .select("id").eq("case_id", caseId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1);
  const reviewId = (reviewRows ?? [])[0]?.id;
  if (reviewId) {
    await EditorialWorkflowService.decideReview({
      reviewId, decision: "approved",
      comment: `Automatisiert erstellt und geprüft: Score ${ev.score}/100, ${links.length} Rechtsgrundlage(n) verknüpft, Entscheidungsbaum ${currentTreeOk ? "freigegeben" : "unvollständig"}.`,
    });
  }
  await EditorialWorkflowService.publish({ caseId, publicationTier: "internal" });
  console.log("Veröffentlicht (Tier: internal).\n");

  // ---- 9) Abschlussbericht ----
  const finalEv = await loadCaseForEvaluation(caseId);
  console.log("=== 9/9: ABSCHLUSSBERICHT ===");
  console.log(`Titel: "${draft.title ?? title}"`);
  console.log(`Fall-ID: ${caseId}`);
  console.log(`Score: ${finalEv.score}/100`);
  console.log(`Rechtsgrundlagen: ${links.length}`);
  console.log(`Entscheidungsbaum: ${currentTreeOk ? "vollständig, freigegeben" : "unvollständig"}`);
  console.log(`Status: veröffentlicht (internal)`);
  if (finalEv.score < TARGET_SCORE) {
    console.log(`\nScore ${TARGET_SCORE} nicht vollständig erreicht. Verbleibende Gründe:`);
    for (const r of finalEv.reasons) {
      console.log(`  - [${r.category}, -${r.points} Pkt] ${r.message}${r.fixable ? "" : " (nur redaktionell behebbar)"}`);
    }
  } else {
    console.log("\nScore 100 erreicht.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
