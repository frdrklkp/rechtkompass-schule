/**
 * Entfernt Markdown-Artefakte (**fett**, __fett__, `code`, # Überschriften,
 * [Text](Link)) aus bereits erzeugten KI-Inhalten (Nutzerrückmeldung
 * 2026-08-14: sichtbare "**" in Do's/Don'ts, da die Anzeige reiner Text ist,
 * kein Markdown-Renderer). Die Prompts wurden bereits gefixt (kein neues
 * Markdown mehr) - dies räumt den Bestand rückwirkend auf.
 *
 * Betroffene Quellen (alle nutzen dieselbe AI-Provider-Infrastruktur):
 *   - practice_cases: alle Freitext-/Array-Felder + faq.meta.faq_items
 *   - legal_sections: summary/practice_relevance/recommendation/common_mistakes
 *     (nur Zeilen, die je angereichert wurden)
 *   - practice_cases.decision_tree: steps[].question/explanation,
 *     results[].{title,urgency,recommendation,responsible,documentation,warning,steps[]}
 *   - case_documents: title/content
 *
 * Aufruf: bun run scripts/_strip-markdown.ts [--dry]
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
const DRY = process.argv.includes("--dry");

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

/** Entfernt gängige Markdown-Marker, behält den eingeschlossenen Text. */
function stripMd(text: unknown): unknown {
  if (typeof text !== "string" || !text) return text;
  let out = text;
  out = out.replace(/\*\*(.+?)\*\*/g, "$1"); // **bold**
  out = out.replace(/__(.+?)__/g, "$1"); // __bold__
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1$2"); // *italic* (einfaches Sternchen, Bullet '- ' bleibt unberührt)
  out = out.replace(/`([^`]+)`/g, "$1"); // `code`
  out = out.replace(/^#{1,6}\s+/gm, ""); // # Überschrift
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // [Text](Link)
  // Auffangschritt: verwaiste/unpaarige Sternchen (z.B. "*Don'ts:**" - ungerade
  // Anzahl, von den paarweisen Regeln oben nicht erfasst) - Nutzeranforderung
  // ist absolut ("kein einziges Sternchen mehr"), daher jedes verbleibende '*'
  // entfernen. Unterstriche werden NICHT pauschal entfernt, da "__" auch als
  // legitimer Lückentext-Platzhalter vorkommt (z.B. "Alleinsorgerecht bei: __").
  out = out.replace(/\*/g, "");
  return out;
}

function hasMd(text: unknown): boolean {
  return typeof text === "string" && /\*|__|`|^#{1,6}\s|\[[^\]]+\]\([^)]+\)/m.test(text);
}

function stripArr(arr: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(arr)) return { value: arr, changed: false };
  let changed = false;
  const value = arr.map((x) => {
    if (typeof x === "string") {
      if (hasMd(x)) changed = true;
      return stripMd(x);
    }
    return x;
  });
  return { value, changed };
}

async function main() {
  console.log(`Modus: ${DRY ? "DRY-RUN (keine Schreibvorgänge)" : "LIVE"}\n`);
  console.log("Bootstrapping Admin-Session...");
  await bootstrapSession();
  console.log("Session bereit.\n");

  const { supabase } = await import("../src/integrations/supabase/client");

  // ---- 1) practice_cases ----
  console.log("=== practice_cases ===");
  const { data: cases, error: casesErr } = await supabase
    .from("practice_cases")
    .select("id,title,short_description,short_answer,immediate_actions,recommendation,legal_explanation,responsibilities,practice_tip,checklist,documentation,common_mistakes,faq,decision_tree");
  if (casesErr) throw casesErr;

  const STR_FIELDS = ["title", "short_description", "short_answer", "immediate_actions", "recommendation", "legal_explanation", "responsibilities", "practice_tip"] as const;
  const ARR_FIELDS = ["checklist", "documentation", "common_mistakes"] as const;

  let casesFixed = 0;
  for (const row of (cases ?? []) as any[]) {
    const patch: Record<string, unknown> = {};
    let changed = false;

    for (const f of STR_FIELDS) {
      if (hasMd(row[f])) { patch[f] = stripMd(row[f]); changed = true; }
    }
    for (const f of ARR_FIELDS) {
      const r = stripArr(row[f]);
      if (r.changed) { patch[f] = r.value; changed = true; }
    }

    // faq: entweder echtes Array (q/a) oder {meta:{faq_items:[...]}} - beides ggf. bereinigen.
    if (Array.isArray(row.faq)) {
      let faqChanged = false;
      const nextFaq = row.faq.map((item: any) => {
        if (item && typeof item === "object") {
          const q = hasMd(item.q) ? stripMd(item.q) : item.q;
          const a = hasMd(item.a) ? stripMd(item.a) : item.a;
          if (q !== item.q || a !== item.a) faqChanged = true;
          return { ...item, q, a };
        }
        return item;
      });
      if (faqChanged) { patch.faq = nextFaq; changed = true; }
    } else if (row.faq && typeof row.faq === "object" && row.faq.meta) {
      const meta = row.faq.meta;
      let metaChanged = false;
      const nextFaqItems = Array.isArray(meta.faq_items)
        ? meta.faq_items.map((item: any) => {
            if (item && typeof item === "object") {
              const q = hasMd(item.q) ? stripMd(item.q) : item.q;
              const a = hasMd(item.a) ? stripMd(item.a) : item.a;
              if (q !== item.q || a !== item.a) metaChanged = true;
              return { ...item, q, a };
            }
            return item;
          })
        : meta.faq_items;
      if (metaChanged) {
        patch.faq = { ...row.faq, meta: { ...meta, faq_items: nextFaqItems } };
        changed = true;
      }
    }

    // decision_tree: steps[].question/explanation, results[].{title,urgency,recommendation,responsible,documentation,warning,steps[]}
    if (row.decision_tree && typeof row.decision_tree === "object") {
      const tree = row.decision_tree;
      let treeChanged = false;
      const nextSteps: Record<string, unknown> = {};
      for (const [key, step] of Object.entries(tree.steps ?? {})) {
        const s = step as any;
        const question = hasMd(s.question) ? stripMd(s.question) : s.question;
        const explanation = hasMd(s.explanation) ? stripMd(s.explanation) : s.explanation;
        if (question !== s.question || explanation !== s.explanation) treeChanged = true;
        nextSteps[key] = { ...s, question, explanation };
      }
      const nextResults: Record<string, unknown> = {};
      for (const [key, result] of Object.entries(tree.results ?? {})) {
        const r = result as any;
        const patchR: Record<string, unknown> = { ...r };
        for (const f of ["title", "urgency", "recommendation", "responsible", "documentation", "warning"]) {
          if (hasMd(r[f])) { patchR[f] = stripMd(r[f]); treeChanged = true; }
        }
        if (Array.isArray(r.steps)) {
          const rs = stripArr(r.steps);
          if (rs.changed) { patchR.steps = rs.value; treeChanged = true; }
        }
        nextResults[key] = patchR;
      }
      if (treeChanged) {
        patch.decision_tree = { ...tree, steps: nextSteps, results: nextResults };
        changed = true;
      }
    }

    if (changed) {
      casesFixed++;
      console.log(`  [${DRY ? "würde ändern" : "ändere"}] ${row.title?.slice(0, 55)}`);
      if (!DRY) {
        const { error: updErr } = await (supabase.from("practice_cases") as any).update(patch).eq("id", row.id);
        if (updErr) console.log(`    FEHLER: ${updErr.message}`);
      }
    }
  }
  console.log(`practice_cases: ${casesFixed}/${(cases ?? []).length} betroffen.\n`);

  // ---- 2) legal_sections (nur angereicherte Zeilen) ----
  console.log("=== legal_sections (angereichert) ===");
  const { data: sections, error: secErr } = await (supabase.from("legal_sections") as any)
    .select("id,summary,practice_relevance,recommendation,common_mistakes")
    .not("practice_relevance", "is", null);
  if (secErr) throw secErr;
  let secFixed = 0;
  for (const row of (sections ?? []) as any[]) {
    const patch: Record<string, unknown> = {};
    let changed = false;
    for (const f of ["summary", "practice_relevance", "recommendation", "common_mistakes"]) {
      if (hasMd(row[f])) { patch[f] = stripMd(row[f]); changed = true; }
    }
    if (changed) {
      secFixed++;
      if (!DRY) {
        const { error: updErr } = await (supabase.from("legal_sections") as any).update(patch).eq("id", row.id);
        if (updErr) console.log(`  FEHLER bei ${row.id}: ${updErr.message}`);
      }
    }
  }
  console.log(`legal_sections: ${secFixed}/${(sections ?? []).length} betroffen.\n`);

  // ---- 3) case_documents ----
  console.log("=== case_documents ===");
  const { data: docs, error: docErr } = await (supabase.from("case_documents") as any).select("id,title,content");
  if (docErr) {
    console.log(`  (übersprungen: ${docErr.message})`);
  } else {
    let docFixed = 0;
    for (const row of (docs ?? []) as any[]) {
      const patch: Record<string, unknown> = {};
      let changed = false;
      if (hasMd(row.title)) { patch.title = stripMd(row.title); changed = true; }
      if (hasMd(row.content)) { patch.content = stripMd(row.content); changed = true; }
      if (changed) {
        docFixed++;
        if (!DRY) {
          const { error: updErr } = await (supabase.from("case_documents") as any).update(patch).eq("id", row.id);
          if (updErr) console.log(`  FEHLER bei ${row.id}: ${updErr.message}`);
        }
      }
    }
    console.log(`case_documents: ${docFixed}/${(docs ?? []).length} betroffen.\n`);
  }

  console.log("=== Fertig ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
