import { createFileRoute } from "@tanstack/react-router";
import { mapDbCase } from "@/lib/casesFromDb";
import {
  buildPracticeCaseSearchDocument,
  computePracticeCaseHash,
  SEARCH_DOCUMENT_VERSION,
} from "@/lib/searchDocument";

type Mode = "missing" | "stale" | "all" | "single";

type ReindexResultRow = {
  caseId: string;
  status: "created" | "updated" | "unchanged" | "error" | "skipped";
  error?: string;
  oldHashPrefix?: string;
  newHashPrefix?: string;
  documentLength?: number;
  embeddingFingerprint?: string;
};

/**
 * Kompakter, deterministischer Fingerprint eines Embedding-Vektors.
 * Nutzt die ersten fünf Werte + L2-Norm. Keine sensitiven Rohdaten.
 */
function fingerprintEmbedding(v: number[]): string {
  const head = v.slice(0, 5).map((n) => n.toFixed(4)).join(",");
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)).toFixed(4);
  return `[${head}|‖${norm}|dim=${v.length}]`;
}

export const Route = createFileRoute("/api/search-embeddings-reindex")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { mode?: Mode; caseId?: string; maxBatch?: number };
        try {
          body = (await request.json()) as { mode?: Mode; caseId?: string; maxBatch?: number };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const mode: Mode = body.mode ?? "missing";
        const maxBatch = Math.max(1, Math.min(50, Number(body.maxBatch ?? 25)));

        try {
          const { generateEmbedding, EMBEDDING_MODEL } = await import(
            "@/lib/searchEmbeddings.server"
          );
          const { createServiceSupabase } = await import(
            "@/lib/searchEmbeddings.supabase.server"
          );
          const supabaseAdmin = createServiceSupabase();

          // 1. Kandidatenmenge bestimmen (nur published).
          let q = (supabaseAdmin.from as any)("practice_cases")
            .select("*")
            .eq("status", "published");
          if (mode === "single") {
            if (!body.caseId) return new Response("caseId required", { status: 400 });
            q = q.eq("id", body.caseId);
          }
          const { data: caseRows, error: caseErr } = await q;
          if (caseErr) throw new Error(caseErr.message);

          // 2. Vorhandene Embeddings laden.
          const { data: emb, error: embErr } = await (supabaseAdmin.from as any)(
            "practice_case_search_embeddings",
          ).select("case_id, content_hash");
          if (embErr) throw new Error(embErr.message);
          const embMap = new Map<string, string>();
          for (const r of (emb ?? []) as Array<{ case_id: string; content_hash: string }>) {
            embMap.set(r.case_id, r.content_hash);
          }

          const results: ReindexResultRow[] = [];
          let processed = 0;

          for (const row of (caseRows ?? []) as Array<Record<string, unknown>>) {
            if (processed >= maxBatch && mode !== "single") break;

            const c = mapDbCase(row);
            const doc = buildPracticeCaseSearchDocument(c);
            const hash = await computePracticeCaseHash(doc, EMBEDDING_MODEL);
            const existing = embMap.get(c.id);

            // Skip-Logik pro Modus.
            if (mode === "missing" && existing) continue;
            if (mode === "stale" && existing === hash) continue;
            if ((mode === "missing" || mode === "stale") && existing === hash) continue;
            // mode === "all" erzwingt Rebuild, auch wenn Hash gleich ist.

            processed++;
            try {
              const { embedding } = await generateEmbedding(doc);
              const nowIso = new Date().toISOString();
              const { error: upErr } = await (supabaseAdmin.from as any)(
                "practice_case_search_embeddings",
              ).upsert(
                {
                  case_id: c.id,
                  embedding,
                  content_hash: hash,
                  embedding_model: EMBEDDING_MODEL,
                  updated_at: nowIso,
                },
                { onConflict: "case_id" },
              );
              if (upErr) throw new Error(upErr.message);
              results.push({
                caseId: c.id,
                status: existing ? "updated" : "created",
                oldHashPrefix: existing?.slice(0, 8),
                newHashPrefix: hash.slice(0, 8),
                documentLength: doc.length,
                embeddingFingerprint: fingerprintEmbedding(embedding),
              });
            } catch (err) {
              results.push({
                caseId: c.id,
                status: "error",
                error: err instanceof Error ? err.message : String(err),
                oldHashPrefix: existing?.slice(0, 8),
                newHashPrefix: hash.slice(0, 8),
                documentLength: doc.length,
              });
            }
          }

          return Response.json({
            mode,
            searchDocumentVersion: SEARCH_DOCUMENT_VERSION,
            embeddingModel: EMBEDDING_MODEL,
            processed,
            total: (caseRows ?? []).length,
            results,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
