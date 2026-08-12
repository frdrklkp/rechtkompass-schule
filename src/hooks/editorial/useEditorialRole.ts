// Rollen- und Rechte-Kontext für das Editorial-UI. Grundlage ist die
// bereits im Projekt vorhandene Rolle aus user_profiles (useAdminAuth).
// Diese Ableitungen dienen ausschließlich der UI-Steuerung – die tatsächliche
// Sicherheit bleibt bei RLS, RPC-Rollenprüfungen und Triggern.

import { useMemo } from "react";
import { useAdminAuth, type AppRole } from "@/lib/adminAuth";

export interface EditorialRoleContext {
  ready: boolean;
  role: AppRole | null;
  userId: string | null;
  canSeeEditorial: boolean;
  canEdit: boolean; // Draft bearbeiten / einreichen
  canReview: boolean; // Reviewentscheidungen
  canPublish: boolean; // Veröffentlichen
  canArchivePublished: boolean; // published → archived
  canArchiveDraft: boolean; // draft → archived (editor+)
  canReactivate: boolean; // archived → draft
  isAdmin: boolean;
}

const EDITORIAL_ROLES = new Set<AppRole>([
  "editor",
  "reviewer",
  "admin",
  "superadmin",
]);

export function useEditorialRole(): EditorialRoleContext {
  const { role, user, ready } = useAdminAuth();
  return useMemo<EditorialRoleContext>(() => {
    const r = role;
    const isAdmin = r === "admin" || r === "superadmin";
    return {
      ready,
      role: r,
      userId: user?.id ?? null,
      canSeeEditorial: !!r && EDITORIAL_ROLES.has(r),
      canEdit: r === "editor" || r === "reviewer" || isAdmin,
      canReview: r === "reviewer" || isAdmin,
      canPublish: isAdmin,
      canArchivePublished: isAdmin,
      canArchiveDraft: r === "editor" || r === "reviewer" || isAdmin,
      canReactivate: isAdmin,
      isAdmin,
    };
  }, [role, user, ready]);
}
