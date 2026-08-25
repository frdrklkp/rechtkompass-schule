/**
 * Rückwirkende Anwendung des Legal Export Quality Gate (Claim-zu-Quelle-
 * Validierung) auf bereits veröffentlichte Praxisfälle, die den Schritt
 * nie durchlaufen haben (legal_review_status IS NULL - Stand 2026-08-25:
 * 430 von 431 veröffentlichten Fällen betroffen, siehe Nutzergespräch).
 *
 * Repliziert exakt dieselbe Aufruf-/Verarbeitungslogik wie
 * scripts/_create-and-publish-case.ts Schritt "4.5/9" (keine neue Logik) -
 * nur die Quelle der Eingabedaten ist ein bereits existierender Fall statt
 * eines frisch generierten.
 *
 * Aufruf: bun run scripts/_retro-validate-legal-claims.ts [--limit N] [--only-ids id1,id2,...] [--dry-run]
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
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function bootstrapSession(): Promise<void> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
  if (error) throw new Error(`generateLink fehlgeschlagen: ${error.message}`);
  const { supabase } = await import("../src/integrations/supabase/client");
  const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "magiclink" });
  if (verifyErr) throw new Error(`verifyOtp fehlgeschlagen: ${verifyErr.message}`);
}

const toArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : typeof v === "string" && v.trim() ? v.split(/\r?\n/).map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean)
    : [];

type ItemVerdict = { id: string; verdict: string; new_label?: string; note?: string };

async function processOne(
  caseId: string,
  caseTitle: string,
  updateCase: (id: string, patch: Record<string, unknown>) => Promise<unknown>,
  createLegalReviewFlag: (id: string, text: string) => Promise<unknown>,
  dryRun: boolean,
): Promise<{ color: string; downgraded: number; open: number; removed: number; conflicts: number }> {
  const { parseTieredItem, splitLegalExplanation } = await import("../src/lib/caseEnrichment");

  const { data: caseRows } = await supabaseAdmin.from("practice_cases").select("*").eq("id", caseId).limit(1);
  const caseRow = (caseRows ?? [])[0] as any;
  if (!caseRow) throw new Error("Fall nicht gefunden");

  const { data: links } = await supabaseAdmin.from("case_legal_links").select("legal_section_id").eq("case_id", caseId);
  const sectionIds = ((links ?? []) as any[]).map((l) => l.legal_section_id).filter(Boolean);

  const { data: fullSectionRows } = sectionIds.length
    ? await (supabaseAdmin.from("legal_sections") as any)
        .select("id, section_number, title, full_text, legal_sources(name)")
        .in("id", sectionIds)
    : { data: [] };
  const sources = ((fullSectionRows ?? []) as any[]).map((s) => ({
    id: s.id, reference: s.section_number ?? "", title: s.title ?? null,
    full_text: s.full_text ?? null, source_name: s.legal_sources?.name ?? null,
  }));

  const split = splitLegalExplanation(caseRow.legal_explanation);

  const checklistRaw = toArray(caseRow.checklist);
  const practiceTipRaw = toArray(caseRow.practice_tip);
  const commonMistakesRaw = toArray(caseRow.common_mistakes);
  const documentationRaw = toArray(caseRow.documentation);

  const checklistItems = checklistRaw.map((text, i) => ({ id: `checklist-${i}`, ...parseTieredItem(text) }));
  const practiceTipItems = practiceTipRaw.map((text, i) => ({ id: `practice_tip-${i}`, ...parseTieredItem(text) }));
  const commonMistakesItems = commonMistakesRaw.map((text, i) => ({ id: `common_mistakes-${i}`, ...parseTieredItem(text) }));
  const documentationItems = documentationRaw.map((text, i) => ({ id: `documentation-${i}`, ...parseTieredItem(text) }));

  const valRes = await fetch(`${_API_ORIGIN}/api/ai-validate-legal-claims`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: caseRow.title, category: caseRow.category,
      legal_vorgegeben: split.vorgegeben, legal_einordnung: split.einordnung,
      short_answer: caseRow.short_answer,
      recommendation: caseRow.recommendation,
      checklist: checklistItems, practice_tip: practiceTipItems, common_mistakes: commonMistakesItems,
      documentation: documentationItems,
      sources,
    }),
  });
  if (!valRes.ok) throw new Error(`ai-validate-legal-claims fehlgeschlagen (${valRes.status}): ${await valRes.text()}`);
  const val = (await valRes.json()) as {
    legal_explanation_revision: { changed: boolean; vorgegeben?: string; einordnung?: string };
    short_answer_revision: { changed: boolean; text?: string };
    consistency_conflicts: string[];
    source_summaries: Array<{ id: string; kind: "wortlaut" | "zusammengefasst"; text: string; preciseReference?: string }>;
    item_verdicts: ItemVerdict[];
    new_open_questions: string[];
    quality_color: "gruen" | "gelb" | "rot";
    quality_reasoning: string;
    release_gate_blockers: string[];
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

  console.log(`  Urteil: ${val.quality_color.toUpperCase()} - ${val.quality_reasoning}`);
  console.log(`  ${downgraded} herabgestuft, ${openFromItems + val.new_open_questions.length} offene Frage(n), ${removed} entfernt.`);
  if (val.consistency_conflicts.length > 0) {
    console.log(`  ${val.consistency_conflicts.length} Konsistenzkonflikt(e):`);
    for (const c of val.consistency_conflicts) console.log(`    - ${c}`);
  }
  if (val.release_gate_blockers.length > 0) {
    console.log(`  ${val.release_gate_blockers.length} Release-Blocker:`);
    for (const b of val.release_gate_blockers) console.log(`    - ${b}`);
  }

  if (dryRun) {
    console.log("  [DRY RUN] Keine Änderungen geschrieben.");
    return { color: val.quality_color, downgraded, open: openFromItems + val.new_open_questions.length, removed, conflicts: val.consistency_conflicts.length };
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
  await updateCase(caseId, updatePayload);

  for (const s of val.source_summaries) {
    await (supabaseAdmin.from("case_legal_links") as any)
      .update({ content_summary: s.text, content_summary_kind: s.kind, precise_reference: s.preciseReference ?? null })
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

  return { color: val.quality_color, downgraded, open: openFromItems + val.new_open_questions.length, removed, conflicts: val.consistency_conflicts.length };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 10;
  const onlyIdsIdx = args.indexOf("--only-ids");
  const dryRun = args.includes("--dry-run");

  let targets: { id: string; title: string }[];
  if (onlyIdsIdx >= 0) {
    const ids = args[onlyIdsIdx + 1].split(",").map((s) => s.trim()).filter(Boolean);
    const { data } = await supabaseAdmin.from("practice_cases").select("id, title").in("id", ids);
    targets = (data ?? []) as any[];
  } else {
    const { data } = await supabaseAdmin
      .from("practice_cases")
      .select("id, title")
      .eq("status", "published")
      .is("legal_review_status", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    targets = (data ?? []) as any[];
  }

  console.log(`${targets.length} Fälle werden geprüft${dryRun ? " (DRY RUN, keine Schreibvorgänge)" : ""}.\n`);

  console.log("Bootstrapping Admin-Session...");
  await bootstrapSession();
  const { updateCase, createLegalReviewFlag } = await import("../src/lib/coreBuilder");
  console.log("Session bereit.\n");

  const stats = { gruen: 0, gelb: 0, rot: 0, error: 0, downgraded: 0, open: 0, removed: 0, conflicts: 0 };
  for (let i = 0; i < targets.length; i++) {
    const { id, title } = targets[i];
    console.log(`[${i + 1}/${targets.length}] ${title.slice(0, 80)}`);
    try {
      const r = await processOne(id, title, updateCase, createLegalReviewFlag, dryRun);
      stats[r.color as "gruen" | "gelb" | "rot"]++;
      stats.downgraded += r.downgraded;
      stats.open += r.open;
      stats.removed += r.removed;
      stats.conflicts += r.conflicts;
    } catch (e) {
      stats.error++;
      console.log(`  FEHLER: ${e instanceof Error ? e.message : e}`);
    }
    console.log();
  }

  console.log("=== Zusammenfassung ===");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => { console.error("Skript fehlgeschlagen:", e); process.exit(1); });
