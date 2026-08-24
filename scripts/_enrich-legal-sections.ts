/**
 * Generiert redaktionelle Aufbereitung (Kurzbeschreibung, Praxisbedeutung,
 * Handlungsempfehlung, typische Fehler) für die meistzitierten
 * legal_sections-Einträge, die noch keine haben, über
 * /api/ai-enrich-legal-section (siehe dort für Hintergrund).
 *
 * "Meistzitiert" = Häufigkeit in case_legal_links (nach der Fließtext-
 * Neuverknüpfung vom 2026-08-19 verlässlich textbelegt).
 *
 * Aufruf:
 *   bun run scripts/_enrich-legal-sections.ts --limit=20
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
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 20;

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

async function main() {
  console.log(`Modus: LIVE, Limit=${LIMIT}\n`);
  console.log("Bootstrapping Admin-Session...");
  await bootstrapSession();
  console.log("Session bereit.\n");

  const { supabase } = await import("../src/integrations/supabase/client");
  const { apiFetch } = await import("../src/lib/apiFetch");

  let links: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from("case_legal_links").select("legal_section_id").range(from, from + 999);
    if (!data || data.length === 0) break;
    links = links.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const counts = new Map<string, number>();
  for (const l of links as any[]) counts.set(l.legal_section_id, (counts.get(l.legal_section_id) ?? 0) + 1);

  const ids = [...counts.keys()];
  let sections: any[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase
      .from("legal_sections")
      .select("id,section_number,title,full_text,summary,legal_sources(name)")
      .in("id", ids.slice(i, i + 500));
    sections = sections.concat(data ?? []);
  }
  const candidates = (sections as any[])
    .filter((s) => !s.summary && s.full_text && s.full_text.trim())
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    .slice(0, LIMIT);

  console.log(`${candidates.length} Abschnitte werden bearbeitet (von ${ids.length} zitierten, ${candidates.length < LIMIT ? "alle ohne Aufbereitung" : `Top ${LIMIT}`}).\n`);

  const stats = { done: 0, errors: 0 };

  for (let i = 0; i < candidates.length; i++) {
    const s = candidates[i];
    const label = `${s.section_number ?? ""} ${s.title ?? ""}`.trim().slice(0, 60);
    const uses = counts.get(s.id) ?? 0;
    try {
      const res = await apiFetch("/api/ai-enrich-legal-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: {
            section_number: s.section_number,
            title: s.title,
            full_text: s.full_text,
            source_name: s.legal_sources?.name ?? null,
          },
        }),
      });
      if (!res.ok) {
        stats.errors++;
        const errText = await res.text();
        console.log(`[${i + 1}/${candidates.length}] FEHLER (HTTP ${res.status}, ${uses}x zitiert) bei "${label}": ${errText.slice(0, 200)}`);
        continue;
      }
      const result = (await res.json()) as {
        summary: unknown;
        practice_relevance: unknown;
        recommendation: unknown;
        common_mistakes: unknown;
      };
      if (
        typeof result.summary !== "string" ||
        typeof result.practice_relevance !== "string" ||
        typeof result.recommendation !== "string" ||
        typeof result.common_mistakes !== "string"
      ) {
        stats.errors++;
        console.log(`[${i + 1}/${candidates.length}] FEHLER (unerwartetes Antwortformat) bei "${label}"`);
        continue;
      }

      const { error: updErr } = await supabase
        .from("legal_sections")
        .update({
          summary: result.summary,
          practice_relevance: result.practice_relevance,
          recommendation: result.recommendation,
          common_mistakes: result.common_mistakes,
        })
        .eq("id", s.id);
      if (updErr) {
        stats.errors++;
        console.log(`[${i + 1}/${candidates.length}] FEHLER (DB-Update) bei "${label}": ${updErr.message}`);
        continue;
      }
      stats.done++;
      console.log(`[${i + 1}/${candidates.length}] OK (${uses}x zitiert): ${label}`);
    } catch (e) {
      stats.errors++;
      console.log(`[${i + 1}/${candidates.length}] FEHLER (Exception) bei "${label}": ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\n=== Zusammenfassung ===");
  console.log("Erfolgreich aufbereitet:", stats.done);
  console.log("Fehler:", stats.errors);
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
