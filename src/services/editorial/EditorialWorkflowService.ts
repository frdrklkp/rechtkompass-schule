// EditorialWorkflowService – kapselt die in Sprint 3.2 eingeführten
// SECURITY-DEFINER-RPCs. Ausschließlich dieser Service ruft die RPCs
// submit_case_for_review, decide_case_review, publish_case, archive_case
// und reactivate_case auf. Keine andere Stelle im Frontend darf
// supabase.rpc(...) für Workflowfelder verwenden.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { mapSupabaseError } from "./errorMapper";
import type {
  CorrelationOptions,
  PublicationTier,
  ReviewDecision,
} from "./types";

function newCorrelationId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* noop */
  }
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function callRpc<T = unknown>(
  fn: string,
  params: Record<string, unknown>,
  correlationId: string,
): Promise<T> {
  const client = supabase as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: T; error: unknown }>;
  };
  const { data, error } = await client.rpc(fn, params);
  if (error) {
    throw mapSupabaseError(error, correlationId);
  }
  return data as T;
}

export interface SubmitForReviewInput extends CorrelationOptions {
  caseId: string;
  assignedTo?: string | null;
  comment?: string | null;
}

export interface DecideReviewInput extends CorrelationOptions {
  reviewId: string;
  decision: ReviewDecision;
  comment?: string | null;
}

export interface PublishInput extends CorrelationOptions {
  caseId: string;
  publicationTier: PublicationTier;
}

export interface ArchiveInput extends CorrelationOptions {
  caseId: string;
  reason?: string | null;
}

export interface ReactivateInput extends CorrelationOptions {
  caseId: string;
}

export const EditorialWorkflowService = {
  async submitForReview(input: SubmitForReviewInput) {
    const cid = input.correlationId ?? newCorrelationId();
    return callRpc<unknown>(
      "submit_case_for_review",
      {
        p_case_id: input.caseId,
        p_assigned_to: input.assignedTo ?? null,
        p_comment: input.comment ?? null,
      },
      cid,
    );
  },

  async decideReview(input: DecideReviewInput) {
    const cid = input.correlationId ?? newCorrelationId();
    if (
      input.decision === "changes_requested" &&
      !input.comment?.trim()
    ) {
      throw mapSupabaseError(
        { message: "comment_required_for_changes_requested" },
        cid,
      );
    }
    if (input.decision === "rejected" && !input.comment?.trim()) {
      throw mapSupabaseError(
        { message: "comment_required_for_rejected" },
        cid,
      );
    }
    return callRpc<unknown>(
      "decide_case_review",
      {
        p_review_id: input.reviewId,
        p_decision: input.decision,
        p_comment: input.comment ?? null,
      },
      cid,
    );
  },

  async approveReview(input: Omit<DecideReviewInput, "decision">) {
    return this.decideReview({ ...input, decision: "approved" });
  },

  async requestChanges(input: Omit<DecideReviewInput, "decision">) {
    return this.decideReview({ ...input, decision: "changes_requested" });
  },

  async rejectReview(input: Omit<DecideReviewInput, "decision">) {
    return this.decideReview({ ...input, decision: "rejected" });
  },

  async cancelReview(input: Omit<DecideReviewInput, "decision">) {
    return this.decideReview({ ...input, decision: "cancelled" });
  },

  async publish(input: PublishInput) {
    const cid = input.correlationId ?? newCorrelationId();
    return callRpc<unknown>(
      "publish_case",
      {
        p_case_id: input.caseId,
        p_publication_tier: input.publicationTier,
      },
      cid,
    );
  },

  async archive(input: ArchiveInput) {
    const cid = input.correlationId ?? newCorrelationId();
    return callRpc<unknown>(
      "archive_case",
      {
        p_case_id: input.caseId,
        p_reason: input.reason ?? null,
      },
      cid,
    );
  },

  async reactivate(input: ReactivateInput) {
    const cid = input.correlationId ?? newCorrelationId();
    return callRpc<unknown>(
      "reactivate_case",
      { p_case_id: input.caseId },
      cid,
    );
  },
};

export type EditorialWorkflowServiceType = typeof EditorialWorkflowService;
