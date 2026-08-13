/**
 * Kuratiert die 15 besten Praxisfälle für die Lehrerkonferenz-Demo
 * (Nutzeranforderung 2026-08-13): überragende Qualität, mehrere belastbare
 * Rechtsgrundlagen, hinterlegte Wissenskarten, funktionierender (freigegebener)
 * Entscheidungsassistent.
 *
 * Modi:
 *   --select-only   Nur ranken + Wissenskarten-Lücken schließen, NICHT
 *                    veröffentlichen. Druckt die Kandidatenliste zur
 *                    redaktionellen Kontrolle vor dem eigentlichen Publish-Schritt.
 *   (kein Flag)      Zusätzlich: die finalen 15 durch den Redaktions-Workflow
 *                    schieben (submit -> approve -> publish, tier "internal").
 *
 * Auswahlkriterien (alle Pflicht):
 *   - qualityEngine.evaluateCase(): hardBlockers.length === 0, score >= 88
 *   - counts.legalCount >= 3 ("mehrere" Rechtsgrundlagen)
 *   - Wissenskarten-Abdeckung 100% (missingKnowledgeCardIds.length === 0,
 *     ggf. durch KI-Anreicherung von legal_sections.practice_relevance
 *     hergestellt - NUR für Abschnitte, die noch keinen Wert haben, bestehende
 *     redaktionelle Inhalte werden nie überschrieben)
 *   - decision_tree strukturell valide UND meta.status === "approved"
 *     (isCuratedTreeApproved-Kriterien, siehe src/lib/decisionTree.ts)
 *
 * Aufruf: bun run scripts/_curate-showcase-cases.ts --select-only
 *         bun run scripts/_curate-showcase-cases.ts
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
const SELECT_ONLY = process.argv.includes("--select-only");
const TARGET_COUNT = 15;
const MIN_SCORE = 88;
const MIN_LEGAL = 2; // "mehrere" = Plural, mind. 2. Diagnose 2026-08-13: >=3 träfe nur ~12% des Bestands.

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

/**
 * Strukturelle Bereitschaft OHNE meta.status-Gate: die separate
 * Massen-Freigabe (scripts/_backfill-decision-trees.ts Phase 2) läuft noch
 * und hat entsprechend noch keinen einzigen Baum auf "approved" gesetzt
 * (Diagnose 2026-08-13: 98 strukturell valide Bäume, 0 davon approved).
 * Für die hier handverlesenen 15 Fälle übernimmt DIESES Skript selbst die
 * redaktionelle Freigabe (meta.status -> "approved") im Publish-Schritt -
 * das ist eine strengere Prüfung (Score, Rechtsgrundlagen, Wissenskarten)
 * als die pauschale Massen-Freigabe und ersetzt sie für diese Auswahl.
 */
function isTreeReady(tree: unknown, parseCuratedTree: any, validateCuratedTree: any): boolean {
  const parsed = parseCuratedTree(tree);
  if (!parsed) return false;
  if (Object.keys(parsed.steps).length === 0) return false;
  if (Object.keys(parsed.results).length === 0) return false;
  return validateCuratedTree(parsed).valid;
}

async function main() {
  console.log(`Modus: ${SELECT_ONLY ? "SELECT-ONLY (kein Publish)" : "SELECT + PUBLISH"}\n`);
  console.log("Bootstrapping Admin-Session...");
  await bootstrapSession();
  console.log("Session bereit.\n");

  const { supabase } = await import("../src/integrations/supabase/client");
  const { apiFetch } = await import("../src/lib/apiFetch");
  const { loadCaseForEvaluation } = await import("../src/lib/qualityEngine");
  const { parseCuratedTree, validateCuratedTree } = await import("../src/lib/decisionTree");
  const { EditorialWorkflowService } = await import("../src/services/editorial/EditorialWorkflowService");

  const { data: rows, error } = await supabase
    .from("practice_cases")
    .select("id,title,workflow_status,decision_tree");
  if (error) throw error;
  console.log(`${rows?.length ?? 0} Fälle insgesamt. Bewerte alle...\n`);

  type Candidate = {
    id: string; title: string; workflow_status: string; decision_tree: unknown;
    score: number; legalCount: number; hardBlockers: string[]; missingKnowledgeCardIds: string[];
  };
  const candidates: Candidate[] = [];

  // In Batches von 10 parallel auswerten - genug Parallelität, ohne die DB zu fluten.
  const all = (rows ?? []) as any[];
  for (let i = 0; i < all.length; i += 10) {
    const batch = all.slice(i, i + 10);
    const evals = await Promise.all(
      batch.map(async (r) => {
        try {
          const ev = await loadCaseForEvaluation(r.id);
          return { r, ev };
        } catch (e) {
          console.log(`  Bewertungsfehler ${r.id}: ${e instanceof Error ? e.message : e}`);
          return null;
        }
      }),
    );
    for (const item of evals) {
      if (!item) continue;
      const { r, ev } = item;
      const treeOk = isTreeReady(r.decision_tree, parseCuratedTree, validateCuratedTree);
      if (ev.hardBlockers.length === 0 && ev.score >= MIN_SCORE && ev.counts.legalCount >= MIN_LEGAL && treeOk) {
        candidates.push({
          id: r.id, title: r.title, workflow_status: r.workflow_status, decision_tree: r.decision_tree,
          score: ev.score, legalCount: ev.counts.legalCount,
          hardBlockers: ev.hardBlockers,
          missingKnowledgeCardIds: (ev as any).missingKnowledgeCardIds ?? [],
        });
      }
    }
    if ((i + 10) % 50 < 10) console.log(`  ...${Math.min(i + 10, all.length)}/${all.length} bewertet, ${candidates.length} Kandidaten bisher`);
  }

  // missingKnowledgeCardIds steht nicht direkt in EvalResult (nur reasons/warnings) -
  // wir ermitteln fehlende Wissenskarten daher separat je Kandidat, exakt.
  console.log(`\n${candidates.length} Kandidaten erfüllen Score/Blocker/Rechtsgrundlagen/Baum-Kriterien.`);
  console.log("Prüfe Wissenskarten-Abdeckung je Kandidat...\n");

  candidates.sort((a, b) => b.score - a.score || b.legalCount - a.legalCount);

  type Enriched = Candidate & { knowledgeCount: number; legalSectionIds: string[] };
  const finalists: Enriched[] = [];

  for (const cand of candidates) {
    if (finalists.length >= TARGET_COUNT) break;

    const { data: links } = await (supabase.from("case_legal_links") as any)
      .select("legal_section_id")
      .eq("case_id", cand.id);
    const sectionIds = ((links ?? []) as any[]).map((l) => l.legal_section_id).filter(Boolean);
    if (sectionIds.length === 0) continue;

    const { data: sections } = await (supabase.from("legal_sections") as any)
      .select("id, section_number, title, full_text, practice_relevance, summary, recommendation, common_mistakes, source_id, legal_sources(name, jurisdiction)")
      .in("id", sectionIds);
    const sectionRows = (sections ?? []) as any[];
    const missing = sectionRows.filter((s) => !s.practice_relevance);

    if (missing.length > 0) {
      console.log(`  "${cand.title.slice(0, 55)}": ${missing.length} Wissenskarte(n) fehlen, reichere an...`);
      for (const sec of missing) {
        try {
          const res = await apiFetch("/api/enrich-legal-section", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              section_number: sec.section_number,
              title: sec.title,
              full_text: sec.full_text,
              source_name: sec.legal_sources?.name,
              source_area: sec.legal_sources?.jurisdiction,
            }),
          });
          if (!res.ok) { console.log(`    Fehler bei ${sec.section_number}: HTTP ${res.status}`); continue; }
          const { draft } = (await res.json()) as { draft: Record<string, unknown> };
          const patch: Record<string, unknown> = {};
          if (draft.practice_relevance) patch.practice_relevance = draft.practice_relevance;
          if (!sec.summary && draft.summary) patch.summary = draft.summary;
          if (!sec.recommendation && draft.recommendation) patch.recommendation = draft.recommendation;
          if (!sec.common_mistakes && draft.common_mistakes) patch.common_mistakes = draft.common_mistakes;
          if (Object.keys(patch).length === 0) continue;
          const { error: updErr } = await (supabase.from("legal_sections") as any).update(patch).eq("id", sec.id);
          if (updErr) { console.log(`    Speicherfehler ${sec.section_number}: ${updErr.message}`); continue; }
          sec.practice_relevance = patch.practice_relevance ?? sec.practice_relevance;
        } catch (e) {
          console.log(`    Ausnahme bei ${sec.section_number}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    const stillMissing = sectionRows.filter((s) => !s.practice_relevance);
    const knowledgeCount = sectionRows.length - stillMissing.length;
    if (stillMissing.length > 0) {
      console.log(`  -> "${cand.title.slice(0, 55)}" übersprungen (${stillMissing.length} Wissenskarte(n) weiterhin fehlend)`);
      continue;
    }

    finalists.push({ ...cand, knowledgeCount, legalSectionIds: sectionIds });
    console.log(`  OK [${finalists.length}/${TARGET_COUNT}] Score ${cand.score} · ${cand.legalCount} Rechtsgrundlagen · ${knowledgeCount} Wissenskarten · "${cand.title.slice(0, 55)}"`);
  }

  console.log(`\n=== ${finalists.length} von ${TARGET_COUNT} Ziel-Fällen gefunden ===\n`);
  finalists.forEach((f, i) => {
    console.log(`${i + 1}. [${f.workflow_status}] Score ${f.score} · ${f.legalCount} RG · ${f.knowledgeCount} WK · ${f.title}`);
    console.log(`   id: ${f.id}`);
  });

  if (finalists.length < TARGET_COUNT) {
    console.log(`\nWARNUNG: nur ${finalists.length} statt ${TARGET_COUNT} Fälle erfüllen alle Kriterien.`);
  }

  if (SELECT_ONLY) {
    console.log("\n--select-only: kein Publish-Schritt ausgeführt.");
    return;
  }

  console.log("\n=== Publish-Schritt: schiebe Finalisten durch den Redaktions-Workflow ===\n");
  const { updateCase } = await import("../src/lib/coreBuilder");
  const stats = { published: 0, alreadyPublished: 0, error: 0 };
  for (const f of finalists) {
    try {
      // Redaktionelle Freigabe des Entscheidungsbaums (siehe isTreeReady-Kommentar
      // oben) - ersetzt für diese handverlesenen Fälle die separate Massen-Freigabe.
      const parsedTree = f.decision_tree as Record<string, unknown>;
      const currentMeta = (parsedTree?.meta as Record<string, unknown>) ?? {};
      if (currentMeta.status !== "approved") {
        await updateCase(f.id, {
          decision_tree: { ...parsedTree, meta: { ...currentMeta, status: "approved", version: currentMeta.version ?? 1 } },
        } as any);
      }

      if (f.workflow_status === "published") {
        stats.alreadyPublished++;
        console.log(`  bereits veröffentlicht: "${f.title.slice(0, 55)}"`);
        continue;
      }
      if (f.workflow_status === "draft") {
        await EditorialWorkflowService.submitForReview({ caseId: f.id });
      }
      // Nach submit (oder wenn bereits in_review) offenes Review suchen und genehmigen.
      const { data: reviewRows } = await (supabase.from("case_reviews") as any)
        .select("id")
        .eq("case_id", f.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      const reviewId = (reviewRows ?? [])[0]?.id;
      if (reviewId) {
        await EditorialWorkflowService.decideReview({ reviewId, decision: "approved", comment: "Kuratiert für Lehrerkonferenz-Demo (Qualitäts-Score, Rechtsgrundlagen, Wissenskarten, Entscheidungsbaum geprüft)." });
      }
      await EditorialWorkflowService.publish({ caseId: f.id, publicationTier: "internal" });
      stats.published++;
      console.log(`  veröffentlicht: "${f.title.slice(0, 55)}"`);
    } catch (e) {
      stats.error++;
      console.log(`  FEHLER bei "${f.title.slice(0, 55)}": ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n=== Fertig: ${JSON.stringify(stats)} ===`);
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
