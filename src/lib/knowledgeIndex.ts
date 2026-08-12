/**
 * Zentraler Wissensindex ("Digitaler Zwilling").
 *
 * Verdichtet alle vorhandenen Beziehungen (Fälle, Rechtsgrundlagen, Vorlagen,
 * Schlagwörter, FAQ, Checklisten, Kategorien) zu einem einzigen Graphen.
 *
 * Alle Module (Cockpit, Editoren, Knowledge Graph) nutzen diesen Index.
 * Es werden keine Daten kopiert — jede Information bleibt an ihrem Ort und
 * wird nur verlinkt. "Create once – use everywhere."
 *
 * Keine Schemaänderungen, kein neues Feld: alles kommt aus den bestehenden
 * `coreBuilder`-Funktionen und der Fall-Metadaten (`meta.template_ids`,
 * `documentation[]`, `related_cases[]`, `faq[]`, `checklist[]`).
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  listCases,
  listSections,
  listSources,
  listTemplates,
  listKeywords,
  listCaseLegalLinks,
} from "@/lib/coreBuilder";
import { supabase } from "@/integrations/supabase/client";
import { listDocTemplates, type DocTemplate } from "@/lib/templatesRepo";
import { countBullets } from "@/lib/caseCompleteness";

// ---------------- Types ----------------
export type EntityKind =
  | "case"
  | "section"
  | "template"
  | "keyword"
  | "faq"
  | "checklist"
  | "category";

export type IndexNode = {
  id: string; // prefixed id "case:xxx", "section:xxx" …
  kind: EntityKind;
  refId: string; // pure id (or category name)
  label: string;
  meta?: string;
  editorTo?: string;
  editorParams?: Record<string, string>;
};

export type IndexEdge = {
  source: string;
  target: string;
  kind:
    | "case-section"
    | "case-template"
    | "case-keyword"
    | "case-faq"
    | "case-checklist"
    | "case-category"
    | "case-case";
};

export type Suggestion = {
  kind: "section" | "template" | "keyword" | "case";
  refId: string;
  label: string;
  score: number;
  reason: string;
};

export type CaseQuality = {
  id: string;
  title: string;
  pct: number;
  checks: { key: string; label: string; ok: boolean }[];
  missing: string[];
};

export type TrustIndex = {
  id: string;
  title: string;
  pct: number;
  positives: string[];
  negatives: string[];
};

export type DuplicatePair = {
  kind: "case" | "faq" | "template" | "keyword";
  aId: string;
  bId: string;
  aLabel: string;
  bLabel: string;
  score: number;
  reason: string;
  to?: string;
  aParams?: Record<string, string>;
  bParams?: Record<string, string>;
};

export type KnowledgeGap = {
  keywordId: string;
  keyword: string;
  usage: number;
  reason: string;
};

export type EditorialTask = {
  id: string;
  kind:
    | "case-complete"
    | "section-orphan"
    | "template-orphan"
    | "keyword-orphan"
    | "duplicate"
    | "gap";
  priority: "high" | "medium" | "low";
  title: string;
  hint: string;
  to?: string;
  params?: Record<string, string>;
  reason: string;
};

// ---------------- Loader ----------------
export function useKnowledgeIndex() {
  const q = useQuery({
    queryKey: ["knowledge-index"],
    queryFn: async () => {
      const [cases, sections, sources, templates, keywords, links, caseKws, docTemplates] =
        await Promise.all([
          listCases(),
          listSections(),
          listSources(),
          listTemplates(),
          listKeywords(),
          listCaseLegalLinks(),
          (async () => {
            const { data, error } = await supabase
              .from("case_keywords")
              .select("case_id, keyword_id");
            if (error) throw error;
            return (data ?? []) as Array<{ case_id: string; keyword_id: string }>;
          })(),
          listDocTemplates().catch(() => [] as DocTemplate[]),
        ]);
      return { cases, sections, sources, templates, keywords, links, caseKws, docTemplates };
    },
    staleTime: 60_000,
  });

  const index = useMemo(() => (q.data ? buildIndex(q.data) : null), [q.data]);
  return { ...q, index };
}

// ---------------- Builder ----------------
type Raw = Awaited<ReturnType<typeof loadForType>>;
async function loadForType() {
  // helper type marker
  return {
    cases: [] as any[],
    sections: [] as any[],
    sources: [] as any[],
    templates: [] as any[],
    keywords: [] as any[],
    links: [] as any[],
    caseKws: [] as Array<{ case_id: string; keyword_id: string }>,
    docTemplates: [] as DocTemplate[],
  };
}

export type KnowledgeIndex = ReturnType<typeof buildIndex>;

function buildIndex(raw: Raw) {
  const { cases, sections, sources, templates, keywords, links, caseKws, docTemplates } = raw;
  const nodes: IndexNode[] = [];
  const edges: IndexEdge[] = [];

  const sourceById = new Map(sources.map((s: any) => [s.id, s]));

  // Cases
  for (const c of cases) {
    nodes.push({
      id: `case:${c.id}`,
      kind: "case",
      refId: c.id,
      label: c.title ?? "(ohne Titel)",
      meta: c.category ?? undefined,
      editorTo: "/admin/faelle/$id",
      editorParams: { id: c.id },
    });
  }
  // Sections
  for (const s of sections as any[]) {
    const src = sourceById.get(s.source_id);
    nodes.push({
      id: `section:${s.id}`,
      kind: "section",
      refId: s.id,
      label: `${(src?.short_name ?? src?.name ?? "").toString()} ${s.section_number ?? ""}`.trim() ||
        (s.title ?? "Abschnitt"),
      meta: s.title ?? undefined,
      editorTo: "/admin/rechtsgrundlagen/$id",
      editorParams: { id: s.id },
    });
  }
  // Templates (from coreBuilder listTemplates)
  for (const t of templates as any[]) {
    nodes.push({
      id: `template:${t.id}`,
      kind: "template",
      refId: t.id,
      label: t.title ?? "(Vorlage)",
      editorTo: "/admin/vorlagen",
    });
  }
  // Keywords
  for (const k of keywords as any[]) {
    nodes.push({
      id: `keyword:${k.id}`,
      kind: "keyword",
      refId: k.id,
      label: k.keyword ?? "(Schlagwort)",
      editorTo: "/admin/schlagwoerter",
    });
  }
  // Categories (derived)
  const catSet = new Set<string>();
  for (const c of cases) {
    if (c.category) catSet.add(c.category);
  }
  for (const cat of catSet) {
    nodes.push({
      id: `category:${cat}`,
      kind: "category",
      refId: cat,
      label: cat,
      editorTo: "/admin/kategorien",
    });
  }

  // FAQ + Checklist aggregate nodes per case
  for (const c of cases) {
    const faqArr = Array.isArray(c.faq) ? c.faq : [];
    if (faqArr.length > 0) {
      const id = `faq:${c.id}`;
      nodes.push({
        id,
        kind: "faq",
        refId: c.id,
        label: `FAQ (${faqArr.length})`,
        meta: c.title,
        editorTo: "/admin/faelle/$id",
        editorParams: { id: c.id },
      });
      edges.push({ source: `case:${c.id}`, target: id, kind: "case-faq" });
    }
    const clArr = Array.isArray(c.checklist) ? c.checklist : [];
    if (clArr.length > 0) {
      const id = `checklist:${c.id}`;
      nodes.push({
        id,
        kind: "checklist",
        refId: c.id,
        label: `Checkliste (${clArr.length})`,
        meta: c.title,
        editorTo: "/admin/faelle/$id",
        editorParams: { id: c.id },
      });
      edges.push({ source: `case:${c.id}`, target: id, kind: "case-checklist" });
    }
    if (c.category) {
      edges.push({ source: `case:${c.id}`, target: `category:${c.category}`, kind: "case-category" });
    }
  }

  // Edges: legal links
  for (const l of links as any[]) {
    if (l.case_id && l.legal_section_id) {
      edges.push({
        source: `case:${l.case_id}`,
        target: `section:${l.legal_section_id}`,
        kind: "case-section",
      });
    }
  }
  // Edges: case ↔ keyword
  for (const ck of caseKws) {
    edges.push({
      source: `case:${ck.case_id}`,
      target: `keyword:${ck.keyword_id}`,
      kind: "case-keyword",
    });
  }
  // Edges: case ↔ template — normalize both paths
  // (a) via document_templates.caseIds (canonical)
  // (b) via case.meta.template_ids
  // (c) via case.documentation[] title match (legacy)
  const templateIdSet = new Set(templates.map((t: any) => t.id));
  const emit = (caseId: string, tid: string) => {
    if (!templateIdSet.has(tid)) return;
    edges.push({ source: `case:${caseId}`, target: `template:${tid}`, kind: "case-template" });
  };
  const seen = new Set<string>();
  for (const dt of docTemplates ?? []) {
    for (const cid of dt.meta?.caseIds ?? []) {
      const key = `${cid}|${dt.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      emit(cid, dt.id);
    }
  }
  const templateByTitle = new Map(
    templates.map((t: any) => [String(t.title ?? "").toLowerCase().trim(), t.id]),
  );
  for (const c of cases) {
    const metaTids: string[] = Array.isArray((c as any).meta?.template_ids)
      ? (c as any).meta.template_ids
      : [];
    for (const tid of metaTids) {
      const key = `${c.id}|${tid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      emit(c.id, tid);
    }
    const docs: string[] = Array.isArray(c.documentation) ? c.documentation : [];
    for (const d of docs) {
      const tid = templateByTitle.get(String(d ?? "").toLowerCase().trim());
      if (!tid) continue;
      const key = `${c.id}|${tid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      emit(c.id, tid);
    }
  }

  // Edges: related cases
  for (const c of cases) {
    const rel: string[] = Array.isArray((c as any).related_cases) ? (c as any).related_cases : [];
    for (const rid of rel) {
      if (typeof rid === "string" && rid && rid !== c.id) {
        edges.push({ source: `case:${c.id}`, target: `case:${rid}`, kind: "case-case" });
      }
    }
  }

  // Adjacency
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    (adj.get(e.source) ?? adj.set(e.source, new Set()).get(e.source)!).add(e.target);
    (adj.get(e.target) ?? adj.set(e.target, new Set()).get(e.target)!).add(e.source);
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ---- Selectors ----
  const neighbors = (id: string): IndexNode[] => {
    const set = adj.get(id);
    if (!set) return [];
    return [...set].map((x) => nodeById.get(x)).filter(Boolean) as IndexNode[];
  };
  const degree = (id: string) => adj.get(id)?.size ?? 0;

  // Orphans per kind
  const orphansByKind: Record<EntityKind, IndexNode[]> = {
    case: [],
    section: [],
    template: [],
    keyword: [],
    faq: [],
    checklist: [],
    category: [],
  };
  for (const n of nodes) {
    if (degree(n.id) === 0) orphansByKind[n.kind].push(n);
  }

  // Quality per case (10 Kriterien laut EPIC 2)
  const kwCountByCase = new Map<string, number>();
  for (const ck of caseKws) kwCountByCase.set(ck.case_id, (kwCountByCase.get(ck.case_id) ?? 0) + 1);
  const linkCountByCase = new Map<string, number>();
  for (const l of links as any[])
    linkCountByCase.set(l.case_id, (linkCountByCase.get(l.case_id) ?? 0) + 1);
  const templateCountByCase = new Map<string, number>();
  for (const [key] of seen) {
    const cid = key.split("|")[0];
    templateCountByCase.set(cid, (templateCountByCase.get(cid) ?? 0) + 1);
  }

  const qualityByCase = new Map<string, CaseQuality>();
  for (const c of cases) {
    const tipCount = countBullets((c as any).practice_tip);
    const mistakes: string[] = Array.isArray((c as any).common_mistakes)
      ? (c as any).common_mistakes.filter((x: any) => String(x ?? "").trim())
      : String((c as any).common_mistakes ?? "")
          .split(/\n+/)
          .map((s: string) => s.trim())
          .filter(Boolean);
    const faqArr = Array.isArray((c as any).faq) ? (c as any).faq : [];
    const clArr = Array.isArray((c as any).checklist)
      ? (c as any).checklist.filter((x: any) => String(x ?? "").trim())
      : [];
    const rel: string[] = Array.isArray((c as any).related_cases) ? (c as any).related_cases : [];
    const checks = [
      { key: "recommendation", label: "Handlungsempfehlung", ok: !!String((c as any).recommendation ?? "").trim() },
      { key: "dos", label: "Do's (mind. 5)", ok: tipCount >= 5 },
      { key: "donts", label: "Don'ts (Typische Fehler)", ok: mistakes.length > 0 },
      {
        key: "legal_explanation",
        label: "Rechtliche Erläuterung",
        ok: !!String((c as any).legal_explanation ?? "").trim(),
      },
      { key: "sections", label: "Rechtsgrundlagen", ok: (linkCountByCase.get(c.id) ?? 0) > 0 },
      { key: "templates", label: "Dokumentvorlagen", ok: (templateCountByCase.get(c.id) ?? 0) > 0 },
      { key: "faq", label: "FAQ", ok: faqArr.length > 0 },
      { key: "checklist", label: "Checkliste", ok: clArr.length > 0 },
      { key: "keywords", label: "Schlagwörter", ok: (kwCountByCase.get(c.id) ?? 0) > 0 },
      { key: "related", label: "Ähnliche Praxisfälle", ok: rel.length > 0 },
    ];
    const done = checks.filter((x) => x.ok).length;
    qualityByCase.set(c.id, {
      id: c.id,
      title: c.title ?? "(ohne Titel)",
      pct: Math.round((done / checks.length) * 100),
      checks,
      missing: checks.filter((x) => !x.ok).map((x) => x.label),
    });
  }

  // ---- Impact: welche Inhalte hängen an X? ----
  function impactForSection(sectionId: string) {
    const caseIds = new Set<string>();
    for (const l of links as any[]) {
      if (l.legal_section_id === sectionId) caseIds.add(l.case_id);
    }
    const affectedCases = cases.filter((c: any) => caseIds.has(c.id));
    let docs = 0;
    let faqs = 0;
    let checks = 0;
    for (const c of affectedCases as any[]) {
      docs += templateCountByCase.get(c.id) ?? 0;
      faqs += Array.isArray(c.faq) ? c.faq.length : 0;
      checks += Array.isArray(c.checklist) ? c.checklist.length : 0;
    }
    return { cases: affectedCases, docs, faqs, checks };
  }
  function impactForTemplate(templateId: string) {
    const affected: any[] = [];
    for (const c of cases as any[]) {
      const key = `${c.id}|${templateId}`;
      if (seen.has(key)) affected.push(c);
    }
    return { cases: affected };
  }
  function impactForKeyword(keywordId: string) {
    const caseIds = new Set<string>();
    for (const ck of caseKws) if (ck.keyword_id === keywordId) caseIds.add(ck.case_id);
    return { cases: cases.filter((c: any) => caseIds.has(c.id)) };
  }

  // ---- Suggestions für einen Fall ----
  function suggestionsForCase(caseId: string): Suggestion[] {
    const target = cases.find((c: any) => c.id === caseId);
    if (!target) return [];

    // Vergleichs-Signale des Zielfalls
    const targetKw = new Set<string>();
    for (const ck of caseKws) if (ck.case_id === caseId) targetKw.add(ck.keyword_id);
    const targetSections = new Set<string>();
    for (const l of links as any[])
      if (l.case_id === caseId) targetSections.add(l.legal_section_id);
    const targetTemplates = new Set<string>();
    for (const k of seen) {
      const [cid, tid] = k.split("|");
      if (cid === caseId) targetTemplates.add(tid);
    }
    const cat = (target as any).category ?? "";

    // Ähnlichkeitsscore fremder Fälle
    const otherScores = new Map<string, number>();
    for (const other of cases as any[]) {
      if (other.id === caseId) continue;
      let s = 0;
      if (other.category && other.category === cat) s += 2;
      const otherKw = new Set<string>();
      for (const ck of caseKws) if (ck.case_id === other.id) otherKw.add(ck.keyword_id);
      for (const k of otherKw) if (targetKw.has(k)) s += 1;
      if (s > 0) otherScores.set(other.id, s);
    }

    const suggestions: Suggestion[] = [];

    // Rechtsgrundlagen empfehlen (aus ähnlichen Fällen, noch nicht verknüpft)
    if (targetSections.size < 2) {
      const scoreBySection = new Map<string, number>();
      for (const l of links as any[]) {
        const w = otherScores.get(l.case_id) ?? 0;
        if (w === 0) continue;
        if (targetSections.has(l.legal_section_id)) continue;
        scoreBySection.set(
          l.legal_section_id,
          (scoreBySection.get(l.legal_section_id) ?? 0) + w,
        );
      }
      [...scoreBySection.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .forEach(([sid, sc]) => {
          const n = nodeById.get(`section:${sid}`);
          if (!n) return;
          suggestions.push({
            kind: "section",
            refId: sid,
            label: n.label,
            score: sc,
            reason: "Wird in ähnlichen Praxisfällen häufig verwendet.",
          });
        });
    }

    // Vorlagen empfehlen
    if (targetTemplates.size === 0) {
      const scoreByTpl = new Map<string, number>();
      for (const k of seen) {
        const [cid, tid] = k.split("|");
        const w = otherScores.get(cid) ?? 0;
        if (w === 0) continue;
        if (targetTemplates.has(tid)) continue;
        scoreByTpl.set(tid, (scoreByTpl.get(tid) ?? 0) + w);
      }
      [...scoreByTpl.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .forEach(([tid, sc]) => {
          const n = nodeById.get(`template:${tid}`);
          if (!n) return;
          suggestions.push({
            kind: "template",
            refId: tid,
            label: n.label,
            score: sc,
            reason: "Wird in ähnlichen Praxisfällen dokumentiert.",
          });
        });
    }

    // Schlagwörter empfehlen
    const scoreByKw = new Map<string, number>();
    for (const ck of caseKws) {
      const w = otherScores.get(ck.case_id) ?? 0;
      if (w === 0) continue;
      if (targetKw.has(ck.keyword_id)) continue;
      scoreByKw.set(ck.keyword_id, (scoreByKw.get(ck.keyword_id) ?? 0) + w);
    }
    [...scoreByKw.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([kid, sc]) => {
        const n = nodeById.get(`keyword:${kid}`);
        if (!n) return;
        suggestions.push({
          kind: "keyword",
          refId: kid,
          label: n.label,
          score: sc,
          reason: "Häufig bei ähnlichen Fällen.",
        });
      });

    // Ähnliche Fälle empfehlen (Top 3, noch nicht verlinkt)
    const already = new Set<string>(
      Array.isArray((target as any).related_cases) ? (target as any).related_cases : [],
    );
    [...otherScores.entries()]
      .filter(([id]) => !already.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([cid, sc]) => {
        const n = nodeById.get(`case:${cid}`);
        if (!n) return;
        suggestions.push({
          kind: "case",
          refId: cid,
          label: n.label,
          score: sc,
          reason: "Teilt Kategorie und Schlagwörter.",
        });
      });

    return suggestions;
  }

  // ---- Vertrauensindex ----
  const trustByCase = new Map<string, TrustIndex>();
  for (const c of cases as any[]) {
    const secN = linkCountByCase.get(c.id) ?? 0;
    const tplN = templateCountByCase.get(c.id) ?? 0;
    const faqN = Array.isArray(c.faq) ? c.faq.length : 0;
    const clN = Array.isArray(c.checklist)
      ? c.checklist.filter((x: any) => String(x ?? "").trim()).length
      : 0;
    const doN = countBullets(c.practice_tip) >= 5 ? 1 : 0;
    const dontN = Array.isArray(c.common_mistakes)
      ? c.common_mistakes.filter((x: any) => String(x ?? "").trim()).length
      : String(c.common_mistakes ?? "").trim()
        ? 1
        : 0;
    const legalN = String(c.legal_explanation ?? "").trim() ? 1 : 0;
    const status = String(c.status ?? "");
    const relN = Array.isArray(c.related_cases) ? c.related_cases.length : 0;

    let pct = 0;
    const pos: string[] = [];
    const neg: string[] = [];

    // Rechtsgrundlagen (max 25)
    const secScore = secN >= 3 ? 25 : secN === 2 ? 20 : secN === 1 ? 12 : 0;
    pct += secScore;
    if (secN >= 3) pos.push(`✓ ${secN} Rechtsgrundlagen verknüpft`);
    else if (secN >= 1) pos.push(`✓ ${secN} Rechtsgrundlage${secN > 1 ? "n" : ""} verknüpft`);
    else neg.push("⚠ keine Rechtsgrundlage");

    // Vorlagen (15)
    if (tplN > 0) {
      pct += 15;
      pos.push(`✓ ${tplN} Dokumentvorlage${tplN > 1 ? "n" : ""}`);
    } else neg.push("⚠ keine Dokumentvorlage");

    // FAQ (10)
    if (faqN > 0) {
      pct += 10;
      pos.push(`✓ FAQ vorhanden (${faqN})`);
    } else neg.push("⚠ keine FAQ");

    // Checkliste (10)
    if (clN > 0) {
      pct += 10;
      pos.push("✓ Checkliste vorhanden");
    } else neg.push("⚠ keine Checkliste");

    // Do's / Don'ts (je 5)
    if (doN) {
      pct += 5;
      pos.push("✓ mind. 5 konkrete Do's");
    } else neg.push("⚠ weniger als 5 konkrete Do's");
    if (dontN) {
      pct += 5;
      pos.push("✓ Don'ts vorhanden");
    } else neg.push("⚠ keine Don'ts");

    // Rechtliche Erläuterung (10)
    if (legalN) {
      pct += 10;
      pos.push("✓ Rechtliche Erläuterung vorhanden");
    } else neg.push("⚠ keine rechtliche Erläuterung");

    // Freigabestatus (15)
    if (status === "published") {
      pct += 15;
      pos.push("✓ fachlich freigegeben (veröffentlicht)");
    } else if (status === "reviewed" || status === "review") {
      pct += 8;
      pos.push("✓ fachlich geprüft");
    } else neg.push("⚠ keine fachliche Freigabe");

    // Verknüpfung zu ähnlichen Fällen (5)
    if (relN > 0) {
      pct += 5;
      pos.push(`✓ ${relN} ähnliche Praxisfälle verknüpft`);
    }

    pct = Math.max(0, Math.min(100, pct));
    trustByCase.set(c.id, {
      id: c.id,
      title: c.title ?? "(ohne Titel)",
      pct,
      positives: pos,
      negatives: neg,
    });
  }

  // ---- Duplikate ----
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const trigrams = (s: string) => {
    const t = ` ${norm(s)} `;
    const out = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
    return out;
  };
  const jaccard = (a: Set<string>, b: Set<string>) => {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
  };

  const duplicates: DuplicatePair[] = [];

  // Fälle
  const caseTri = cases.map((c: any) => ({ c, tri: trigrams(c.title ?? "") }));
  const kwByCase = new Map<string, Set<string>>();
  for (const ck of caseKws) {
    if (!kwByCase.has(ck.case_id)) kwByCase.set(ck.case_id, new Set());
    kwByCase.get(ck.case_id)!.add(ck.keyword_id);
  }
  for (let i = 0; i < caseTri.length; i++) {
    for (let j = i + 1; j < caseTri.length; j++) {
      const a = caseTri[i];
      const b = caseTri[j];
      const sim = jaccard(a.tri, b.tri);
      const kwA = kwByCase.get(a.c.id) ?? new Set();
      const kwB = kwByCase.get(b.c.id) ?? new Set();
      let sharedKw = 0;
      for (const k of kwA) if (kwB.has(k)) sharedKw++;
      const sameCat = a.c.category && a.c.category === b.c.category;
      const score = sim + (sameCat ? 0.15 : 0) + Math.min(sharedKw, 3) * 0.1;
      if (score >= 0.55) {
        duplicates.push({
          kind: "case",
          aId: a.c.id,
          bId: b.c.id,
          aLabel: a.c.title ?? "(ohne Titel)",
          bLabel: b.c.title ?? "(ohne Titel)",
          score,
          reason: `Titel-Ähnlichkeit ${(sim * 100).toFixed(0)}%${
            sameCat ? ", gleiche Kategorie" : ""
          }${sharedKw > 0 ? `, ${sharedKw} gemeinsame Schlagwörter` : ""}.`,
          to: "/admin/faelle/$id",
          aParams: { id: a.c.id },
          bParams: { id: b.c.id },
        });
      }
    }
  }

  // Vorlagen
  const tplList = templates as any[];
  const tplTri = tplList.map((t) => ({ t, tri: trigrams(t.title ?? "") }));
  for (let i = 0; i < tplTri.length; i++) {
    for (let j = i + 1; j < tplTri.length; j++) {
      const sim = jaccard(tplTri[i].tri, tplTri[j].tri);
      if (sim >= 0.6) {
        duplicates.push({
          kind: "template",
          aId: tplTri[i].t.id,
          bId: tplTri[j].t.id,
          aLabel: tplTri[i].t.title ?? "(Vorlage)",
          bLabel: tplTri[j].t.title ?? "(Vorlage)",
          score: sim,
          reason: `Titel-Ähnlichkeit ${(sim * 100).toFixed(0)}%.`,
          to: "/admin/vorlagen",
        });
      }
    }
  }

  // Schlagwörter
  const kwList = keywords as any[];
  const kwTri = kwList.map((k) => ({ k, tri: trigrams(k.keyword ?? "") }));
  for (let i = 0; i < kwTri.length; i++) {
    for (let j = i + 1; j < kwTri.length; j++) {
      const sim = jaccard(kwTri[i].tri, kwTri[j].tri);
      if (sim >= 0.7 || norm(kwTri[i].k.keyword ?? "") === norm(kwTri[j].k.keyword ?? "")) {
        duplicates.push({
          kind: "keyword",
          aId: kwTri[i].k.id,
          bId: kwTri[j].k.id,
          aLabel: kwTri[i].k.keyword ?? "",
          bLabel: kwTri[j].k.keyword ?? "",
          score: Math.max(sim, 0.7),
          reason: "Nahezu identische Schreibweise.",
          to: "/admin/schlagwoerter",
        });
      }
    }
  }

  // FAQ: alle FAQ-Fragen über alle Fälle vergleichen
  type FaqRec = { caseId: string; caseTitle: string; q: string; tri: Set<string> };
  const faqRecs: FaqRec[] = [];
  for (const c of cases as any[]) {
    const arr = Array.isArray(c.faq) ? c.faq : [];
    for (const item of arr) {
      const q = typeof item === "string" ? item : (item?.question ?? item?.q ?? "");
      const s = String(q ?? "").trim();
      if (!s) continue;
      faqRecs.push({ caseId: c.id, caseTitle: c.title ?? "", q: s, tri: trigrams(s) });
    }
  }
  for (let i = 0; i < faqRecs.length; i++) {
    for (let j = i + 1; j < faqRecs.length; j++) {
      if (faqRecs[i].caseId === faqRecs[j].caseId) continue;
      const sim = jaccard(faqRecs[i].tri, faqRecs[j].tri);
      if (sim >= 0.7) {
        duplicates.push({
          kind: "faq",
          aId: faqRecs[i].caseId,
          bId: faqRecs[j].caseId,
          aLabel: `${faqRecs[i].q} — ${faqRecs[i].caseTitle}`,
          bLabel: `${faqRecs[j].q} — ${faqRecs[j].caseTitle}`,
          score: sim,
          reason: `Fast identische FAQ-Frage (${(sim * 100).toFixed(0)}% Ähnlichkeit).`,
          to: "/admin/faelle/$id",
          aParams: { id: faqRecs[i].caseId },
          bParams: { id: faqRecs[j].caseId },
        });
      }
    }
  }
  duplicates.sort((a, b) => b.score - a.score);

  // ---- Wissenslücken ----
  const gaps: KnowledgeGap[] = [];
  const usageByKeyword = new Map<string, number>();
  for (const ck of caseKws) usageByKeyword.set(ck.keyword_id, (usageByKeyword.get(ck.keyword_id) ?? 0) + 1);
  for (const k of kwList) {
    const usage = usageByKeyword.get(k.id) ?? 0;
    if (usage < 3) continue;
    const kwNorm = norm(k.keyword ?? "");
    const hasDedicated = cases.some((c: any) =>
      norm(c.title ?? "").includes(kwNorm) && (c.status === "published" || c.status === "reviewed"),
    );
    if (!hasDedicated) {
      gaps.push({
        keywordId: k.id,
        keyword: k.keyword,
        usage,
        reason: `Schlagwort wird in ${usage} Praxisfällen genutzt, aber keine eigene Wissenskarte vorhanden.`,
      });
    }
  }
  gaps.sort((a, b) => b.usage - a.usage);

  // ---- Redaktionelle Aufgaben ----
  const tasks: EditorialTask[] = [];
  // Fälle mit vielen Lücken
  for (const q of qualityByCase.values()) {
    const missing = q.missing.length;
    if (missing >= 3) {
      tasks.push({
        id: `task:case:${q.id}`,
        kind: "case-complete",
        priority: missing >= 6 ? "high" : missing >= 4 ? "medium" : "low",
        title: `Praxisfall vervollständigen: ${q.title}`,
        hint: `${missing} Bausteine fehlen: ${q.missing.slice(0, 3).join(", ")}${
          missing > 3 ? " …" : ""
        }`,
        to: "/admin/faelle/$id",
        params: { id: q.id },
        reason: `10-Punkte-Qualitätsprüfung: ${q.pct}% erreicht.`,
      });
    }
  }
  // Verwaiste Rechtsgrundlagen
  for (const n of orphansByKind.section) {
    tasks.push({
      id: `task:sec:${n.refId}`,
      kind: "section-orphan",
      priority: "medium",
      title: `Rechtsgrundlage prüfen: ${n.label}`,
      hint: "Keinem Praxisfall zugeordnet.",
      to: n.editorTo,
      params: n.editorParams,
      reason: "Verwaister Knoten im Knowledge Graph.",
    });
  }
  // Verwaiste Vorlagen
  for (const n of orphansByKind.template) {
    tasks.push({
      id: `task:tpl:${n.refId}`,
      kind: "template-orphan",
      priority: "medium",
      title: `Vorlage zuordnen: ${n.label}`,
      hint: "Diese Dokumentvorlage wird in keinem Fall verwendet.",
      to: n.editorTo,
      params: n.editorParams,
      reason: "Verwaister Knoten im Knowledge Graph.",
    });
  }
  // Verwaiste Schlagwörter
  for (const n of orphansByKind.keyword) {
    tasks.push({
      id: `task:kw:${n.refId}`,
      kind: "keyword-orphan",
      priority: "low",
      title: `Schlagwort prüfen: ${n.label}`,
      hint: "Schlagwort ist keinem Fall zugeordnet.",
      to: n.editorTo,
      params: n.editorParams,
      reason: "Verwaister Knoten im Knowledge Graph.",
    });
  }
  // Duplikate
  for (const d of duplicates.slice(0, 20)) {
    tasks.push({
      id: `task:dup:${d.kind}:${d.aId}:${d.bId}`,
      kind: "duplicate",
      priority: d.score >= 0.8 ? "high" : "medium",
      title: `Ähnliche Inhalte prüfen (${d.kind === "case" ? "Praxisfälle" : d.kind === "faq" ? "FAQ" : d.kind === "template" ? "Vorlagen" : "Schlagwörter"})`,
      hint: `${d.aLabel}  ↔  ${d.bLabel}`,
      to: d.to,
      params: d.aParams,
      reason: d.reason,
    });
  }
  // Wissenslücken
  for (const g of gaps) {
    tasks.push({
      id: `task:gap:${g.keywordId}`,
      kind: "gap",
      priority: g.usage >= 6 ? "high" : "medium",
      title: `Neue Wissenskarte erstellen: „${g.keyword}"`,
      hint: `In ${g.usage} Fällen verwendet, jedoch keine eigenständige Wissenskarte.`,
      to: "/admin/faelle/$id",
      params: { id: "neu" },
      reason: g.reason,
    });
  }
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // ---- Gesamtqualität ----
  const qualityValues = [...qualityByCase.values()];
  const trustValues = [...trustByCase.values()];
  const overall = {
    avgQuality:
      qualityValues.length === 0
        ? 0
        : Math.round(qualityValues.reduce((a, b) => a + b.pct, 0) / qualityValues.length),
    avgTrust:
      trustValues.length === 0
        ? 0
        : Math.round(trustValues.reduce((a, b) => a + b.pct, 0) / trustValues.length),
    completeCases: qualityValues.filter((q) => q.pct >= 90).length,
    incompleteCases: qualityValues.filter((q) => q.pct < 90).length,
    openTasks: tasks.length,
    duplicateCount: duplicates.length,
    gapCount: gaps.length,
  };

  return {
    nodes,
    edges,
    nodeById,
    neighbors,
    degree,
    orphansByKind,
    qualityByCase,
    trustByCase,
    duplicates,
    gaps,
    tasks,
    overall,
    impactForSection,
    impactForTemplate,
    impactForKeyword,
    suggestionsForCase,
    // raw
    cases,
    sections,
    sources,
    templates,
    keywords,
    links,
    caseKws,
  };
}
