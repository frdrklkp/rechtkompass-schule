/**
 * Neu-Verknüpfung der 96 Berufskolleg-Fälle, deren Rechtsgrundlagen-Links
 * am fehlerhaften Vorfilter vorbei entstanden sind (Fund 2026-08-26: der
 * Token-Überlappungs-Vorfilter in ai-draft-batch-item.ts ließ keinen der
 * 372 APO-BK-Paragraphen in die Top-300, sodass die KI beim Entwurf nur
 * unpassende Ersatzquellen wie APO-GOSt oder PO-Externe-S I sehen konnte).
 *
 * Ablauf pro Fall:
 *  1. Kandidatenkatalog über den GEFIXTEN Vorfilter aufbauen (importiert
 *     die echte filterRelevantSections aus ai-draft-batch-item.ts, mit
 *     Fall-Volltext + "Berufskolleg"-Anker, Top-400 wie von
 *     /api/ai-match-legal-sections akzeptiert).
 *  2. /api/ai-match-legal-sections: neue Zuordnungen wählen lassen.
 *  3. /api/ai-reevaluate-legal-links: bestehende Links einzeln bewerten.
 *  4. Anwenden: neue Links anlegen (createLegalLink), klar irrelevante
 *     bestehende Links entfernen (deleteLegalLink, nur bei Verdict
 *     "irrelevant" mit confidence >= 70).
 *
 * Die Fall-IDs kommen aus der Scoping-Analyse (gap_refined.json); über
 * --gap-file ist der Pfad übersteuerbar. Kein Fall wird veröffentlicht/
 * entpublisht - es ändern sich ausschließlich case_legal_links.
 *
 * Aufruf: bun run scripts/_relink-apo-bk-cases.ts [--limit N] [--only-ids id1,id2,...] [--dry-run] [--gap-file pfad.json]
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
import { readFileSync } from "node:fs";
import { filterRelevantSections } from "../src/routes/api/ai-draft-batch-item";

const ADMIN_EMAIL = "admin@rechtkompass.local";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_GAP_FILE =
  "/private/tmp/claude-501/-Users-frederik-Downloads-A-Fresh-Start/05ab1dc5-2718-4ee1-97a7-493f09297f00/scratchpad/gap_refined.json";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function bootstrapSession(): Promise<void> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
  if (error) throw new Error(`generateLink fehlgeschlagen: ${error.message}`);
  const { supabase } = await import("../src/integrations/supabase/client");
  const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "magiclink" });
  if (verifyErr) throw new Error(`verifyOtp fehlgeschlagen: ${verifyErr.message}`);
}

type SectionRow = {
  id: string;
  section_number: string | null;
  title: string | null;
  legal_sources: { name: string | null; short_name: string | null } | null;
};

async function loadAllSections(): Promise<SectionRow[]> {
  const PAGE = 1000;
  const all: SectionRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await (supabaseAdmin.from("legal_sections") as any)
      .select("id, section_number, title, legal_sources(name, short_name)")
      .order("section_number")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`legal_sections laden fehlgeschlagen: ${error.message}`);
    all.push(...((data ?? []) as SectionRow[]));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

type MatchResult = {
  matches: Array<{ id: string; confidence: number; relevance_stars: number; relevance_tier?: string; reason: string }>;
  missing_area?: string;
};
type ReevalResult = {
  verdicts: Array<{ id: string; relevance: string; confidence: number; reason: string }>;
};

const tierToRelevance = (tier: string | undefined): "low" | "medium" | "high" =>
  tier === "primary" ? "high" : tier === "supporting" ? "medium" : "low";

async function processOne(
  caseId: string,
  allSections: SectionRow[],
  createLegalLink: (caseId: string, sectionId: string, note?: string, relevance?: "low" | "medium" | "high" | null) => Promise<unknown>,
  deleteLegalLink: (id: string) => Promise<void>,
  dryRun: boolean,
): Promise<{ added: number; removed: number; kept: number }> {
  const { data: caseRows } = await supabaseAdmin.from("practice_cases").select("*").eq("id", caseId).limit(1);
  const c = (caseRows ?? [])[0] as any;
  if (!c) throw new Error("Fall nicht gefunden");
  console.log(`\n»${(c.title as string).slice(0, 80)}«`);

  const { data: linkRows } = await (supabaseAdmin.from("case_legal_links") as any)
    .select("id, legal_section_id")
    .eq("case_id", caseId);
  const existingLinks = ((linkRows ?? []) as Array<{ id: string; legal_section_id: string }>).filter((l) => l.legal_section_id);
  const linkedSectionIds = new Set(existingLinks.map((l) => l.legal_section_id));
  const sectionById = new Map(allSections.map((s) => [s.id, s]));

  // 1) Kandidatenkatalog über den gefixten Vorfilter (wie die Entwurfs-Route,
  //    aber mit dem vollen Fall-Text statt nur der Ideen-Skizze).
  const labelRefs = allSections.map((s) => ({
    id: s.id,
    label: `${s.legal_sources?.name ?? ""} ${s.section_number ?? ""} ${s.title ?? ""}`.trim(),
  }));
  const queryText = [
    c.title, c.short_description, c.category, c.subcategory,
    c.legal_explanation, c.recommendation, c.immediate_actions, "Berufskolleg",
  ].filter(Boolean).join(" ");
  const candidates = filterRelevantSections(labelRefs, queryText, 400).map((ref) => {
    const s = sectionById.get(ref.id)!;
    return {
      id: s.id,
      source_short: s.legal_sources?.short_name ?? s.legal_sources?.name ?? "",
      section_number: s.section_number ?? "",
      title: s.title ?? "",
    };
  });

  // 2) Neue Zuordnungen wählen lassen.
  const matchRes = await fetch("/api/ai-match-legal-sections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: c.title ?? "",
      short_description: c.short_description ?? "",
      category: c.category ?? "",
      subcategory: c.subcategory ?? "",
      bildungsgang: "Berufskolleg",
      recommendation: c.recommendation ?? "",
      immediate_actions: c.immediate_actions ?? "",
      responsibilities: c.responsibilities ?? "",
      sections: candidates,
    }),
  });
  if (!matchRes.ok) throw new Error(`ai-match-legal-sections fehlgeschlagen (${matchRes.status}): ${await matchRes.text()}`);
  const match = (await matchRes.json()) as MatchResult;

  // 3) Bestehende Links einzeln bewerten.
  let verdicts: ReevalResult["verdicts"] = [];
  if (existingLinks.length > 0) {
    const reevalRes = await fetch("/api/ai-reevaluate-legal-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: c.title ?? "",
        short_description: c.short_description ?? "",
        category: c.category ?? "",
        subcategory: c.subcategory ?? "",
        recommendation: c.recommendation ?? "",
        immediate_actions: c.immediate_actions ?? "",
        responsibilities: c.responsibilities ?? "",
        legal_explanation: c.legal_explanation ?? "",
        existing_links: existingLinks.map((l) => {
          const s = sectionById.get(l.legal_section_id);
          return {
            id: l.legal_section_id,
            source_short: s?.legal_sources?.short_name ?? s?.legal_sources?.name ?? "",
            section_number: s?.section_number ?? "",
            title: s?.title ?? "",
          };
        }),
      }),
    });
    if (!reevalRes.ok) throw new Error(`ai-reevaluate-legal-links fehlgeschlagen (${reevalRes.status}): ${await reevalRes.text()}`);
    verdicts = ((await reevalRes.json()) as ReevalResult).verdicts ?? [];
  }

  const labelOf = (sectionId: string): string => {
    const s = sectionById.get(sectionId);
    return `${s?.legal_sources?.short_name ?? s?.legal_sources?.name ?? "?"} ${s?.section_number ?? ""} ${s?.title ?? ""}`.trim();
  };

  // 4a) Neue Links anlegen (nur nicht bereits verknüpfte, confidence >= 55).
  const toAdd = (match.matches ?? []).filter((m) => !linkedSectionIds.has(m.id) && m.confidence >= 55);
  for (const m of toAdd) {
    console.log(`  + ${labelOf(m.id)} (${m.relevance_tier ?? "?"}, conf ${m.confidence})`);
    if (!dryRun) await createLegalLink(caseId, m.id, m.reason?.slice(0, 500) || undefined, tierToRelevance(m.relevance_tier));
  }

  // 4b) Klar irrelevante bestehende Links entfernen. Bewusst konservativ:
  //     nur Verdict "irrelevant" MIT confidence >= 70; alles andere bleibt.
  const irrelevantIds = new Set(
    verdicts.filter((v) => v.relevance === "irrelevant" && v.confidence >= 70).map((v) => v.id),
  );
  const toRemove = existingLinks.filter((l) => irrelevantIds.has(l.legal_section_id));
  for (const l of toRemove) {
    const verdict = verdicts.find((v) => v.id === l.legal_section_id);
    console.log(`  - ${labelOf(l.legal_section_id)} (irrelevant, conf ${verdict?.confidence}): ${verdict?.reason?.slice(0, 120)}`);
    if (!dryRun) await deleteLegalLink(l.id);
  }

  const kept = existingLinks.length - toRemove.length;
  console.log(`  = ${toAdd.length} neu, ${toRemove.length} entfernt, ${kept} bestehend belassen${match.missing_area ? ` | Hinweis: ${match.missing_area}` : ""}`);
  return { added: toAdd.length, removed: toRemove.length, kept };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const onlyIdx = args.indexOf("--only-ids");
  const onlyIds = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",").map((s) => s.trim()).filter(Boolean)) : null;
  const gapIdx = args.indexOf("--gap-file");
  const gapFile = gapIdx >= 0 ? args[gapIdx + 1] : DEFAULT_GAP_FILE;

  const gap = JSON.parse(readFileSync(gapFile, "utf-8")) as Array<{ id: string; title: string }>;
  let targets = gap.map((g) => g.id);
  if (onlyIds) targets = targets.filter((id) => onlyIds.has(id));
  targets = targets.slice(0, limit);
  console.log(`${targets.length} Fälle werden neu verknüpft${dryRun ? " (DRY RUN, keine Schreibvorgänge)" : ""}.`);

  console.log("\nBootstrapping Admin-Session...");
  await bootstrapSession();
  console.log("Session bereit.");

  const { createLegalLink, deleteLegalLink } = await import("../src/lib/coreBuilder");

  console.log("Lade vollständigen Rechtsgrundlagen-Katalog...");
  const allSections = await loadAllSections();
  console.log(`${allSections.length} Abschnitte geladen.`);

  const totals = { added: 0, removed: 0, kept: 0, error: 0 };
  for (let i = 0; i < targets.length; i++) {
    process.stdout.write(`\n[${i + 1}/${targets.length}]`);
    try {
      const r = await processOne(targets[i], allSections, createLegalLink, deleteLegalLink, dryRun);
      totals.added += r.added;
      totals.removed += r.removed;
      totals.kept += r.kept;
    } catch (err) {
      totals.error++;
      console.log(`  FEHLER: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n=== Zusammenfassung ===\n${JSON.stringify(totals, null, 2)}`);
}

main();
