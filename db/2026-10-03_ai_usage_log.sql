-- 2026-10-03: KI-Kostenmessung (Phase 1, Paket A).
--
-- Bisher werden Token-Zahlen pro KI-Aufruf zwar vom Provider geliefert, aber
-- nirgends gespeichert - ohne Messung ist keine Kostenrechnung für die
-- Fallgenerierung und den Copilot möglich.
--
-- ai_usage_log:     eine Zeile pro erfolgreichem KI-Aufruf (Token, Modell, Zweck).
--                   Schreiben nur per Service-Rolle (RLS an, keine Policy).
-- ai_model_prices:  Preise je Modell in USD pro 1 Mio. Token. BEWUSST LEER:
--                   aktuelle Preise bitte aus der Preisliste des Anbieters
--                   eintragen (siehe Beispiel unten) - nicht aus dem Gedächtnis.
-- ai_usage_costs:   Auswertung je Tag, Aufgabe und Modell inkl. Kosten, sobald
--                   ein Preis hinterlegt ist.
--
-- Idempotent; im Supabase SQL Editor ausführen.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at        timestamptz NOT NULL DEFAULT now(),
  provider          text NOT NULL,
  model             text NOT NULL,
  task_id           text NULL,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  latency_ms        integer NULL
);

CREATE INDEX IF NOT EXISTS ai_usage_log_created_idx ON public.ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_task_idx    ON public.ai_usage_log (task_id, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ai_model_prices (
  model              text PRIMARY KEY,
  input_usd_per_mtok  numeric(10, 4) NOT NULL,
  output_usd_per_mtok numeric(10, 4) NOT NULL,
  note               text NULL,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_model_prices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.ai_usage_costs AS
SELECT
  date_trunc('day', l.created_at)::date                         AS tag,
  l.task_id,
  l.model,
  count(*)                                                       AS aufrufe,
  sum(l.prompt_tokens)                                           AS eingabe_token,
  sum(l.completion_tokens)                                       AS ausgabe_token,
  round(avg(l.latency_ms))                                       AS latenz_ms_mittel,
  round(
    sum(l.prompt_tokens)     / 1000000.0 * coalesce(p.input_usd_per_mtok, 0)
  + sum(l.completion_tokens) / 1000000.0 * coalesce(p.output_usd_per_mtok, 0)
  , 4)                                                           AS kosten_usd,
  (p.model IS NOT NULL)                                          AS preis_hinterlegt
FROM public.ai_usage_log l
LEFT JOIN public.ai_model_prices p ON p.model = l.model
GROUP BY 1, 2, 3, p.model, p.input_usd_per_mtok, p.output_usd_per_mtok;

-- Die View liest Daten, auf die nur die Service-Rolle Zugriff hat; für
-- anon/authenticated bleibt sie wirkungslos (RLS der Basistabellen).
REVOKE ALL ON public.ai_usage_costs FROM anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- Preise eintragen (Beispielform - Werte aus der offiziellen Preisliste
-- des Anbieters übernehmen; Modellnamen wie im Log, z. B. "anthropic/claude-haiku-4-5"):
--
--   insert into public.ai_model_prices (model, input_usd_per_mtok, output_usd_per_mtok, note)
--   values ('anthropic/claude-haiku-4-5', <EINGABE>, <AUSGABE>, 'Quelle: Preisliste vom <Datum>')
--   on conflict (model) do update set input_usd_per_mtok = excluded.input_usd_per_mtok,
--     output_usd_per_mtok = excluded.output_usd_per_mtok, note = excluded.note, updated_at = now();
--
-- Auswertung:
--   select * from public.ai_usage_costs order by tag desc, kosten_usd desc;
-- ---------------------------------------------------------------------------
