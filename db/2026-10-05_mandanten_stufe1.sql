-- 2026-10-05: Mandantenkonzept, Stufe 1 - Mandantenstamm (Schule als Mandant).
--
-- Grundlage: Mandantenkonzept vom 04./05.10.2026 (Claude-Doc). Entscheidungen
-- des Betreibers: Beitritt nur per Einladung, Berichte nur als Summen,
-- Vorgänge bleiben bei der Schule, keine Trägerebene.
--
-- Was diese Stufe tut:
--   1. schools wird zum Mandantenstamm (Domains, Vertrag, Budget, Status).
--   2. school_members: genau eine aktive Mitgliedschaft je Person, mit Rolle
--      lehrkraft | schul_admin. Redaktionsrollen bleiben global (user_profiles.role).
--   3. school_invitations: Einladung per E-Mail; beim ersten Login wird daraus
--      die Mitgliedschaft (claim_school_membership()).
--   4. current_school_id() / is_school_admin(): Zugriffsfunktionen für RLS.
--   5. is_pilot_approved() prüft ab jetzt die Mitgliedschaft; die alte Pilotliste
--      bleibt als Übergang gültig, bis Stufe 3 (Schulverwaltung) sie ablöst.
--   6. Datenübernahme: Berufskolleg Olsberg als erste Schule, alle Konten mit
--      @berufskolleg-olsberg.de werden aktive Mitglieder, Pilotlisten-Adressen
--      ohne Konto werden zu offenen Einladungen.
--
-- Was diese Stufe NICHT tut: school_id auf den personenbezogenen Tabellen
-- (Stufe 2), Oberfläche für Schul-Admins (Stufe 3), Budgetprüfung (Stufe 4).
--
-- Konvention seit 22.09.2026: neue Tabellen brauchen explizite GRANTs.
-- Idempotent; im Supabase SQL Editor ausführen (oder per Bun-SQL-Skript).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. schools: Mandantenstamm
-- ---------------------------------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS email_domains      text[]        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contract_ref       text          NULL,
  ADD COLUMN IF NOT EXISTS monthly_budget_usd numeric(8, 2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS joined_at          timestamptz   NULL,
  ADD COLUMN IF NOT EXISTS left_at            timestamptz   NULL,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz   NOT NULL DEFAULT now();

-- Status: active (Regelbetrieb), paused (Zugang gesperrt, Daten bleiben),
-- left (ausgetreten: Export, dann Löschung nach 30 Tagen).
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_status_check;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_status_check CHECK (status IN ('active', 'paused', 'left'));

CREATE UNIQUE INDEX IF NOT EXISTS schools_short_name_key ON public.schools (short_name);

COMMENT ON TABLE public.schools IS
  'Mandanten (Schulen). Personenbezogene Daten hängen über school_members an genau einer Schule. Gemeinsame Inhalte (Fälle, Quellen, Vorlagen) sind mandantenübergreifend.';
COMMENT ON COLUMN public.schools.email_domains IS
  'Dienstliche E-Mail-Domains der Schule (ohne @). Dient Stufe 3 für die optionale Domain-Freigabe; der Beitritt läuft bis dahin nur per Einladung.';

GRANT SELECT ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;

-- ---------------------------------------------------------------------------
-- 2. school_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  school_id   uuid        NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  school_role text        NOT NULL DEFAULT 'lehrkraft' CHECK (school_role IN ('lehrkraft', 'schul_admin')),
  status      text        NOT NULL DEFAULT 'aktiv' CHECK (status IN ('eingeladen', 'aktiv', 'entfernt')),
  invited_by  uuid        NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  removed_at  timestamptz NULL,
  -- Genau eine Mitgliedschaft je Person (Entscheidung: keine Mehrfachmitgliedschaft).
  CONSTRAINT school_members_user_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS school_members_school_idx ON public.school_members (school_id, status);

COMMENT ON TABLE public.school_members IS
  'Zugehörigkeit einer Person zu ihrer Schule. Nur Status aktiv gewährt Zugang zur Lehrkräfte-Oberfläche. school_role schul_admin verwaltet Mitglieder und sieht Summen, nie Inhalte.';

GRANT SELECT, INSERT, UPDATE ON public.school_members TO authenticated;
GRANT ALL ON public.school_members TO service_role;
ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. school_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_invitations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid        NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  email            text        NOT NULL,
  school_role      text        NOT NULL DEFAULT 'lehrkraft' CHECK (school_role IN ('lehrkraft', 'schul_admin')),
  invited_by       uuid        NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  note             text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '30 days',
  accepted_at      timestamptz NULL,
  accepted_user_id uuid        NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  revoked_at       timestamptz NULL
);

-- Je Adresse höchstens eine offene Einladung.
CREATE UNIQUE INDEX IF NOT EXISTS school_invitations_open_email_key
  ON public.school_invitations (lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.school_invitations IS
  'Einladungen per dienstlicher E-Mail. Der Magic-Link-Login bleibt; nach dem Login wandelt claim_school_membership() eine passende offene Einladung in eine Mitgliedschaft um.';

GRANT SELECT, INSERT, UPDATE ON public.school_invitations TO authenticated;
GRANT ALL ON public.school_invitations TO service_role;
ALTER TABLE public.school_invitations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Zugriffsfunktionen (SECURITY DEFINER wie has_role/is_pilot_approved)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.school_id
    FROM public.school_members m
    JOIN public.schools s ON s.id = m.school_id
   WHERE m.user_id = auth.uid()
     AND m.status = 'aktiv'
     AND s.status = 'active'
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin(_school_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.school_members m
      JOIN public.schools s ON s.id = m.school_id
     WHERE m.user_id = auth.uid()
       AND m.status = 'aktiv'
       AND m.school_role = 'schul_admin'
       AND s.status = 'active'
       AND (_school_id IS NULL OR m.school_id = _school_id)
  )
$$;

-- Nach dem Login aufrufen: wandelt eine offene Einladung für die eigene
-- E-Mail in eine Mitgliedschaft um. Rückgabe: 'aktiv' (Mitglied, ggf. gerade
-- geworden), 'keine' (weder Mitglied noch Einladung).
CREATE OR REPLACE FUNCTION public.claim_school_membership()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid   uuid := auth.uid();
  _email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  _inv   public.school_invitations%ROWTYPE;
BEGIN
  IF _uid IS NULL OR _email = '' THEN
    RETURN 'keine';
  END IF;

  IF EXISTS (SELECT 1 FROM public.school_members WHERE user_id = _uid AND status = 'aktiv') THEN
    RETURN 'aktiv';
  END IF;

  SELECT * INTO _inv
    FROM public.school_invitations i
    JOIN public.schools s ON s.id = i.school_id AND s.status = 'active'
   WHERE lower(i.email) = _email
     AND i.accepted_at IS NULL
     AND i.revoked_at IS NULL
     AND i.expires_at > now()
   ORDER BY i.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'keine';
  END IF;

  INSERT INTO public.school_members (user_id, school_id, school_role, status, invited_by)
  VALUES (_uid, _inv.school_id, _inv.school_role, 'aktiv', _inv.invited_by)
  ON CONFLICT (user_id) DO UPDATE
     SET school_id = EXCLUDED.school_id,
         school_role = EXCLUDED.school_role,
         status = 'aktiv',
         removed_at = NULL,
         updated_at = now();

  UPDATE public.school_invitations
     SET accepted_at = now(), accepted_user_id = _uid
   WHERE id = _inv.id;

  RETURN 'aktiv';
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_school_membership() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. is_pilot_approved(): Mitgliedschaft zählt; Pilotliste nur noch als Übergang
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_pilot_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_school_id() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.pilot_allowlist
       WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    OR public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'reviewer')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superadmin')
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
-- schools: aktive Schulen bleiben öffentlich lesbar (bestehende Policy "Public
-- read schools"); Schul-Admins und Betreiber-Admins lesen zusätzlich ihre
-- pausierten/ausgetretenen Schulen. Schreiben nur Betreiber-Admin/Service-Rolle.
DROP POLICY IF EXISTS schools_admin_read ON public.schools;
CREATE POLICY schools_admin_read ON public.schools
  FOR SELECT TO authenticated
  USING (public.is_school_admin(id) OR public.is_admin());

-- school_members: eigene Zeile sehen; Schul-Admin sieht und pflegt Mitglieder
-- der eigenen Schule; Betreiber-Admin alles.
DROP POLICY IF EXISTS school_members_self_read ON public.school_members;
CREATE POLICY school_members_self_read ON public.school_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS school_members_school_admin_read ON public.school_members;
CREATE POLICY school_members_school_admin_read ON public.school_members
  FOR SELECT TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_admin());

DROP POLICY IF EXISTS school_members_school_admin_write ON public.school_members;
CREATE POLICY school_members_school_admin_write ON public.school_members
  FOR UPDATE TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_admin());

DROP POLICY IF EXISTS school_members_admin_insert ON public.school_members;
CREATE POLICY school_members_admin_insert ON public.school_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- school_invitations: Schul-Admin verwaltet Einladungen der eigenen Schule;
-- Betreiber-Admin alles. Lehrkräfte sehen Einladungen nie (claim läuft als
-- SECURITY DEFINER).
DROP POLICY IF EXISTS school_invitations_school_admin ON public.school_invitations;
CREATE POLICY school_invitations_school_admin ON public.school_invitations
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Datenübernahme: Berufskolleg Olsberg als erste Schule
-- ---------------------------------------------------------------------------
INSERT INTO public.schools (name, short_name, city, status, email_domains, joined_at, contract_ref)
VALUES ('Berufskolleg Olsberg des Hochsauerlandkreises', 'BK Olsberg', 'Olsberg', 'active',
        ARRAY['berufskolleg-olsberg.de'], '2026-08-24', 'Pilotphase 2026 (Vereinbarung mit der Schulleitung)')
ON CONFLICT (short_name) DO UPDATE
   SET email_domains = EXCLUDED.email_domains,
       updated_at = now();

-- Alle bestehenden Konten mit Schul-Domain werden aktive Mitglieder
-- (Lehrkräfte). Betreiber-Admins ohne Schul-Domain bleiben global.
INSERT INTO public.school_members (user_id, school_id, school_role, status)
SELECT p.id, s.id, 'lehrkraft', 'aktiv'
  FROM public.user_profiles p
  JOIN public.schools s ON s.short_name = 'BK Olsberg'
 WHERE lower(split_part(p.email, '@', 2)) = ANY (s.email_domains)
ON CONFLICT (user_id) DO NOTHING;

-- Pilotlisten-Adressen ohne Konto werden zu offenen Einladungen (90 Tage),
-- damit die noch nicht angemeldeten Kolleginnen und Kollegen weiter hereinkommen.
INSERT INTO public.school_invitations (school_id, email, school_role, note, expires_at)
SELECT s.id, lower(a.email), 'lehrkraft', 'Übernahme aus Pilotliste', now() + interval '90 days'
  FROM public.pilot_allowlist a
  JOIN public.schools s ON s.short_name = 'BK Olsberg'
 WHERE lower(split_part(a.email, '@', 2)) = ANY (s.email_domains)
   AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE lower(p.email) = lower(a.email))
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ---------------------------------------------------------------------------
-- Prüfung (separat, ändert nichts):
--   select s.short_name, m.status, m.school_role, count(*)
--     from public.school_members m join public.schools s on s.id = m.school_id
--    group by 1,2,3;
--   select count(*) as offene_einladungen from public.school_invitations where accepted_at is null;
--
-- Schul-Admin ernennen (Schulleitung oder Koordinator), per Service-Rolle:
--   update public.school_members set school_role = 'schul_admin', updated_at = now()
--    where user_id = (select id from public.user_profiles where lower(email) = '<dienst-adresse>');
-- ---------------------------------------------------------------------------
