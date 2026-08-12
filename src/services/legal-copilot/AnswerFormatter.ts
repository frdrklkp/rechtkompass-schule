/**
 * Baut das finale CopilotAnswer-Objekt aus roher LLM-JSON-Antwort.
 * Fügt Zitierungen, Disclaimer und Checkliste zusammen.
 */
import { CitationInjector } from "./CitationInjector";
import { DisclaimerBuilder } from "./DisclaimerBuilder";
import { NO_SOURCES_ANSWER, PROMPT_TEMPLATES_VERSION } from "./PromptTemplates";
import type {
  CopilotAnswer,
  CopilotAnswerSections,
  CopilotChecklistItem,
  CopilotConfidence,
  CopilotFollowUp,
  ExplanationMode,
  GroundedChunk,
} from "./types";
import { COPILOT_DOMAIN_VERSION } from "./types";

const EMPTY_SECTIONS: CopilotAnswerSections = {
  kurzantwort: "",
  einordnung: "",
  empfohleneHandlung: [],
  begruendung: "",
  hinweise: [],
  unsicherheiten: [],
  typischeFehler: [],
  naechsteSchritte: [],
  disclaimer: "",
};

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : "")).filter((s) => s.length > 0);
}

export interface RawLlmAnswer {
  answered?: boolean;
  reason?: string | null;
  sections?: Partial<CopilotAnswerSections>;
  citationRefs?: string[];
  checklist?: Array<{ label?: string; role?: string | null }>;
  followUps?: Array<{ code?: string; question?: string; hint?: string }>;
}

export const AnswerFormatter = {
  buildUnanswered(mode: ExplanationMode, reason?: string): CopilotAnswer {
    const dummyConfidence: CopilotConfidence = {
      retrieval: 0, llm: 0, sourceCoverage: 0, reviewStatus: 0, overall: 0, level: "low",
    };
    return {
      answered: false,
      reasonUnanswered: reason ?? NO_SOURCES_ANSWER,
      sections: {
        ...EMPTY_SECTIONS,
        kurzantwort: NO_SOURCES_ANSWER,
        disclaimer: DisclaimerBuilder.build(dummyConfidence),
      },
      citations: [],
      checklist: [],
      followUps: [],
      confidence: dummyConfidence,
      mode,
      promptVersion: PROMPT_TEMPLATES_VERSION,
      domainVersion: COPILOT_DOMAIN_VERSION,
    };
  },

  format(params: {
    raw: RawLlmAnswer;
    grounded: GroundedChunk[];
    confidence: CopilotConfidence;
    mode: ExplanationMode;
  }): CopilotAnswer {
    const { raw, grounded, confidence, mode } = params;
    const answered = Boolean(raw.answered);
    if (!answered) {
      return {
        ...AnswerFormatter.buildUnanswered(mode, raw.reason ?? undefined),
        confidence,
        followUps: (raw.followUps ?? []).map((f, i) => ({
          code: asStr(f.code, `fu_${i}`),
          question: asStr(f.question),
        })).filter((f) => f.question.length > 0),
      };
    }

    const s = raw.sections ?? {};
    const injectedBegruendung = CitationInjector.inject(asStr(s.begruendung), grounded).text;
    const injectedKurz = CitationInjector.inject(asStr(s.kurzantwort), grounded).text;
    const injectedEinordnung = CitationInjector.inject(asStr(s.einordnung), grounded).text;
    const sections: CopilotAnswerSections = {
      kurzantwort: injectedKurz,
      einordnung: injectedEinordnung,
      empfohleneHandlung: asStrArr(s.empfohleneHandlung),
      begruendung: injectedBegruendung,
      hinweise: asStrArr(s.hinweise),
      unsicherheiten: asStrArr(s.unsicherheiten),
      typischeFehler: asStrArr(s.typischeFehler),
      naechsteSchritte: asStrArr(s.naechsteSchritte),
      disclaimer: DisclaimerBuilder.build(confidence),
    };

    const citations = CitationInjector.citationsFor(raw.citationRefs ?? [], grounded);
    const checklist: CopilotChecklistItem[] = (raw.checklist ?? [])
      .map((c, i) => ({
        id: `c_${i + 1}`,
        label: asStr(c.label),
        role: asStr(c.role ?? undefined, "") || undefined,
      }))
      .filter((c) => c.label.length > 0);

    const followUps: CopilotFollowUp[] = (raw.followUps ?? [])
      .map((f, i) => ({
        code: asStr(f.code, `fu_${i + 1}`),
        question: asStr(f.question),
        hint: asStr(f.hint) || undefined,
      }))
      .filter((f) => f.question.length > 0);

    return {
      answered: true,
      sections,
      citations,
      checklist,
      followUps,
      confidence,
      mode,
      promptVersion: PROMPT_TEMPLATES_VERSION,
      domainVersion: COPILOT_DOMAIN_VERSION,
    };
  },

  /**
   * Erzeugt ein Dokumentationsprotokoll als Markdown. Kann von einer
   * clientseitigen Export-Funktion in PDF/Word weiterverarbeitet werden.
   */
  toMarkdown(params: { question: string; answer: CopilotAnswer; createdAt: string; sessionId: string }): string {
    const { question, answer, createdAt, sessionId } = params;
    const a = answer.sections;
    const lines: string[] = [];
    lines.push(`# Rechtskompass · Copilot-Protokoll`);
    lines.push("");
    lines.push(`- Zeitpunkt: ${createdAt}`);
    lines.push(`- Sitzung: ${sessionId}`);
    lines.push(`- Prompt-Version: ${answer.promptVersion}`);
    lines.push(`- Modus: ${answer.mode}`);
    lines.push(`- Konfidenz: ${(answer.confidence.overall * 100).toFixed(0)} % (${answer.confidence.level})`);
    lines.push("");
    lines.push(`## Frage`);
    lines.push(question);
    lines.push("");
    if (!answer.answered) {
      lines.push(`## Antwort`);
      lines.push(answer.reasonUnanswered ?? NO_SOURCES_ANSWER);
      lines.push("");
    } else {
      lines.push(`## Kurzantwort`);
      lines.push(a.kurzantwort);
      lines.push("");
      lines.push(`## Einordnung`);
      lines.push(a.einordnung);
      lines.push("");
      if (a.empfohleneHandlung.length) {
        lines.push(`## Empfohlene Handlung`);
        a.empfohleneHandlung.forEach((h, i) => lines.push(`${i + 1}. ${h}`));
        lines.push("");
      }
      lines.push(`## Begründung`);
      lines.push(a.begruendung);
      lines.push("");
      if (answer.citations.length) {
        lines.push(`## Rechtsgrundlagen`);
        answer.citations.forEach((c) => lines.push(`- ${c.display}${c.officialUrl ? ` (${c.officialUrl})` : ""}`));
        lines.push("");
      }
      if (a.hinweise.length) { lines.push(`## Hinweise`); a.hinweise.forEach((x) => lines.push(`- ${x}`)); lines.push(""); }
      if (a.unsicherheiten.length) { lines.push(`## Unsicherheiten`); a.unsicherheiten.forEach((x) => lines.push(`- ${x}`)); lines.push(""); }
      if (a.typischeFehler.length) { lines.push(`## Typische Fehler`); a.typischeFehler.forEach((x) => lines.push(`- ${x}`)); lines.push(""); }
      if (a.naechsteSchritte.length) { lines.push(`## Nächste Schritte`); a.naechsteSchritte.forEach((x) => lines.push(`- ${x}`)); lines.push(""); }
      if (answer.checklist.length) {
        lines.push(`## Checkliste`);
        answer.checklist.forEach((c) => lines.push(`- [ ] ${c.label}${c.role ? ` _(Rolle: ${c.role})_` : ""}`));
        lines.push("");
      }
    }
    lines.push(`## Disclaimer`);
    lines.push(a.disclaimer);
    return lines.join("\n");
  },
};
