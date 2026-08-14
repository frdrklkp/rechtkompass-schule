#!/usr/bin/env node
/**
 * Testrunner-Wrapper für `bun test`.
 *
 * Alle Testdateien in diesem Projekt nutzen `node:test` (kein Vitest, keine
 * Abhängigkeit dazu in package.json). Bun implementiert `node:test`, hat
 * aber einen bekannten Bug: ruft man `bun test` ohne Pfad auf, versucht
 * Bun, mehrere Testdateien im selben Prozess zu registrieren - das kollidiert
 * mit `node:test`s globaler Registrierung ("test() inside another test()
 * is not yet implemented", https://github.com/oven-sh/bun/issues/5090) und
 * erzeugt FALSCHE Fehlschläge, obwohl jede Datei einzeln fehlerfrei läuft.
 *
 * Workaround: jede Testdatei als eigener `bun test <datei>`-Prozess,
 * Ergebnisse aggregieren. Sobald oven-sh/bun#5090 behoben ist, kann dieser
 * Wrapper durch ein einfaches `bun test` ersetzt werden.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", ".output", "dist", "build"]);

function findTestFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) findTestFiles(full, out);
    // .test.tsx mit erfassen (Fund Sprint 4.6J.2, 2026-08-14: die UI-Tests
    // wie assistantUi.test.tsx wurden vom Runner bisher still uebersprungen,
    // weil nur .test.ts gesammelt wurde).
    else if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

const files = findTestFiles(ROOT).sort();
if (files.length === 0) {
  console.error("Keine *.test.ts(x)-Dateien gefunden.");
  process.exit(1);
}

console.log(`Führe ${files.length} Testdateien einzeln aus (Workaround für oven-sh/bun#5090)...\n`);

let totalPass = 0;
let totalFail = 0;
let failedFiles = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  const res = spawnSync("bun", ["test", file], { encoding: "utf8" });
  const output = (res.stdout ?? "") + (res.stderr ?? "");
  const passMatch = output.match(/(\d+) pass/);
  const failMatch = output.match(/(\d+) fail/);
  const pass = passMatch ? Number(passMatch[1]) : 0;
  const fail = failMatch ? Number(failMatch[1]) : 0;
  totalPass += pass;
  totalFail += fail;

  const ok = res.status === 0 && fail === 0;
  console.log(`${ok ? "✓" : "✗"} ${rel}  (${pass} pass, ${fail} fail)`);
  if (!ok) {
    failedFiles.push(rel);
    console.log(output.split("\n").slice(-20).join("\n"));
  }
}

console.log(`\n=== Gesamt: ${totalPass} pass, ${totalFail} fail über ${files.length} Dateien ===`);
if (failedFiles.length > 0) {
  console.log(`Fehlgeschlagene Dateien:\n  ${failedFiles.join("\n  ")}`);
  process.exit(1);
}
process.exit(0);
