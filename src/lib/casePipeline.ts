/**
 * Pipeline-Utilities für die KI-Fallproduktionsmaschine.
 *
 * Reine Client-Utilities – wiederverwenden vorhandener Repos und Matching-Logik.
 * Kein neues Datenmodell, keine parallelen Systeme.
 *
 * Sprint 3.3: Die Veröffentlichung erfolgt ausschließlich über den
 * SECURITY-DEFINER-RPC public.publish_case (via EditorialWorkflowService).
 * Direkte Schreibzugriffe auf practice_cases.status/workflow_status sind
 * nach Sprint 3.2 durch den Workflow-Guard-Trigger blockiert.
 */

import { supabase } from "@/integrations/supabase/client";
import { assertAdminWrite } from "@/lib/adminAuth";
import { apiFetch } from "@/lib/apiFetch";
import { loadCaseForEvaluation, type EvalResult } from "@/lib/qualityEngine";
import {
  EditorialWorkflowService,
  isEditorialError,
  type PublicationTier,
} from "@/services/editorial";

export type PublishReport = {
  published: string[];
  rejected: Array<{ caseId: string; reasons: string[]; hardBlockers: string[]; score: number }>;
  errors: Array<{ caseId: string; message: string }>;
};

/**
 * Batch-Veröffentlichung.
 * WICHTIG: Jeder Fall wird UNMITTELBAR vor der Publikation erneut serverseitig
 * via loadCaseForEvaluation() (arbeitet gegen den aktuellen DB-Stand) geprüft.
 * Der Score aus dem Frontend wird NICHT vertraut (Race-Condition-Schutz).
 *
 * Die eigentliche Publikation erfolgt über EditorialWorkflowService.publish,
 * das den RPC public.publish_case ansteuert. Der Aufrufkontext ist der
 * angemeldete authenticated-Benutzer (kein service_role); die tatsächliche
 * Berechtigungsprüfung erfolgt im RPC.
 */
export async function publishCasesBatch(
  caseIds: string[],
  publicationTier: PublicationTier = "public",
): Promise<PublishReport> {
  assertAdminWrite();
  const report: PublishReport = { published: [], rejected: [], errors: [] };

  for (const id of caseIds) {
    try {
      const evalRes = await loadCaseForEvaluation(id);
      if (!evalRes.publicationReady) {
        report.rejected.push({
          caseId: id,
          score: evalRes.score,
          hardBlockers: evalRes.hardBlockers,
          reasons: evalRes.reasons
            .filter((r) => !evalRes.hardBlockers.some((h) => h.includes(r.key)))
            .map((r) => r.message),
        });
        continue;
      }
      try {
        await EditorialWorkflowService.publish({
          caseId: id,
          publicationTier,
        });
        report.published.push(id);
      } catch (rpcErr) {
        const message = isEditorialError(rpcErr)
          ? rpcErr.userMessage
          : rpcErr instanceof Error
            ? rpcErr.message
            : String(rpcErr);
        report.errors.push({ caseId: id, message });
      }
    } catch (e) {
      report.errors.push({
        caseId: id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return report;
}

/**
 * Batch-Evaluation für eine Liste von IDs (parallel, mit Fehler-Isolation).
 */
export async function evaluateCases(
  caseIds: string[],
): Promise<Array<EvalResult | { caseId: string; error: string }>> {
  const results = await Promise.all(
    caseIds.map(async (id) => {
      try {
        return await loadCaseForEvaluation(id);
      } catch (e) {
        return { caseId: id, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return results;
}

/**
 * Gezielte Nachbesserung eines einzelnen Feldes über den KI-Endpunkt.
 * Überschreibt nur das benannte Feld – guter Inhalt in anderen Feldern bleibt erhalten.
 *
 * Hinweis: Redaktionelle Inhaltsfelder sind vom Workflow-Guard nicht betroffen
 * (nur workflow_status/status). Ein direktes Update ist zulässig, solange der
 * Fall im Zustand `draft` bearbeitet werden darf (RLS-geprüft).
 */
export async function refineCaseField(
  caseId: string,
  field:
    | "practice_tip"
    | "faq"
    | "checklist"
    | "documentation"
    | "common_mistakes"
    | "legal_explanation"
    | "short_description"
    | "recommendation"
    | "immediate_actions"
    | "responsibilities",
  reason: string,
): Promise<{ ok: boolean; message: string }> {
  assertAdminWrite();
  const caseRes = await supabase.from("practice_cases").select("*").eq("id", caseId).limit(1);
  if (caseRes.error) throw caseRes.error;
  const caseRow = (caseRes.data ?? [])[0];
  if (!caseRow) return { ok: false, message: "Fall nicht gefunden" };

  const res = await apiFetch("/api/ai-refine-case-field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, reason, caseRow }),
  });
  if (!res.ok) {
    return { ok: false, message: `KI-Nachbesserung fehlgeschlagen (${res.status})` };
  }
  const { value } = (await res.json()) as { value: unknown };
  if (value == null) return { ok: false, message: "Keine Rückgabe" };

  const patch: Record<string, unknown> = {};
  patch[field] = value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("practice_cases") as any).update(patch).eq("id", caseId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Feld nachgebessert" };
}
