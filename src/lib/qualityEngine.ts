/**
 * Zentrale, deterministische Quality Engine für Praxisfälle.
 *
 * WICHTIG (Grundsatz):
 *  - Die KI darf ihren eigenen Score NICHT bestimmen.
 *  - Der Score wird ausschließlich aus tatsächlich in der Datenbank gespeicherten
 *    Daten und überprüfbaren Kriterien berechnet.
 *  - Hard Blocker sind vom Score getrennt. Ein Fall ist erst veröffentlichungsreif,
 *    wenn Score >= 90 UND keine Hard Blocker vorliegen.
 *
 * Punkteschema (100 Punkte gesamt):
 *   A. Inhaltliche Vollständigkeit (30)
 *   B. Rechtliche Fundierung       (30)
 *   C. Vernetzung                  (20)
 *   D. Redaktionelle Qualität      (20)
 *
 * Wiederverwendet in: KI-Fallmaschine, Prüfliste, Batch-Veröffentlichung,
 * Core Builder Qualitätsübersicht.
 */

import { supabase } from "@/integrations/supabase/client";
import { countBullets } from "@/lib/caseCompleteness";

export type CaseEvalInput = {
  id: string;
  title?: string | null;
  category?: string | null;
  subcategory?: string | null;
  short_description?: string | null;
  short_answer?: string | null;
  immediate_actions?: string | null;
  recommendation?: string | null;
  legal_explanation?: string | null;
  responsibilities?: string | null;
  practice_tip?: string | null;
  checklist?: string[] | null;
  documentation?: string[] | null;
  common_mistakes?: string[] | null;
  faq?: unknown;
  status?: string | null;
};

export type CaseEvalContext = {
  /** IDs der case_legal_links, die auf tatsächlich existierende legal_sections zeigen. */
  validLegalSectionIds: string[];
  /** IDs, die in case_legal_links stehen, aber KEINE existierende legal_section haben. */
  invalidLegalSectionIds: string[];
  keywordCount: number;
  templateCount: number;
  /** Anzahl ähnlicher Fälle >= 0. -1 = noch nicht geprüft. */
  similarChecked: boolean;
  /** Höchste Ähnlichkeit zu einem bestehenden Fall (0..1). */
  strongestSimilarity: number;
  /** Wissenskarten-Abdeckung (Anteil zugeordneter Rechtsgrundlagen mit Wissenskarte, 0..1). */
  knowledgeCardCoverage: number;
  /** IDs zugeordneter legal_sections, die § 53 SchulG NRW referenzieren. */
  assignedSchulG53Ids?: string[];
  /** Ob der Fallkontext fachliche Signale für § 53 (Ordnungsmaßnahme etc.) enthält. */
  schulG53HasContextSignals?: boolean;
  /** Ob schwache/ambivalente §-53-Signale vorliegen (Grenzfall → redaktionelle Prüfung). */
  schulG53AmbiguousSignals?: boolean;
  /** IDs zugeordneter legal_sections OHNE zugehörige Wissenskarte. */
  missingKnowledgeCardIds?: string[];
};

export type EvalReason = {
  key: string;
  message: string;
  points: number;
  category: "A" | "B" | "C" | "D";
  fixable: boolean;
  /** Auf welches Feld zielt die Nachbesserung? */
  fixField?: "practice_tip" | "faq" | "checklist" | "documentation" | "common_mistakes" | "legal_explanation" | "responsibilities" | "short_description" | "recommendation" | "immediate_actions" | "matching:legal" | "matching:keywords" | "matching:templates" | "matching:similar" | "matching:legal_remove_53";
};

export type EvalResult = {
  caseId: string;
  score: number;
  sub: { inhalt: number; recht: number; vernetzung: number; redaktion: number };
  hardBlockers: string[];
  warnings: string[];
  reasons: EvalReason[];
  publicationReady: boolean;
  counts: {
    doCount: number;
    dontCount: number;
    legalCount: number;
    keywordCount: number;
    templateCount: number;
    checklistCount: number;
    faqCount: number;
  };
};

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function len(v: unknown): number {
  return s(v).length;
}
function faqCount(v: unknown): number {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object").length;
  return 0;
}

export type SchulG53ContextAnalysis = {
  hasStrongSignals: boolean;
  hasAmbiguousSignals: boolean;
  strongSignals: string[];
  ambiguousSignals: string[];
};

const SCHULG53_STRONG_PATTERNS: Array<[string, RegExp]> = [
  ["Fehlverhalten", /fehlverhalt/i],
  ["Pflichtverletzung", /pflichtverletz/i],
  ["Regelverstoß", /regelversto(?:ß|ss)|regelverstoß|regelverstoss/i],
  ["Unterrichtsstörung", /unterrichtsst(?:ö|oe)rung|st(?:ö|oe)rung des unterrichts/i],
  ["Ordnungsmaßnahme", /ordnungsma(?:ß|ss)|ordnungsmass/i],
  ["Disziplinarmaßnahme", /disziplin/i],
  ["Verweis", /\bverweis\b|schriftlicher verweis/i],
  ["Ausschluss", /ausschluss vom unterricht|schulausschluss|schulverweis/i],
  ["Erzieherische Einwirkung", /erzieherisch(?:e|en)? einwirk|erzieherische ma(?:ß|ss)nahme/i],
  ["Verhältnismäßigkeit", /verh(?:ä|ae)ltnism(?:ä|ae)(?:ß|ss)ig|verh(?:ä|ae)ltnismass/i],
];

const SCHULG53_AMBIGUOUS_PATTERNS: Array<[string, RegExp]> = [
  ["Konflikt", /\bkonflikt(?:e|s)?\b/i],
  ["Streit", /\bstreit\b|streitigkeit/i],
  ["Aggression", /aggressi/i],
  ["Beleidigung", /beleidig/i],
  ["Gewalt/Drohung", /gewalt|drohung/i],
  ["Mobbing", /mobbing/i],
  ["Übergriff", /(?:ü|ue)bergriff/i],
];

const SCHULG53_AMBIGUITY_ANCHOR =
  /sch(?:ü|ue)ler(?:in|innen)?|klasse|unterricht|aufsicht|lehrkraft|pädagogisch|paedagogisch|sanktion|konsequenz|maßnahme|massnahme|deeskalation/i;

export function buildSchulG53ContextText(c: CaseEvalInput): string {
  return [
    c.title,
    c.short_description,
    c.short_answer,
    c.immediate_actions,
    c.recommendation,
    c.responsibilities,
    c.practice_tip,
    c.category,
    c.subcategory,
    ...(c.checklist ?? []),
    ...(c.common_mistakes ?? []),
  ]
    .map((v) => (typeof v === "string" ? v : ""))
    .join(" ");
}

export function analyzeSchulG53Context(text: string): SchulG53ContextAnalysis {
  const strongSignals = SCHULG53_STRONG_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
  const ambiguousSignals = SCHULG53_AMBIGUOUS_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);

  const hasStrongSignals = strongSignals.length > 0;
  const hasAmbiguousSignals =
    !hasStrongSignals && ambiguousSignals.length > 0 && SCHULG53_AMBIGUITY_ANCHOR.test(text);

  return {
    hasStrongSignals,
    hasAmbiguousSignals,
    strongSignals,
    ambiguousSignals: hasAmbiguousSignals ? ambiguousSignals : [],
  };
}

/**
 * Deterministische, rein datenbasierte Bewertung.
 * Diese Funktion ist pur – keine Netzwerkzugriffe, kein Zufall.
 */
export function evaluateCase(c: CaseEvalInput, ctx: CaseEvalContext): EvalResult {
  const reasons: EvalReason[] = [];
  const hardBlockers: string[] = [];
  const warnings: string[] = [];

  const doCount = countBullets(c.practice_tip);
  const dontCount = (c.common_mistakes ?? []).filter((x) => s(x)).length;
  const checklistCount = (c.checklist ?? []).filter((x) => s(x)).length;
  const docCount = (c.documentation ?? []).filter((x) => s(x)).length;
  const faqC = faqCount(c.faq);
  const legalCount = ctx.validLegalSectionIds.length;

  // ── A. Inhaltliche Vollständigkeit (30) ──
  let A = 0;
  const addA = (ok: boolean, pts: number, key: string, msg: string, fixField?: EvalReason["fixField"]) => {
    if (ok) A += pts;
    else reasons.push({ key, message: msg, points: pts, category: "A", fixable: !!fixField, fixField });
  };
  addA(!!s(c.title), 2, "title", "Titel fehlt");
  addA(!!s(c.category), 2, "category", "Kategorie fehlt");
  addA(!!s(c.subcategory), 2, "subcategory", "Unterkategorie/Prozess fehlt");
  addA(!!s(c.short_description), 2, "short_description", "Kurzbeschreibung fehlt", "short_description");
  addA(len(c.short_description) >= 120 || len(c.short_answer) >= 120 || len(c.immediate_actions) >= 120, 4, "sachverhalt", "Ausführlicher Sachverhalt fehlt", "short_description");
  addA(!!s(c.immediate_actions), 3, "immediate_actions", "Sofortentscheidung fehlt", "immediate_actions");
  addA(!!s(c.recommendation), 4, "recommendation", "Handlungsempfehlung fehlt", "recommendation");
  addA(doCount >= 5, 4, "dos", `Mindestens 5 Do's erforderlich (aktuell ${doCount})`, "practice_tip");
  addA(dontCount >= 2, 3, "donts", "Don'ts fehlen (mindestens 2)", "common_mistakes");
  addA(checklistCount >= 3, 2, "checklist", "Checkliste zu kurz (mindestens 3)", "checklist");
  addA(faqC >= 3, 1, "faq", "FAQ fehlt (mindestens 3)", "faq");
  addA(!!s(c.responsibilities), 1, "responsibilities", "Zuständigkeiten fehlen", "responsibilities");

  // ── B. Rechtliche Fundierung (30) ──
  let B = 0;
  const addB = (ok: boolean, pts: number, key: string, msg: string, fixField?: EvalReason["fixField"]) => {
    if (ok) B += pts;
    else reasons.push({ key, message: msg, points: pts, category: "B", fixable: !!fixField, fixField });
  };
  addB(legalCount >= 1, 10, "legal_any", "Keine belastbare Rechtsgrundlage zugeordnet", "matching:legal");
  addB(ctx.invalidLegalSectionIds.length === 0, 5, "legal_valid", `Zuordnung enthält nicht existierende Rechtsgrundlage(n)`);
  addB(ctx.invalidLegalSectionIds.length === 0, 5, "legal_invented", "Erfundene Rechtsgrundlage erkannt");
  addB(len(c.legal_explanation) >= 200, 4, "legal_explanation", "Rechtliche Erläuterung zu kurz", "legal_explanation");
  addB(legalCount === 0 || ctx.knowledgeCardCoverage >= 0.5, 3, "knowledge_cards", "Wissenskarten zu Rechtsgrundlagen fehlen");
  addB(true, 3, "no_contradiction", "Do's/Don'ts widersprechen Rechtsgrundlagen"); // heuristisch: bestanden, sofern kein manueller Widerspruchs-Flag

  // ── B'. Zusätzliche Rechts-Qualitätssignale (keine Punkte, aber Tasks). ──
  // Ziel: mindestens drei belastbare Rechtsgrundlagen. KEINE künstliche Auffüllung.
  if (legalCount === 1) {
    reasons.push({
      key: "legal_only_one_source",
      message: "Nur eine belastbare Rechtsgrundlage zugeordnet – erneute Rechtsprüfung erforderlich.",
      points: 0,
      category: "B",
      fixable: true,
      fixField: "matching:legal",
    });
  } else if (legalCount === 2) {
    reasons.push({
      key: "legal_only_two_sources",
      message: "Weniger als drei belastbare Rechtsgrundlagen ermittelt – bitte weitere passende Normen prüfen.",
      points: 0,
      category: "B",
      fixable: true,
      fixField: "matching:legal",
    });
  }
  // § 53 SchulG NRW ohne fachliche Kontextsignale:
  //  - Ambivalente Signale vorhanden → redaktionelle Prüfung (nicht auto).
  //  - Keine Signale und keine Ambivalenz → eindeutig unpassend → automatisch entfernbar.
  const assigned53 = ctx.assignedSchulG53Ids ?? [];
  if (assigned53.length > 0 && ctx.schulG53HasContextSignals === false) {
    if (ctx.schulG53AmbiguousSignals === true) {
      reasons.push({
        key: "legal_53_review_required",
        message: "§ 53 SchulG NRW wurde zugeordnet. Fachliche Relevanz ist unklar (ambivalente Signale) – redaktionelle Prüfung erforderlich.",
        points: 0,
        category: "B",
        fixable: false,
      });
    } else {
      reasons.push({
        key: "legal_53_irrelevant",
        message: "§ 53 SchulG NRW wurde zugeordnet, obwohl der Fall keine Signale für Fehlverhalten / Ordnungsmaßnahme / Verhältnismäßigkeit enthält. Verknüpfung entfernen und Rechtsgrundlagen erneut ermitteln.",
        points: 0,
        category: "B",
        fixable: true,
        fixField: "matching:legal_remove_53",
      });
    }
  }
  // Fehlende Wissenskarten je zugeordneter Rechtsgrundlage.
  const missingCards = ctx.missingKnowledgeCardIds ?? [];
  if (missingCards.length > 0) {
    reasons.push({
      key: "legal_no_knowledge_card",
      message: `Für ${missingCards.length} zugeordnete Rechtsgrundlage(n) fehlt eine Wissenskarte.`,
      points: 0,
      category: "B",
      fixable: false,
    });
  }

  // ── C. Vernetzung (20) ──
  let C = 0;
  const addC = (ok: boolean, pts: number, key: string, msg: string, fixField?: EvalReason["fixField"]) => {
    if (ok) C += pts;
    else reasons.push({ key, message: msg, points: pts, category: "C", fixable: !!fixField, fixField });
  };
  addC(ctx.keywordCount >= 3, 5, "keywords", "Schlagwörter fehlen (mindestens 3)", "matching:keywords");
  addC(ctx.templateCount >= 1, 5, "templates", "Keine Dokumentvorlage zugeordnet", "matching:templates");
  addC(ctx.similarChecked, 3, "similar_checked", "Ähnliche Fälle wurden nicht geprüft", "matching:similar");
  addC(!!s(c.category), 3, "category_ok", "Kategorie nicht korrekt zugeordnet");
  addC(legalCount > 0 || ctx.keywordCount > 0 || ctx.templateCount > 0, 4, "persisted", "Zuordnungen nicht dauerhaft gespeichert");

  // ── D. Redaktionelle Qualität (20) ──
  let D = 0;
  const emptyText = !s(c.title) || !s(c.short_description) || !s(c.recommendation);
  const dosArr = String(c.practice_tip ?? "").split(/\r?\n+/).map((l) => l.replace(/^\s*([-*•–—]|\d+[.)])\s+/, "").trim()).filter(Boolean);
  const dosUnique = new Set(dosArr.map((x) => x.toLowerCase())).size;
  const hasDuplicates = dosArr.length > 0 && dosUnique < dosArr.length;
  const strongDuplicate = ctx.strongestSimilarity >= 0.85;

  const addD = (ok: boolean, pts: number, key: string, msg: string, fixField?: EvalReason["fixField"]) => {
    if (ok) D += pts;
    else reasons.push({ key, message: msg, points: pts, category: "D", fixable: !!fixField, fixField });
  };
  addD(!emptyText, 3, "no_empty", "Kritische Felder leer");
  addD(!hasDuplicates, 3, "no_textdup", "Textdubletten in Do's erkannt", "practice_tip");
  addD(dosUnique >= 5, 4, "dos_unique", "Weniger als 5 unterschiedliche Do's", "practice_tip");
  addD(true, 4, "no_contradictions", "Offensichtliche Widersprüche");
  addD(!strongDuplicate, 4, "no_warnings", "Kritische Qualitätswarnung: mögliche Dublette");
  addD(!strongDuplicate, 2, "no_case_dup", "Starke Dublette eines vorhandenen Praxisfalls");

  // ── Hard Blocker (unabhängig vom Score) ──
  if (doCount < 5) hardBlockers.push(`Weniger als 5 Do's (${doCount})`);
  if (legalCount < 1) hardBlockers.push("Keine belastbare Rechtsgrundlage");
  if (ctx.invalidLegalSectionIds.length > 0) hardBlockers.push("Nicht existierende Rechtsgrundlage zugeordnet");
  if (strongDuplicate) hardBlockers.push(`Starke Falldublette (Ähnlichkeit ${(ctx.strongestSimilarity * 100).toFixed(0)}%)`);
  if (!ctx.similarChecked) hardBlockers.push("Vernetzung/Similaritätsprüfung nicht abgeschlossen");

  if (legalCount > 0 && ctx.knowledgeCardCoverage < 0.5) warnings.push("Wissenskarten-Abdeckung < 50 %");
  if (legalCount === 1) warnings.push("Nur eine belastbare Rechtsgrundlage – Ziel: mindestens 3.");
  if (legalCount === 2) warnings.push("Nur zwei belastbare Rechtsgrundlagen – Ziel: mindestens 3.");
  if ((ctx.assignedSchulG53Ids ?? []).length > 0 && ctx.schulG53HasContextSignals === false) {
    warnings.push("§ 53 SchulG NRW zugeordnet, aber keine fachlichen Kontextsignale – Prüfung erforderlich.");
  }
  if ((ctx.missingKnowledgeCardIds ?? []).length > 0) {
    warnings.push(`${(ctx.missingKnowledgeCardIds ?? []).length} Wissenskarten fehlen.`);
  }
  if (ctx.strongestSimilarity >= 0.65 && ctx.strongestSimilarity < 0.85) warnings.push(`Mögliche Ähnlichkeit ${(ctx.strongestSimilarity * 100).toFixed(0)}% zu vorhandenem Fall`);

  const score = Math.max(0, Math.min(100, A + B + C + D));
  const publicationReady =
    score >= 90 &&
    hardBlockers.length === 0 &&
    doCount >= 5 &&
    legalCount >= 1;

  return {
    caseId: c.id,
    score,
    sub: { inhalt: A, recht: B, vernetzung: C, redaktion: D },
    hardBlockers,
    warnings,
    reasons,
    publicationReady,
    counts: {
      doCount,
      dontCount,
      legalCount,
      keywordCount: ctx.keywordCount,
      templateCount: ctx.templateCount,
      checklistCount,
      faqCount: faqC,
    },
  };
}

/**
 * Lädt einen Praxisfall inkl. Verknüpfungen und wertet ihn deterministisch aus.
 * Wird sowohl vor der Anzeige als auch unmittelbar vor der Batch-Veröffentlichung
 * genutzt (Race-Condition-Schutz gegen veraltete Frontend-Scores).
 */
export async function loadCaseForEvaluation(caseId: string): Promise<EvalResult> {
  const [caseRes, linksRes, kwRes, tplRes] = await Promise.all([
    supabase.from("practice_cases").select("*").eq("id", caseId).limit(1),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("case_legal_links") as any).select("legal_section_id").eq("case_id", caseId),
    supabase.from("case_keywords").select("keyword_id").eq("case_id", caseId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("case_templates" as any) as any).select("template_id").eq("case_id", caseId),
  ]);
  if (caseRes.error) throw caseRes.error;
  const row = (caseRes.data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Praxisfall ${caseId} nicht gefunden`);

  const requestedIds = ((linksRes.data ?? []) as Array<{ legal_section_id: string }>).map((r) => r.legal_section_id).filter(Boolean);
  let validIds: string[] = [];
  let sectionRows: Array<{ id: string; section_number: string | null; source_id: string | null; practice_relevance: string | null }> = [];
  if (requestedIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secRes = await (supabase.from("legal_sections") as any)
      .select("id, section_number, source_id, practice_relevance")
      .in("id", requestedIds);
    sectionRows = (secRes.data ?? []) as typeof sectionRows;
    validIds = sectionRows.map((r) => r.id);
  }
  const invalidIds = requestedIds.filter((id) => !validIds.includes(id));
  const keywordCount = (kwRes.data ?? []).length;
  const templateCount = (tplRes.data ?? []).length;

  // § 53 SchulG NRW erkennen: source_short via legal_sources auflösen und Sektionsnummer prüfen.
  let assignedSchulG53Ids: string[] = [];
  if (sectionRows.length > 0) {
    const sourceIds = Array.from(new Set(sectionRows.map((r) => r.source_id).filter((x): x is string => !!x)));
    let schulgSourceIds = new Set<string>();
    if (sourceIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const srcRes = await (supabase.from("legal_sources") as any)
        .select("id, short_name, name")
        .in("id", sourceIds);
      const rows = (srcRes.data ?? []) as Array<{ id: string; short_name: string | null; name: string | null }>;
      schulgSourceIds = new Set(
        rows
          .filter((r) => /schulg|schulgesetz/i.test(`${r.short_name ?? ""} ${r.name ?? ""}`))
          .map((r) => r.id),
      );
    }
    assignedSchulG53Ids = sectionRows
      .filter((r) => r.source_id && schulgSourceIds.has(r.source_id))
      .filter((r) => {
        const n = (r.section_number ?? "").toLowerCase().replace(/\s+/g, "");
        return n === "53" || n === "§53" || n === "n53";
      })
      .map((r) => r.id);
  }

  // Wissenskarten-Abdeckung: legal_sections mit angereicherten Feldern gelten als
  // vorhandene Wissenskarte (siehe zentrale Definition in caseMatching/qualityFixManager).
  const knowledgeIds = new Set(
    sectionRows
      .filter((r) => !!r.practice_relevance)
      .map((r) => r.id),
  );
  const missingKnowledgeCardIds = validIds.filter((id) => !knowledgeIds.has(id));
  const knowledgeCardCoverage = validIds.length === 0 ? 1 : knowledgeIds.size / validIds.length;

  const c: CaseEvalInput = {
    id: caseId,
    title: (row.title as string) ?? null,
    category: (row.category as string) ?? null,
    subcategory: (row.subcategory as string) ?? null,
    short_description: (row.short_description as string) ?? null,
    short_answer: (row.short_answer as string) ?? null,
    immediate_actions: (row.immediate_actions as string) ?? null,
    recommendation: (row.recommendation as string) ?? null,
    legal_explanation: (row.legal_explanation as string) ?? null,
    responsibilities: (row.responsibilities as string) ?? null,
    practice_tip: (row.practice_tip as string) ?? null,
    checklist: (row.checklist as string[]) ?? null,
    documentation: (row.documentation as string[]) ?? null,
    common_mistakes: (row.common_mistakes as string[]) ?? null,
    faq: row.faq,
    status: (row.status as string) ?? null,
  };

  // §-53-Kontextsignal-Check aus tatsächlichen Fallinhalten (nicht aus KI-Antwort
  // und nicht aus der rechtlichen Erläuterung, weil diese falsche §53-Zuordnungen
  // selbst legitimieren kann).
  const schulG53Context = analyzeSchulG53Context(buildSchulG53ContextText(c));
  const schulG53HasContextSignals = schulG53Context.hasStrongSignals;
  const schulG53AmbiguousSignals = schulG53Context.hasAmbiguousSignals;

  return evaluateCase(c, {
    validLegalSectionIds: validIds,
    invalidLegalSectionIds: invalidIds,
    keywordCount,
    templateCount,
    similarChecked: true,
    strongestSimilarity: 0,
    knowledgeCardCoverage,
    assignedSchulG53Ids,
    schulG53HasContextSignals,
    schulG53AmbiguousSignals,
    missingKnowledgeCardIds,
  });
}

/**
 * Kompakte Statuslabel für die UI.
 */
export function statusLabel(r: EvalResult): { label: string; tone: "gruen" | "gelb" | "rot" } {
  if (r.hardBlockers.length > 0) return { label: "🔴 Kritische Prüfung erforderlich", tone: "rot" };
  if (r.publicationReady) return { label: "🟢 Veröffentlichungsreif", tone: "gruen" };
  return { label: "🟡 Nachbesserung erforderlich", tone: "gelb" };
}

// ─────────────────────────────────────────────────────────────
// Quality Tasks – deterministisch aus EvalResult abgeleitet.
// KI wird NICHT beteiligt an Auswahl oder Score.
// ─────────────────────────────────────────────────────────────

export type QualityTaskCategory = "INHALT" | "RECHT" | "VERNETZUNG" | "REDAKTION" | "TECHNIK";
export type QualityTaskSeverity = "info" | "warn" | "error" | "critical";
export type QualityTaskFixType =
  | "ai_content"
  | "legal_matching"
  | "legal_remove_irrelevant_53"
  | "keyword_matching"
  | "template_matching"
  | "similarity_matching"
  | "manual";

export type AiContentField =
  | "practice_tip"
  | "faq"
  | "checklist"
  | "documentation"
  | "common_mistakes"
  | "legal_explanation"
  | "short_description"
  | "recommendation"
  | "immediate_actions"
  | "responsibilities";

export type QualityTask = {
  caseId: string;
  code: string;
  category: QualityTaskCategory;
  severity: QualityTaskSeverity;
  title: string;
  description: string;
  fixable: boolean;
  fixType: QualityTaskFixType;
  affectedField?: AiContentField;
  currentPoints: number;
  expectedImpact: number;
};

const CAT_MAP: Record<"A" | "B" | "C" | "D", QualityTaskCategory> = {
  A: "INHALT",
  B: "RECHT",
  C: "VERNETZUNG",
  D: "REDAKTION",
};

const TITLES: Record<string, string> = {
  title: "Titel ergänzen",
  category: "Kategorie festlegen",
  subcategory: "Unterkategorie festlegen",
  short_description: "Kurzbeschreibung ergänzen",
  sachverhalt: "Sachverhalt ausführlicher beschreiben",
  immediate_actions: "Sofortentscheidung ergänzen",
  recommendation: "Handlungsempfehlung ergänzen",
  dos: "Do's ergänzen",
  donts: "Don'ts ergänzen",
  checklist: "Checkliste verlängern",
  faq: "FAQ ergänzen",
  responsibilities: "Zuständigkeiten ergänzen",
  legal_any: "Rechtsgrundlage ermitteln",
  legal_valid: "Ungültige Rechtsgrundlage entfernen",
  legal_invented: "Erfundene Rechtsgrundlage entfernen",
  legal_explanation: "Rechtliche Erläuterung ausbauen",
  knowledge_cards: "Wissenskarten zuordnen",
  no_contradiction: "Widerspruch zwischen Inhalt und Recht prüfen",
  keywords: "Schlagwörter zuordnen",
  templates: "Dokumentvorlagen zuordnen",
  similar_checked: "Ähnliche Fälle prüfen",
  category_ok: "Kategoriezuordnung prüfen",
  persisted: "Zuordnungen persistent speichern",
  no_empty: "Kritische Felder befüllen",
  no_textdup: "Textdubletten in Do's beheben",
  dos_unique: "Do's variantenreicher formulieren",
  no_contradictions: "Widersprüche prüfen",
  no_warnings: "Mögliche Dublette redaktionell prüfen",
  no_case_dup: "Falldublette klären",
  legal_only_one_source: "Nur 1 Rechtsgrundlage – weitere ermitteln",
  legal_only_two_sources: "Nur 2 Rechtsgrundlagen – dritte ergänzen",
  legal_53_review_required: "§ 53 SchulG NRW: fachliche Relevanz prüfen",
  legal_53_irrelevant: "Unpassenden § 53 SchulG NRW entfernen",
  legal_no_knowledge_card: "Wissenskarte(n) für Rechtsgrundlage(n) fehlen",
};

function fixTypeFor(reason: EvalReason): { fixType: QualityTaskFixType; affectedField?: AiContentField; fixable: boolean } {
  const ff = reason.fixField;
  if (!ff) return { fixType: "manual", fixable: false };
  if (ff === "matching:legal") return { fixType: "legal_matching", fixable: true };
  if (ff === "matching:legal_remove_53") return { fixType: "legal_remove_irrelevant_53", fixable: true };
  if (ff === "matching:keywords") return { fixType: "keyword_matching", fixable: true };
  if (ff === "matching:templates") return { fixType: "template_matching", fixable: true };
  if (ff === "matching:similar") return { fixType: "similarity_matching", fixable: true };
  return { fixType: "ai_content", affectedField: ff as AiContentField, fixable: true };
}

function severityFor(cat: QualityTaskCategory, reason: EvalReason): QualityTaskSeverity {
  if (reason.key === "legal_any" || reason.key === "legal_invented" || reason.key === "legal_valid") return "critical";
  if (reason.key === "dos" || reason.key === "no_case_dup") return "critical";
  if (reason.key === "legal_53_irrelevant") return "error";
  if (reason.key === "legal_53_review_required") return "warn";
  if (reason.key === "legal_only_one_source") return "error";
  if (reason.key === "legal_only_two_sources") return "warn";
  if (reason.key === "legal_no_knowledge_card") return "warn";
  if (cat === "INHALT" || cat === "RECHT") return "error";
  if (cat === "REDAKTION") return "warn";
  return "warn";
}

/**
 * Wandelt einen EvalResult in eine deterministische Aufgabenliste um.
 * Es werden ausschließlich Aufgaben aus vorhandenen EvalReasons + HardBlockers erzeugt.
 * KI wird nicht befragt.
 */
export function deriveQualityTasks(evalRes: EvalResult): QualityTask[] {
  const tasks: QualityTask[] = [];
  for (const r of evalRes.reasons) {
    const reason =
      r.key === "legal_53_review_required" && /keine\s+signale\s+f(?:ü|ue)r\s+fehlverhalten/i.test(r.message)
        ? {
            ...r,
            key: "legal_53_irrelevant",
            fixable: true,
            fixField: "matching:legal_remove_53" as const,
            message:
              "§ 53 SchulG NRW wurde zugeordnet, obwohl der Fall keine Signale für Fehlverhalten / Ordnungsmaßnahme / Verhältnismäßigkeit enthält. Verknüpfung entfernen und Rechtsgrundlagen erneut ermitteln.",
          }
        : r;
    const cat = CAT_MAP[reason.category];
    const { fixType, affectedField, fixable } = fixTypeFor(reason);
    tasks.push({
      caseId: evalRes.caseId,
      code: reason.key.toUpperCase(),
      category: cat,
      severity: severityFor(cat, reason),
      title: TITLES[reason.key] ?? reason.message,
      description: reason.message,
      fixable,
      fixType,
      affectedField,
      currentPoints: reason.points,
      expectedImpact: reason.points,
    });
  }
  // Hard Blocker, die nicht bereits über reasons abgedeckt sind, ergänzen.
  for (const hb of evalRes.hardBlockers) {
    if (!tasks.some((t) => hb.toLowerCase().includes(t.code.toLowerCase().replace(/_/g, " ")))) {
      tasks.push({
        caseId: evalRes.caseId,
        code: "HARD_BLOCKER",
        category: "TECHNIK",
        severity: "critical",
        title: "Hard Blocker beheben",
        description: hb,
        fixable: false,
        fixType: "manual",
        currentPoints: 0,
        expectedImpact: 0,
      });
    }
  }
  return tasks;
}

