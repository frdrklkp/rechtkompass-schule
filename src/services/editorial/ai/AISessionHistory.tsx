// Session-Historie für KI-Vorschläge. Rein clientseitig, ephemer.
// Persistiert NICHT über Reload hinweg. Pro Fall separates Bündel.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AISuggestion, AISuggestionStatus } from "./types";

interface Ctx {
  suggestions: AISuggestion[];
  add: (s: AISuggestion) => void;
  update: (id: string, patch: Partial<AISuggestion>) => void;
  setStatus: (id: string, status: AISuggestionStatus) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const AISessionContext = createContext<Ctx | null>(null);

export function AISessionProvider({
  caseId,
  children,
}: {
  caseId: string;
  children: ReactNode;
}) {
  // caseId ist nur logisch – der Provider selbst hält die Historie
  // für diesen Fall (der Provider wird pro Fall gerendert und key-t auf id).
  void caseId;
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  const add = useCallback((s: AISuggestion) => {
    setSuggestions((prev) => [s, ...prev]);
  }, []);
  const update = useCallback(
    (id: string, patch: Partial<AISuggestion>) => {
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
    },
    [],
  );
  const setStatus = useCallback((id: string, status: AISuggestionStatus) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s)),
    );
  }, []);
  const remove = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);
  const clear = useCallback(() => setSuggestions([]), []);

  const value = useMemo<Ctx>(
    () => ({ suggestions, add, update, setStatus, remove, clear }),
    [suggestions, add, update, setStatus, remove, clear],
  );
  return (
    <AISessionContext.Provider value={value}>
      {children}
    </AISessionContext.Provider>
  );
}

export function useAISession(): Ctx {
  const c = useContext(AISessionContext);
  if (!c) throw new Error("useAISession must be used inside AISessionProvider");
  return c;
}
