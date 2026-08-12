/**
 * Quellenwächter – EPIC 4.
 *
 * Analysiert die vorhandene Wissensbasis (legal_sources, legal_sections,
 * practice_cases) und leitet daraus einen Änderungsbericht ab.
 *
 * MVP-Grundsätze:
 *  - Keine Schemaänderungen, keine neuen Tabellen.
 *  - Keine automatische Übernahme – nur Vorschläge.
 *  - Letzter Prüfzeitpunkt & letzter Login liegen lokal (localStorage),
 *    damit das externe Supabase-Projekt unverändert bleibt.
 *
 * Architektur: das Modul arbeitet auf dem zentralen Wissensindex
 * ("Single Source of Truth"). Später kann die Erkennungslogik gegen
 * externe Quellen (BASS NRW, recht.nrw.de, EUR-Lex …) ausgetauscht
 * werden, ohne dass das UI angepasst werden muss.
 */

import { useMemo } from "react";
import { useKnowledgeIndex, type KnowledgeIndex } from "@/lib/knowledgeIndex";

// ---------------- LocalStorage helpers ----------------
const LS_LAST_CHECK = "rk.sourceWatcher.lastCheck";
const LS_LAST_LOGIN = "rk.sourceWatcher.lastLogin";
const LS_DISMISSED = "rk.sourceWatcher.dismissed"; // JSON: string[] change ids

function readTs(key: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function writeTs(key: string, ts: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(ts));
}
function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LS_DISMISSED);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}
function writeDismissed(set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_DISMISSED, JSON.stringify([...set]));
}

export function getLastCheck(): Date | null {
  const ts = readTs(LS_LAST_CHECK);
  return ts ? new Date(ts) : null;
}
export function markCheckedNow(): Date {
  const now = Date.now();
  writeTs(LS_LAST_CHECK, now);
  return new Date(now);
}
export function getLastLogin(): Date | null {
  const ts = readTs(LS_LAST_LOGIN);
  return ts ? new Date(ts) : null;
}
export function markLoginNow() {
  writeTs(LS_LAST_LOGIN, Date.now());
}
export function dismissChange(id: string) {
  const s = readDismissed();
  s.add(id);
  writeDismissed(s);
}
export function isDismissed(id: string) {
  return readDismissed().has(id);
}

// ---------------- Types ----------------
export type SourceStatus = "green" | "yellow" | "red";

export type WatchedSource = {
  id: string;
  name: string;
  shortName: string;
  scope: string | null;
  sectionCount: number;
  lastCheck: Date | null;
  status: SourceStatus; // aktuell / prüfen / aktualisieren
  reason: string;
};

export type ChangeKind =
  | "new-section"
  | "updated-section"
  | "stale-section"
  | "missing-source"
  | "new-source"
  | "orphan-section";

export type ChangeEntry = {
  id: string; // stable id (e.g. `updated:<sectionId>`)
  kind: ChangeKind;
  priority: "high" | "medium" | "low";
  sectionId?: string;
  sourceId?: string;
  title: string;
  before?: string; // "Alt"
  after?: string; // "Neu"
  diffSummary: string;
  reason: string;
  detectedAt: Date;
  impact: {
    cases: number;
    templates: number;
    faqs: number;
    checks: number;
  };
  affectedCases: { id: string; title: string }[];
  suggestion: string;
  to?: string;
  params?: Record<string, string>;
};

export type DailyDigest = {
  changesHigh: number;
  casesToRefresh: number;
  templatesToRefresh: number;
  cardsToReview: number;
  openAiSuggestions: number;
};

export type MonthlyDigest = {
  detectedChanges: number;
  updatedCases: number;
  newSections: number;
  newTemplates: number;
  freshnessPct: number;
};

export type SourceWatcherReport = {
  sources: WatchedSource[];
  changes: ChangeEntry[];
  sinceLastLogin: ChangeEntry[];
  daily: DailyDigest;
  monthly: MonthlyDigest;
  lastCheck: Date | null;
  lastLogin: Date | null;
};

// ---------------- Analyzer ----------------
const EIGHTEEN_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 18;
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
const SEVEN_DAYS_MS = 1000 * 60 * 60 * 24 * 7;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function priorityFor(impactCases: number, isPublishedTouch: boolean): ChangeEntry["priority"] {
  if (isPublishedTouch && impactCases > 0) return "high";
  if (impactCases >= 3) return "high";
  if (impactCases >= 1) return "medium";
  return "low";
}

function buildReport(
  index: KnowledgeIndex,
  raw: {
    cases: any[];
    sections: any[];
    sources: any[];
    templates: any[];
    links: any[];
  },
  lastCheck: Date | null,
  lastLogin: Date | null,
): SourceWatcherReport {
  const { sections, sources, cases } = raw;
  const now = Date.now();
  const dismissed = readDismissed();

  const sectionsBySource = new Map<string, any[]>();
  for (const s of sections) {
    const arr = sectionsBySource.get(s.source_id) ?? [];
    arr.push(s);
    sectionsBySource.set(s.source_id, arr);
  }
  const sourceById = new Map<string, any>(sources.map((s) => [s.id, s]));

  // ------- Sources overview -------
  const watchedSources: WatchedSource[] = sources.map((s) => {
    const secs = sectionsBySource.get(s.id) ?? [];
    const reviews = secs
      .map((sec) => toDate(sec.last_reviewed_at ?? sec.updated_at ?? sec.created_at))
      .filter((d): d is Date => !!d);
    const latest = reviews.reduce<Date | null>(
      (acc, d) => (!acc || d > acc ? d : acc),
      null,
    );
    const age = latest ? now - latest.getTime() : Infinity;
    let status: SourceStatus = "green";
    let reason = "Alle geprüften Abschnitte sind aktuell.";
    if (secs.length === 0) {
      status = "yellow";
      reason = "Quelle enthält noch keine Abschnitte.";
    } else if (age > EIGHTEEN_MONTHS_MS) {
      status = "red";
      reason = "Letzte Prüfung liegt länger als 18 Monate zurück.";
    } else if (age > THIRTY_DAYS_MS * 6) {
      status = "yellow";
      reason = "Prüfung empfohlen – letzte Aktualisierung > 6 Monate.";
    }
    return {
      id: s.id,
      name: s.name ?? s.title ?? "(unbenannt)",
      shortName: s.short_name ?? s.name ?? "",
      scope: s.scope ?? null,
      sectionCount: secs.length,
      lastCheck: latest,
      status,
      reason,
    };
  });

  // ------- Changes -------
  const changes: ChangeEntry[] = [];
  const sinceLastLogin: ChangeEntry[] = [];

  const impact = (sectionId: string) => index.impactForSection(sectionId);

  for (const sec of sections) {
    const created = toDate(sec.created_at);
    const updated = toDate(sec.updated_at ?? sec.last_reviewed_at ?? sec.created_at);
    const reviewed = toDate(sec.last_reviewed_at);
    const src = sourceById.get(sec.source_id);
    const label = `${(src?.short_name ?? src?.name ?? "").toString()} ${sec.section_number ?? sec.reference ?? ""}`.trim();
    const imp = impact(sec.id);
    const impactSummary = {
      cases: imp.cases.length,
      templates: imp.docs,
      faqs: imp.faqs,
      checks: imp.checks,
    };
    const publishedCases = imp.cases.filter((c: any) => c.status === "published").length;
    const affectedCases = imp.cases.slice(0, 12).map((c: any) => ({ id: c.id, title: c.title }));

    // (a) Neuer Abschnitt seit letzter Prüfung
    if (created && lastCheck && created > lastCheck) {
      const id = `new:${sec.id}`;
      if (!dismissed.has(id)) {
        const entry: ChangeEntry = {
          id,
          kind: "new-section",
          priority: priorityFor(impactSummary.cases, publishedCases > 0),
          sectionId: sec.id,
          sourceId: sec.source_id,
          title: `Neuer Abschnitt ${label}`,
          diffSummary: `+ Neuer Paragraph „${sec.title ?? sec.section_number ?? "ohne Titel"}" hinzugefügt.`,
          after: sec.summary ?? sec.full_text ?? "",
          reason: "Der Abschnitt wurde nach der letzten Quellenprüfung angelegt.",
          detectedAt: created,
          impact: impactSummary,
          affectedCases,
          suggestion:
            "Prüfen, ob passende Praxisfälle, FAQ oder Vorlagen mit diesem Abschnitt verknüpft werden sollten.",
          to: "/admin/rechtsgrundlagen/$id",
          params: { id: sec.id },
        };
        changes.push(entry);
      }
    }

    // (b) Geänderter Abschnitt (updated_at nach letztem Check)
    if (updated && lastCheck && created && updated > lastCheck && updated.getTime() !== created.getTime()) {
      const id = `updated:${sec.id}`;
      if (!dismissed.has(id)) {
        const entry: ChangeEntry = {
          id,
          kind: "updated-section",
          priority: priorityFor(impactSummary.cases, publishedCases > 0),
          sectionId: sec.id,
          sourceId: sec.source_id,
          title: `Änderung: ${label}`,
          before: sec.previous_version ?? "(vorherige Fassung nicht archiviert)",
          after: sec.summary ?? sec.full_text ?? "",
          diffSummary: `Fassung vom ${updated.toLocaleDateString("de-DE")} weicht von der letzten geprüften Version ab.`,
          reason: `Metadaten-Aktualisierung nach ${lastCheck.toLocaleDateString("de-DE")}.`,
          detectedAt: updated,
          impact: impactSummary,
          affectedCases,
          suggestion:
            "Verknüpfte Praxisfälle, Handlungsempfehlungen und Vorlagen auf inhaltliche Konsequenzen prüfen.",
          to: "/admin/rechtsgrundlagen/$id",
          params: { id: sec.id },
        };
        changes.push(entry);
      }
    }

    // (c) Prüfung überfällig
    if (reviewed && now - reviewed.getTime() > EIGHTEEN_MONTHS_MS) {
      const id = `stale:${sec.id}`;
      if (!dismissed.has(id)) {
        const entry: ChangeEntry = {
          id,
          kind: "stale-section",
          priority: impactSummary.cases > 0 ? "medium" : "low",
          sectionId: sec.id,
          sourceId: sec.source_id,
          title: `Prüfung überfällig: ${label}`,
          diffSummary: `Letzte fachliche Prüfung: ${reviewed.toLocaleDateString("de-DE")}.`,
          reason: "Prüfintervall > 18 Monate – Abgleich mit offizieller Quelle empfohlen.",
          detectedAt: reviewed,
          impact: impactSummary,
          affectedCases,
          suggestion: "Aktuelle Fassung mit der offiziellen Quelle abgleichen und Freigabe erneuern.",
          to: "/admin/rechtsgrundlagen/$id",
          params: { id: sec.id },
        };
        changes.push(entry);
      }
    }

    // (d) Verwaister Abschnitt (kein Praxisfall)
    if (impactSummary.cases === 0) {
      const id = `orphan:${sec.id}`;
      if (!dismissed.has(id)) {
        const entry: ChangeEntry = {
          id,
          kind: "orphan-section",
          priority: "low",
          sectionId: sec.id,
          sourceId: sec.source_id,
          title: `Ohne Verknüpfung: ${label}`,
          diffSummary: "Dieser Abschnitt ist noch keinem Praxisfall zugeordnet.",
          reason: "Keine ausgehende Verknüpfung im Wissensgraph.",
          detectedAt: updated ?? created ?? new Date(now),
          impact: impactSummary,
          affectedCases,
          suggestion: "Passenden Praxisfall verknüpfen oder Abschnitt archivieren.",
          to: "/admin/rechtsgrundlagen/$id",
          params: { id: sec.id },
        };
        changes.push(entry);
      }
    }
  }

  // Fehlende Quellen: Praxisfälle ohne jede Rechtsgrundlage
  const casesWithoutLinks = cases.filter(
    (c: any) =>
      !raw.links.some((l: any) => l.case_id === c.id) && c.status === "published",
  );
  if (casesWithoutLinks.length > 0) {
    const id = `missing-source:aggregate`;
    if (!dismissed.has(id)) {
      changes.push({
        id,
        kind: "missing-source",
        priority: "high",
        title: `${casesWithoutLinks.length} veröffentlichte Fälle ohne Rechtsgrundlage`,
        diffSummary: "Veröffentlichte Praxisfälle sollen mindestens eine Rechtsgrundlage nennen.",
        reason: "Nachweislücke im Quellenwächter.",
        detectedAt: new Date(now),
        impact: {
          cases: casesWithoutLinks.length,
          templates: 0,
          faqs: 0,
          checks: 0,
        },
        affectedCases: casesWithoutLinks
          .slice(0, 10)
          .map((c: any) => ({ id: c.id, title: c.title })),
        suggestion: "Für jeden Fall eine offizielle Rechtsgrundlage recherchieren und verknüpfen.",
        to: "/admin/qualitaet",
      });
    }
  }

  // Sort by priority + date
  const prioRank = { high: 0, medium: 1, low: 2 } as const;
  changes.sort((a, b) => {
    const p = prioRank[a.priority] - prioRank[b.priority];
    if (p !== 0) return p;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });

  // Since last login
  if (lastLogin) {
    for (const c of changes) {
      if (c.detectedAt > lastLogin) sinceLastLogin.push(c);
    }
  }

  // Digests
  const daily: DailyDigest = {
    changesHigh: changes.filter((c) => c.priority === "high").length,
    casesToRefresh: index.tasks.filter((t) => t.kind === "case-complete").length,
    templatesToRefresh: index.orphansByKind.template.length,
    cardsToReview: changes.filter((c) => c.kind === "stale-section").length,
    openAiSuggestions: index.tasks.filter((t) => t.priority !== "low").length,
  };

  const monthAgo = now - THIRTY_DAYS_MS;
  const detectedChanges = changes.filter((c) => c.detectedAt.getTime() > monthAgo).length;
  const updatedCases = cases.filter((c: any) => {
    const u = toDate(c.updated_at);
    return u && u.getTime() > monthAgo;
  }).length;
  const newSections = sections.filter((s: any) => {
    const d = toDate(s.created_at);
    return d && d.getTime() > monthAgo;
  }).length;
  const totalCases = cases.length || 1;
  const freshCases = cases.filter((c: any) => {
    const u = toDate(c.updated_at);
    return u && now - u.getTime() < EIGHTEEN_MONTHS_MS;
  }).length;
  const monthly: MonthlyDigest = {
    detectedChanges,
    updatedCases,
    newSections,
    newTemplates: 0,
    freshnessPct: Math.round((freshCases / totalCases) * 100),
  };

  return {
    sources: watchedSources,
    changes,
    sinceLastLogin,
    daily,
    monthly,
    lastCheck,
    lastLogin,
  };
}

// ---------------- Hook ----------------
export function useSourceWatcher(overrideLastCheck?: Date | null) {
  const ki = useKnowledgeIndex();
  const report = useMemo<SourceWatcherReport | null>(() => {
    if (!ki.index || !ki.data) return null;
    const lastCheck = overrideLastCheck !== undefined ? overrideLastCheck : getLastCheck();
    const lastLogin = getLastLogin();
    return buildReport(
      ki.index,
      {
        cases: ki.data.cases as any[],
        sections: ki.data.sections as any[],
        sources: ki.data.sources as any[],
        templates: ki.data.templates as any[],
        links: ki.data.links as any[],
      },
      lastCheck,
      lastLogin,
    );
  }, [ki.index, ki.data, overrideLastCheck]);
  return { ...ki, report };
}
