-- 2026-10-05: Mandantenkonzept, Stufe 3a - Schulverwaltung (Funktionen für die
-- Oberfläche). Voraussetzung: Stufe 1 und 2 sind angewendet.
--
-- Zwei Oberflächen greifen hierauf zu:
--   /schule          Schul-Admin: Mitglieder und Einladungen der EIGENEN Schule
--   /admin/schulen   Betreiber-Admin: Schulen anlegen, Status, erste Schul-Admin einladen
--
-- Alle Schreibwege laufen über SECURITY-DEFINER-Funktionen mit eigener
-- Berechtigungsprüfung, damit ein Schul-Admin nie Zeilen anderer Schulen
-- anfasst und kein Tabellen-Update aus der Oberfläche nötig ist. Lesen von
-- Profildaten (E-Mail, Name, letzter Login) geschieht nur über die Übersicht
-- der eigenen Schule - user_profiles bleibt für Lehrkräfte auf "self" beschränkt.
--
-- Idempotent; im Supabase SQL Editor oder per Bun-SQL-Skript ausführen.

BEGIN;

-- ---------------------------------------------------------------------------
-- schools: Betreiber-Admin darf anlegen und ändern (bisher nur Service-Rolle)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS schools_admin_write ON public.schools;
CREATE POLICY schools_admin_write ON public.schools
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
GRANT INSERT, UPDATE ON public.schools TO authenticated;

-- ---------------------------------------------------------------------------
-- Übersicht Mitglieder einer Schule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.school_member_overview(_school_id uuid DEFAULT NULL)
RETURNS TABLE (
  user_id          uuid,
  email            text,
  display_name     text,
  school_role      text,
  status           text,
  member_since     timestamptz,
  last_sign_in_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sid uuid := coalesce(_school_id, public.current_school_id());
BEGIN
  IF _sid IS NULL THEN
    RETURN;
  END IF;
  IF NOT (public.is_school_admin(_sid) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Keine Berechtigung für diese Schule' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.user_id,
           coalesce(p.email, u.email)::text,
           p.display_name,
           m.school_role,
           m.status,
           m.created_at,
           u.last_sign_in_at
      FROM public.school_members m
      LEFT JOIN public.user_profiles p ON p.id = m.user_id
      LEFT JOIN auth.users u ON u.id = m.user_id
     WHERE m.school_id = _sid
       AND m.status <> 'entfernt'
     ORDER BY m.school_role DESC, coalesce(p.display_name, p.email, u.email);
END;
$$;

-- ---------------------------------------------------------------------------
-- Übersicht aller Schulen (Betreiber)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.school_overview()
RETURNS TABLE (
  id                 uuid,
  name               text,
  short_name         text,
  city               text,
  status             text,
  email_domains      text[],
  contract_ref       text,
  monthly_budget_usd numeric,
  joined_at          timestamptz,
  members_active     integer,
  school_admins      integer,
  invitations_open   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.short_name, s.city, s.status, s.email_domains, s.contract_ref,
         s.monthly_budget_usd, s.joined_at,
         (SELECT count(*)::int FROM public.school_members m WHERE m.school_id = s.id AND m.status = 'aktiv'),
         (SELECT count(*)::int FROM public.school_members m WHERE m.school_id = s.id AND m.status = 'aktiv' AND m.school_role = 'schul_admin'),
         (SELECT count(*)::int FROM public.school_invitations i WHERE i.school_id = s.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now())
    FROM public.schools s
   WHERE public.is_admin()
   ORDER BY s.status, s.name
$$;

-- ---------------------------------------------------------------------------
-- Einladung anlegen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_school_invitation(
  _email     text,
  _school_id uuid DEFAULT NULL,
  _role      text DEFAULT 'lehrkraft',
  _note      text DEFAULT NULL
)
RETURNS TABLE (id uuid, school_id uuid, school_name text, expires_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sid   uuid := coalesce(_school_id, public.current_school_id());
  _mail  text := lower(trim(_email));
  _inv   public.school_invitations%ROWTYPE;
  _sname text;
BEGIN
  IF _sid IS NULL THEN
    RAISE EXCEPTION 'Keine Schule angegeben' USING ERRCODE = '22023';
  END IF;
  IF _role NOT IN ('lehrkraft', 'schul_admin') THEN
    RAISE EXCEPTION 'Unbekannte Rolle' USING ERRCODE = '22023';
  END IF;
  IF _mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Ungültige E-Mail-Adresse' USING ERRCODE = '22023';
  END IF;
  -- Schul-Admins laden nur Lehrkräfte der eigenen Schule ein; Betreiber-Admin alles.
  IF public.is_admin() THEN
    NULL;
  ELSIF public.is_school_admin(_sid) THEN
    IF _role <> 'lehrkraft' THEN
      RAISE EXCEPTION 'Schul-Admins können nur Lehrkräfte einladen' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Keine Berechtigung für diese Schule' USING ERRCODE = '42501';
  END IF;
  SELECT s.name INTO _sname FROM public.schools s WHERE s.id = _sid AND s.status = 'active';
  IF _sname IS NULL THEN
    RAISE EXCEPTION 'Schule nicht aktiv' USING ERRCODE = '22023';
  END IF;
  -- Bereits aktives Mitglied (irgendeiner Schule)? Dann keine zweite Mitgliedschaft.
  IF EXISTS (
    SELECT 1 FROM public.school_members m JOIN public.user_profiles p ON p.id = m.user_id
     WHERE lower(p.email) = _mail AND m.status = 'aktiv'
  ) THEN
    RAISE EXCEPTION 'Diese Adresse ist bereits Mitglied einer Schule' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.school_invitations i
     WHERE lower(i.email) = _mail AND i.accepted_at IS NULL AND i.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Für diese Adresse liegt bereits eine offene Einladung vor' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.school_invitations (school_id, email, school_role, invited_by, note)
  VALUES (_sid, _mail, _role, auth.uid(), nullif(trim(coalesce(_note, '')), ''))
  RETURNING * INTO _inv;

  RETURN QUERY SELECT _inv.id, _inv.school_id, _sname, _inv.expires_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- Einladung widerrufen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_school_invitation(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sid uuid;
BEGIN
  SELECT i.school_id INTO _sid FROM public.school_invitations i WHERE i.id = _id AND i.accepted_at IS NULL AND i.revoked_at IS NULL;
  IF _sid IS NULL THEN RETURN false; END IF;
  IF NOT (public.is_school_admin(_sid) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Keine Berechtigung für diese Schule' USING ERRCODE = '42501';
  END IF;
  UPDATE public.school_invitations SET revoked_at = now() WHERE id = _id;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Mitglied entfernen / Rolle setzen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_school_member(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sid uuid;
BEGIN
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Die eigene Mitgliedschaft kann nicht entfernt werden' USING ERRCODE = '22023';
  END IF;
  SELECT m.school_id INTO _sid FROM public.school_members m WHERE m.user_id = _user_id AND m.status = 'aktiv';
  IF _sid IS NULL THEN RETURN false; END IF;
  IF NOT (public.is_school_admin(_sid) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Keine Berechtigung für diese Schule' USING ERRCODE = '42501';
  END IF;
  UPDATE public.school_members
     SET status = 'entfernt', removed_at = now(), updated_at = now()
   WHERE user_id = _user_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_school_member_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sid uuid;
BEGIN
  IF _role NOT IN ('lehrkraft', 'schul_admin') THEN
    RAISE EXCEPTION 'Unbekannte Rolle' USING ERRCODE = '22023';
  END IF;
  SELECT m.school_id INTO _sid FROM public.school_members m WHERE m.user_id = _user_id AND m.status = 'aktiv';
  IF _sid IS NULL THEN RETURN false; END IF;
  IF NOT (public.is_school_admin(_sid) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Keine Berechtigung für diese Schule' USING ERRCODE = '42501';
  END IF;
  -- Die letzte Schul-Admin kann sich nicht selbst herabstufen.
  IF _role = 'lehrkraft' AND _user_id = auth.uid()
     AND (SELECT count(*) FROM public.school_members m WHERE m.school_id = _sid AND m.status = 'aktiv' AND m.school_role = 'schul_admin') <= 1 THEN
    RAISE EXCEPTION 'Mindestens eine Schul-Admin muss bleiben' USING ERRCODE = '22023';
  END IF;
  UPDATE public.school_members SET school_role = _role, updated_at = now() WHERE user_id = _user_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_member_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_school_invitation(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_school_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_school_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_school_member_role(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
