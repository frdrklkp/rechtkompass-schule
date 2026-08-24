// Alle Quality-Regeln – nur Felder, die im aktuellen Schema eindeutig
// interpretierbar sind. Keine Simulation. Reihenfolge = Anzeigereihenfolge.

import type { CaseQualityInput, QualityRule } from "./types";
import { AGING_THRESHOLDS, agingLevelFor } from "./scoring";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

function hasMinItems(v: unknown, min: number): boolean {
  return Array.isArray(v) && v.length >= min;
}

function isNonEmptyObjectOrArray(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return false;
}

const caseEditPath = (id: string) => `/admin/faelle/${id}`;
const detailPath = (id: string) => `/admin/editorial/faelle/${id}`;

// -------- CONTENT --------
export const CONTENT_RULES: QualityRule[] = [
  {
    id: "content.title",
    category: "content",
    severity: "blocker",
    maxScore: 6,
    title: "Titel vorhanden",
    description:
      "Der Fall besitzt einen aussagekräftigen Titel (mindestens 5 Zeichen).",
    remediation:
      "Öffnen Sie den Fall-Editor und tragen Sie einen eindeutigen Titel ein.",
    relatedField: "title",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed:
        isNonEmptyString(i.case.title) && i.case.title.trim().length >= 5,
    }),
  },
  {
    id: "content.short_description",
    category: "content",
    severity: "blocker",
    maxScore: 5,
    title: "Kurzbeschreibung vorhanden",
    description: "Kurzbeschreibung des Sachverhalts ist gepflegt.",
    remediation: "Pflegen Sie eine prägnante Kurzbeschreibung im Fall-Editor.",
    relatedField: "short_description",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed: isNonEmptyString(i.case.short_description as string | null),
    }),
  },
  {
    id: "content.short_description.length",
    category: "content",
    severity: "info",
    maxScore: 0,
    title: "Kurzbeschreibung ausreichend lang",
    description:
      "Eine Kurzbeschreibung mit mindestens 80 Zeichen ist redaktionell empfohlen.",
    remediation:
      "Ergänzen Sie die Kurzbeschreibung um mindestens 1–2 Sätze Kontext.",
    relatedField: "short_description",
    relatedRoute: caseEditPath,
    evaluate: (i) => {
      const s = (i.case.short_description as string | null) ?? "";
      return { passed: s.trim().length >= 80 };
    },
  },
  {
    id: "content.recommendation",
    category: "content",
    severity: "blocker",
    maxScore: 6,
    title: "Handlungsempfehlung vorhanden",
    description: "Der Fall enthält eine zentrale Handlungsempfehlung.",
    remediation: "Ergänzen Sie eine klare Handlungsempfehlung.",
    relatedField: "recommendation",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed: isNonEmptyString(i.case.recommendation as string | null),
    }),
  },
  {
    id: "content.legal_explanation",
    category: "content",
    severity: "warning",
    maxScore: 4,
    title: "Rechtliche Einordnung vorhanden",
    description: "Eine rechtliche Einordnung erhöht die redaktionelle Qualität.",
    remediation: "Ergänzen Sie eine kurze rechtliche Einordnung.",
    relatedField: "legal_explanation",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed: isNonEmptyString(i.case.legal_explanation as string | null),
    }),
  },
  {
    id: "content.immediate_actions",
    category: "content",
    severity: "warning",
    maxScore: 3,
    title: "Sofortmaßnahmen vorhanden",
    description: "Sofortmaßnahmen sind für Lehrkräfte handlungsleitend.",
    remediation: "Pflegen Sie mindestens einen Sofortmaßnahmen-Text.",
    relatedField: "immediate_actions",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed: isNonEmptyString(i.case.immediate_actions as string | null),
    }),
  },
  {
    id: "content.responsibilities",
    category: "content",
    severity: "warning",
    maxScore: 3,
    title: "Zuständigkeiten vorhanden",
    description: "Klare Zuständigkeiten helfen bei der Umsetzung.",
    remediation: "Ergänzen Sie Zuständigkeiten im Fall-Editor.",
    relatedField: "responsibilities",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed: isNonEmptyString(i.case.responsibilities as string | null),
    }),
  },
  {
    id: "content.practice_tip",
    category: "content",
    severity: "warning",
    maxScore: 2,
    title: "Praxistipp vorhanden",
    description: "Ein Praxistipp erhöht den redaktionellen Mehrwert.",
    remediation: "Ergänzen Sie einen kurzen Praxistipp.",
    relatedField: "practice_tip",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed: isNonEmptyString(i.case.practice_tip as string | null),
    }),
  },
  {
    id: "content.checklist",
    category: "content",
    severity: "warning",
    maxScore: 3,
    title: "Checkliste vorhanden",
    description: "Mindestens ein Checklistenpunkt sollte vorhanden sein.",
    remediation: "Ergänzen Sie Checklistenpunkte.",
    relatedField: "checklist",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({ passed: isNonEmptyArray(i.case.checklist) }),
  },
  {
    id: "content.documentation",
    category: "documentation",
    severity: "warning",
    maxScore: 3,
    title: "Dokumentationshinweise vorhanden",
    description: "Dokumentationshinweise unterstützen die Beweissicherung.",
    remediation: "Ergänzen Sie mindestens einen Dokumentationshinweis.",
    relatedField: "documentation",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({ passed: isNonEmptyArray(i.case.documentation) }),
  },
  {
    id: "content.common_mistakes",
    category: "content",
    severity: "blocker",
    maxScore: 2,
    title: "Don'ts als Liste vorhanden",
    description: "Mindestens 2 separate Don'ts-Einträge erforderlich - sonst vermutlich zu einem String zusammengequetscht statt als Liste gepflegt.",
    remediation: "Don'ts als mehrere eigenständige Einträge pflegen (nicht als ein zusammenhängender Text).",
    relatedField: "common_mistakes",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({ passed: hasMinItems(i.case.common_mistakes, 2) }),
  },
  {
    id: "content.faq",
    category: "content",
    severity: "warning",
    maxScore: 2,
    title: "FAQ vorhanden",
    description: "Häufige Fragen und Antworten unterstützen Lehrkräfte.",
    remediation: "Pflegen Sie mindestens einen FAQ-Eintrag.",
    relatedField: "faq",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({ passed: isNonEmptyObjectOrArray(i.case.faq) }),
  },
  {
    id: "content.decision_tree",
    category: "content",
    severity: "warning",
    maxScore: 1,
    title: "Entscheidungsbaum vorhanden",
    description:
      "Ein kuratierter Entscheidungsbaum verbessert die Nutzerführung.",
    remediation:
      "Pflegen Sie einen kuratierten Entscheidungsbaum im Fall-Editor.",
    relatedField: "decision_tree",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed: isNonEmptyObjectOrArray(i.case.decision_tree),
    }),
  },
];

// -------- LEGAL --------
export const LEGAL_RULES: QualityRule[] = [
  {
    id: "legal.min_one_source",
    category: "legal",
    severity: "blocker",
    maxScore: 15,
    title: "Mindestens eine Rechtsgrundlage verknüpft",
    description:
      "Ein Fall ohne verknüpfte Rechtsgrundlage darf nicht veröffentlicht werden.",
    remediation:
      "Verknüpfen Sie im Fall-Editor mindestens eine Rechtsgrundlage.",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({ passed: i.legalLinkCount >= 1 }),
  },
  {
    id: "legal.three_sources",
    category: "legal",
    severity: "warning",
    maxScore: 5,
    title: "Mindestens drei Rechtsgrundlagen",
    description:
      "Drei oder mehr Rechtsgrundlagen erhöhen die redaktionelle Belastbarkeit.",
    remediation: "Ergänzen Sie zusätzliche Rechtsgrundlagen.",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({ passed: i.legalLinkCount >= 3 }),
  },
  {
    id: "legal.no_open_flags",
    category: "legal",
    severity: "blocker",
    maxScore: 3,
    title: "Keine offenen Legal-Review-Flags",
    description:
      "Solange offene Rechts-Review-Hinweise bestehen, darf der Fall nicht veröffentlicht werden.",
    remediation: "Lösen Sie offene Legal-Flags auf.",
    evaluate: (i) => ({
      passed: (i.legalFlags?.filter((f) => !f.resolved_at).length ?? 0) === 0,
    }),
  },
  {
    id: "legal.no_update_required",
    category: "legal",
    severity: "blocker",
    maxScore: 2,
    title: "Kein Rechts-Update erforderlich",
    description:
      "Der Fall ist nicht mit `legal_update_required = true` markiert.",
    remediation:
      "Prüfen Sie die Rechtsgrundlagen und heben Sie das Flag nach Aktualisierung auf.",
    evaluate: (i) => ({
      passed: !(i.case as { legal_update_required?: boolean })
        .legal_update_required,
    }),
  },
];

// -------- REVIEW --------
export const REVIEW_RULES: QualityRule[] = [
  {
    id: "review.approved_exists",
    category: "review",
    severity: "blocker",
    maxScore: 10,
    title: "Genehmigtes Review vorhanden",
    description:
      "Mindestens ein Review wurde mit Ergebnis 'genehmigt' abgeschlossen.",
    remediation: "Reichen Sie den Fall zur Prüfung ein und lassen Sie ihn genehmigen.",
    relatedRoute: detailPath,
    evaluate: (i) => ({
      passed: i.reviews.some((r) => r.status === "approved"),
    }),
  },
  {
    id: "review.no_open",
    category: "review",
    severity: "blocker",
    maxScore: 4,
    title: "Kein offenes Review",
    description:
      "Solange ein Review offen ist, darf der Fall nicht veröffentlicht werden.",
    remediation: "Schließen Sie das offene Review mit einer Entscheidung ab.",
    relatedRoute: detailPath,
    evaluate: (i) => ({
      passed: !i.reviews.some((r) => r.status === "pending"),
    }),
  },
];

// -------- WORKFLOW --------
export const WORKFLOW_RULES: QualityRule[] = [
  {
    id: "workflow.current_version",
    category: "workflow",
    severity: "blocker",
    maxScore: 3,
    title: "Aktuelle Version gesetzt",
    description: "Der Fall besitzt eine current_version_id.",
    remediation:
      "Erzeugen Sie durch eine erneute Einreichung eine Version, oder wenden Sie sich an die Administration.",
    evaluate: (i) => ({
      passed: !!(i.case as { current_version_id?: string | null })
        .current_version_id,
    }),
  },
  {
    id: "workflow.state_ready",
    category: "workflow",
    severity: "blocker",
    maxScore: 3,
    title: "Status ist 'approved' oder 'published'",
    description:
      "Nur genehmigte oder bereits veröffentlichte Fälle sind veröffentlichungsbereit.",
    remediation:
      "Durchlaufen Sie den Reviewprozess bis zum Status 'approved'.",
    evaluate: (i) => {
      const s = (i.case as { workflow_status?: string }).workflow_status;
      return { passed: s === "approved" || s === "published" };
    },
  },
];

// -------- METADATA --------
export const METADATA_RULES: QualityRule[] = [
  {
    id: "metadata.category",
    category: "metadata",
    severity: "warning",
    maxScore: 3,
    title: "Kategorie vorhanden",
    description: "Kategorien verbessern Auffindbarkeit und Filterung.",
    remediation: "Wählen Sie im Fall-Editor eine Kategorie.",
    relatedField: "category",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed: isNonEmptyString(i.case.category as string | null),
    }),
  },
  {
    id: "metadata.subcategory",
    category: "metadata",
    severity: "info",
    maxScore: 0,
    title: "Unterkategorie vorhanden",
    description: "Optional – erhöht die redaktionelle Präzision.",
    remediation: "Pflegen Sie eine Unterkategorie.",
    relatedField: "subcategory",
    relatedRoute: caseEditPath,
    evaluate: (i) => ({
      passed: isNonEmptyString(i.case.subcategory as string | null),
    }),
  },
  {
    id: "metadata.author",
    category: "metadata",
    severity: "warning",
    maxScore: 2,
    title: "Autor:in gesetzt",
    description: "Ein zugeordneter Autor:in verbessert die Nachvollziehbarkeit.",
    remediation:
      "Der Fall sollte durch eine angemeldete Redakteurin bearbeitet worden sein.",
    evaluate: (i) => ({
      passed: !!(i.case as { created_by?: string | null }).created_by,
    }),
  },
  {
    id: "metadata.updated_recent",
    category: "metadata",
    severity: "warning",
    maxScore: 2,
    title: "Redaktionell aktuell",
    description: `Seit weniger als ${AGING_THRESHOLDS.reviewRecommendedDays} Tagen aktualisiert.`,
    remediation:
      "Prüfen Sie den Fall redaktionell erneut und speichern Sie eine neue Version.",
    evaluate: (i) => ({
      passed:
        agingLevelFor(
          (i.case as { updated_at?: string | null }).updated_at,
        ) === "current",
    }),
  },
];

// -------- PUBLICATION --------
export const PUBLICATION_RULES: QualityRule[] = [
  {
    id: "publication.tier_chosen",
    category: "publication",
    severity: "warning",
    maxScore: 2,
    title: "Sichtbarkeit gewählt",
    description: "Für Veröffentlichungen sollte eine Sichtbarkeitsstufe gewählt sein.",
    remediation: "Wählen Sie beim Veröffentlichen die passende Sichtbarkeit.",
    evaluate: (i) => {
      const t = (i.case as { publication_tier?: string | null })
        .publication_tier;
      const s = (i.case as { workflow_status?: string }).workflow_status;
      // Nur bei published relevant – bei approved-Warnung, sonst passed.
      if (s !== "published") return { passed: true };
      return { passed: !!t };
    },
  },
  {
    id: "publication.not_archived",
    category: "publication",
    severity: "blocker",
    maxScore: 1,
    title: "Nicht archiviert",
    description: "Archivierte Fälle sind nicht veröffentlichungsfähig.",
    remediation: "Reaktivieren Sie den Fall vor der Veröffentlichung.",
    evaluate: (i) => ({
      passed:
        (i.case as { workflow_status?: string }).workflow_status !== "archived",
    }),
  },
];

export const ALL_RULES: QualityRule[] = [
  ...CONTENT_RULES,
  ...LEGAL_RULES,
  ...REVIEW_RULES,
  ...WORKFLOW_RULES,
  ...METADATA_RULES,
  ...PUBLICATION_RULES,
];

export const MAX_SCORE = ALL_RULES.reduce((s, r) => s + r.maxScore, 0);
