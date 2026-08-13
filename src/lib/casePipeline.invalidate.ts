/**
 * Zentrale Query-Invalidierung für Praxisfall-relevante Caches.
 *
 * WICHTIG: Alle Auslöser der Pipeline (KI-Fallmaschine, Vernetzen,
 * Quality-Fix, Fallmanager, Batch) verwenden AUSSCHLIESSLICH diese Funktion.
 * Damit gibt es genau EINE Wahrheit über zu invalidierende Keys.
 */

import type { QueryClient } from "@tanstack/react-query";

export function invalidatePracticeCaseQueries(qc: QueryClient, caseId?: string) {
  // Fall selbst
  qc.invalidateQueries({ queryKey: ["case"] });
  qc.invalidateQueries({ queryKey: ["cases"] });
  qc.invalidateQueries({ queryKey: ["admin", "cases"] });

  // Verknüpfungen (mit und ohne case-scope). Drei parallele Key-Konventionen
  // sind historisch gewachsen ("case-legal-links", "case-links",
  // "admin"+"case-links") - insbesondere die vom Praxisfall-Editor selbst
  // genutzte ["admin","case-links",id] fehlte hier bisher komplett, wodurch
  // dessen Rechtsgrundlagen-Fortschrittsanzeige nach JEDER Pipeline-Aktion
  // (Vernetzen, Quality-Fix, Batch, ...) veraltet blieb (Fund 2026-08-14).
  qc.invalidateQueries({ queryKey: ["case-legal-links"] });
  qc.invalidateQueries({ queryKey: ["admin", "case-legal-links"] });
  qc.invalidateQueries({ queryKey: ["case-links"] });
  qc.invalidateQueries({ queryKey: ["admin", "case-links"] });
  qc.invalidateQueries({ queryKey: ["case-keywords"] });
  qc.invalidateQueries({ queryKey: ["admin", "case-keywords"] });
  qc.invalidateQueries({ queryKey: ["case-templates"] });
  qc.invalidateQueries({ queryKey: ["admin", "case-templates"] });

  // Kataloge
  qc.invalidateQueries({ queryKey: ["keywords"] });
  qc.invalidateQueries({ queryKey: ["templates"] });
  qc.invalidateQueries({ queryKey: ["legal-sections"] });
  qc.invalidateQueries({ queryKey: ["knowledge-cards"] });
  qc.invalidateQueries({ queryKey: ["knowledge-index"] });

  // Quality
  qc.invalidateQueries({ queryKey: ["quality-rows"] });
  qc.invalidateQueries({ queryKey: ["quality-tasks"] });

  // Vernetzungs-Dialog-Kataloge
  qc.invalidateQueries({ queryKey: ["case-networking"] });

  if (caseId) {
    qc.invalidateQueries({ queryKey: ["case", caseId] });
    qc.invalidateQueries({ queryKey: ["case-legal-links", caseId] });
    qc.invalidateQueries({ queryKey: ["admin", "case-links", caseId] });
    qc.invalidateQueries({ queryKey: ["case-keywords", caseId] });
    qc.invalidateQueries({ queryKey: ["admin", "case-templates", caseId] });
    qc.invalidateQueries({ queryKey: ["case-templates", caseId] });
  }
}
