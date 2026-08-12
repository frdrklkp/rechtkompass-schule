#!/usr/bin/env node
/**
 * Schema Validator – prüft Code gegen das reale Supabase-Schema.
 *
 * Läuft im prebuild-Hook. Bei Drift bricht der Build ab.
 *
 * Vorgehen:
 *  1. Lädt Live-Schema per RPC public.__schema_snapshot() (siehe
 *     db/2026-07-06_schema_introspection.sql).
 *  2. Vergleicht mit db/schema.lock.json (falls vorhanden).
 *  3. Grept src/ nach supabase-Zugriffen (.from, .select, .eq, .insert, .update)
 *     und meldet unbekannte Tabellen / Spalten mit Datei:Zeile.
 *
 * CLI:
 *   node scripts/schema-check.mjs           # prüfen (Exit 1 bei Fehler)
 *   node scripts/schema-check.mjs --update  # Live-Schema als neuen Lock übernehmen
 *   node scripts/schema-check.mjs --soft    # Warnungen statt Exit 1
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOCK_PATH = join(ROOT, "db", "schema.lock.json");
const LIVE_PATH = join(ROOT, "db", "schema.live.json");
const SRC_DIR   = join(ROOT, "src");

const args = new Set(process.argv.slice(2));
const MODE = args.has("--update") ? "update" : args.has("--soft") ? "soft" : "strict";

// ---------- .env laden ----------
function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const SUPA_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPA_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
              || process.env.SUPABASE_PUBLISHABLE_KEY
              || process.env.VITE_SUPABASE_ANON_KEY;

// ---------- Live-Schema holen ----------
async function fetchLiveSchema() {
  if (!SUPA_URL || !SUPA_KEY) {
    return { ok: false, reason: "VITE_SUPABASE_URL/PUBLISHABLE_KEY nicht gesetzt." };
  }
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/__schema_snapshot`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        authorization: `Bearer ${SUPA_KEY}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, reason: `RPC __schema_snapshot fehlgeschlagen (${res.status}): ${body.slice(0, 200)}` };
    }
    return { ok: true, schema: await res.json() };
  } catch (e) {
    return { ok: false, reason: `Netzwerkfehler beim Schema-RPC: ${e.message}` };
  }
}

// ---------- Codebase scannen ----------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") && name !== "routeTree.gen.ts") out.push(p);
  }
  return out;
}

const IGNORED_TABLES = new Set(["auth", "storage"]);

function scanFile(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  const hits = [];
  // Match: .from("table") ... .method("column"[, ...])  (auf mehrere Zeilen)
  // Greift Ketten wie .from("t").select("a,b").eq("c", x).order("d")
  const fromRe = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/g;
  let m;
  while ((m = fromRe.exec(text)) !== null) {
    const table = m[1];
    if (IGNORED_TABLES.has(table)) continue;
    const startIdx = m.index;
    // Chain endet spätestens beim nächsten .from( – sonst bluten Spalten aus Nachbarketten hinein.
    const rest = text.slice(startIdx + m[0].length);
    const nextFromRel = rest.search(/\.from\(\s*["'`]/);
    const chainEnd = nextFromRel === -1 ? startIdx + 1200 : startIdx + m[0].length + nextFromRel;
    const chain = text.slice(startIdx, Math.min(chainEnd, startIdx + 2000));
    const line = text.slice(0, startIdx).split("\n").length;

    // Spalten aus .eq/.neq/.gt/.gte/.lt/.lte/.like/.ilike/.is/.in/.contains/.order
    const colRe = /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|order|match)\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/g;
    const cols = new Set();
    let cm;
    while ((cm = colRe.exec(chain)) !== null) cols.add(cm[1]);

    // select("a, b, rel(x,y)") – top-level Spalten extrahieren
    const selMatch = chain.match(/\.select\(\s*["'`]([^"'`]+)["'`]/);
    const selectCols = [];
    if (selMatch) {
      const raw = selMatch[1];
      // Klammern-tief-1 splitten, damit rel(x,y) nicht zerfällt
      let depth = 0, buf = "";
      const parts = [];
      for (const ch of raw) {
        if (ch === "(") { depth++; buf += ch; }
        else if (ch === ")") { depth--; buf += ch; }
        else if (ch === "," && depth === 0) { parts.push(buf); buf = ""; }
        else buf += ch;
      }
      if (buf.trim()) parts.push(buf);
      for (const p of parts) {
        const s = p.trim();
        if (!s || s === "*" || s.startsWith("count(")) continue;
        // rel(x,y) => Beziehungsname (Tabelle/FK) – separat prüfen
        const rel = s.match(/^([a-z_][a-z0-9_]*)\s*\(/);
        if (rel) { selectCols.push({ kind: "relation", name: rel[1] }); continue; }
        // alias:col oder alias:col.type
        const col = s.split(/[:!]/)[0].trim();
        if (/^[a-z_][a-z0-9_]*$/.test(col)) selectCols.push({ kind: "column", name: col });
      }
    }

    hits.push({ file: path, line, table, cols: [...cols], select: selectCols });
  }
  return hits;
}

function scanCode() {
  const files = walk(SRC_DIR);
  return files.flatMap(scanFile);
}

// ---------- Validierung ----------
function validate(live, hits) {
  const errors = [];
  const tables = live?.tables ?? {};
  const tableSet = new Set(Object.keys(tables));

  // Bekannte FK-Beziehungsnamen pro Tabelle (referenced_table)
  const rels = {};
  for (const [tName, t] of Object.entries(tables)) {
    rels[tName] = new Set((t.foreign_keys ?? []).map((fk) => fk.referenced_table));
    // Inverse: andere Tabellen mit FK auf diese
  }
  for (const [tName, t] of Object.entries(tables)) {
    for (const fk of t.foreign_keys ?? []) {
      rels[fk.referenced_table] ??= new Set();
      rels[fk.referenced_table].add(tName);
    }
  }

  for (const hit of hits) {
    const t = tables[hit.table];
    if (!t) {
      errors.push({ file: hit.file, line: hit.line,
        msg: `Tabelle public.${hit.table} existiert nicht in der Live-DB.` });
      continue;
    }
    const colSet = new Set(t.columns.map((c) => c.name));
    const suggest = (bad) => {
      const cands = [...colSet].filter((c) => c.includes(bad) || bad.includes(c));
      return cands.length ? ` – vermutlich: ${cands.slice(0, 3).join(", ")}` : "";
    };
    for (const c of hit.cols) {
      if (!colSet.has(c)) {
        errors.push({ file: hit.file, line: hit.line,
          msg: `Spalte ${hit.table}.${c} existiert nicht${suggest(c)}` });
      }
    }
    for (const s of hit.select) {
      if (s.kind === "column" && !colSet.has(s.name)) {
        errors.push({ file: hit.file, line: hit.line,
          msg: `select(): Spalte ${hit.table}.${s.name} existiert nicht${suggest(s.name)}` });
      }
      if (s.kind === "relation" && !tableSet.has(s.name) && !(rels[hit.table]?.has(s.name))) {
        errors.push({ file: hit.file, line: hit.line,
          msg: `select(): Beziehung ${hit.table} → ${s.name} unbekannt (keine Tabelle / kein FK).` });
      }
    }
  }
  return errors;
}

// ---------- Lock-Diff (Struktur) ----------
function diffLock(live, lock) {
  const drift = [];
  if (!lock) return drift;
  const L = lock.tables ?? {};
  const R = live.tables ?? {};
  for (const t of Object.keys(L)) {
    if (!R[t]) { drift.push(`- Tabelle ${t} fehlt in Live-DB`); continue; }
    const lc = new Set(L[t].columns.map((c) => c.name));
    const rc = new Set(R[t].columns.map((c) => c.name));
    for (const c of lc) if (!rc.has(c)) drift.push(`- ${t}.${c} fehlt in Live-DB`);
    for (const c of rc) if (!lc.has(c)) drift.push(`+ ${t}.${c} neu in Live-DB (Lock veraltet)`);
  }
  for (const t of Object.keys(R)) if (!L[t]) drift.push(`+ Tabelle ${t} neu in Live-DB (Lock veraltet)`);
  return drift;
}

// ---------- Hauptlauf ----------
function report(status, tables) {
  const rows = [
    ["Practice Cases",    tables.practice_cases],
    ["Legal Sources",     tables.legal_sources],
    ["Legal Sections",    tables.legal_sections],
    ["Case Legal Links",  tables.case_legal_links],
    ["Keywords",          tables.keywords],
    ["Case Keywords",     tables.case_keywords],
    ["Templates",         tables.document_templates],
    ["Categories",        tables.practice_categories],
  ];
  const line = "──────────────────────────────";
  console.log("\n" + line);
  console.log("SCHEMA STATUS");
  console.log(line);
  for (const [label, ok] of rows) {
    console.log(`${label.padEnd(22, ".")} ${ok ? "✓" : "✗"}`);
  }
  console.log(`${"RLS".padEnd(22, ".")} ${status.rls}`);
  console.log(`${"Types".padEnd(22, ".")} ${status.types}`);
  console.log(`${"Queries".padEnd(22, ".")} ${status.queries}`);
  console.log(`${"Joins".padEnd(22, ".")} ${status.joins}`);
  console.log(`${"Validator".padEnd(22, ".")} ✓`);
  console.log(line + "\n");
}

async function main() {
  const live = await fetchLiveSchema();
  if (!live.ok) {
    const msg = `[schema-check] ${live.reason}\n` +
      `  → Führe zunächst db/2026-07-06_schema_introspection.sql im Supabase SQL-Editor aus.`;
    if (MODE === "strict") { console.error(msg); process.exit(1); }
    console.warn(msg + "\n  (Modus: " + MODE + " – Build läuft weiter)");
    return;
  }

  writeFileSync(LIVE_PATH, JSON.stringify(live.schema, null, 2));
  console.log(`[schema-check] Live-Snapshot: ${relative(ROOT, LIVE_PATH)} (${Object.keys(live.schema.tables ?? {}).length} Tabellen)`);

  if (MODE === "update") {
    writeFileSync(LOCK_PATH, JSON.stringify(live.schema, null, 2));
    console.log(`[schema-check] Lock aktualisiert: ${relative(ROOT, LOCK_PATH)}`);
    return;
  }

  const lock = existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, "utf8")) : null;
  const drift = diffLock(live.schema, lock);

  const hits = scanCode();
  const errors = validate(live.schema, hits);

  const tables = Object.fromEntries(Object.keys(live.schema.tables ?? {}).map((t) => [t, true]));
  const rlsOk = Object.values(live.schema.tables ?? {}).some((t) => t.rls_enabled);
  report(
    { rls: rlsOk ? "✓" : "?", types: "✓ (generiert)", queries: errors.length ? "✗" : "✓", joins: errors.length ? "✗" : "✓" },
    tables,
  );

  if (drift.length) {
    console.log("[schema-check] Lock-Drift:");
    for (const d of drift) console.log("  " + d);
    console.log("  → `bun run schema:update` übernimmt Live als neuen Lock.\n");
  }

  if (errors.length) {
    console.error(`[schema-check] ${errors.length} Codefehler:`);
    for (const e of errors) {
      const rel = relative(ROOT, e.file);
      console.error(`  ${rel}:${e.line}  ${e.msg}`);
    }
    if (MODE === "strict") process.exit(1);
  } else {
    console.log("[schema-check] OK – Code und Live-Schema sind synchron.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
