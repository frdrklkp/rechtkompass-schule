/**
 * Betroffenenrechte zur Selbstbedienung (DSGVO-Audit 01.10.2026, Punkt 6;
 * umgesetzt 23.10.2026): Lehrkräfte laden ihre Daten selbst herunter
 * (Art. 15/20) und löschen ihr Konto selbst (Art. 17).
 *
 * Gleiche Tabellenliste wie scripts/_school-data.ts (Löschung je Schule),
 * hier aber je Konto. Läuft serverseitig mit der Service-Rolle; die Routen
 * prüfen vorher das Bearer-Token und geben nur Daten DIESES Kontos heraus.
 *
 * Wird eine neue Tabelle mit Kontobezug angelegt, gehört sie hier UND in
 * src/routes/datenschutz.tsx nachgetragen.
 */

/** Tabellen mit Kontobezug, die bei Kontolöschung vollständig gelöscht werden. */
export const OWNED_TABLES = [
  { table: "copilot_conversations", column: "user_id" }, // Turns per CASCADE
  { table: "workflow_execution_sessions", column: "user_id" }, // Schritte, Dokumente, Ereignisse per CASCADE
  { table: "case_files", column: "owner_id" },
  { table: "case_documents", column: "created_by" },
  { table: "favorites", column: "user_id" },
  { table: "pilot_survey_responses", column: "user_id" },
] as const;

/**
 * Darf dieses Konto sich selbst löschen? Redaktions- und Administrationskonten
 * nicht (sonst sperrt sich der Betrieb aus), und die Bestätigung muss exakt die
 * eigene E-Mail-Adresse sein.
 */
export function checkSelfDeletion(role: string | null | undefined, confirm: string | null | undefined, email: string | null | undefined): { ok: true } | { ok: false; reason: string } {
  if (role && role !== "teacher") {
    return { ok: false, reason: "Konten mit Redaktions- oder Administrationsrolle werden über den Betreiber gelöscht." };
  }
  const want = (email ?? "").trim().toLowerCase();
  if (!want || (confirm ?? "").trim().toLowerCase() !== want) {
    return { ok: false, reason: "Zur Bestätigung bitte die eigene E-Mail-Adresse eingeben." };
  }
  return { ok: true };
}

export const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// Die neuen Tabellen stehen nicht in den generierten Supabase-Typen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function rows(db: Db, table: string, column: string, value: string | string[]): Promise<unknown[]> {
  let q = db.from(table).select("*");
  q = Array.isArray(value) ? q.in(column, value) : q.eq(column, value);
  const { data, error } = await q.limit(5000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

export async function collectMyData(db: Db, userId: string) {
  const { data: authUser } = await db.auth.admin.getUserById(userId);
  const u = authUser?.user;
  const email: string | undefined = u?.email ?? undefined;

  const owned: Record<string, unknown[]> = {};
  for (const { table, column } of OWNED_TABLES) owned[table] = await rows(db, table, column, userId);

  const sessionIds = (owned.copilot_conversations as Array<{ session_id: string }>).map((c) => c.session_id);
  const wfIds = (owned.workflow_execution_sessions as Array<{ id: string }>).map((s) => s.id);

  return {
    hinweis:
      "Datenauskunft nach Art. 15 und Art. 20 DSGVO. Enthalten sind alle Daten, die RechtKompass Schule Ihrem Konto zuordnet. Die gemeinsame Fallsammlung und die Rechtsquellen enthalten keine Daten zu Ihrer Person.",
    erstelltAm: new Date().toISOString(),
    konto: u
      ? { id: u.id, email: u.email, angelegt: u.created_at, letzteAnmeldung: u.last_sign_in_at, bestaetigt: u.email_confirmed_at }
      : { id: userId },
    profil: (await rows(db, "user_profiles", "id", userId))[0] ?? null,
    schulmitgliedschaften: await rows(db, "school_members", "user_id", userId),
    pilotFreischaltung: email
      ? (((await db.from("pilot_allowlist").select("*").limit(5000)).data ?? []) as Array<{ email: string }>).filter((r) => sameEmail(r.email, email))
      : [],
    copilotGespraeche: owned.copilot_conversations,
    copilotBeitraege: sessionIds.length ? await rows(db, "copilot_conversation_turns", "session_id", sessionIds) : [],
    vorgaenge: owned.workflow_execution_sessions,
    vorgangsSchritte: wfIds.length ? await rows(db, "workflow_execution_steps", "session_id", wfIds) : [],
    vorgangsDokumente: wfIds.length ? await rows(db, "workflow_session_documents", "session_id", wfIds) : [],
    vorgangsEreignisse: wfIds.length ? await rows(db, "workflow_events", "session_id", wfIds) : [],
    fallakten: owned.case_files,
    dokumente: owned.case_documents,
    favoriten: owned.favorites,
    umfrageantworten: owned.pilot_survey_responses,
    fehlermeldungen: await rows(db, "case_feedback_reports", "user_id", userId),
    fallgenerierungen: await rows(db, "case_generation_jobs", "requested_by", userId),
    protokolleintraege: await rows(db, "audit_logs", "user_id", userId),
    imBrowserGespeichert:
      "Darstellung, Favoriten, zuletzt geöffnete Fälle und die zuletzt verwendete Empfängeradresse liegen nur in Ihrem Browser (localStorage) und sind hier nicht enthalten.",
  };
}

/**
 * Löscht alle Daten des Kontos und das Konto selbst. Fehlermeldungen und
 * Fallgenerierungs-Aufträge bleiben als Redaktionsvorgang ohne Personenbezug
 * stehen; die Schilderung wird entfernt.
 */
export async function deleteMyAccount(db: Db, userId: string, email: string | undefined): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const del = async (table: string, column: string, value: string) => {
    const { data, error } = await db.from(table).delete().eq(column, value).select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    counts[table] = (data ?? []).length;
  };
  const anon = async (table: string, column: string, patch: Record<string, unknown>) => {
    const { data, error } = await db.from(table).update(patch).eq(column, userId).select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    counts[`${table} (anonymisiert)`] = (data ?? []).length;
  };

  for (const { table, column } of OWNED_TABLES) await del(table, column, userId);
  await anon("case_feedback_reports", "user_id", { user_id: null });
  await anon("case_generation_jobs", "requested_by", { requested_by: null, sketch: null, sketch_purged_at: new Date().toISOString() });
  await anon("audit_logs", "user_id", { user_id: null });
  await del("school_members", "user_id", userId);
  if (email) {
    // Groß-/Kleinschreibung der Adressen ist in den Listen nicht vereinheitlicht.
    for (const table of ["school_invitations", "pilot_allowlist"]) {
      const { data, error } = await db.from(table).select("email").limit(5000);
      if (error) throw new Error(`${table}: ${error.message}`);
      const hits = [...new Set((data ?? []).map((r: { email: string }) => r.email).filter((e: string) => sameEmail(e, email)))] as string[];
      counts[table] = 0;
      // pilot_allowlist: sonst entstünde beim nächsten Anmeldelink still ein neues Konto.
      for (const e of hits) { await del(table, "email", e); counts[table] += 1; }
    }
  }
  await del("user_profiles", "id", userId);

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Konto: ${error.message}`);
  counts.konto = 1;
  return counts;
}
