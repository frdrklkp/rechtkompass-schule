// Runtime-Feedback-Store für KI-Vorschläge (👍/👎).
// Kein Persist, kein Netz. Wird von der SuggestionCard beschrieben und
// von einer optionalen Debug-Sicht/Telemetrie gelesen.

export type FeedbackVote = "up" | "down";

interface FeedbackRecord {
  suggestionId: string;
  vote: FeedbackVote;
  note?: string;
  ts: string;
}

const store = new Map<string, FeedbackRecord>();
type Listener = (r: FeedbackRecord) => void;
const listeners = new Set<Listener>();

export const FeedbackStore = {
  set(suggestionId: string, vote: FeedbackVote, note?: string): FeedbackRecord {
    const rec: FeedbackRecord = {
      suggestionId,
      vote,
      note,
      ts: new Date().toISOString(),
    };
    store.set(suggestionId, rec);
    for (const l of listeners) {
      try {
        l(rec);
      } catch {
        /* noop */
      }
    }
    return rec;
  },
  get(suggestionId: string): FeedbackRecord | undefined {
    return store.get(suggestionId);
  },
  list(): FeedbackRecord[] {
    return [...store.values()];
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  clear(): void {
    store.clear();
  },
};
