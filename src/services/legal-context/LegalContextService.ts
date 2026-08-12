/**
 * Sprint 4.6G – Zentrale Orchestrierung des Legal Context.
 *
 * Der Service verbindet Repository, Resolver, FreshnessChecker, Ranker und
 * Explainer zu einem persistierbaren Ergebnis und erkennt über einen
 * djb2-Eingabe-Hash, ob sich Fall, Verknüpfungen oder Quellen seit der
 * Auflösung verändert haben.
 *
 * Der Datenabruf ist injizierbar (fetcher), damit der Service ohne
 * Netzwerk testbar bleibt. Standard ist das Supabase-Repository.
 */
import { djb2, stableStringify } from "@/services/assessment-engine";
import { LegalContextEventBus } from "./LegalContextEventBus";
import { LegalContextExplainer } from "./LegalContextExplainer";
import { LegalContextFreshnessChecker } from "./LegalContextFreshnessChecker";
import { rankLegalReferences } from "./LegalContextRanker";
import { resolveLegalContext, sectionIdOfLink } from "./LegalContextResolver";
import {
  LEGAL_CONTEXT_SCHEMA_VERSION,
  type LegalContextData,
  type LegalContextIssue,
  type LegalContextResult,
  type LegalReference,
} from "./types";

export class LegalContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegalContextError";
  }
}

/** Datenabruf (Standard: Supabase-Repository; in Tests injiziert). */
export type LegalContextFetcher = (caseId: string) => Promise<LegalContextData>;

export interface LegalContextServiceOptions {
  fetcher?: LegalContextFetcher;
  freshness?: LegalContextFreshnessChecker;
  explainer?: LegalContextExplainer;
  events?: LegalContextEventBus;
  now?: () => Date;
}

export interface LegalContextRestore {
  entry: LegalContextResult | null;
  error: string | null;
}

export class LegalContextService {
  private readonly fetcher?: LegalContextFetcher;
  private readonly freshness: LegalContextFreshnessChecker;
  private readonly explainer: LegalContextExplainer;
  private readonly events: LegalContextEventBus;
  private readonly now: () => Date;

  constructor(options: LegalContextServiceOptions = {}) {
    this.fetcher = options.fetcher;
    this.freshness = options.freshness ?? new LegalContextFreshnessChecker({ now: options.now });
    this.explainer = options.explainer ?? new LegalContextExplainer();
    this.events = options.events ?? new LegalContextEventBus();
    this.now = options.now ?? (() => new Date());
  }

  /** Lädt und löst den Rechtskontext eines bestätigten Praxisfalls. */
  async resolveForCase(caseId: string): Promise<LegalContextResult> {
    if (!caseId) throw new LegalContextError("Es wurde kein Praxisfall übergeben.");
    const fetcher = this.fetcher ?? (await this.defaultFetcher());
    const data = await fetcher(caseId);
    if (!data.caseRow) {
      throw new LegalContextError("Der bestätigte Praxisfall wurde nicht gefunden.");
    }
    const result = this.buildResult(data);
    this.events.emit("LegalContextResolved", {
      caseId,
      referenceCount: result.references.length,
      issueCount: result.issues.length,
    });
    return result;
  }

  /**
   * Generischer Fallback ohne Praxisfall: leeres Ergebnis ohne
   * fallspezifische Rechtsgrundlagen (es wird nichts ergänzt).
   */
  resolveGeneric(): LegalContextResult {
    return {
      schemaVersion: LEGAL_CONTEXT_SCHEMA_VERSION,
      source: { kind: "none" },
      references: [],
      issues: [],
      resolvedAt: this.now().toISOString(),
      inputHash: djb2(stableStringify({ kind: "none" })),
    };
  }

  /** Baut das Ergebnis aus flachen Rohdaten (deterministisch, synchron). */
  buildResult(data: LegalContextData): LegalContextResult {
    const caseRow = data.caseRow;
    const source: LegalContextResult["source"] = caseRow
      ? {
          kind: "practice_case",
          caseId: caseRow.id,
          caseTitle: caseRow.title ?? "Praxisfall",
          caseVersion: caseRow.updated_at ?? null,
        }
      : { kind: "none" };

    const { references: resolved, issues } = resolveLegalContext(data);
    const caseTitle = source.kind === "practice_case" ? source.caseTitle : "Praxisfall";

    const references: LegalReference[] = rankLegalReferences(resolved).map((ref) => {
      const assessment = this.freshness.assess(ref);
      return {
        ...ref,
        freshness: assessment.status,
        freshnessReasons: assessment.reasons,
        explanation: this.explainer.explainReference(
          ref,
          caseTitle,
          assessment.status,
          assessment.reasons,
        ),
      };
    });

    const allIssues: LegalContextIssue[] = [...issues];
    for (const ref of references) {
      if (ref.freshness === "outdated") {
        allIssues.push({
          type: "outdated_reference",
          sectionId: ref.sectionId,
          message: `„${ref.reference}“ ist möglicherweise nicht mehr aktuell: ${ref.freshnessReasons[0] ?? ""}`.trim(),
        });
      } else if (ref.source?.verificationStatus === "unverified") {
        allIssues.push({
          type: "unverified_source",
          sectionId: ref.sectionId,
          message: `Die Quelle von „${ref.reference}“ ist noch nicht verifiziert.`,
        });
      }
    }

    return {
      schemaVersion: LEGAL_CONTEXT_SCHEMA_VERSION,
      source,
      references,
      issues: allIssues,
      resolvedAt: this.now().toISOString(),
      inputHash: this.computeInputHash(data),
    };
  }

  /**
   * djb2-Hash über die fachlich relevante Eingabe: Fallstand, Verknüpfungen
   * sowie Änderungsstände der Abschnitte und Quellen. Jede redaktionelle
   * Änderung an diesen Daten erzeugt einen anderen Hash.
   */
  computeInputHash(data: LegalContextData): string {
    const projection = {
      caseId: data.caseRow?.id ?? null,
      caseVersion: data.caseRow?.updated_at ?? null,
      links: data.links
        .map((l) => ({ id: l.id, sectionId: sectionIdOfLink(l), relevance: l.relevance ?? null }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      sections: data.sections
        .map((s) => ({ id: s.id, updatedAt: s.updated_at ?? null }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      sources: data.sources
        .map((s) => ({
          id: s.id,
          updatedAt: s.updated_at ?? null,
          versionLabel: s.version_label ?? null,
          lifecycleStatus: s.lifecycle_status ?? null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
    return djb2(stableStringify(projection));
  }

  /** true, wenn sich die Eingabe seit der gespeicherten Auflösung geändert hat. */
  isStale(stored: LegalContextResult, fresh: LegalContextResult): boolean {
    return stored.inputHash !== fresh.inputHash;
  }

  /**
   * Standard-Datenabruf: das Supabase-Repository wird erst bei Bedarf
   * geladen, damit der Service in Tests ohne Netzwerk-Schicht nutzbar bleibt.
   */
  private async defaultFetcher(): Promise<LegalContextFetcher> {
    const { fetchLegalContextData } = await import("./LegalContextRepository");
    return fetchLegalContextData;
  }

  /** Validiert einen aus dem Navigator-Kontext gelesenen Eintrag. */
  restore(raw: unknown): LegalContextRestore {
    if (raw === undefined || raw === null) return { entry: null, error: null };
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return { entry: null, error: "Der gespeicherte Rechtskontext konnte nicht gelesen werden." };
    }
    const candidate = raw as Partial<LegalContextResult>;
    if (
      candidate.schemaVersion !== LEGAL_CONTEXT_SCHEMA_VERSION ||
      !candidate.source ||
      typeof candidate.source !== "object" ||
      !Array.isArray(candidate.references) ||
      typeof candidate.resolvedAt !== "string" ||
      typeof candidate.inputHash !== "string"
    ) {
      return { entry: null, error: "Der gespeicherte Rechtskontext ist nicht mehr gültig." };
    }
    this.events.emit("LegalContextRestored", {
      referenceCount: candidate.references.length,
    });
    return { entry: candidate as LegalContextResult, error: null };
  }
}

export const defaultLegalContextService = new LegalContextService();
