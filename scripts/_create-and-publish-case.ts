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

  const { createCase, listCategories, listKeywords, listTemplates, listSections, listCases, listCaseLegalLinks, updateCase, createLegalReviewFlag } =
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

  // ---- 2b) Offene Fragen aus dem Entwurf als Legal-Review-Flags eintragen ----
  // Sperrt die Veröffentlichung automatisch über die bestehende Blocker-Regel
  // "legal.no_open_flags", bis die Redaktion sie auflöst.
  const openQuestions = Array.isArray((draft as any).open_questions) ? (draft as any).open_questions : [];
  if (openQuestions.length > 0) {
    console.log(`=== 2b/9: ${openQuestions.length} offene Frage(n) aus dem Entwurf als Legal-Review-Flag eingetragen ===`);
    for (const oq of openQuestions) {
      if (!oq || typeof oq.question !== "string" || !oq.question.trim()) continue;
      const field = typeof oq.field === "string" && oq.field.trim() ? oq.field.trim() : "unbekanntes Feld";
      await createLegalReviewFlag(caseId, `[${field}] ${oq.question.trim()}`);
      console.log(`  - [${field}] ${oq.question.trim()}`);
    }
    console.log("");
  }

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

  // ---- 4.5) Legal Export Quality Gate: Claim-zu-Quelle-Validierung ----
  // Zweiter, unabhängiger KI-Durchlauf: prüft jedes gelabelte Element
  // (Checkliste/Do's/Don'ts) und die Rechtlich-vorgegeben/Einordnung-Absätze
  // GEGEN den tatsächlichen Volltext der verlinkten Rechtsgrundlagen.
  // Reklassifiziert statt neu zu formulieren (kein Risiko neuer
  // Halluzination beim "Verbessern").
  console.log("=== 4.5/9: Legal Export Quality Gate (Claim-Validierung) ===");
  let qualityColor: "gruen" | "gelb" | "rot" = "gruen";
  {
    const { parseTieredItem, splitLegalExplanation } = await import("../src/lib/caseEnrichment");

    const { data: fullSectionRows } = sectionIds.length
      ? await (supabase.from("legal_sections") as any)
          .select("id, section_number, title, full_text, legal_sources(name)")
          .in("id", sectionIds)
      : { data: [] };
    const sources = ((fullSectionRows ?? []) as any[]).map((s) => ({
      id: s.id, reference: s.section_number ?? "", title: s.title ?? null,
      full_text: s.full_text ?? null, source_name: s.legal_sources?.name ?? null,
    }));

    const { data: caseRows2 } = await supabase.from("practice_cases").select("*").eq("id", caseId).limit(1);
    const caseRow2 = (caseRows2 ?? [])[0] as any;
    const split = splitLegalExplanation(caseRow2.legal_explanation);

    const toArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : typeof v === "string" && v.trim() ? v.split(/\r?\n/).map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean)
        : [];

    const checklistRaw = toArray(caseRow2.checklist);
    const practiceTipRaw = toArray(caseRow2.practice_tip);
    const commonMistakesRaw = toArray(caseRow2.common_mistakes);
    const documentationRaw = toArray(caseRow2.documentation);

    const checklistItems = checklistRaw.map((text, i) => ({ id: `checklist-${i}`, ...parseTieredItem(text) }));
    const practiceTipItems = practiceTipRaw.map((text, i) => ({ id: `practice_tip-${i}`, ...parseTieredItem(text) }));
    const commonMistakesItems = commonMistakesRaw.map((text, i) => ({ id: `common_mistakes-${i}`, ...parseTieredItem(text) }));
    const documentationItems = documentationRaw.map((text, i) => ({ id: `documentation-${i}`, ...parseTieredItem(text) }));

    const valRes = await fetch(`${_API_ORIGIN}/api/ai-validate-legal-claims`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: caseRow2.title, category: caseRow2.category,
        legal_vorgegeben: split.vorgegeben, legal_einordnung: split.einordnung,
        short_answer: caseRow2.short_answer,
        recommendation: caseRow2.recommendation,
        checklist: checklistItems, practice_tip: practiceTipItems, common_mistakes: commonMistakesItems,
        documentation: documentationItems,
        sources,
      }),
    });
    if (!valRes.ok) throw new Error(`ai-validate-legal-claims fehlgeschlagen: ${await valRes.text()}`);
    const val = (await valRes.json()) as {
      legal_explanation_revision: { changed: boolean; vorgegeben?: string; einordnung?: string };
      short_answer_revision: { changed: boolean; text?: string };
      consistency_conflicts: string[];
      source_summaries: Array<{ id: string; kind: "wortlaut" | "zusammengefasst"; text: string; preciseReference?: string }>;
      item_verdicts: Array<{ id: string; verdict: string; new_label?: string; note?: string }>;
      new_open_questions: string[];
      quality_color: "gruen" | "gelb" | "rot";
      quality_reasoning: string;
      release_gate_blockers: string[];
      release_gate_flags: Array<{ claimId: string; flagType: string; message: string }>;
      claims: Array<{ id: string; section: string; text: string; classification: string; isCentral: boolean; sourceId?: string | null }>;
      model_quality_color: "gruen" | "gelb" | "rot";
    };

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
        } // "entfernen": Element wird ausgelassen.
      }
      return out;
    }

    const newChecklist = applyVerdicts(checklistItems);
    const newPracticeTipLines = applyVerdicts(practiceTipItems).map((s) => `- ${s}`);
    const newCommonMistakes = applyVerdicts(commonMistakesItems);
    const newDocumentation = applyVerdicts(documentationItems);

    const downgraded = val.item_verdicts.filter((v) => v.verdict === "herabgestuft").length;
    const openFromItems = val.item_verdicts.filter((v) => v.verdict === "offene_frage").length;
    const removed = val.item_verdicts.filter((v) => v.verdict === "entfernen").length;
    // Fund 2026-08-21 (Legal Export Release Blocker): der Status kommt jetzt
    // deterministisch aus computeReleaseGate() (siehe ai-validate-legal-claims.ts),
    // nicht mehr aus der Modell-Selbstauskunft. val.model_quality_color wird
    // nur noch als Vergleichswert geloggt.
    console.log(`Urteil: ${val.quality_color.toUpperCase()} - ${val.quality_reasoning}`);
    if (val.model_quality_color !== val.quality_color) {
      console.log(`  (Modell selbst schätzte ${val.model_quality_color.toUpperCase()} - maßgeblich ist die deterministische Berechnung.)`);
    }
    console.log(`  ${downgraded} herabgestuft, ${openFromItems + val.new_open_questions.length} offene Frage(n), ${removed} entfernt.`);
    if (val.consistency_conflicts.length > 0) {
      console.log(`  ${val.consistency_conflicts.length} Konsistenzkonflikt(e) zwischen Aussagen gefunden:`);
      for (const c of val.consistency_conflicts) console.log(`    - ${c}`);
    }
    if (val.release_gate_blockers.length > 0) {
      console.log(`  ${val.release_gate_blockers.length} Release-Blocker (Legal Claim Audit):`);
      for (const b of val.release_gate_blockers) console.log(`    - ${b}`);
    }

    const updatePayload: Record<string, unknown> = {
      checklist: newChecklist,
      practice_tip: newPracticeTipLines.join("\n"),
      common_mistakes: newCommonMistakes,
      documentation: newDocumentation,
      legal_review_status: val.quality_color,
      legal_review_reasoning: val.quality_reasoning,
    };
    if (val.legal_explanation_revision.changed) {
      updatePayload.legal_explanation =
        `RECHTLICH VORGEGEBEN: ${val.legal_explanation_revision.vorgegeben}\n\nRECHTLICHE EINORDNUNG: ${val.legal_explanation_revision.einordnung}`;
      console.log("  legal_explanation wurde vorsichtiger neu gefasst.");
    }
    if (val.short_answer_revision.changed && val.short_answer_revision.text) {
      updatePayload.short_answer = val.short_answer_revision.text;
      console.log("  short_answer wurde vorsichtiger neu gefasst.");
    }
    await updateCase(caseId, updatePayload as any);

    // Kompakte, gekennzeichnete Rechtsquellen-Kurzfassung je Fall-Quelle-
    // Verknüpfung speichern (ersetzt die Anzeige des vollen Normtexts im
    // Export durch eine gezielte, aber ehrlich gekennzeichnete Fassung).
    for (const s of val.source_summaries) {
      await (supabase.from("case_legal_links") as any)
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
    // Flags statt generischer Meldungen - je Blocker Claim/Status/Quelle/
    // Problem/Empfohlene Aktion, damit die Redaktion direkt sieht, was zu
    // tun ist, statt nur "Rechtslage prüfen".
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

    qualityColor = val.quality_color;
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

  // Veröffentlichungs-Sperre: die Blocker-Regel "legal.no_open_flags"
  // (src/services/editorial/quality/rules.ts) wird nur in der Admin-UI
  // (PublishReadinessDialog) geprüft, nicht in der publish_case-RPC selbst.
  // Das Skript muss den Check daher selbst vornehmen, sonst würde es offene
  // Unsicherheiten aus 2b) stillschweigend übergehen.
  const { data: openFlags } = await (supabase.from("case_legal_review_flags") as any)
    .select("id, reason").eq("case_id", caseId).is("resolved_at", null);
  const hasOpenFlags = (openFlags?.length ?? 0) > 0;
  const isRot = qualityColor === "rot";
  let published = false;
  // Technischer Release-Block (Legal Export Release Blocker, Regel 19): bei
  // Rot keine Kennzeichnung "geprüft"/"rechtssicher"/"freigegeben", keine
  // automatische Veröffentlichung, kein Publish ohne Warnung.
  if (hasOpenFlags || isRot) {
    console.log("Veröffentlichung blockiert: zentrale Rechtsclaims nicht hinreichend belegt.");
    if (isRot) console.log("  - Legal Claim Audit: Status ROT.");
    if (hasOpenFlags) {
      console.log(`  - ${openFlags!.length} offene Rechts-Review-Hinweis(e):`);
      for (const f of openFlags as any[]) console.log(`    - ${f.reason}`);
    }
    console.log("Fall bleibt im Status 'genehmigt', bis dies redaktionell aufgelöst ist.\n");
  } else {
    if (qualityColor === "gelb") {
      console.log("Hinweis: Status GELB - fachliche Prüfung empfohlen. Export/Veröffentlichung möglich, aber NICHT als vollständig geprüfter Praxisfall gekennzeichnet.");
    }
    await EditorialWorkflowService.publish({ caseId, publicationTier: "internal" });
    published = true;
    console.log("Veröffentlicht (Tier: internal).\n");
  }

  // ---- 9) Abschlussbericht ----
  const finalEv = await loadCaseForEvaluation(caseId);
  console.log("=== 9/9: ABSCHLUSSBERICHT ===");
  console.log(`Titel: "${draft.title ?? title}"`);
  console.log(`Fall-ID: ${caseId}`);
  console.log(`Score: ${finalEv.score}/100`);
  console.log(`Rechtsgrundlagen: ${links.length}`);
  console.log(`Entscheidungsbaum: ${currentTreeOk ? "vollständig, freigegeben" : "unvollständig"}`);
  console.log(`Legal Export Quality Gate: ${qualityColor.toUpperCase()}`);
  console.log(`Status: ${published ? "veröffentlicht (internal)" : "genehmigt, NICHT veröffentlicht (offene Rechts-Review-Hinweise oder Quality Gate ROT)"}`);
  if (openQuestions.length > 0) {
    console.log(`Offene Fragen aus dem Entwurf: ${openQuestions.length}`);
  }
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
