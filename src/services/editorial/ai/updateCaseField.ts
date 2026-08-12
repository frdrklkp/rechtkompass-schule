// Einzelfeld-Übernahme für KI-Vorschläge. Nur im Status "draft" erlaubt.
// Schreibt genau EIN Feld auf practice_cases und respektiert RLS.
// Kein direkter Workflow-Change, keine Version, kein Publish.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { AIEditorialField } from "./types";

export interface UpdateFieldInput {
  caseId: string;
  field: AIEditorialField;
  value: unknown;
}

export async function updateEditorialCaseField(
  input: UpdateFieldInput,
): Promise<void> {
  const patch: Record<string, unknown> = { [input.field]: input.value };
  const { error } = await (supabase.from("practice_cases") as any)
    .update(patch)
    .eq("id", input.caseId);
  if (error) {
    const msg = (error as { message?: string })?.message ?? "Update fehlgeschlagen";
    throw new Error(msg);
  }
}
