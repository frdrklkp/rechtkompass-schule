/**
 * Repo für redaktionelle Ground-Truth-Overrides zum Suchtest-Set.
 * Tabelle: search_testset_overrides (siehe db/2026-07-14_search_testset_overrides.sql).
 *
 * Reads: direkt über den Publishable-Client (RLS erlaubt SELECT für anon/authenticated).
 * Writes: ausschließlich über die serverseitige Route /api/search-testset-overrides,
 *   die den Service-Role-Client verwendet. Aus dem Browser wird NIE mit erhöhten
 *   Rechten geschrieben und der Service-Role-Key gelangt nicht in das Client-Bundle.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TestAudit } from "@/lib/searchTestSet";
import { apiFetch } from "@/lib/apiFetch";

const T = "search_testset_overrides" as const;

export type TestOverride = {
  test_id: string;
  expected_case_ids: string[];
  acceptable_case_ids: string[];
  audit: TestAudit | null;
  note: string | null;
  updated_at: string;
  updated_by: string | null;
};

function mapRow(r: any): TestOverride {
  return {
    test_id: r.test_id,
    expected_case_ids: Array.isArray(r.expected_case_ids) ? r.expected_case_ids : [],
    acceptable_case_ids: Array.isArray(r.acceptable_case_ids) ? r.acceptable_case_ids : [],
    audit: (r.audit ?? null) as TestAudit | null,
    note: r.note ?? null,
    updated_at: r.updated_at,
    updated_by: r.updated_by ?? null,
  };
}

export async function listTestOverrides(): Promise<TestOverride[]> {
  const { data, error } = await (supabase as any).from(T).select("*");
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[searchTestOverridesRepo] list failed:", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export type UpsertTestOverrideInput = {
  test_id: string;
  expected_case_ids: string[];
  acceptable_case_ids: string[];
  audit?: TestAudit | null;
  note?: string | null;
};

async function parseApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; details?: unknown };
    const base = j.error ?? `HTTP ${res.status}`;
    if (j.details) {
      try {
        return `${base} (${JSON.stringify(j.details)})`;
      } catch {
        return base;
      }
    }
    return base;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function upsertTestOverride(
  input: UpsertTestOverrideInput,
): Promise<TestOverride> {
  const res = await apiFetch("/api/search-testset-overrides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      testId: input.test_id,
      expectedCaseIds: input.expected_case_ids,
      acceptableCaseIds: input.acceptable_case_ids,
      audit: input.audit ?? null,
      editorialNote: input.note ?? null,
    }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  const j = (await res.json()) as { override: unknown };
  return mapRow(j.override);
}

export async function deleteTestOverride(testId: string): Promise<void> {
  const res = await apiFetch("/api/search-testset-overrides", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testId }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}
