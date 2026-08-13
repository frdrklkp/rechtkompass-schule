(globalThis as any).window = globalThis;
const _store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => _store.get(k) ?? null,
  setItem: (k: string, v: string) => { _store.set(k, v); },
  removeItem: (k: string) => { _store.delete(k); },
  clear: () => { _store.clear(); },
  key: (i: number) => [..._store.keys()][i] ?? null,
  get length() { return _store.size; },
};

import { createClient } from "@supabase/supabase-js";
const url = process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: "admin@rechtkompass.local" });
const { supabase } = await import("../src/integrations/supabase/client");
await supabase.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "magiclink" });
const { canWrite } = await import("../src/lib/adminAuth");
for (let i = 0; i < 25; i++) { if (canWrite()) break; await new Promise((r) => setTimeout(r, 200)); }
console.log("canWrite:", canWrite());

const { createCase } = await import("../src/lib/coreBuilder");
try {
  const row = await createCase({
    title: "__SMOKETEST__ Permission-Fix-Verifikation",
    short_description: "Test", category: "Datenschutz", subcategory: "",
    ampel: "gelb", status: "draft",
  } as any);
  console.log("createCase SUCCESS, id:", row.id);

  const { EditorialWorkflowService } = await import("../src/services/editorial/EditorialWorkflowService");
  try {
    const reviewId = await EditorialWorkflowService.submitForReview({ caseId: row.id });
    console.log("submitForReview SUCCESS, reviewId:", reviewId);
  } catch (e) {
    console.log("submitForReview FAILED:", e instanceof Error ? e.message : e);
  }

  // Aufräumen
  await admin.from("case_reviews").delete().eq("case_id", row.id);
  await admin.from("practice_cases").delete().eq("id", row.id);
  console.log("cleanup done");
} catch (e) {
  console.log("createCase FAILED:", e instanceof Error ? e.message : e);
}
