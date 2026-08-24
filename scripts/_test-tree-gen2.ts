const url = process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const res0 = await fetch(`${url}/rest/v1/practice_cases?workflow_status=eq.in_review&select=id,title,category,short_description,short_answer,immediate_actions,recommendation,responsibilities,practice_tip,common_mistakes,checklist,documentation,legal_explanation,faq&limit=5`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});
const rows = await res0.json();
let missing = 0, ok = 0;
for (const caseRow of rows) {
  const res = await fetch("http://127.0.0.1:8080/api/ai-draft-decision-tree", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseRow }),
  });
  const { tree } = await res.json();
  const hasResults = tree?.results && Object.keys(tree.results).length > 0;
  const hasMeta = !!tree?.meta;
  console.log(caseRow.title.slice(0, 50), "| meta:", hasMeta, "| results:", hasResults, hasResults ? Object.keys(tree.results).length : 0);
  if (hasResults && hasMeta) ok++; else missing++;
}
console.log(`\nErgebnis: ${ok} vollstaendig, ${missing} unvollstaendig`);
