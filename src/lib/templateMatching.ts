/**
 * Zentrale KI-gestützte Zuordnung von Dokumentvorlagen zu einem Praxisfall.
 *
 * - `matchTemplates`  → ruft /api/ai-match-templates (bereits vorhanden)
 * - `applyTemplateMatches` → persistiert Verknüpfungen in `case_templates`,
 *   verhindert Dubletten und sammelt Fehler.
 * - `seedStandardTemplates` → legt fehlende Standard-Vorlagen als Entwurf
 *   in `document_templates` an (idempotent, keine Dubletten anhand `title`).
 * - `listCaseTemplateLinks` → holt aktuelle Zuordnungen für einen Fall.
 *
 * Wird genutzt von:
 *  - Core Builder (TemplateAssignmentDialog)
 *  - CaseNetworkingDialog („Fall automatisch vernetzen“)
 *  - KI-Fallmaschine
 */

import { supabase } from "@/integrations/supabase/contextAwareClient";

export type TemplateMatch = {
  id: string;
  confidence: number;
  reason: string;
  signals: string[];
  already_linked: boolean;
};

export type TemplateMatchResponse = {
  matches: TemplateMatch[];
  missing_area?: string | null;
};

export type CaseTemplateMatchInput = {
  title?: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  recommendation?: string;
  immediate_actions?: string;
  responsibilities?: string;
  legal_explanation?: string;
  keywords?: string[];
  legal_sections?: Array<{
    source_short?: string;
    section_number?: string;
    title?: string;
  }>;
  templates: Array<{ id: string; title: string; type?: string; description?: string }>;
  already_linked?: string[];
};

export function templateAmpel(c: number): "gruen" | "gelb" | "orange" | "rot" {
  if (c >= 90) return "gruen";
  if (c >= 70) return "gelb";
  if (c >= 50) return "orange";
  return "rot";
}
export function templateAmpelDot(a: ReturnType<typeof templateAmpel>): string {
  return a === "gruen" ? "🟢" : a === "gelb" ? "🟡" : a === "orange" ? "🟠" : "🔴";
}

export async function matchTemplates(
  input: CaseTemplateMatchInput,
): Promise<TemplateMatchResponse> {
  const res = await fetch("/api/ai-match-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `KI-Vorlagenzuordnung fehlgeschlagen (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as TemplateMatchResponse;
  return {
    matches: Array.isArray(json.matches) ? json.matches : [],
    missing_area: json.missing_area ?? null,
  };
}

export type TemplateApplyResult = {
  assigned: number;
  skipped: number;
  failed: number;
  errors: Array<{
    template_id: string;
    message: string;
    code?: string;
    details?: string;
  }>;
};

/**
 * Persistiert Vorlagen-Zuordnungen in `case_templates`.
 * Erstellt KEINE neuen Vorlagen (nur bestehende IDs werden verknüpft).
 */
export async function applyTemplateMatches(
  caseId: string,
  items: Array<{
    template_id: string;
    relevance?: "high" | "medium" | "low";
    explanation?: string;
  }>,
  opts?: { alreadyLinked?: string[] },
): Promise<TemplateApplyResult> {
  const result: TemplateApplyResult = { assigned: 0, skipped: 0, failed: 0, errors: [] };
  if (!caseId) {
    throw new Error("Keine case_id vorhanden – bitte Praxisfall zuerst speichern.");
  }

  // Bestehende Verknüpfungen laden, damit Dubletten sicher erkannt werden.
  const linked = new Set<string>(opts?.alreadyLinked ?? []);
  if (!opts?.alreadyLinked) {
    const { data, error } = await (supabase as any)
      .from("case_templates")
      .select("template_id")
      .eq("case_id", caseId);
    if (error) throw error;
    for (const r of data ?? []) linked.add(r.template_id);
  }

  for (const item of items) {
    const tid = item.template_id;
    if (!tid) {
      result.skipped++;
      continue;
    }
    if (linked.has(tid)) {
      result.skipped++;
      continue;
    }
    try {
      const payload: Record<string, unknown> = { case_id: caseId, template_id: tid };
      if (item.relevance) payload.relevance = item.relevance;
      if (item.explanation) payload.explanation = item.explanation.slice(0, 500);
      const { error } = await (supabase as any).from("case_templates").insert(payload);
      if (error) {
        // Duplicate-Key trotz Vorabprüfung → als skipped werten
        const msg = String(error.message ?? "");
        if (error.code === "23505" || /duplicate/i.test(msg)) {
          linked.add(tid);
          result.skipped++;
          continue;
        }
        throw error;
      }
      linked.add(tid);
      result.assigned++;
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      result.failed++;
      result.errors.push({
        template_id: tid,
        message: err?.message ?? String(e),
        code: err?.code,
        details: err?.details,
      });
      if (import.meta.env.DEV) {
        console.error("[applyTemplateMatches] failed", { caseId, tid, err });
      }
    }
  }
  return result;
}

export async function listCaseTemplateLinks(
  caseId: string,
): Promise<Array<{ template_id: string; relevance: string | null; explanation: string | null }>> {
  const { data, error } = await (supabase as any)
    .from("case_templates")
    .select("template_id, relevance, explanation")
    .eq("case_id", caseId);
  if (error) throw error;
  return data ?? [];
}

export async function unlinkCaseTemplate(caseId: string, templateId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("case_templates")
    .delete()
    .eq("case_id", caseId)
    .eq("template_id", templateId);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Standard-Dokumentvorlagen (Entwurf)
// ────────────────────────────────────────────────────────────

export type StandardTemplateSeed = {
  title: string;
  template_type: string;
  description: string;
  body: string;
  /** Semantische Alias-Titel (lowercase-Vergleich), um Dubletten zu erkennen. */
  aliases?: string[];
};


/**
 * Baut einen strukturierten Vorlagentext mit einheitlichem Kopf und
 * beliebigen Abschnitten. Alle Abschnitte enthalten Platzhalter statt
 * konkreter rechtlicher Aussagen – so werden keine pauschalen
 * Rechtsbehauptungen erzeugt.
 */
function mkBody(header: string, sections: Array<[string, string?]> = []): string {
  const head = [
    header,
    "",
    "Datum: [Datum]",
    "Uhrzeit: [Uhrzeit]",
    "Ort: [Ort]",
    "Beteiligte Personen: [Beteiligte Personen]",
    "Dokumentiert von: [Dokumentiert von]",
    "",
  ].join("\n");
  const body = sections
    .map(([label, placeholder]) => `${label}:\n${placeholder ?? "[bitte ergänzen]"}\n`)
    .join("\n");
  const foot = [
    "",
    "Zuständigkeit: [Zuständigkeit]",
    "Wiedervorlage am: [Wiedervorlage am]",
    "Rechtsgrundlage: [Rechtsgrundlage nach fachlicher Prüfung ergänzen]",
    "",
  ].join("\n");
  return head + body + foot;
}

/**
 * Standard-Katalog schulischer Dokumentvorlagen. Wird über
 * `seedStandardTemplates()` idempotent in `document_templates` angelegt
 * (Status: draft). Dubletten werden anhand `title` (case-insensitive)
 * erkannt; semantische Dubletten sind hier bereits ausgeklammert.
 */
export const STANDARD_TEMPLATES: StandardTemplateSeed[] = [
  // ───── Bereits im MVP-Katalog (bleiben zur Rückwärtskompatibilität)
  {
    title: "Aktennotiz",
    template_type: "Notiz",
    description: "Kurze, sachliche Notiz zu einem Vorfall für die Akte.",
    body:
      "AKTENNOTIZ\n\nDatum: \nVerfasser:in: \nBetreff: \n\nSachverhalt:\n\n\nMaßnahme:\n",
  },
  {
    title: "Gesprächsprotokoll",
    template_type: "Protokoll",
    description: "Ergebnisprotokoll eines Gesprächs mit Beteiligten.",
    body:
      "GESPRÄCHSPROTOKOLL\n\nDatum: \nTeilnehmende: \nAnlass: \n\nInhalt:\n\n\nVereinbarungen:\n",
  },
  {
    title: "Elterninformation",
    template_type: "Anschreiben",
    description: "Schriftliche Information an Erziehungsberechtigte oder Ausbildungsbetrieb.",
    body:
      "Sehr geehrte Damen und Herren,\n\nBetreff: \nDatum: \n\n[Text]\n\nMit freundlichen Grüßen\n",
  },
  {
    title: "Information an Klassenleitung",
    template_type: "Interne Info",
    description: "Kurze interne Information an die Klassenleitung.",
    body:
      "An die Klassenleitung\n\nVon: \nDatum: \nBetreff: \n\nSachverhalt:\n\n\nBitte um / Vorschlag:\n",
  },
  {
    title: "Information an Schulleitung",
    template_type: "Interne Info",
    description: "Interne Information an die Schulleitung.",
    body:
      "An die Schulleitung\n\nVon: \nDatum: \nBetreff: \n\nSachverhalt:\n\n\nBitte um / Vorschlag:\n",
  },
  {
    title: "Anhörung vor Ordnungsmaßnahme",
    template_type: "Formular",
    description: "Anhörung nach § 28 VwVfG NRW vor belastender Entscheidung.",
    body:
      "ANHÖRUNG (§ 28 VwVfG NRW)\n\nBetroffen: \nDatum: \n\nSachverhalt / Vorwurf:\n\n\nGelegenheit zur Stellungnahme bis: \n",
  },
  {
    title: "Dokumentation Ordnungsmaßnahme",
    template_type: "Dokumentation",
    description: "Dokumentation der beschlossenen Ordnungsmaßnahme nach § 53 SchulG NRW.",
    body:
      "DOKUMENTATION ORDNUNGSMASSNAHME\n\nSchüler:in: \nDatum: \nMaßnahme: \n\nBegründung:\n\n\nRechtsgrundlage: § 53 SchulG NRW\n",
  },
  {
    title: "Datenschutz-Vorfallnotiz",
    template_type: "Meldung",
    description: "Interne Dokumentation eines Datenschutzvorfalls nach Art. 33 DSGVO.",
    body:
      "DATENSCHUTZVORFALL (Art. 33 DSGVO)\n\nDatum/Zeit: \nArt: \n\nBetroffene Daten/Personen:\n\n\nHergang:\n\n\nSofortmaßnahmen:\n\n\nMeldung an DSB / Aufsichtsbehörde:\n",
  },
  {
    title: "Unfall- / Vorfallmeldung",
    template_type: "Meldung",
    description: "Chronologische Erfassung eines relevanten Unfalls oder Vorfalls.",
    body:
      "VORFALL- / UNFALLMELDUNG\n\nDatum/Zeit: \nOrt: \nBeteiligte / Zeug:innen:\n\n\nHergang:\n\n\nSofortmaßnahmen:\n\n\nInformierte Stellen:\n",
  },
  {
    title: "Fehlzeiten-Dokumentation",
    template_type: "Dokumentation",
    description: "Übersicht und Maßnahmen bei auffälligen Fehlzeiten.",
    body:
      "FEHLZEITENDOKUMENTATION\n\nSchüler:in / Klasse: \nZeitraum: \n\nFehltage (entschuldigt / unentschuldigt):\n\n\nKontakte zu Erziehungsberechtigten / Betrieb:\n\n\nMaßnahmen:\n",
  },
  {
    title: "Klassenbucheintrag",
    template_type: "Eintrag",
    description: "Kurzer, sachlicher Eintrag ins Klassenbuch.",
    body:
      "KLASSENBUCHEINTRAG\n\nDatum: \nStunde/Fach: \nSchüler:in: \n\nSachverhalt (sachlich, kurz):\n",
  },
  {
    title: "Maßnahmenplan",
    template_type: "Plan",
    description: "Übersicht geplanter pädagogischer / organisatorischer Maßnahmen.",
    body:
      "MASSNAHMENPLAN\n\nSchüler:in / Fall: \nZiel: \n\nMaßnahmen (Verantwortlich, Termin):\n1. \n2. \n3. \n\nÜberprüfung am: \n",
  },
  {
    title: "Wiedervorlage / Nachverfolgung",
    template_type: "Notiz",
    description: "Merkzettel zur Nachverfolgung offener Punkte.",
    body:
      "WIEDERVORLAGE\n\nFall: \nWiedervorlage am: \nZuständig: \n\nOffene Punkte:\n- \n- \n",
  },
  {
    title: "Einverständniserklärung",
    template_type: "Formular",
    description: "Einverständniserklärung für Erziehungsberechtigte / Volljährige.",
    body:
      "EINVERSTÄNDNISERKLÄRUNG\n\nName Schüler:in: \nKlasse: \nDatum: \n\nHiermit erkläre/n ich/wir mich/uns einverstanden mit:\n\n\nOrt, Datum, Unterschrift:\n",
  },
  {
    title: "Gefährdungseinschätzung",
    template_type: "Dokumentation",
    description: "Sachliche Einschätzung nach § 4 KKG / § 8a SGB VIII.",
    body:
      "GEFÄHRDUNGSEINSCHÄTZUNG (vertraulich)\n\nDatum: \nBetroffene:r: \n\nKonkrete Beobachtungen (ohne Wertung):\n\n\nÄußerungen:\n\n\nKollegiale Fallberatung / insoFa:\n\n\nEinschätzung & nächste Schritte:\n",
  },

  // ───── Allgemeine Dokumentation
  {
    title: "Chronologischer Ereignisvermerk",
    template_type: "Dokumentation",
    description: "Zeitlich geordnete Erfassung eines mehrstufigen Ereignisses.",
    body: mkBody("CHRONOLOGISCHER EREIGNISVERMERK", [
      ["Anlass", "[Anlass]"],
      ["Chronologie (Zeit → Ereignis)"],
      ["Beobachtungen"],
      ["Getroffene Sofortmaßnahmen"],
      ["Beteiligte Stellen"],
    ]),
  },
  {
    title: "Sachverhaltsdokumentation",
    template_type: "Dokumentation",
    description: "Ausführliche, wertungsfreie Darstellung eines Sachverhalts.",
    body: mkBody("SACHVERHALTSDOKUMENTATION", [
      ["Vorgeschichte"],
      ["Sachverhalt (wertungsfrei)"],
      ["Beobachtungen"],
      ["Aussagen Beteiligter"],
      ["Weitere Maßnahmen"],
    ]),
  },
  {
    title: "Gesprächsnotiz",
    template_type: "Notiz",
    description: "Knappe Notiz zu einem informellen Gespräch.",
    body: mkBody("GESPRÄCHSNOTIZ", [
      ["Anlass"],
      ["Gesprächsinhalte"],
      ["Vereinbarungen"],
    ]),
  },
  {
    title: "Telefonvermerk",
    template_type: "Notiz",
    description: "Vermerk über den Inhalt eines telefonischen Kontakts.",
    body: mkBody("TELEFONVERMERK", [
      ["Gesprächspartner:in / Rolle"],
      ["Rufnummer / Erreichbarkeit"],
      ["Gesprächsinhalte"],
      ["Vereinbarungen / Rückruf"],
    ]),
  },
  {
    title: "Übergabevermerk",
    template_type: "Notiz",
    description: "Übergabe eines Vorgangs an eine andere Zuständigkeit.",
    body: mkBody("ÜBERGABEVERMERK", [
      ["Übergebender Vorgang"],
      ["Sachstand"],
      ["Offene Punkte"],
      ["Empfangende Stelle"],
    ]),
  },
  {
    title: "Wiedervorlagevermerk",
    template_type: "Notiz",
    description: "Merkposten für die zeitgesteuerte Nachverfolgung eines Vorgangs.",
    body: mkBody("WIEDERVORLAGEVERMERK", [
      ["Vorgang"],
      ["Bisheriger Sachstand"],
      ["Grund der Wiedervorlage"],
      ["Nächster Schritt"],
    ]),
  },
  {
    title: "Maßnahmen- und Verlaufsdokumentation",
    template_type: "Dokumentation",
    description: "Fortlaufende Dokumentation von Maßnahmen und Wirkungsverlauf.",
    body: mkBody("MASSNAHMEN- UND VERLAUFSDOKUMENTATION", [
      ["Ausgangssituation"],
      ["Ergriffene Maßnahmen"],
      ["Beobachteter Verlauf"],
      ["Bewertung der Wirkung"],
      ["Weitere Schritte"],
    ]),
  },

  // ───── Schülergespräche
  {
    title: "Protokoll Schülergespräch",
    template_type: "Protokoll",
    description: "Ergebnisprotokoll eines pädagogischen Schülergesprächs.",
    body: mkBody("PROTOKOLL SCHÜLERGESPRÄCH", [
      ["Anlass"],
      ["Gesprächsinhalte"],
      ["Sicht der Schüler:in"],
      ["Vereinbarungen"],
    ]),
  },
  {
    title: "Anhörung einer Schülerin oder eines Schülers",
    template_type: "Formular",
    description: "Formalisierte Anhörung vor einer belastenden Maßnahme.",
    body: mkBody("ANHÖRUNG SCHÜLER:IN", [
      ["Vorwurf / Sachverhalt"],
      ["Belehrung über Rechte"],
      ["Stellungnahme der Schüler:in"],
      ["Anwesende Personen"],
    ]),
  },
  {
    title: "Stellungnahme einer Schülerin oder eines Schülers",
    template_type: "Formular",
    description: "Schriftliche Stellungnahme der Schüler:in zum Sachverhalt.",
    body: mkBody("SCHRIFTLICHE STELLUNGNAHME", [
      ["Sachverhalt (aus Sicht der Schüler:in)"],
      ["Erklärung / Begründung"],
      ["Vorschläge zur Wiedergutmachung"],
    ]),
  },
  {
    title: "Reflexionsbogen nach Fehlverhalten",
    template_type: "Formular",
    description: "Strukturierter Bogen zur Selbstreflexion der Schüler:in.",
    body: mkBody("REFLEXIONSBOGEN", [
      ["Was ist passiert?"],
      ["Wie habe ich mich verhalten?"],
      ["Wen habe ich beeinträchtigt?"],
      ["Was möchte ich zukünftig anders machen?"],
    ]),
  },
  {
    title: "Vereinbarung über zukünftiges Verhalten",
    template_type: "Vereinbarung",
    description: "Schriftliche Verhaltensvereinbarung zwischen Schule und Schüler:in.",
    body: mkBody("VERHALTENSVEREINBARUNG", [
      ["Ausgangssituation"],
      ["Vereinbarte Verhaltensziele"],
      ["Unterstützung durch die Schule"],
      ["Überprüfung am"],
    ]),
  },
  {
    title: "Dokumentation einer pädagogischen Maßnahme",
    template_type: "Dokumentation",
    description: "Dokumentation einer erzieherischen, nicht förmlichen Maßnahme.",
    body: mkBody("PÄDAGOGISCHE MASSNAHME", [
      ["Anlass"],
      ["Gewählte pädagogische Maßnahme"],
      ["Begründung der Verhältnismäßigkeit"],
      ["Beobachtete Wirkung"],
    ]),
  },

  // ───── Eltern und Erziehungsberechtigte
  {
    title: "Protokoll Elterngespräch",
    template_type: "Protokoll",
    description: "Ergebnisprotokoll eines Gesprächs mit Erziehungsberechtigten.",
    body: mkBody("PROTOKOLL ELTERNGESPRÄCH", [
      ["Anlass"],
      ["Teilnehmende"],
      ["Gesprächsinhalte"],
      ["Vereinbarungen"],
    ]),
  },
  {
    title: "Einladung zum Elterngespräch",
    template_type: "Anschreiben",
    description: "Schriftliche Einladung zu einem Elterngespräch.",
    body: mkBody("EINLADUNG ELTERNGESPRÄCH", [
      ["Anlass des Gesprächs"],
      ["Terminvorschlag"],
      ["Ort / Raum"],
      ["Rückmeldung erbeten bis"],
    ]),
  },
  {
    title: "Dokumentation telefonischer Elternkontakt",
    template_type: "Notiz",
    description: "Vermerk über einen telefonischen Kontakt mit Erziehungsberechtigten.",
    body: mkBody("TELEFONISCHER ELTERNKONTAKT", [
      ["Gesprächspartner:in"],
      ["Anlass"],
      ["Gesprächsinhalte"],
      ["Vereinbarungen / Rückruf"],
    ]),
  },
  {
    title: "Gesprächsvereinbarung Schule – Eltern – Schüler",
    template_type: "Vereinbarung",
    description: "Dreiseitige Vereinbarung zwischen Schule, Eltern und Schüler:in.",
    body: mkBody("VEREINBARUNG SCHULE – ELTERN – SCHÜLER:IN", [
      ["Ausgangssituation"],
      ["Vereinbarte Ziele"],
      ["Beitrag der Schule"],
      ["Beitrag der Eltern"],
      ["Beitrag der Schüler:in"],
      ["Überprüfung am"],
    ]),
  },
  {
    title: "Information über schulischen Vorfall",
    template_type: "Anschreiben",
    description: "Information der Erziehungsberechtigten über einen konkreten Vorfall.",
    body: mkBody("INFORMATION ÜBER SCHULISCHEN VORFALL", [
      ["Sachverhalt"],
      ["Getroffene Maßnahmen"],
      ["Bitte um Rücksprache"],
    ]),
  },
  {
    title: "Information über wiederholtes Fehlverhalten",
    template_type: "Anschreiben",
    description: "Elternbrief bei wiederholtem Fehlverhalten der Schüler:in.",
    body: mkBody("INFORMATION WIEDERHOLTES FEHLVERHALTEN", [
      ["Bisherige Vorfälle (chronologisch)"],
      ["Bereits ergriffene Maßnahmen"],
      ["Aktueller Anlass"],
      ["Weiteres Vorgehen"],
    ]),
  },
  {
    title: "Information über Fehlzeiten",
    template_type: "Anschreiben",
    description: "Elternbrief bei auffälligen oder unentschuldigten Fehlzeiten.",
    body: mkBody("INFORMATION FEHLZEITEN", [
      ["Zeitraum"],
      ["Fehltage entschuldigt / unentschuldigt"],
      ["Bereits erfolgte Rücksprachen"],
      ["Nächste Schritte"],
    ]),
  },

  // ───── Ordnungs- und Erziehungsmaßnahmen
  {
    title: "Dokumentation erzieherischer Einwirkungen",
    template_type: "Dokumentation",
    description: "Dokumentation erzieherischer Einwirkungen unterhalb förmlicher Maßnahmen.",
    body: mkBody("ERZIEHERISCHE EINWIRKUNGEN", [
      ["Anlass"],
      ["Gewählte Einwirkung"],
      ["Begründung"],
      ["Beobachtete Wirkung"],
    ]),
  },
  {
    title: "Sachverhaltsdarstellung vor Entscheidung",
    template_type: "Dokumentation",
    description: "Zusammenfassung des Sachverhalts vor einer Maßnahmenentscheidung.",
    body: mkBody("SACHVERHALTSDARSTELLUNG", [
      ["Sachverhalt (wertungsfrei)"],
      ["Bisherige Maßnahmen"],
      ["Beteiligte Personen"],
      ["Aussagen / Beweise"],
      ["Entscheidungsrelevante Umstände"],
    ]),
  },
  {
    title: "Dokumentation der Verhältnismäßigkeitsprüfung",
    template_type: "Dokumentation",
    description: "Prüfung von Geeignetheit, Erforderlichkeit und Angemessenheit einer Maßnahme.",
    body: mkBody("VERHÄLTNISMÄSSIGKEITSPRÜFUNG", [
      ["Ziel der Maßnahme"],
      ["Geeignetheit"],
      ["Erforderlichkeit (mildere Mittel geprüft)"],
      ["Angemessenheit (Abwägung)"],
      ["Ergebnis"],
    ]),
  },
  {
    title: "Maßnahmenentscheidung",
    template_type: "Dokumentation",
    description: "Formalisierte Dokumentation einer schulischen Maßnahmenentscheidung.",
    body: mkBody("MASSNAHMENENTSCHEIDUNG", [
      ["Beschlossene Maßnahme"],
      ["Sachverhalt"],
      ["Begründung"],
      ["Anhörung erfolgt am"],
      ["Beschlussgremium"],
      ["Rechtsbehelfsbelehrung", "[Rechtsbehelfsbelehrung nach fachlicher Prüfung ergänzen]"],
    ]),
  },
  {
    title: "Verlaufsdokumentation nach einer Maßnahme",
    template_type: "Dokumentation",
    description: "Dokumentation des Verlaufs und der Wirkung nach einer Maßnahme.",
    body: mkBody("VERLAUFSDOKUMENTATION NACH MASSNAHME", [
      ["Getroffene Maßnahme"],
      ["Beobachtungen seit der Maßnahme"],
      ["Rückmeldungen (Schüler:in, Eltern, Kolleg:innen)"],
      ["Weitere Schritte"],
    ]),
  },
  {
    title: "Information der Schulleitung",
    template_type: "Interne Info",
    description: "Formalisierte Information der Schulleitung über einen Vorgang.",
    body: mkBody("INFORMATION SCHULLEITUNG", [
      ["Vorgang"],
      ["Sachverhalt"],
      ["Bereits ergriffene Maßnahmen"],
      ["Bitte um Entscheidung / Rücksprache"],
    ]),
  },
  {
    title: "Dokumentation wiederholten Fehlverhaltens",
    template_type: "Dokumentation",
    description: "Chronologische Dokumentation wiederholten Fehlverhaltens.",
    body: mkBody("WIEDERHOLTES FEHLVERHALTEN", [
      ["Chronologie der Vorfälle"],
      ["Bereits ergriffene Maßnahmen"],
      ["Reaktion der Schüler:in"],
      ["Einschätzung"],
    ]),
  },

  // ───── Gewalt, Bedrohung, Konflikte
  {
    title: "Gewaltvorfall-Dokumentation",
    template_type: "Dokumentation",
    description: "Dokumentation eines Gewaltvorfalls an der Schule.",
    body: mkBody("GEWALTVORFALL", [
      ["Hergang"],
      ["Beteiligte / Zeug:innen"],
      ["Verletzungen / Schäden"],
      ["Sofortmaßnahmen"],
      ["Informierte Stellen"],
    ]),
  },
  {
    title: "Bedrohungslage-Erstvermerk",
    template_type: "Dokumentation",
    description: "Erstvermerk bei einer akuten oder mutmaßlichen Bedrohungslage.",
    body: mkBody("BEDROHUNGSLAGE – ERSTVERMERK", [
      ["Meldung durch"],
      ["Konkrete Äußerungen / Beobachtungen"],
      ["Betroffene Personen"],
      ["Sofortmaßnahmen"],
      ["Informierte Stellen"],
    ]),
  },
  {
    title: "Konfliktprotokoll",
    template_type: "Protokoll",
    description: "Dokumentation eines Konflikts und der Klärungsschritte.",
    body: mkBody("KONFLIKTPROTOKOLL", [
      ["Konfliktparteien"],
      ["Sicht Partei A"],
      ["Sicht Partei B"],
      ["Vereinbarungen"],
    ]),
  },
  {
    title: "Mobbing-Dokumentation",
    template_type: "Dokumentation",
    description: "Systematische Erfassung wiederkehrender Mobbing-Vorfälle.",
    body: mkBody("MOBBING-DOKUMENTATION", [
      ["Betroffene Person"],
      ["Beteiligte Personen"],
      ["Chronologie der Vorfälle"],
      ["Beobachtete Muster"],
      ["Schutzmaßnahmen"],
    ]),
  },
  {
    title: "Cybermobbing-Dokumentation",
    template_type: "Dokumentation",
    description: "Dokumentation digitaler Mobbing-Vorfälle inkl. Kanäle und Inhalte.",
    body: mkBody("CYBERMOBBING-DOKUMENTATION", [
      ["Betroffene Person"],
      ["Beteiligte Accounts / Personen"],
      ["Genutzte Plattform(en)"],
      ["Chronologie / Screenshots (sicher verwahrt)"],
      ["Schutzmaßnahmen"],
    ]),
  },
  {
    title: "Dokumentation körperlicher Auseinandersetzung",
    template_type: "Dokumentation",
    description: "Dokumentation einer körperlichen Auseinandersetzung inkl. Verletzungen.",
    body: mkBody("KÖRPERLICHE AUSEINANDERSETZUNG", [
      ["Hergang"],
      ["Beteiligte / Zeug:innen"],
      ["Verletzungen (soweit sichtbar)"],
      ["Sofortmaßnahmen / Erste Hilfe"],
      ["Informierte Stellen"],
    ]),
  },
  {
    title: "Zeugenaussage / Beobachtungsprotokoll",
    template_type: "Protokoll",
    description: "Protokoll einer Zeugenaussage oder externen Beobachtung.",
    body: mkBody("ZEUGENAUSSAGE / BEOBACHTUNG", [
      ["Beobachtende Person"],
      ["Beobachtung (wortnah, wertungsfrei)"],
      ["Standpunkt / Sichtwinkel"],
      ["Weitere Angaben"],
    ]),
  },
  {
    title: "Sicherungs- und Schutzmaßnahmen-Protokoll",
    template_type: "Protokoll",
    description: "Protokoll ergriffener Sicherungs- und Schutzmaßnahmen.",
    body: mkBody("SICHERUNGS- UND SCHUTZMASSNAHMEN", [
      ["Gefährdungslage"],
      ["Ergriffene Sicherungsmaßnahmen"],
      ["Ergriffene Schutzmaßnahmen für Betroffene"],
      ["Informierte Stellen"],
    ]),
  },

  // ───── Digitale Medien und Datenschutz
  {
    title: "Dokumentation unerlaubter Fotoaufnahme",
    template_type: "Dokumentation",
    description: "Dokumentation einer unerlaubten Fotoaufnahme im Schulkontext.",
    body: mkBody("UNERLAUBTE FOTOAUFNAHME", [
      ["Aufnahmesituation"],
      ["Aufnehmende Person"],
      ["Betroffene Personen"],
      ["Verbreitungsweg (falls bekannt)"],
      ["Getroffene Sofortmaßnahmen"],
    ]),
  },
  {
    title: "Dokumentation unerlaubter Videoaufnahme",
    template_type: "Dokumentation",
    description: "Dokumentation einer heimlichen oder unerlaubten Videoaufnahme.",
    body: mkBody("UNERLAUBTE VIDEOAUFNAHME", [
      ["Aufnahmesituation"],
      ["Aufnehmende Person"],
      ["Betroffene Personen"],
      ["Verbreitungsweg (falls bekannt)"],
      ["Sicherung / Umgang mit dem Gerät"],
      ["Getroffene Sofortmaßnahmen"],
    ]),
  },
  {
    title: "Dokumentation unerlaubter Tonaufnahme",
    template_type: "Dokumentation",
    description: "Dokumentation einer unerlaubten Ton- oder Sprachaufnahme.",
    body: mkBody("UNERLAUBTE TONAUFNAHME", [
      ["Aufnahmesituation"],
      ["Aufnehmende Person"],
      ["Betroffene Personen"],
      ["Verbreitungsweg (falls bekannt)"],
      ["Getroffene Sofortmaßnahmen"],
    ]),
  },
  {
    title: "Social-Media-Vorfall",
    template_type: "Dokumentation",
    description: "Dokumentation eines Vorfalls in sozialen Netzwerken oder Messengern.",
    body: mkBody("SOCIAL-MEDIA-VORFALL", [
      ["Betroffene Plattform"],
      ["Beteiligte Accounts / Personen"],
      ["Inhalt (Beschreibung, keine Weiterverbreitung)"],
      ["Beweissicherung (Screenshot dienstlich verwahrt)"],
      ["Sofortmaßnahmen"],
    ]),
  },
  {
    title: "Dokumentation möglicher Persönlichkeitsrechtsverletzung",
    template_type: "Dokumentation",
    description: "Sachliche Dokumentation eines möglichen Eingriffs in Persönlichkeitsrechte.",
    body: mkBody("MÖGLICHE PERSÖNLICHKEITSRECHTSVERLETZUNG", [
      ["Beobachteter Sachverhalt"],
      ["Betroffene Person(en)"],
      ["Vermutete Verantwortliche"],
      ["Verbreitung / Reichweite"],
      ["Weiteres Vorgehen"],
    ]),
  },
  {
    title: "Dokumentation Smartphone-Missbrauch",
    template_type: "Dokumentation",
    description: "Dokumentation einer regelwidrigen Smartphone-Nutzung im Unterricht.",
    body: mkBody("SMARTPHONE-MISSBRAUCH", [
      ["Situation"],
      ["Beobachteter Nutzungszweck"],
      ["Umgang mit dem Gerät (Sichtverwahrung, Rückgabe)"],
      ["Sofortmaßnahmen"],
    ]),
  },
  {
    title: "Meldung eines Datenschutzvorfalls",
    template_type: "Meldung",
    description: "Formelle Meldung eines Datenschutzvorfalls an die zuständige Stelle.",
    body: mkBody("MELDUNG DATENSCHUTZVORFALL", [
      ["Art des Vorfalls"],
      ["Betroffene Daten / Personen"],
      ["Zeitpunkt der Kenntnisnahme"],
      ["Ergriffene Sofortmaßnahmen"],
      ["Meldung an DSB / Aufsichtsbehörde"],
    ]),
  },

  // ───── Fehlzeiten und Schulpflicht
  {
    title: "Dokumentation unentschuldigter Fehlzeiten",
    template_type: "Dokumentation",
    description: "Dokumentation konkreter unentschuldigter Fehlzeiten.",
    body: mkBody("UNENTSCHULDIGTE FEHLZEITEN", [
      ["Zeitraum"],
      ["Betroffene Stunden / Tage"],
      ["Bereits erfolgte Kontaktversuche"],
      ["Reaktion der Erziehungsberechtigten"],
      ["Nächste Schritte"],
    ]),
  },
  {
    title: "Gesprächsprotokoll Schulpflichtverletzung",
    template_type: "Protokoll",
    description: "Gesprächsprotokoll bei mutmaßlicher Schulpflichtverletzung.",
    body: mkBody("GESPRÄCH SCHULPFLICHTVERLETZUNG", [
      ["Teilnehmende"],
      ["Sachverhalt"],
      ["Sicht der Beteiligten"],
      ["Vereinbarungen"],
      ["Nächster Termin"],
    ]),
  },
  {
    title: "Maßnahmenverlauf bei Schulabsentismus",
    template_type: "Dokumentation",
    description: "Chronologische Übersicht ergriffener Maßnahmen bei Schulabsentismus.",
    body: mkBody("MASSNAHMENVERLAUF SCHULABSENTISMUS", [
      ["Ausgangssituation"],
      ["Chronologie der Maßnahmen"],
      ["Beteiligte Stellen"],
      ["Wirkung / weiterer Bedarf"],
    ]),
  },
  {
    title: "Dokumentation wiederholter Verspätungen",
    template_type: "Dokumentation",
    description: "Dokumentation wiederholter Verspätungen einer Schüler:in.",
    body: mkBody("WIEDERHOLTE VERSPÄTUNGEN", [
      ["Zeitraum"],
      ["Chronologie der Verspätungen"],
      ["Erklärungen der Schüler:in"],
      ["Bereits ergriffene Maßnahmen"],
      ["Nächste Schritte"],
    ]),
  },

  // ───── Aufsicht und Schulalltag
  {
    title: "Dokumentation eines Aufsichtsvorfalls",
    template_type: "Dokumentation",
    description: "Dokumentation eines Vorfalls während der Aufsichtszeit.",
    body: mkBody("AUFSICHTSVORFALL", [
      ["Aufsichtszeit / Bereich"],
      ["Hergang"],
      ["Beteiligte / Zeug:innen"],
      ["Sofortmaßnahmen"],
    ]),
  },
  {
    title: "Übergabe der Aufsicht",
    template_type: "Notiz",
    description: "Vermerk zur Übergabe der Aufsicht an eine andere Lehrkraft.",
    body: mkBody("AUFSICHTSÜBERGABE", [
      ["Übergebende Lehrkraft"],
      ["Übernehmende Lehrkraft"],
      ["Aufsichtsbereich / -zeit"],
      ["Besonderheiten"],
    ]),
  },
  {
    title: "Dokumentation einer Aufsichtspflichtverletzung",
    template_type: "Dokumentation",
    description: "Dokumentation einer mutmaßlichen Aufsichtspflichtverletzung.",
    body: mkBody("AUFSICHTSPFLICHTVERLETZUNG", [
      ["Aufsichtssituation"],
      ["Beobachteter Sachverhalt"],
      ["Folgen"],
      ["Weitere Schritte"],
    ]),
  },
  {
    title: "Vorfall während Pause",
    template_type: "Dokumentation",
    description: "Vorfall während der Pausenaufsicht.",
    body: mkBody("VORFALL PAUSE", [
      ["Pausenzeit / Bereich"],
      ["Hergang"],
      ["Beteiligte"],
      ["Sofortmaßnahmen"],
    ]),
  },
  {
    title: "Vorfall während Unterricht",
    template_type: "Dokumentation",
    description: "Vorfall im laufenden Unterricht.",
    body: mkBody("VORFALL UNTERRICHT", [
      ["Fach / Stunde"],
      ["Hergang"],
      ["Beteiligte"],
      ["Sofortmaßnahmen"],
    ]),
  },
  {
    title: "Vorfall auf Schulgelände",
    template_type: "Dokumentation",
    description: "Vorfall auf dem Schulgelände außerhalb des Unterrichts.",
    body: mkBody("VORFALL SCHULGELÄNDE", [
      ["Ort auf dem Schulgelände"],
      ["Hergang"],
      ["Beteiligte"],
      ["Sofortmaßnahmen"],
    ]),
  },
  {
    title: "Vorfall bei Schulveranstaltung",
    template_type: "Dokumentation",
    description: "Vorfall im Rahmen einer Schulveranstaltung.",
    body: mkBody("VORFALL SCHULVERANSTALTUNG", [
      ["Veranstaltung"],
      ["Hergang"],
      ["Beteiligte"],
      ["Sofortmaßnahmen"],
      ["Informierte Stellen"],
    ]),
  },
  {
    title: "Vorfall auf Klassenfahrt",
    template_type: "Dokumentation",
    description: "Vorfall während einer Klassenfahrt oder mehrtägigen Exkursion.",
    body: mkBody("VORFALL KLASSENFAHRT", [
      ["Fahrtziel / Zeitraum"],
      ["Hergang"],
      ["Beteiligte"],
      ["Sofortmaßnahmen"],
      ["Information an Schulleitung / Eltern"],
    ]),
  },

  // ───── Unfall und Gesundheit
  {
    title: "Schulunfall-Erstvermerk",
    template_type: "Meldung",
    description: "Erstvermerk zu einem Schulunfall vor Meldung an den Unfallversicherungsträger.",
    body: mkBody("SCHULUNFALL – ERSTVERMERK", [
      ["Verletzte Person"],
      ["Hergang"],
      ["Verletzungen"],
      ["Erste Hilfe"],
      ["Weiterleitung / Arzt"],
    ]),
  },
  {
    title: "Unfallhergang-Dokumentation",
    template_type: "Dokumentation",
    description: "Ausführliche Beschreibung des Unfallhergangs.",
    body: mkBody("UNFALLHERGANG", [
      ["Situation vor dem Unfall"],
      ["Unfallhergang"],
      ["Zeug:innen"],
      ["Sicht der Beteiligten"],
    ]),
  },
  {
    title: "Erste-Hilfe-Dokumentation",
    template_type: "Dokumentation",
    description: "Dokumentation geleisteter Erste-Hilfe-Maßnahmen.",
    body: mkBody("ERSTE-HILFE-DOKUMENTATION", [
      ["Betroffene Person"],
      ["Symptome / Verletzungen"],
      ["Geleistete Erste Hilfe"],
      ["Ersthelfer:in"],
      ["Weiterleitung"],
    ]),
  },
  {
    title: "Information der Erziehungsberechtigten nach Unfall",
    template_type: "Anschreiben",
    description: "Information der Erziehungsberechtigten über einen Schulunfall.",
    body: mkBody("INFORMATION ELTERN NACH UNFALL", [
      ["Sachverhalt"],
      ["Verletzungen (soweit bekannt)"],
      ["Ergriffene Maßnahmen"],
      ["Empfohlene nächste Schritte"],
    ]),
  },
  {
    title: "Dokumentation medizinischer Notfall",
    template_type: "Dokumentation",
    description: "Dokumentation eines akuten medizinischen Notfalls.",
    body: mkBody("MEDIZINISCHER NOTFALL", [
      ["Betroffene Person"],
      ["Symptome"],
      ["Verlauf"],
      ["Notruf / eingesetzte Kräfte"],
      ["Informierte Stellen"],
    ]),
  },
  {
    title: "Dokumentation Medikamentengabe",
    template_type: "Dokumentation",
    description: "Dokumentation der Verabreichung von Medikamenten in der Schule.",
    body: mkBody("MEDIKAMENTENGABE", [
      ["Schüler:in"],
      ["Medikament / Dosierung"],
      ["Grundlage (ärztliche Anordnung, Einwilligung)"],
      ["Verabreichende Person"],
      ["Beobachtungen"],
    ]),
  },
  {
    title: "Dokumentation gesundheitlicher Auffälligkeiten",
    template_type: "Dokumentation",
    description: "Vertrauliche Dokumentation beobachteter gesundheitlicher Auffälligkeiten.",
    body: mkBody("GESUNDHEITLICHE AUFFÄLLIGKEITEN", [
      ["Beobachtete Symptome"],
      ["Häufigkeit / Muster"],
      ["Bereits erfolgte Rücksprachen"],
      ["Weiteres Vorgehen"],
    ]),
  },

  // ───── Sachbeschädigung und Diebstahl
  {
    title: "Sachbeschädigungsprotokoll",
    template_type: "Protokoll",
    description: "Protokoll einer Sachbeschädigung an schulischem Eigentum.",
    body: mkBody("SACHBESCHÄDIGUNGSPROTOKOLL", [
      ["Beschädigter Gegenstand / Raum"],
      ["Umfang des Schadens"],
      ["Mutmaßlicher Hergang"],
      ["Beteiligte / Zeug:innen"],
    ]),
  },
  {
    title: "Dokumentation Vandalismus",
    template_type: "Dokumentation",
    description: "Dokumentation von Vandalismus an der Schule.",
    body: mkBody("VANDALISMUS", [
      ["Betroffener Bereich"],
      ["Art der Beschädigung"],
      ["Zeitraum der Entdeckung"],
      ["Beteiligte / Verdachtsmomente"],
    ]),
  },
  {
    title: "Schadensmeldung",
    template_type: "Meldung",
    description: "Formalisierte Schadensmeldung an den Schulträger.",
    body: mkBody("SCHADENSMELDUNG", [
      ["Schadensart"],
      ["Beschädigter Gegenstand"],
      ["Ungefährer Schadenswert"],
      ["Mutmaßliche Ursache"],
      ["Empfänger:in der Meldung"],
    ]),
  },
  {
    title: "Dokumentation Diebstahlsverdacht",
    template_type: "Dokumentation",
    description: "Dokumentation eines Diebstahls oder Diebstahlsverdachts.",
    body: mkBody("DIEBSTAHLSVERDACHT", [
      ["Entwendeter Gegenstand"],
      ["Ort / Zeitraum"],
      ["Betroffene Person"],
      ["Beobachtungen"],
      ["Verdachtsmomente (wertungsfrei)"],
    ]),
  },
  {
    title: "Fund- und Verlustdokumentation",
    template_type: "Notiz",
    description: "Dokumentation von Fund- und Verlustsachen.",
    body: mkBody("FUND / VERLUST", [
      ["Gegenstand"],
      ["Fund- / Verlustort"],
      ["Meldende Person"],
      ["Verwahrort"],
      ["Abholung / Rückgabe"],
    ]),
  },
  {
    title: "Übergabe sichergestellter Gegenstände",
    template_type: "Protokoll",
    description: "Protokoll zur Übergabe sichergestellter Gegenstände.",
    body: mkBody("ÜBERGABE SICHERGESTELLTER GEGENSTÄNDE", [
      ["Gegenstand"],
      ["Sicherstellungsgrund"],
      ["Übergabe an"],
      ["Zustand bei Übergabe"],
    ]),
  },

  // ───── Prüfungen und Leistungsbewertung
  {
    title: "Dokumentation Prüfungsstörung",
    template_type: "Dokumentation",
    description: "Dokumentation einer Störung während einer Prüfung.",
    body: mkBody("PRÜFUNGSSTÖRUNG", [
      ["Prüfung / Fach"],
      ["Art der Störung"],
      ["Beteiligte"],
      ["Getroffene Maßnahmen"],
    ]),
  },
  {
    title: "Dokumentation Täuschungsversuch",
    template_type: "Dokumentation",
    description: "Dokumentation eines mutmaßlichen Täuschungsversuchs.",
    body: mkBody("TÄUSCHUNGSVERSUCH", [
      ["Prüfung / Fach"],
      ["Beobachtete Handlung"],
      ["Verwendete Hilfsmittel"],
      ["Sichergestellte Beweismittel"],
      ["Aufsichtsführende Lehrkraft"],
    ]),
  },
  {
    title: "Anhörung bei Täuschungsverdacht",
    template_type: "Formular",
    description: "Anhörung der Schüler:in bei einem Täuschungsverdacht.",
    body: mkBody("ANHÖRUNG BEI TÄUSCHUNGSVERDACHT", [
      ["Vorwurf"],
      ["Stellungnahme der Schüler:in"],
      ["Anwesende Personen"],
      ["Weiteres Vorgehen"],
    ]),
  },
  {
    title: "Bewertungsdokumentation",
    template_type: "Dokumentation",
    description: "Dokumentation der Grundlagen einer Leistungsbewertung.",
    body: mkBody("BEWERTUNGSDOKUMENTATION", [
      ["Bewertungsanlass"],
      ["Bewertungskriterien"],
      ["Beobachtete Leistungen"],
      ["Ergebnis / Note"],
    ]),
  },
  {
    title: "Gesprächsprotokoll Leistungsbeschwerde",
    template_type: "Protokoll",
    description: "Protokoll eines Gesprächs zu einer Beschwerde über eine Leistungsbewertung.",
    body: mkBody("BESCHWERDEGESPRÄCH LEISTUNGSBEWERTUNG", [
      ["Anlass der Beschwerde"],
      ["Sicht der Schüler:in / Eltern"],
      ["Sicht der Lehrkraft"],
      ["Ergebnis"],
    ]),
  },
  {
    title: "Dokumentation Nachteilsausgleich",
    template_type: "Dokumentation",
    description: "Dokumentation eines gewährten Nachteilsausgleichs.",
    body: mkBody("NACHTEILSAUSGLEICH", [
      ["Schüler:in"],
      ["Grundlage (Gutachten, Bescheid)"],
      ["Gewährte Anpassungen"],
      ["Gültigkeit / Überprüfung"],
    ]),
  },

  // ───── Schulleitung und interne Kommunikation
  {
    title: "Entscheidungsvorlage für die Schulleitung",
    template_type: "Vorlage",
    description: "Strukturierte Vorlage für eine Entscheidung der Schulleitung.",
    body: mkBody("ENTSCHEIDUNGSVORLAGE SCHULLEITUNG", [
      ["Fragestellung / Anlass"],
      ["Sachverhalt"],
      ["Handlungsoptionen"],
      ["Empfehlung"],
      ["Erforderliche Entscheidung"],
    ]),
  },
  {
    title: "Sachstandsbericht",
    template_type: "Bericht",
    description: "Zusammenfassender Sachstandsbericht zu einem laufenden Vorgang.",
    body: mkBody("SACHSTANDSBERICHT", [
      ["Vorgang"],
      ["Bisheriger Verlauf"],
      ["Aktueller Sachstand"],
      ["Nächste Schritte"],
    ]),
  },
  {
    title: "Interne Fallübergabe",
    template_type: "Notiz",
    description: "Übergabe eines Falls an eine andere interne Zuständigkeit.",
    body: mkBody("INTERNE FALLÜBERGABE", [
      ["Fall"],
      ["Bisheriger Sachstand"],
      ["Offene Punkte"],
      ["Übergabe an"],
    ]),
  },
  {
    title: "Dokumentation einer Fallbesprechung",
    template_type: "Protokoll",
    description: "Protokoll einer kollegialen Fallbesprechung.",
    body: mkBody("FALLBESPRECHUNG", [
      ["Teilnehmende"],
      ["Anlass"],
      ["Inhalte / Sichtweisen"],
      ["Vereinbarungen"],
      ["Nächster Schritt"],
    ]),
  },
  {
    title: "Protokoll schulisches Beratungsgespräch",
    template_type: "Protokoll",
    description: "Protokoll eines schulischen Beratungsgesprächs (Beratungslehrkraft, SoPäd, Schulsozialarbeit).",
    body: mkBody("SCHULISCHES BERATUNGSGESPRÄCH", [
      ["Beratungssetting"],
      ["Anlass"],
      ["Wesentliche Inhalte"],
      ["Vereinbarungen"],
      ["Folgetermin"],
    ]),
  },

  // ═════════════════════════════════════════════════════════════
  // PREMIUM-VORLAGEN (besonders geeignet für fallspezifische KI)
  // ═════════════════════════════════════════════════════════════
  {
    title: "Fallspezifischer Maßnahmenplan",
    template_type: "Plan",
    description:
      "Strukturierter, fallbezogener Plan mit Zielen, Maßnahmen, Zuständigkeiten, Fristen und Überprüfung.",
    aliases: ["maßnahmenplan (fallspezifisch)", "individueller maßnahmenplan"],
    body: mkBody("FALLSPEZIFISCHER MASSNAHMENPLAN", [
      ["Ausgangssituation / Sachverhalt"],
      ["Ziel des Plans"],
      ["Handlungsleitende Rechtsgrundlagen", "[Zugeordnete Rechtsgrundlagen ergänzen]"],
      ["Maßnahme 1 (Verantwortlich, Frist)"],
      ["Maßnahme 2 (Verantwortlich, Frist)"],
      ["Maßnahme 3 (Verantwortlich, Frist)"],
      ["Beteiligte Stellen / Kooperationspartner"],
      ["Erfolgskriterien"],
      ["Überprüfung am"],
      ["Eskalationspfad bei Nichterreichung"],
    ]),
  },
  {
    title: "Rechtliche Prüfdokumentation",
    template_type: "Prüfblatt",
    description:
      "Strukturierte Prüfung der Rechtsgrundlage, Zuständigkeit, Verfahrensvoraussetzungen und Ermessensausübung.",
    aliases: ["rechtsprüfung", "rechtliches prüfblatt"],
    body: mkBody("RECHTLICHE PRÜFDOKUMENTATION", [
      ["Sachverhalt (wertungsfrei)"],
      ["Einschlägige Rechtsgrundlagen", "[Zugeordnete Rechtsgrundlagen ergänzen]"],
      ["Tatbestandsmerkmale (subsumiert)"],
      ["Zuständigkeit geprüft"],
      ["Verfahrensvoraussetzungen (Anhörung, Fristen, Form)"],
      ["Ermessen (Entschließungs- / Auswahlermessen)"],
      ["Verhältnismäßigkeit (geeignet, erforderlich, angemessen)"],
      ["Ergebnis der rechtlichen Prüfung"],
      ["Empfohlene Entscheidung"],
    ]),
  },
  {
    title: "Chronologische Fallakte",
    template_type: "Fallakte",
    description:
      "Fortlaufende chronologische Akte zu einem Fall: alle Ereignisse, Kontakte, Maßnahmen und Entscheidungen.",
    aliases: ["fallakte", "chronologische akte"],
    body: mkBody("CHRONOLOGISCHE FALLAKTE", [
      ["Fallbezeichnung"],
      ["Beteiligte Personen (Rollen)"],
      ["Zeitleiste (Datum → Ereignis / Maßnahme / Kontakt)"],
      ["Zugeordnete Rechtsgrundlagen", "[Zugeordnete Rechtsgrundlagen ergänzen]"],
      ["Zwischenstände / Bewertungen"],
      ["Offene Punkte"],
      ["Wiedervorlage am"],
    ]),
  },
  {
    title: "Entscheidungsvorlage Schulleitung (strukturiert)",
    template_type: "Vorlage",
    description:
      "Premium-Entscheidungsvorlage mit Sachverhalt, Rechtsprüfung, Optionenvergleich, Empfehlung und Beschlussformel.",
    aliases: [
      "entscheidungsvorlage für die schulleitung",
      "entscheidungsvorlage schulleitung",
    ],
    body: mkBody("ENTSCHEIDUNGSVORLAGE (SCHULLEITUNG)", [
      ["Anlass / Fragestellung"],
      ["Sachverhalt (kompakt)"],
      ["Rechtsgrundlagen", "[Zugeordnete Rechtsgrundlagen ergänzen]"],
      ["Handlungsoption A – Vor-/Nachteile"],
      ["Handlungsoption B – Vor-/Nachteile"],
      ["Handlungsoption C – Vor-/Nachteile"],
      ["Abwägung / Verhältnismäßigkeit"],
      ["Empfehlung"],
      ["Erforderlicher Beschluss (Formulierungsvorschlag)"],
      ["Rechtsbehelfsbelehrung", "[Rechtsbehelfsbelehrung nach fachlicher Prüfung ergänzen]"],
    ]),
  },
  {
    title: "Verfahrenscheckliste",
    template_type: "Checkliste",
    description:
      "Schritt-für-Schritt-Checkliste für ein schulrechtliches Verfahren (Sachverhalt → Anhörung → Entscheidung → Bekanntgabe).",
    aliases: ["checkliste schulrechtliches verfahren"],
    body: mkBody("VERFAHRENSCHECKLISTE", [
      ["1. Sachverhalt festgestellt (Datum, Fundstellen)"],
      ["2. Zuständigkeit geprüft"],
      ["3. Rechtsgrundlagen identifiziert", "[Zugeordnete Rechtsgrundlagen ergänzen]"],
      ["4. Anhörung nach § 28 VwVfG NRW durchgeführt"],
      ["5. Ermessen / Verhältnismäßigkeit dokumentiert"],
      ["6. Entscheidung getroffen und begründet"],
      ["7. Bekanntgabe / Zustellung erfolgt"],
      ["8. Rechtsbehelfsbelehrung beigefügt"],
      ["9. Fristen / Wiedervorlage vermerkt"],
      ["10. Abschlussvermerk"],
    ]),
  },

  // ═════════════════════════════════════════════════════════════
  // Schutz und Gefährdung (Ergänzungen)
  // ═════════════════════════════════════════════════════════════
  {
    title: "Strukturierte Gefährdungseinschätzung",
    template_type: "Dokumentation",
    description:
      "Erweitertes Formular zur strukturierten Einschätzung einer Kindeswohlgefährdung (Risiko- und Schutzfaktoren).",
    aliases: ["gefährdungseinschätzung strukturiert"],
    body: mkBody("STRUKTURIERTE GEFÄHRDUNGSEINSCHÄTZUNG (vertraulich)", [
      ["Anlass / Meldung"],
      ["Konkrete Beobachtungen (wortnah)"],
      ["Äußerungen der Betroffenen"],
      ["Risikofaktoren"],
      ["Schutzfaktoren / Ressourcen"],
      ["Kollegiale Fallberatung / insoFa"],
      ["Einschätzung Gefährdungsgrad"],
      ["Erforderliche Sofortmaßnahmen"],
      ["Information / Übergabe an Jugendamt"],
    ]),
  },
  {
    title: "Schutz- und Maßnahmenplan",
    template_type: "Plan",
    description: "Konkreter Schutzplan mit Verantwortlichkeiten und Überprüfungsintervallen.",
    body: mkBody("SCHUTZ- UND MASSNAHMENPLAN (vertraulich)", [
      ["Betroffene Person"],
      ["Aktuelle Gefährdungslage"],
      ["Sofortige Schutzmaßnahmen"],
      ["Mittelfristige Maßnahmen"],
      ["Verantwortliche Personen"],
      ["Beteiligte externe Stellen"],
      ["Überprüfung am"],
    ]),
  },
  {
    title: "Dokumentation akuter Selbst- oder Fremdgefährdung",
    template_type: "Dokumentation",
    description: "Dokumentation einer akuten Selbst- oder Fremdgefährdung mit Sofortmaßnahmen.",
    aliases: [
      "dokumentation akuter selbstgefährdung",
      "dokumentation fremdgefährdung",
      "dokumentation suizidäußerung",
    ],
    body: mkBody("AKUTE SELBST-/FREMDGEFÄHRDUNG (vertraulich)", [
      ["Art der Gefährdung"],
      ["Konkrete Äußerungen / Beobachtungen (wortnah)"],
      ["Betroffene / gefährdete Personen"],
      ["Sofortmaßnahmen"],
      ["Verständigte Stellen (Eltern, Notarzt, Polizei, Beratungsstellen)"],
      ["Weiteres Vorgehen"],
    ]),
  },
  {
    title: "Dokumentation Waffenfund oder Waffenverdacht",
    template_type: "Dokumentation",
    description: "Dokumentation eines Waffenfundes oder eines Waffenverdachts an der Schule.",
    aliases: ["dokumentation waffenfund", "dokumentation waffenverdacht"],
    body: mkBody("WAFFENFUND / WAFFENVERDACHT", [
      ["Gegenstand / Beschreibung"],
      ["Fundort / Kontext"],
      ["Beteiligte / Zeug:innen"],
      ["Sicherung des Gegenstands"],
      ["Verständigte Stellen (SL, Polizei)"],
      ["Weiteres Vorgehen"],
    ]),
  },
  {
    title: "Dokumentation sexualisierter Gewalt (Verdacht)",
    template_type: "Dokumentation",
    description:
      "Vertrauliche Dokumentation eines Verdachts auf sexualisierte Gewalt nach dem Schutzkonzept.",
    body: mkBody("VERDACHT SEXUALISIERTER GEWALT (streng vertraulich)", [
      ["Wahrnehmung / Meldung"],
      ["Konkrete Beobachtungen (wortnah)"],
      ["Betroffene Person"],
      ["Verdachtsperson (nur, wenn benannt)"],
      ["Beratung Fachstelle / insoFa"],
      ["Sofortmaßnahmen zum Schutz"],
      ["Weiteres Vorgehen nach Schutzkonzept"],
    ]),
  },
  {
    title: "Dokumentation Diskriminierung / rassistischer Vorfall",
    template_type: "Dokumentation",
    description: "Dokumentation eines diskriminierenden oder rassistischen Vorfalls.",
    aliases: ["dokumentation diskriminierung", "dokumentation rassistischer vorfall"],
    body: mkBody("DISKRIMINIERUNG / RASSISTISCHER VORFALL", [
      ["Sachverhalt"],
      ["Betroffene Person(en)"],
      ["Handelnde Person(en)"],
      ["Zeug:innen"],
      ["Sofortmaßnahmen / Solidarität mit Betroffenen"],
      ["Nachbereitung"],
    ]),
  },
  {
    title: "Dokumentation Extremismus- oder Radikalisierungsverdacht",
    template_type: "Dokumentation",
    description:
      "Sachliche Dokumentation von Anzeichen für eine mögliche Radikalisierung oder extremistische Bezüge.",
    aliases: [
      "dokumentation extremismusverdacht",
      "dokumentation radikalisierungsverdacht",
    ],
    body: mkBody("EXTREMISMUS-/RADIKALISIERUNGSVERDACHT (vertraulich)", [
      ["Beobachtete Anzeichen (wertungsfrei, wortnah)"],
      ["Kontext / Zeitraum"],
      ["Beteiligte Personen"],
      ["Kollegiale Beratung"],
      ["Kontakt zu Fach-/Beratungsstellen"],
      ["Weiteres Vorgehen"],
    ]),
  },

  // ═════════════════════════════════════════════════════════════
  // Schulrechtliche Verfahren (Ergänzungen)
  // ═════════════════════════════════════════════════════════════
  {
    title: "Zuständigkeitsprüfung",
    template_type: "Prüfblatt",
    description: "Prüfung der sachlichen und örtlichen Zuständigkeit vor einer Entscheidung.",
    body: mkBody("ZUSTÄNDIGKEITSPRÜFUNG", [
      ["Anlass"],
      ["Betroffene Person / Sache"],
      ["Sachliche Zuständigkeit (Rechtsgrundlage)"],
      ["Örtliche Zuständigkeit"],
      ["Ergebnis"],
    ]),
  },
  {
    title: "Ermessensdokumentation",
    template_type: "Dokumentation",
    description: "Dokumentation der Ermessensausübung (Entschließungs- und Auswahlermessen).",
    body: mkBody("ERMESSENSDOKUMENTATION", [
      ["Sachverhalt"],
      ["Rechtsgrundlage mit Ermessensspielraum"],
      ["Entschließungsermessen (Handeln ja/nein)"],
      ["Auswahlermessen (welche Maßnahme)"],
      ["Abwägungsgründe"],
      ["Ergebnis"],
    ]),
  },
  {
    title: "Fristenkontrolle",
    template_type: "Checkliste",
    description: "Übersicht relevanter Fristen in einem laufenden Verfahren.",
    body: mkBody("FRISTENKONTROLLE", [
      ["Vorgang"],
      ["Beginn der Frist"],
      ["Fristart (Anhörung, Rechtsbehelf, Wiedervorlage)"],
      ["Ablauf der Frist"],
      ["Erinnerung am"],
      ["Status"],
    ]),
  },
  {
    title: "Abschlussvermerk schulrechtliches Verfahren",
    template_type: "Vermerk",
    description: "Abschließender Vermerk zu einem beendeten schulrechtlichen Verfahren.",
    aliases: ["abschlussvermerk", "fallabschluss-dokumentation"],
    body: mkBody("ABSCHLUSSVERMERK VERFAHREN", [
      ["Verfahrensgegenstand"],
      ["Wesentlicher Verlauf"],
      ["Getroffene Entscheidung"],
      ["Rechtsgrundlage", "[Zugeordnete Rechtsgrundlagen ergänzen]"],
      ["Bekanntgabe / Zustellung"],
      ["Aktenschluss am"],
    ]),
  },

  // ═════════════════════════════════════════════════════════════
  // Beschwerden und Konflikte (Ergänzungen)
  // ═════════════════════════════════════════════════════════════
  {
    title: "Beschwerdeaufnahme",
    template_type: "Formular",
    description: "Strukturierte Aufnahme einer Beschwerde mit Anliegen und Erwartung.",
    aliases: ["beschwerdeprotokoll"],
    body: mkBody("BESCHWERDEAUFNAHME", [
      ["Beschwerdeführer:in"],
      ["Beschwerdegegenstand"],
      ["Bereits erfolgte Klärungsversuche"],
      ["Erwartung / gewünschtes Ergebnis"],
      ["Zuständige Stelle für die Bearbeitung"],
      ["Frist zur Rückmeldung"],
    ]),
  },
  {
    title: "Stellungnahme einer Lehrkraft",
    template_type: "Formular",
    description: "Schriftliche Stellungnahme einer Lehrkraft zu einem Vorfall oder einer Beschwerde.",
    body: mkBody("STELLUNGNAHME LEHRKRAFT", [
      ["Anlass"],
      ["Sachverhalt aus Sicht der Lehrkraft"],
      ["Pädagogische / rechtliche Einordnung"],
      ["Vorgeschlagenes weiteres Vorgehen"],
    ]),
  },
  {
    title: "Stellungnahme Erziehungsberechtigte",
    template_type: "Formular",
    description: "Schriftliche Stellungnahme der Erziehungsberechtigten.",
    body: mkBody("STELLUNGNAHME ERZIEHUNGSBERECHTIGTE", [
      ["Anlass"],
      ["Sachverhalt aus Sicht der Erziehungsberechtigten"],
      ["Erklärungen / Erwartungen"],
      ["Vorschläge"],
    ]),
  },
  {
    title: "Mediationsprotokoll",
    template_type: "Protokoll",
    description: "Protokoll einer Mediation oder eines strukturierten Klärungsgesprächs.",
    body: mkBody("MEDIATIONSPROTOKOLL", [
      ["Konfliktparteien"],
      ["Mediierende Person"],
      ["Vereinbarte Regeln"],
      ["Sicht Partei A"],
      ["Sicht Partei B"],
      ["Gemeinsame Vereinbarung"],
      ["Überprüfung am"],
    ]),
  },

  // ═════════════════════════════════════════════════════════════
  // Digitalisierung und KI (Ergänzungen)
  // ═════════════════════════════════════════════════════════════
  {
    title: "Dokumentation KI-Nutzung im Unterricht",
    template_type: "Dokumentation",
    description: "Dokumentation eines konkreten Einsatzes von KI-Werkzeugen im Unterricht.",
    body: mkBody("KI-NUTZUNG IM UNTERRICHT", [
      ["Fach / Lerngruppe"],
      ["Eingesetztes KI-Werkzeug"],
      ["Didaktisches Ziel"],
      ["Datenschutz-/Urheberrechtsprüfung"],
      ["Beobachtungen"],
      ["Weiteres Vorgehen"],
    ]),
  },
  {
    title: "Dokumentation Verdacht auf KI-Täuschung",
    template_type: "Dokumentation",
    description:
      "Dokumentation eines Verdachts auf unerlaubte KI-Nutzung bei Leistungserbringung.",
    body: mkBody("VERDACHT AUF KI-TÄUSCHUNG", [
      ["Leistung / Prüfung"],
      ["Konkrete Auffälligkeiten"],
      ["Vergleichende Indizien"],
      ["Anhörung der Schüler:in"],
      ["Bewertung / weiteres Vorgehen"],
    ]),
  },
  {
    title: "Dokumentation digitaler Beweismittel",
    template_type: "Dokumentation",
    description:
      "Sachgerechte Dokumentation und Sicherung digitaler Beweismittel (Screenshots, Nachrichten).",
    body: mkBody("DIGITALE BEWEISMITTEL", [
      ["Art des Beweismittels"],
      ["Quelle / Kontext"],
      ["Zeitpunkt der Sicherung"],
      ["Verwahrort (dienstlich)"],
      ["Umgang mit Persönlichkeitsrechten"],
    ]),
  },

  // ═════════════════════════════════════════════════════════════
  // Notfall und Krise (Ergänzungen)
  // ═════════════════════════════════════════════════════════════
  {
    title: "Krisenvorfall / Evakuierung",
    template_type: "Dokumentation",
    description: "Dokumentation eines Krisenvorfalls oder einer Evakuierung.",
    aliases: ["krisenvorfall", "evakuierungsvorfall"],
    body: mkBody("KRISENVORFALL / EVAKUIERUNG", [
      ["Art des Vorfalls"],
      ["Alarmierung / Auslöser"],
      ["Ablauf (chronologisch)"],
      ["Beteiligte / betroffene Personen"],
      ["Externe Kräfte (Feuerwehr, Polizei, Rettungsdienst)"],
      ["Nachbereitung / Debriefing"],
    ]),
  },
  {
    title: "Übergabe an Rettungsdienst oder externe Stelle",
    template_type: "Protokoll",
    description: "Übergabeprotokoll an Rettungsdienst, Polizei oder Jugendamt.",
    body: mkBody("ÜBERGABE AN EXTERNE STELLE", [
      ["Übergebender Sachverhalt"],
      ["Betroffene Person"],
      ["Übernehmende Stelle / Person"],
      ["Übergebene Unterlagen / Informationen"],
      ["Uhrzeit der Übergabe"],
    ]),
  },
];

/**
 * Semantische Dublettenerkennung: prüft `existingTitles` (bereits normalisiert)
 * gegen den Seed-Titel und alle Aliase.
 */
function findSemanticDuplicate(
  seed: StandardTemplateSeed,
  existingTitlesLower: Set<string>,
): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const candidates = [seed.title, ...(seed.aliases ?? [])].map(norm);
  for (const c of candidates) {
    if (existingTitlesLower.has(c)) return c;
  }
  return null;
}


export type SeedResult = {
  created: number;
  existing: number;
  semanticSkipped: number;
  failed: number;
  errors: Array<{ title: string; message: string; code?: string }>;
  createdTitles: string[];
  semanticSkippedTitles: Array<{ seed: string; matched: string }>;
  totalCatalog: number;
  totalExistingBefore: number;
};

export async function seedStandardTemplates(): Promise<SeedResult> {
  const result: SeedResult = {
    created: 0,
    existing: 0,
    semanticSkipped: 0,
    failed: 0,
    errors: [],
    createdTitles: [],
    semanticSkippedTitles: [],
    totalCatalog: STANDARD_TEMPLATES.length,
    totalExistingBefore: 0,
  };
  const { data: existingRows, error: exErr } = await supabase
    .from("document_templates")
    .select("title");
  if (exErr) throw exErr;
  const existingLower = new Set(
    (existingRows ?? [])
      .map((r: any) => String(r.title ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  result.totalExistingBefore = existingLower.size;

  for (const seed of STANDARD_TEMPLATES) {
    const key = seed.title.trim().toLowerCase();
    if (existingLower.has(key)) {
      result.existing++;
      continue;
    }
    // Semantische Dublette über Aliase erkennen (überspringt, wenn ein
    // bereits vorhandener Titel semantisch dieselbe Vorlage abdeckt).
    const semMatch = findSemanticDuplicate(seed, existingLower);
    if (semMatch && semMatch !== key) {
      result.semanticSkipped++;
      result.semanticSkippedTitles.push({ seed: seed.title, matched: semMatch });
      continue;
    }
    try {
      const payload = {
        title: seed.title,
        template_type: seed.template_type,
        body: seed.body,
        fields: { description: seed.description, formFields: [] },
        status: "draft",
      };
      const { error } = await (supabase.from("document_templates") as any).insert(payload);
      if (error) throw error;
      result.created++;
      result.createdTitles.push(seed.title);
      existingLower.add(key);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      result.failed++;
      result.errors.push({
        title: seed.title,
        message: err?.message ?? String(e),
        code: err?.code,
      });
      if (import.meta.env.DEV) console.error("[seedStandardTemplates]", seed.title, err);
    }
  }
  return result;
}

