// Produktive Adminauthentifizierung auf Basis von Supabase Auth + user_profiles.
// Ersetzt die frühere Dummy-Authentifizierung (localStorage-Flag).
//
// Öffentliche API (bewusst kompatibel gehalten, damit bestehende Aufrufer
// unverändert weiterlaufen):
//   - useAdminAuth(): { authed, ready, user, role, canWrite }
//   - isAuthed(): boolean
//   - canWrite(): boolean
//   - assertAdminWrite(): void  (wirft, wenn Rolle nicht schreibberechtigt)
//   - signIn(email, password): Promise<{ ok: boolean; error?: string }>
//   - signOut(): Promise<void>
//   - ADMIN_WRITE_ENABLED, ADMIN_WRITE_NOTICE (Banner-Konstanten)
//
// Wichtige Regel: Rollen werden ausschließlich aus der Datenbank
// (public.user_profiles.role) gelesen. Keine Hardcodierung.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "teacher"
  | "editor"
  | "reviewer"
  | "admin"
  | "superadmin";

const WRITE_ROLES: ReadonlySet<AppRole> = new Set([
  "editor",
  "reviewer",
  "admin",
  "superadmin",
]);

// Rollen, die den Adminbereich betreten dürfen (also nicht nur Lehrer).
const ADMIN_ROLES: ReadonlySet<AppRole> = new Set([
  "editor",
  "reviewer",
  "admin",
  "superadmin",
]);

export const ADMIN_WRITE_NOTICE =
  "Für diese Aktion sind Redaktions- oder Adminrechte erforderlich.";

// Legacy-Konstante: viele UI-Stellen zeigen nur einen Banner, wenn Schreiben
// global deaktiviert ist. In der neuen Auth ist Schreiben rollenabhängig,
// daher lassen wir den globalen Banner ausgeblendet (true) und prüfen fein-
// granular über canWrite()/assertAdminWrite().
export const ADMIN_WRITE_ENABLED = true;

interface AuthSnapshot {
  ready: boolean;
  user: User | null;
  role: AppRole | null;
}

let snapshot: AuthSnapshot = { ready: false, user: null, role: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): AuthSnapshot {
  return snapshot;
}

// Server-Snapshot (SSR): niemals authentifiziert.
const SERVER_SNAPSHOT: AuthSnapshot = { ready: false, user: null, role: null };
function getServerSnapshot(): AuthSnapshot {
  return SERVER_SNAPSHOT;
}

async function loadRole(userId: string): Promise<AppRole | null> {
  // user_profiles ist in supabase/types.ts (noch) nicht enthalten, daher hier
  // bewusst untypisiert. Sobald `bun run schema:check` die Typen regeneriert,
  // kann dieser Cast entfernt werden.
  const client = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { role: AppRole | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await client
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn(
      "[adminAuth] user_profiles.role konnte nicht gelesen werden:",
      error.message,
    );
    return null;
  }
  return (data?.role ?? null) as AppRole | null;
}

async function applyUser(user: User | null) {
  if (!user) {
    snapshot = { ready: true, user: null, role: null };
    emit();
    return;
  }
  const role = await loadRole(user.id);
  snapshot = { ready: true, user, role };
  emit();
}

let bootstrapped = false;
function bootstrap() {
  if (bootstrapped || typeof window === "undefined") return;
  bootstrapped = true;

  supabase.auth
    .getSession()
    .then(({ data }) => applyUser(data.session?.user ?? null))
    .catch((err) => {
      console.warn("[adminAuth] getSession fehlgeschlagen:", err);
      snapshot = { ready: true, user: null, role: null };
      emit();
    });

  supabase.auth.onAuthStateChange((_event, session) => {
    void applyUser(session?.user ?? null);
  });
}

if (typeof window !== "undefined") {
  bootstrap();
}

export function useAdminAuth() {
  // Erststart: falls das Modul bereits vor React geladen wurde, ist bootstrap
  // schon gelaufen. Sonst hier nachziehen.
  useEffect(() => {
    bootstrap();
  }, []);
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const authed = !!s.user && s.role !== null && ADMIN_ROLES.has(s.role);
  return {
    ready: s.ready,
    user: s.user,
    role: s.role,
    authed,
    canWrite: !!s.role && WRITE_ROLES.has(s.role),
  };
}

export function isAuthed(): boolean {
  return !!snapshot.user && !!snapshot.role && ADMIN_ROLES.has(snapshot.role);
}

export function canWrite(): boolean {
  return !!snapshot.role && WRITE_ROLES.has(snapshot.role);
}

export function assertAdminWrite(): void {
  if (!snapshot.user) {
    throw new Error("Nicht angemeldet. Bitte erneut einloggen.");
  }
  if (!snapshot.role || !WRITE_ROLES.has(snapshot.role)) {
    throw new Error(ADMIN_WRITE_NOTICE);
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, error: error.message };
  await applyUser(data.user ?? null);
  // Zugriff nur mit Redaktions-/Adminrolle.
  if (!snapshot.role || !ADMIN_ROLES.has(snapshot.role)) {
    await supabase.auth.signOut();
    await applyUser(null);
    return {
      ok: false,
      error:
        "Dieses Konto hat keine Berechtigung für den Redaktionsbereich.",
    };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  await applyUser(null);
}

// Legacy-Hook für Reactivity in Nicht-Store-Aufrufern.
export function useAuthReady(): boolean {
  const [ready, setReady] = useState(snapshot.ready);
  useEffect(() => {
    if (snapshot.ready) setReady(true);
    return subscribe(() => setReady(snapshot.ready));
  }, []);
  return ready;
}
