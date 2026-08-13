// Query-Hook für die Wissenssuche.
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import type {
  RetrievalFilters,
  RetrievalResult,
  SearchType,
} from "@/services/legal-knowledge/retrieval";

export interface RunRetrievalArgs {
  query: string;
  filters?: RetrievalFilters;
  limit?: number;
  offset?: number;
  searchType?: SearchType;
  debug?: boolean;
  sourceIds?: string[];
}

export function useRunLegalRetrieval() {
  return useMutation({
    mutationFn: async (args: RunRetrievalArgs) => {
      const res = await apiFetch("/api/legal-retrieval-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const json = (await res.json().catch(() => ({}))) as {
        result: RetrievalResult | null;
        error?: string;
        setup?: { schemaMigrated: boolean };
      };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      return json;
    },
  });
}
