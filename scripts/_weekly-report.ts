/**
 * Wochenreport für die Redaktion (Nutzerauftrag 11.09.2026, Schritt 3 der
 * Verbesserungsliste): läuft montags früh per GitHub Actions
 * (.github/workflows/weekly-report.yml) und schickt eine Mail an
 * REVIEW_NOTIFY_EMAIL mit dem Stand der Pilotwoche - Fallbestand nach
 * Prüfstatus, neue Fälle, offene Reviews, offene Problem-Meldungen,
 * Fallgenerierungs-Läufe, erstellte Dokumente und Anthropic-Guthaben.
 * Zugriffszahlen liegen bei Cloudflare (Web Analytics), dorthin wird
 * verlinkt statt Zahlen zu erfinden.
 *
 * Manuell: set -a; source .env; set +a; bun run scripts/_weekly-report.ts
 * Lokaler Test ohne Resend-Secrets: ... --dry-run (schreibt die Mail als
 * HTML in den Scratch-Ordner statt zu versenden).
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NOTIFY_TO = process.env.REVIEW_NOTIFY_EMAIL;
const SITE = "https://www.rechtkompass-schule.de";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.");
  process.exit(1);
}
const DRY_RUN = process.argv.includes("--dry-run");
if (!DRY_RUN && (!NOTIFY_TO || !process.env.RESEND_API_KEY)) {
  console.error("REVIEW_NOTIFY_EMAIL / RESEND_API_KEY fehlen - kein Versand möglich.");
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = service as any;
const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
}

async function countWhere(table: string, apply: (q: any) => any): Promise<number> {
  const { count, error } = await apply(db.from(table).select("id", { count: "exact", head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

/** Anthropic-Guthaben wie im Runner prüfen (1-Token-Minimalanfrage). */
async function creditStatus(): Promise<"ok" | "leer" | "unbekannt"> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "unbekannt";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "." }] }),
    });
    if (res.ok) return "ok";
    const text = await res.text();
    return /credit balance is too low/i.test(text) ? "leer" : "unbekannt";
  } catch {
    return "unbekannt";
  }
}

async function main() {
  // Fallbestand (veröffentlichte Fälle nach Prüfstatus).
  const published = await countWhere("practice_cases", (q: any) => q.eq("status", "published"));
  const gruen = await countWhere("practice_cases", (q: any) => q.eq("status", "published").eq("legal_review_status", "gruen"));
  const gelb = await countWhere("practice_cases", (q: any) => q.eq("status", "published").eq("legal_review_status", "gelb"));
  const rot = await countWhere("practice_cases", (q: any) => q.eq("status", "published").eq("legal_review_status", "rot"));
  const ungeprueft = published - gruen - gelb - rot;

  // Neue Fälle der letzten 7 Tage.
  const { data: newCases, error: ncErr } = await db
    .from("practice_cases")
    .select("id, title, status, legal_review_status, created_at")
    .gt("created_at", weekAgo)
    .order("created_at", { ascending: false })
    .limit(15);
  if (ncErr) throw new Error(`Neue Fälle: ${ncErr.message}`);
  const newCaseCount = await countWhere("practice_cases", (q: any) => q.gt("created_at", weekAgo));

  // Offene Reviews.
  const pendingReviews = await countWhere("case_reviews", (q: any) => q.eq("status", "pending"));

  // Problem-Meldungen: offen gesamt + neu in der Woche.
  const openFeedback = await countWhere("case_feedback_reports", (q: any) => q.in("status", ["open", "in_review", "quality_check"]));
  const { data: newFeedback, error: fbErr } = await db
    .from("case_feedback_reports")
    .select("case_title, report_type, message, urgency, status, created_at")
    .gt("created_at", weekAgo)
    .order("created_at", { ascending: false })
    .limit(10);
  if (fbErr) throw new Error(`Meldungen: ${fbErr.message}`);

  // Fallgenerierungs-Läufe der Woche (System-Marker der Guthaben-Warnung ausgenommen).
  const jobsOk = await countWhere("case_generation_jobs", (q: any) => q.eq("status", "succeeded").gt("created_at", weekAgo));
  const jobsFailed = await countWhere("case_generation_jobs", (q: any) =>
    q.eq("status", "failed").gt("created_at", weekAgo).not("sketch", "ilike", "SYSTEM:%"));

  // Erstellte Dokumente der Woche.
  let docsCreated: number | null = null;
  try {
    docsCreated = await countWhere("case_documents", (q: any) => q.gt("created_at", weekAgo));
  } catch {
    docsCreated = null; // Tabelle/Spalte nicht verfügbar - Abschnitt entfällt.
  }

  const credit = await creditStatus();

  const caseRows = (newCases ?? [])
    .map((c: any) => {
      const badge = c.legal_review_status ? ` [${esc(c.legal_review_status)}]` : "";
      return `<li style="margin:2px 0;">${fmtDate(c.created_at)} &ndash; <a href="${SITE}/admin/faelle/${c.id}">${esc(c.title ?? "(ohne Titel)")}</a>${badge}${c.status !== "published" ? ` <em>(${esc(c.status)})</em>` : ""}</li>`;
    })
    .join("\n");

  const feedbackRows = (newFeedback ?? [])
    .map((f: any) => {
      const snippet = (f.message ?? "").length > 120 ? `${f.message.slice(0, 120)}…` : (f.message ?? "");
      return `<li style="margin:2px 0;">${fmtDate(f.created_at)} &ndash; <strong>${esc(f.case_title ?? "Allgemein")}</strong> (${esc(f.report_type ?? "")}, ${esc(f.urgency ?? "")}): ${esc(snippet)}</li>`;
    })
    .join("\n");

  const creditLine =
    credit === "ok"
      ? `<span style="color:#15803d;">vorhanden</span>`
      : credit === "leer"
        ? `<span style="color:#b91c1c;"><strong>AUFGEBRAUCHT &ndash; Fallgenerierung steht!</strong></span> <a href="https://console.anthropic.com/settings/billing">Jetzt aufladen</a>`
        : `unbekannt (keine Prüfung möglich)`;

  const html = [
    `<h2 style="margin:0 0 4px 0;">RechtKompass &ndash; Wochenreport</h2>`,
    `<p style="margin:0 0 16px 0;color:#666;">Zeitraum: ${fmtDate(weekAgo)} bis ${fmtDate(new Date().toISOString())} &middot; automatisch erstellt</p>`,

    `<h3 style="margin:16px 0 4px 0;">Fallbestand (veröffentlicht)</h3>`,
    `<p style="margin:0;">${published} Fälle &ndash; <strong style="color:#15803d;">${gruen} grün</strong>, <strong style="color:#a16207;">${gelb} gelb</strong>, <strong style="color:#b91c1c;">${rot} rot</strong>${ungeprueft > 0 ? `, ${ungeprueft} ohne Prüfstatus` : ""}</p>`,

    `<h3 style="margin:16px 0 4px 0;">Neue Fälle (7 Tage): ${newCaseCount}</h3>`,
    caseRows ? `<ul style="margin:0;padding-left:20px;">${caseRows}</ul>` : `<p style="margin:0;color:#666;">Keine neuen Fälle.</p>`,
    newCaseCount > (newCases?.length ?? 0) ? `<p style="margin:4px 0 0 0;color:#666;">… und ${newCaseCount - (newCases?.length ?? 0)} weitere.</p>` : "",

    `<h3 style="margin:16px 0 4px 0;">Redaktion</h3>`,
    `<ul style="margin:0;padding-left:20px;">`,
    `<li>Offene Reviews: <strong>${pendingReviews}</strong> &ndash; <a href="${SITE}/admin/editorial/reviews">zur Review-Übersicht</a></li>`,
    `<li>Offene Problem-Meldungen: <strong>${openFeedback}</strong> &ndash; <a href="${SITE}/admin/fallmanager">zum Fallmanager</a></li>`,
    `</ul>`,
    feedbackRows ? `<p style="margin:8px 0 2px 0;">Neue Meldungen der Woche:</p><ul style="margin:0;padding-left:20px;">${feedbackRows}</ul>` : "",

    `<h3 style="margin:16px 0 4px 0;">Fallgenerierung (7 Tage)</h3>`,
    `<p style="margin:0;">${jobsOk} erfolgreich, ${jobsFailed} fehlgeschlagen</p>`,

    docsCreated !== null ? `<h3 style="margin:16px 0 4px 0;">Dokumente</h3><p style="margin:0;">${docsCreated === 1 ? "1 Dokument" : `${docsCreated} Dokumente`} in der Woche erstellt</p>` : "",

    `<h3 style="margin:16px 0 4px 0;">Anthropic-Guthaben</h3>`,
    `<p style="margin:0;">${creditLine}</p>`,

    `<h3 style="margin:16px 0 4px 0;">Zugriffszahlen</h3>`,
    `<p style="margin:0;">Cloudflare Web Analytics: <a href="https://dash.cloudflare.com/?to=/:account/web-analytics">zum Dashboard</a></p>`,

    `<p style="margin:24px 0 0 0;font-size:12px;color:#666;">Automatischer Wochenreport, montags 06:30 Uhr. Quelle: GitHub Actions &rarr; weekly-report.yml.</p>`,
  ]
    .filter(Boolean)
    .join("\n");

  const subject = `RechtKompass Wochenreport: ${published} Fälle (${gruen} grün) · ${pendingReviews} Reviews · ${openFeedback} Meldungen offen`;
  if (DRY_RUN) {
    const out = `${process.env.TMPDIR ?? "/tmp"}/wochenreport-dry-run.html`;
    await Bun.write(out, `<!doctype html><meta charset="utf-8"><title>${esc(subject)}</title>${html}`);
    console.log(`Dry-Run: Mail nicht versendet. Betreff: ${subject}`);
    console.log(`Vorschau: ${out}`);
    return;
  }
  const { sendEmail } = await import("../src/lib/mail/resend.server");
  await sendEmail({ to: NOTIFY_TO!, subject, html });
  console.log(`Wochenreport an ${NOTIFY_TO} versendet.`);
}

main().catch((err) => {
  console.error("Wochenreport fehlgeschlagen:", err instanceof Error ? err.message : err);
  process.exit(1);
});
