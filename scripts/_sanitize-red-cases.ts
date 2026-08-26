/**
 * Textsanierung der ROT-Fälle (Nutzerauftrag 2026-08-26): lädt je Fall die
 * verlinkten Rechtsgrundlagen im Volltext plus die Prüfbefunde
 * (legal_review_reasoning + ungelöste case_legal_review_flags), lässt
 * /api/ai-revise-legal-case die beanstandeten Felder verankern/abstufen/
 * streichen und schreibt die geänderten Felder zurück. Alte ungelöste Flags
 * des Falls werden nach erfolgreicher Sanierung als gelöst markiert - die
 * anschließende Neuprüfung (scripts/_retro-validate-legal-claims.ts, separat
 * ausführen) legt für weiterhin Offenes frische Flags an und vergibt den
 * neuen Status. Diese Trennung hält die Abnahme unabhängig von der Sanierung.
 *
 * Aufruf: bun run scripts/_sanitize-red-cases.ts [--limit N] [--only-ids id1,id2,...] [--dry-run]
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

type ChangedString = { changed: boolean; text?: string };
type ChangedArray = { changed: boolean; items?: string[] };
type Revision = {
  legal_explanation: { changed: boolean; vorgegeben?: string; einordnung?: string };
  short_answer: ChangedString;
  recommendation: ChangedString;
  immediate_actions: ChangedString;
  practice_tip: ChangedString;
  checklist: ChangedArray;
  common_mistakes: ChangedArray;
  documentation: ChangedArray;
  revision_notes: string[];
  unresolved: string[];
};

async function processOne(
  caseId: string,
  caseTitle: string,
  updateCase: (id: string, patch: Record<string, unknown>) => Promise<unknown>,
  dryRun: boolean,
): Promise<{ changedFields: number; unresolved: number }> {
  const { splitLegalExplanation } = await import("../src/lib/caseEnrichment");

  const { data: caseRows } = await supabaseAdmin.from("practice_cases").select("*").eq("id", caseId).limit(1);
  const c = (caseRows ?? [])[0] as any;
  if (!c) throw new Error("Fall nicht gefunden");

  const { data: links } = await supabaseAdmin.from("case_legal_links").select("legal_section_id").eq("case_id", caseId);
  const sectionIds = ((links ?? []) as any[]).map((l) => l.legal_section_id).filter(Boolean);
  const { data: sectionRows } = sectionIds.length
    ? await (supabaseAdmin.from("legal_sections") as any)
        .select("id, section_number, title, full_text, legal_sources(name)")
        .in("id", sectionIds)
    : { data: [] };
  const sources = ((sectionRows ?? []) as any[]).map((s) => ({
    id: s.id, reference: s.section_number ?? "", title: s.title ?? null,
    full_text: s.full_text ?? null, source_name: s.legal_sources?.name ?? null,
  }));

  const { data: flagRows } = await (supabaseAdmin.from("case_legal_review_flags") as any)
    .select("id, reason").eq("case_id", caseId).is("resolved_at", null);
  const openFlags = ((flagRows ?? []) as Array<{ id: string; reason: string | null }>);

  const split = splitLegalExplanation(c.legal_explanation);

  const res = await fetch("/api/ai-revise-legal-case", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });
  if (!res.ok) throw new Error(`ai-revise-legal-case fehlgeschlagen (${res.status}): ${await res.text()}`);
  const rev = (await res.json()) as Revision;

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

  const changedFields = Object.keys(patch).length;
  console.log(`  ${changedFields} Feld(er) geändert, ${rev.unresolved.length} weiterhin ungeklärt.`);
  for (const n of rev.revision_notes.slice(0, 12)) console.log(`    · ${n.slice(0, 140)}`);
  for (const u of rev.unresolved.slice(0, 6)) console.log(`    ? ${u.slice(0, 140)}`);

  if (!dryRun && changedFields > 0) {
    await updateCase(caseId, patch);
    // Alte, in die Sanierung eingeflossene Flags als erledigt markieren -
    // die anschließende Neuprüfung legt für weiterhin Offenes frische an.
    if (openFlags.length) {
      const { error } = await (supabaseAdmin.from("case_legal_review_flags") as any)
        .update({ resolved_at: new Date().toISOString() })
        .eq("case_id", caseId).is("resolved_at", null);
      if (error) throw new Error(`Flags auflösen fehlgeschlagen: ${error.message}`);
    }
  } else if (dryRun) {
    console.log("  [DRY RUN] Keine Änderungen geschrieben.");
  }

  return { changedFields, unresolved: rev.unresolved.length };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 10;
  const onlyIdsIdx = args.indexOf("--only-ids");

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
      .eq("legal_review_status", "rot")
      .order("created_at", { ascending: true })
      .limit(limit);
    targets = (data ?? []) as any[];
  }

  console.log(`${targets.length} ROT-Fälle werden saniert${dryRun ? " (DRY RUN, keine Schreibvorgänge)" : ""}.\n`);
  console.log("Bootstrapping Admin-Session...");
  await bootstrapSession();
  const { updateCase } = await import("../src/lib/coreBuilder");
  console.log("Session bereit.\n");

  const stats = { saniert: 0, unveraendert: 0, error: 0, changedFields: 0, unresolved: 0 };
  for (let i = 0; i < targets.length; i++) {
    const { id, title } = targets[i];
    console.log(`[${i + 1}/${targets.length}] ${title.slice(0, 80)}`);
    try {
      const r = await processOne(id, title, updateCase, dryRun);
      if (r.changedFields > 0) stats.saniert++; else stats.unveraendert++;
      stats.changedFields += r.changedFields;
      stats.unresolved += r.unresolved;
    } catch (err) {
      stats.error++;
      console.log(`  FEHLER: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n=== Zusammenfassung ===\n${JSON.stringify(stats, null, 2)}`);
}

main();
