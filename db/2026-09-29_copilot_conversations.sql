-- 2026-09-29: Persistenz für Rückfragen-Konversationen des Grounded Legal
-- Copilot (Lehrkräfte-Dialog auf der Fallseite, CaseCopilotDialog).
--
-- Bisher lebten Copilot-Sitzungen nur im InMemoryConversationRepository des
-- jeweiligen Serverprozesses (TTL 1h) - nach Neustart/Deploy weg, und eine
-- Lehrkraft verlor den Verlauf beim Schließen des Dialogs. Neues Modell:
--  - copilot_conversations: eine Zeile je Sitzung (session_id im
--    cpl_-Format aus ConversationMemory.newId), gebunden an user_id und
--    optional an den Fall (case_id), zu dem die Rückfrage gestellt wurde.
--  - copilot_conversation_turns: die einzelnen Züge (user/assistant) mit
--    Laufnummer, Frage bzw. Antwort-Kurzfassung und den Chunk-IDs der
--    zitierten Rechtsgrundlagen (Nachvollziehbarkeit für die Redaktion).
--
-- Schreibzugriff ausschließlich serverseitig über die Service-Rolle
-- (API-Route /api/legal-copilot-ask nach requireApiAuth); Clients haben
-- KEINE Insert-/Update-Policies. Lesen darf jede angemeldete Person nur
-- die eigenen Sitzungen (auth.uid() = user_id) - Basis für ein späteres
-- "Meine Rückfragen"-Feature. anon bleibt vollständig ausgesperrt.
--
-- Idempotent; im Supabase SQL Editor oder per psql ausführen.

BEGIN;

CREATE TABLE IF NOT EXISTS public.copilot_conversations (
  session_id text PRIMARY KEY,
  user_id    uuid NOT NULL,
  case_id    uuid NULL REFERENCES public.practice_cases (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.copilot_conversation_turns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     text NOT NULL REFERENCES public.copilot_conversations (session_id) ON DELETE CASCADE,
  seq            integer NOT NULL,
  role           text NOT NULL CHECK (role IN ('user', 'assistant')),
  at             timestamptz NOT NULL DEFAULT now(),
  question       text NULL,
  answer_summary text NULL,
  chunk_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS copilot_conversations_user_idx
  ON public.copilot_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS copilot_conversations_case_idx
  ON public.copilot_conversations (case_id);
CREATE INDEX IF NOT EXISTS copilot_conversation_turns_session_idx
  ON public.copilot_conversation_turns (session_id, seq);

ALTER TABLE public.copilot_conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_conversation_turns  ENABLE ROW LEVEL SECURITY;

-- Lesen: nur die eigenen Sitzungen. Kein Insert/Update/Delete für Clients -
-- Schreibpfad ist ausschließlich die Service-Rolle (umgeht RLS).
DROP POLICY IF EXISTS copilot_conversations_select_own ON public.copilot_conversations;
CREATE POLICY copilot_conversations_select_own
  ON public.copilot_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS copilot_conversation_turns_select_own ON public.copilot_conversation_turns;
CREATE POLICY copilot_conversation_turns_select_own
  ON public.copilot_conversation_turns FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.copilot_conversations c
    WHERE c.session_id = copilot_conversation_turns.session_id
      AND c.user_id = auth.uid()
  ));

COMMIT;
