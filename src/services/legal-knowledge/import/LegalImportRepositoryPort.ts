/**
 * Sprint 4.5C – Repository-Port des Import Frameworks.
 *
 * Das Framework kennt keine konkrete Datenbank. Adapter (z. B. Supabase)
 * implementieren diesen Port und übersetzen `applyDelta` auf die bestehenden
 * Legal-Repositories (LegalSourceRepository, SectionRepository, …).
 */
import type {
  LegalImportDelta,
  LegalImportSnapshot,
  NormalizedLegalDocument,
} from "./types";

export interface LegalImportRepositoryPort {
  /** Letzten erfolgreichen Snapshot je Quelle laden (für Delta-Berechnung). */
  loadSnapshot(sourceKey: string): Promise<LegalImportSnapshot | null>;
  /** Änderungen persistieren – Implementierung darf unveränderte Knoten überspringen. */
  applyDelta(input: {
    document: NormalizedLegalDocument;
    delta: LegalImportDelta;
    previous: LegalImportSnapshot | null;
  }): Promise<void>;
  /** Nach erfolgreichem Import den neuen Snapshot speichern. */
  saveSnapshot(snapshot: LegalImportSnapshot): Promise<void>;
}

/** In-Memory-Adapter für Tests, Golden-Reference und lokale Vorschauen. */
export class InMemoryLegalImportRepository implements LegalImportRepositoryPort {
  private snapshots = new Map<string, LegalImportSnapshot>();
  public readonly writes: Array<{
    sourceKey: string;
    versionLabel: string;
    delta: LegalImportDelta;
  }> = [];

  async loadSnapshot(sourceKey: string): Promise<LegalImportSnapshot | null> {
    return this.snapshots.get(sourceKey) ?? null;
  }

  async applyDelta(input: {
    document: NormalizedLegalDocument;
    delta: LegalImportDelta;
    previous: LegalImportSnapshot | null;
  }): Promise<void> {
    this.writes.push({
      sourceKey: input.document.source.key,
      versionLabel: input.document.version.label,
      delta: input.delta,
    });
  }

  async saveSnapshot(snapshot: LegalImportSnapshot): Promise<void> {
    this.snapshots.set(snapshot.sourceKey, snapshot);
  }

  /** Test-Hilfe: aktuellen Snapshot einer Quelle inspizieren. */
  peek(sourceKey: string): LegalImportSnapshot | null {
    return this.snapshots.get(sourceKey) ?? null;
  }
}
