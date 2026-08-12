/**
 * Server-only Helfer für Fall-Embeddings.
 * NUR aus Server-Routen (src/routes/api/search-embeddings-*.ts) importieren.
 */

const EMBEDDING_MODEL = "openai/text-embedding-3-small";

export type EmbeddingResult = { embedding: number[]; model: string };

/**
 * Ruft ein Embedding über den Lovable AI Gateway ab.
 * Modell erzeugt 1536-dim Vektor.
 */
export async function generateEmbedding(input: string): Promise<EmbeddingResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const text = (input ?? "").slice(0, 24000); // sicherer Cap
  if (!text.trim()) throw new Error("empty input");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${body.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
    model?: string;
  };
  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("AI Gateway: kein embedding im Response");
  }
  return { embedding, model: EMBEDDING_MODEL };
}

export { EMBEDDING_MODEL };
