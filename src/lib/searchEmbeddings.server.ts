/**
 * Server-only Helfer für Fall-Embeddings.
 * NUR aus Server-Routen (src/routes/api/search-embeddings-*.ts) importieren.
 *
 * Dünner Wrapper um EmbeddingProviderFactory – kein eigener Provider-Zugriff
 * mehr, um die Gateway-/Anbieter-Logik nicht doppelt zu pflegen.
 */
import { EmbeddingProviderFactory } from "@/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";

export type EmbeddingResult = { embedding: number[]; model: string };

export async function generateEmbedding(input: string): Promise<EmbeddingResult> {
  const text = (input ?? "").slice(0, 24000); // sicherer Cap
  if (!text.trim()) throw new Error("empty input");

  const provider = EmbeddingProviderFactory.forModel(EMBEDDING_MODEL);
  const result = await provider.embedOne(text, { modelId: EMBEDDING_MODEL });
  return { embedding: result.vector, model: result.model };
}

export { EMBEDDING_MODEL };
