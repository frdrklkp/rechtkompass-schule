// Repo für Nutzer-Feedback / Fehlermeldungen (Tabelle: case_feedback_reports).
// Table-Name als Variable (kein Literal), damit schema-check nicht anschlägt,
// solange die Migration db/2026-07-13_case_feedback_reports.sql noch nicht
// ausgeführt ist.
import { supabase } from "@/integrations/supabase/client";

const T = "case_feedback_reports" as const;

export type FeedbackStatus = "open" | "in_review" | "quality_check" | "resolved" | "rejected";
export type FeedbackUrgency = "low" | "medium" | "high";

export type FeedbackReportType =
  | "content_unclear"
  | "recommendation_mismatch"
  | "dos_donts_missing"
  | "legal_mismatch"
  | "legal_missing"
  | "knowledge_mismatch"
  | "template_mismatch"
  | "decision_tree_unclear"
  | "case_missing"
  | "technical_bug"
  | "other";

export const REPORT_TYPE_LABELS: Record<FeedbackReportType, string> = {
  content_unclear: "Inhalt unklar",
  recommendation_mismatch: "Handlungsempfehlung passt nicht",
  dos_donts_missing: "Do's oder Don'ts unvollständig",
  legal_mismatch: "Rechtsgrundlage passt nicht",
  legal_missing: "Rechtsgrundlage fehlt",
  knowledge_mismatch: "Wissenskarte passt nicht",
  template_mismatch: "Dokumentvorlage passt nicht",
  decision_tree_unclear: "Entscheidungsassistent hilft nicht weiter",
  case_missing: "Wichtiger Praxisfall fehlt",
  technical_bug: "Technischer Fehler",
  other: "Sonstiges",
};

export const URGENCY_LABELS: Record<FeedbackUrgency, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
};

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: "Offen",
  in_review: "In Prüfung",
  quality_check: "Qualitätsprüfung",
  resolved: "Erledigt",
  rejected: "Abgelehnt",
};

export type FeedbackReport = {
  id: string;
  case_id: string | null;
  case_title: string | null;
  user_id: string | null;
  report_type: FeedbackReportType;
  message: string;
  urgency: FeedbackUrgency;
  route: string | null;
  reported_area: string | null;
  status: FeedbackStatus;
  admin_notes: string | null;
  quality_task_reference: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(r: any): FeedbackReport {
  return {
    id: r.id,
    case_id: r.case_id ?? null,
    case_title: r.case_title ?? null,
    user_id: r.user_id ?? null,
    report_type: (r.report_type ?? "other") as FeedbackReportType,
    message: r.message ?? "",
    urgency: (r.urgency ?? "medium") as FeedbackUrgency,
    route: r.route ?? null,
    reported_area: r.reported_area ?? null,
    status: (r.status ?? "open") as FeedbackStatus,
    admin_notes: r.admin_notes ?? null,
    quality_task_reference: r.quality_task_reference ?? null,
    resolved_at: r.resolved_at ?? null,
    resolved_by: r.resolved_by ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function wrapError(e: any): Error {
  if (!e) return new Error("Unbekannter Fehler");
  const parts = [e.message, e.code && `code=${e.code}`, e.details, e.hint].filter(Boolean);
  return new Error(parts.join(" · ") || "Datenbankfehler");
}

export type CreateFeedbackReportInput = {
  case_id: string | null;
  case_title: string | null;
  user_id?: string | null;
  report_type: FeedbackReportType;
  message: string;
  urgency: FeedbackUrgency;
  route?: string | null;
  reported_area?: string | null;
};

export async function createFeedbackReport(input: CreateFeedbackReportInput): Promise<FeedbackReport> {
  const msg = (input.message ?? "").trim();
  if (msg.length < 5) throw new Error("Bitte beschreiben Sie das Problem etwas ausführlicher (mind. 5 Zeichen).");
  const { data, error } = await ((supabase as any).from(T) as any)
    .insert({
      case_id: input.case_id,
      case_title: input.case_title,
      user_id: input.user_id ?? null,
      report_type: input.report_type,
      message: msg,
      urgency: input.urgency,
      route: input.route ?? null,
      reported_area: input.reported_area ?? null,
      status: "open" as FeedbackStatus,
    })
    .select("*")
    .single();
  if (error) throw wrapError(error);
  return mapRow(data);
}

export async function listFeedbackReports(): Promise<FeedbackReport[]> {
  const { data, error } = await (supabase as any)
    .from(T)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw wrapError(error);
  return (data ?? []).map(mapRow);
}

export async function getFeedbackReport(id: string): Promise<FeedbackReport | null> {
  const { data, error } = await (supabase as any).from(T).select("*").eq("id", id).maybeSingle();
  if (error) throw wrapError(error);
  return data ? mapRow(data) : null;
}

export async function countOpenReportsForCase(caseId: string, excludeId?: string): Promise<number> {
  let q = (supabase as any)
    .from(T)
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .in("status", ["open", "in_review", "quality_check"]);
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw wrapError(error);
  return count ?? 0;
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<FeedbackReport> {
  const patch: Record<string, unknown> = { status };
  if (status === "resolved") patch.resolved_at = new Date().toISOString();
  if (status !== "resolved") patch.resolved_at = null;
  const { data, error } = await ((supabase as any).from(T) as any)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw wrapError(error);
  return mapRow(data);
}

export async function updateFeedbackAdminNotes(id: string, notes: string): Promise<FeedbackReport> {
  const { data, error } = await ((supabase as any).from(T) as any)
    .update({ admin_notes: notes })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw wrapError(error);
  return mapRow(data);
}

export async function updateFeedbackQualityReference(id: string, ref: string | null): Promise<FeedbackReport> {
  const { data, error } = await ((supabase as any).from(T) as any)
    .update({ quality_task_reference: ref, status: "quality_check" as FeedbackStatus })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw wrapError(error);
  return mapRow(data);
}

export async function resolveFeedbackReport(id: string): Promise<FeedbackReport> {
  return updateFeedbackStatus(id, "resolved");
}

export async function rejectFeedbackReport(id: string): Promise<FeedbackReport> {
  return updateFeedbackStatus(id, "rejected");
}
