/**
 * Legal Export Release Blocker (Nutzer-Regelwerk 2026-08-21, "LEGAL EXPORT
 * RELEASE BLOCKER – KEINE FREIGABE BEI UNBELEGTEN RECHTSCLAIMS").
 *
 * Kernentscheidung: die KI klassifiziert jede rechtlich relevante Aussage
 * (Claim) in genau einen von sechs Status - der GRÜN/GELB/ROT-Gesamtstatus
 * wird NICHT mehr von der KI selbst behauptet, sondern deterministisch aus
 * dieser Klassifikation berechnet (diese Datei). Grund (Regel 28 des
 * Nutzerdokuments, "KEINE KI-KOSMETIK"): "Quellenlogik vor Sprachlogik" -
 * eine Freigabeentscheidung, die allein auf der Selbstauskunft eines
 * Sprachmodells beruht, ist nicht zuverlässig prüf- oder testbar. Diese
 * Funktion ist reiner, deterministischer Code und wird mit den 14
 * Regressionstests aus Regel 27 des Nutzerdokuments direkt (ohne KI-Aufruf)
 * getestet.
 */

export type ClaimClassification =
  | "DIRECT"
  | "DERIVED"
  | "ORGANIZATIONAL"
  | "OPEN"
  | "UNSUPPORTED"
  | "CONFLICT";

export type ClaimSection =
  | "legal_vorgegeben"
  | "legal_einordnung"
  | "short_answer"
  | "recommendation"
  | "checklist"
  | "practice_tip"
  | "common_mistakes"
  | "documentation";

export const LEGAL_FLAG_TYPES = [
  "LEGAL_UNSUPPORTED_WRITING_REQUIREMENT",
  "LEGAL_UNSUPPORTED_EXCLUSION",
  "LEGAL_UNSUPPORTED_LEGAL_CONSEQUENCE",
  "LEGAL_UNSUPPORTED_DUTY",
  "LEGAL_UNSUPPORTED_RESPONSIBILITY",
  "LEGAL_UNSUPPORTED_DEADLINE",
  "LEGAL_OVERBROAD_BIAS_CLAIM",
  "LEGAL_SOURCE_CONFLICT",
  "LEGAL_SECTION_TOO_BROAD",
  "LEGAL_OPEN_CORE_QUESTION",
  "LEGAL_STRUCTURAL_MISPLACEMENT",
  "LEGAL_OTHER",
] as const;
export type LegalFlagType = (typeof LEGAL_FLAG_TYPES)[number];

export interface ClassifiedClaim {
  /** Stabile id des Elements, z. B. "checklist-2" oder "legal_vorgegeben-1". */
  id: string;
  section: ClaimSection;
  /** Originalsatz/Punkt, für Redaktions-Anzeige und Blocker-Meldungen. */
  text: string;
  classification: ClaimClassification;
  /**
   * Betrifft dieser Claim die zentrale Rechtsfrage des Praxisfalls (nicht
   * eine Nebenfrage)? Nur die KI (bzw. der Aufrufer) kann das im Kontext
   * beurteilen - diese Funktion nimmt es als gegebenen Input.
   */
  isCentral: boolean;
  flagType?: LegalFlagType;
  /** Konkrete Problembeschreibung für die Redaktions-Ansicht (Regel 20/21). */
  problem?: string;
  sourceId?: string | null;
}

export interface ReleaseGateFlag {
  claimId: string;
  flagType: LegalFlagType;
  message: string;
}

export interface ReleaseGateResult {
  color: "gruen" | "gelb" | "rot";
  /** Menschenlesbare Gründe, warum GRÜN (bzw. GELB) verwehrt wurde - leer bei sauberem GRÜN. */
  blockers: string[];
  flags: ReleaseGateFlag[];
}

/**
 * Berechnet den Freigabestatus ausschließlich aus der Claim-Klassifikation -
 * keine Interpretation von Freitext, keine erneute Quellenprüfung.
 *
 * GRÜN nur wenn: keine UNSUPPORTED-, keine CONFLICT-Claims, alle
 * "Rechtlich vorgegeben"-Claims DIRECT, keine offene Rechtsfrage.
 *
 * ROT nur, wenn eine ZENTRALE Aussage UNSUPPORTED oder CONFLICT ist -
 * also aktiv unbelegt oder quellenwidersprüchlich. Alles andere GELB.
 *
 * Rekalibrierung 2026-08-26 (vom Nutzer freigegeben, nach dem ersten
 * Bestands-Nachtlauf mit 375/394 ROT und nur 2 GELB): die ursprüngliche
 * Regel-18-Umsetzung wertete auch (1) eine zentrale, lediglich OFFENE
 * Rechtsfrage und (2) eine belegbare, nur falsch einsortierte Aussage
 * (DERIVED/ORGANIZATIONAL unter "Rechtlich vorgegeben") als ROT. Beides
 * sind keine unbelegten Behauptungen: offene Fragen werden dem Leser auf
 * der Fallseite transparent angezeigt (case_legal_review_flags), und
 * Einsortierungsfehler sind redaktionelle Struktur-, keine Quellenmängel.
 * Der Kern des Regelwerks ("keine Freigabe bei unbelegten Rechtsclaims")
 * bleibt unverändert: zentrale UNSUPPORTED-/CONFLICT-Claims sperren mit ROT.
 */
export function computeReleaseGate(claims: ClassifiedClaim[]): ReleaseGateResult {
  const blockers: string[] = [];
  const flags: ReleaseGateFlag[] = [];
  let color: "gruen" | "gelb" | "rot" = "gruen";

  const escalate = (next: "gelb" | "rot") => {
    if (next === "rot") color = "rot";
    else if (color === "gruen") color = "gelb";
  };

  for (const c of claims) {
    if (c.section === "legal_vorgegeben" && c.classification !== "DIRECT") {
      blockers.push(
        `Nicht-DIRECT-Aussage im Abschnitt "Rechtlich vorgegeben": "${c.text}" (${c.classification}) - dort sind ausschließlich DIRECT-Aussagen zulässig.`,
      );
      flags.push({
        claimId: c.id,
        flagType: "LEGAL_STRUCTURAL_MISPLACEMENT",
        message:
          c.problem ??
          `"${c.text}" ist als ${c.classification} klassifiziert, steht aber unter "Rechtlich vorgegeben" - dort sind nur DIRECT-Aussagen (unmittelbar durch eine Quelle getragen) zulässig.`,
      });
      // Falsche Einsortierung allein ist GELB - ist die Aussage zusätzlich
      // UNSUPPORTED/CONFLICT und zentral, eskaliert deren eigener Block
      // unten ohnehin auf ROT.
      escalate("gelb");
    }

    if (c.classification === "UNSUPPORTED") {
      blockers.push(`Unbelegter Claim: "${c.text}"${c.problem ? ` – ${c.problem}` : ""}`);
      flags.push({
        claimId: c.id,
        flagType: c.flagType ?? "LEGAL_OTHER",
        message: c.problem ?? `"${c.text}" besitzt keine ausreichende Quellenbasis oder geht über die Quelle hinaus.`,
      });
      escalate(c.isCentral ? "rot" : "gelb");
    }

    if (c.classification === "CONFLICT") {
      blockers.push(`Widersprüchlicher Claim: "${c.text}"${c.problem ? ` – ${c.problem}` : ""}`);
      flags.push({
        claimId: c.id,
        flagType: c.flagType ?? "LEGAL_SOURCE_CONFLICT",
        message: c.problem ?? `"${c.text}" widerspricht einer hinterlegten Quelle oder einem anderen Claim.`,
      });
      escalate(c.isCentral ? "rot" : "gelb");
    }

    if (c.classification === "OPEN") {
      if (c.isCentral) {
        blockers.push(`Zentrale offene Rechtsfrage: "${c.text}"${c.problem ? ` – ${c.problem}` : ""}`);
        flags.push({
          claimId: c.id,
          flagType: c.flagType ?? "LEGAL_OPEN_CORE_QUESTION",
          message:
            c.problem ??
            `"${c.text}" betrifft die zentrale Rechtsfrage dieses Praxisfalls und wird durch die vorhandenen Quellen nicht abschließend beantwortet.`,
        });
      }
      // Rekalibrierung 2026-08-26: eine OFFENE Frage ist keine unbelegte
      // Behauptung - sie wird dem Leser als Flag transparent angezeigt.
      // GELB (auch bei zentraler Frage), Blocker/Flag bleiben erhalten.
      escalate("gelb");
    }
  }

  return { color, blockers, flags };
}

/**
 * Regel 12 des Nutzerdokuments: eine Negativaussage, die nur EINE geprüfte
 * Norm zum Gegenstand hatte, darf nicht als "es existiert keine Regelung"
 * (uneingeschränkte Nichtexistenz-Behauptung) formuliert werden, sondern nur
 * als "§X enthält hierzu keine ausdrückliche Regelung" (auf die geprüfte
 * Quelle bezogen). Rein musterbasierte Heuristik, kein Ersatz für die
 * KI-Prüfung - dient als zusätzlicher, deterministischer Blocker.
 */
const OVERBROAD_NEGATIVE_PATTERNS = [
  /\bes\s+(gibt|existiert)\s+keine\s+(vorgabe|regelung|vorschrift|pflicht)/i,
  /\bes\s+ist\s+(generell|grundsätzlich|allgemein)\s+nicht\s+(vorgesehen|geregelt|erlaubt|zulässig)/i,
];
const SCOPED_NEGATIVE_HINTS = [/§\s*\S+/, /\b(die\s+quelle|der\s+wortlaut|die\s+vorschrift|die\s+norm)\b/i];

export interface NegativeStatementCheck {
  overbroad: boolean;
  suggestion?: string;
}

export function checkNegativeStatementPhrasing(text: string): NegativeStatementCheck {
  const isOverbroad = OVERBROAD_NEGATIVE_PATTERNS.some((p) => p.test(text));
  const isScoped = SCOPED_NEGATIVE_HINTS.some((p) => p.test(text));
  if (isOverbroad && !isScoped) {
    return {
      overbroad: true,
      suggestion: "Auf die konkret geprüfte Quelle beziehen, z. B. \"§X enthält hierzu keine ausdrückliche Regelung\" statt einer uneingeschränkten Nichtexistenz-Behauptung.",
    };
  }
  return { overbroad: false };
}

/**
 * Regel 2 des Nutzerdokuments: erweiterte Trigger-Wortliste für erhöhte
 * Prüfpflicht (Auslöser für genauere Quellenprüfung, kein automatisches
 * Verbot dieser Wörter).
 */
export const LEGAL_TRIGGER_WORDS = [
  "muss", "müssen", "zwingend", "verpflichtend", "vorgeschrieben", "erforderlich",
  "ausschließlich", "nur", "darf", "darf nicht", "nicht zulässig", "unzulässig",
  "verboten", "schriftlich", "schriftform", "verantwortlich", "gesamtverantwortung",
  "zuständig", "genehmigung", "genehmigen", "befangenheit", "ausgeschlossen",
  "unwirksam", "nichtig", "rechtswidrig", "anfechtbar", "wird angefochten",
  "führt zur aufhebung", "führt zur wiederholung", "rechtsfolge", "frist",
  "spätestens", "mindestens", "innerhalb von",
];

export function findTriggerWords(text: string): string[] {
  const lower = text.toLowerCase();
  return LEGAL_TRIGGER_WORDS.filter((w) => lower.includes(w));
}

/**
 * Regel 21 des Nutzerdokuments ("Redaktionelle Review-Ansicht"): empfohlene
 * Aktion je nach Klassifikation, deterministisch aus der Klassifikation
 * abgeleitet - keine weitere KI-Entscheidung nötig.
 */
export function suggestedAction(classification: ClaimClassification): string {
  switch (classification) {
    case "UNSUPPORTED":
      return "Quelle ergänzen, falls vorhanden - sonst Claim abschwächen oder entfernen.";
    case "CONFLICT":
      return "Widerspruch klären: betroffene Quelle erneut prüfen, sonst Claim entfernen.";
    case "OPEN":
      return "Als offene Rechtsfrage markieren und redaktionell klären.";
    case "DERIVED":
      return "Als rechtliche Einordnung kennzeichnen, nicht als unmittelbar vorgegeben.";
    case "ORGANIZATIONAL":
      return "Als organisatorische Empfehlung einstufen, nicht als Rechtspflicht.";
    case "DIRECT":
      return "Keine Aktion nötig - Aussage ist durch die Quelle gedeckt.";
  }
}

/** Formatiert einen Claim für die redaktionelle Review-Ansicht (Regel 21). */
export function formatClaimForReview(claim: ClassifiedClaim): string {
  const lines = [
    `Claim: ${claim.text}`,
    `Status: ${claim.classification}`,
    `Quelle: ${claim.sourceId ?? "keine"}`,
    `Problem: ${claim.problem ?? "-"}`,
    `Empfohlene Aktion: ${suggestedAction(claim.classification)}`,
  ];
  return lines.join("\n");
}
