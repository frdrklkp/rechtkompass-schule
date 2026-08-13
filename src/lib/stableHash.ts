/**
 * Deterministischer, browser- UND serverseitig lauffähiger String-Hash.
 *
 * Mehrere Module (HierarchyBuilder.ts, ChunkHashBuilder.ts,
 * EmbeddingInputBuilder.ts) nutzten bisher Node's `crypto.createHash()` für
 * reine Inhalts-/ID-Stabilität (keine Sicherheitsanforderung, nur
 * Determinismus). `crypto` ist ein Node-Builtin und im Browser nicht
 * vorhanden - sobald ein Modul, das diese Funktionen importiert, transitiv
 * in eine client-seitige Komponente gelangt (z.B. ChunksPanel.tsx,
 * DocumentStructurePanel.tsx), bricht Vite das mit
 * "__vite-browser-external:crypto" (Fund 2026-08-13, Code-Audit-
 * Nachbesserung).
 *
 * cyrb128 (öffentlich bekannter, schneller, gut verteilender 128-Bit-
 * String-Hash von Bryc, MIT-artig frei nutzbar) statt echtem SHA-1/SHA-256 -
 * ausreichend kollisionsarm für Content-/ID-Hashing in diesem Umfang, ohne
 * Krypto-Abhängigkeit.
 */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** 32 Hex-Zeichen (128 Bit), deterministisch über Node/Bun/Browser hinweg. */
export function stableHash(input: string): string {
  return cyrb128(input)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
}
