/**
 * Pilot-Workflow "Verdacht auf LRS" als In-Memory-Fixture.
 * Deckt sich mit dem Seed in db/2026-07-30_workflow_platform.sql.
 */
import { WorkflowBuilder } from "./WorkflowBuilder";
import type { WorkflowTemplate } from "./types";

export function buildPilotWorkflow(): WorkflowTemplate {
  const b = new WorkflowBuilder({
    slug: "lrs-verdacht",
    title: "Verdacht auf Lese-Rechtschreib-Schwäche",
    subtitle: "Erste Schritte bei einem LRS-Verdacht",
    description:
      "Strukturierter Ablauf von der Beobachtung bis zur formalen Feststellung eines LRS-Verdachts.",
    workflowStatus: "published",
    publicationTier: "internal",
  });

  const p1 = b.addPhase({ title: "Beobachtung & Dokumentation", isRequired: true });
  const s1 = p1.addStep({
    title: "Auffälligkeiten dokumentieren",
    description: "Fehlermuster, Lesefluss und Schreibproduktionen über mehrere Wochen notieren.",
    goal: "Objektive Grundlage schaffen.",
    stepType: "information", primaryRole: "teacher", estimatedMinutes: 45,
    checklists: [
      { title: "Mindestens 3 Schreibproben gesammelt", isRequired: true },
      { title: "Fehlermuster kategorisiert", isRequired: false },
    ],
    documents: [{ templateSlug: "beobachtungsbogen", title: "Beobachtungsbogen LRS" }],
    roles: [{ role: "teacher", canEdit: true, canComplete: true }],
  });
  const s2 = p1.addStep({
    title: "Andere Ursachen ausschließen",
    description: "Prüfen, ob Seh-, Hör- oder Konzentrationsprobleme naheliegender sind.",
    stepType: "decision", riskLevel: "medium", estimatedMinutes: 20,
    dependsOn: [s1.stepId],
    checklists: [
      { title: "Sehtest-Status geprüft", isRequired: false },
      { title: "Hörstatus geprüft", isRequired: false },
    ],
  });

  const p2 = b.addPhase({ title: "Abstimmung im Kollegium", isRequired: true });
  const s3 = p2.addStep({
    title: "Kollegiale Einordnung",
    description: "Beobachtungen mit Klassenleitung und Deutschlehrkraft besprechen.",
    stepType: "communication", primaryRole: "class_lead", estimatedMinutes: 30,
    dependsOn: [s1.stepId],
  });
  const s4 = p2.addStep({
    title: "Elterngespräch führen",
    description: "Beobachtungen sachlich mitteilen, nächste Schritte erklären, Gespräch protokollieren.",
    stepType: "communication", priority: "high", primaryRole: "teacher",
    riskLevel: "medium", estimatedMinutes: 45,
    dependsOn: [s3.stepId],
    checklists: [
      { title: "Gesprächsprotokoll angelegt", isRequired: true },
      { title: "Nächste Schritte mit Eltern vereinbart", isRequired: true },
    ],
    documents: [{ templateSlug: "gespraechsprotokoll", title: "Gesprächsprotokoll Eltern" }],
  });

  const p3 = b.addPhase({ title: "Formale Feststellung", isRequired: true });
  p3.addStep({
    title: "Meldung an Schulleitung",
    description: "Fall formell melden, Antrag auf Testung/Nachteilsausgleich vorbereiten.",
    stepType: "review", priority: "high", primaryRole: "principal",
    riskLevel: "medium", estimatedMinutes: 30,
    dependsOn: [s4.stepId],
    checklists: [{ title: "Meldeformular ausgefüllt", isRequired: true }],
    documents: [{ templateSlug: "meldung-schulleitung", title: "Meldung an Schulleitung" }],
    roles: [{ role: "principal", canEdit: true, canComplete: true }],
  });

  b.addRule({ whenType: "checklist_missing", whenRef: "Meldeformular ausgefüllt", thenAction: "block_workflow", thenRef: null, priority: 10 });
  b.addRule({ whenType: "step_completed", whenRef: "Elterngespräch führen", thenAction: "unlock_step", thenRef: "Meldung an Schulleitung", priority: 20 });

  // Second reference to avoid "unused" tsc noise
  void s2;

  return b.build();
}
