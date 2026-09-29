/**
 * Versionierte, deterministische Prompt-Templates.
 * Änderungen erhöhen die Version. Keine dynamische Konkatenation im Prompt.
 */
export const PROMPT_TEMPLATES_VERSION = "grounded-copilot-1.1.0";

export const SYSTEM_PROMPT = `Du bist der schulrechtliche Grounded Legal Copilot für Lehrkräfte und Schulleitungen.
Du beantwortest Fragen AUSSCHLIESSLICH auf Basis der bereitgestellten Retrieval-Ergebnisse (\`RECHTSGRUNDLAGEN\`).

REGELN (nicht verhandelbar):
1. Verwende NIEMALS eigenes juristisches Wissen, das nicht in den Retrieval-Ergebnissen enthalten ist.
2. Erfinde NIEMALS Paragraphen, Artikel, Gesetze, Fundstellen oder Quellen.
3. Zitiere Rechtsgrundlagen ausschließlich über die vorgegebenen Referenz-IDs (\`[R1]\`, \`[R2]\` …). Kein Freitext-Zitat.
4. Wenn die Rechtsgrundlagen nicht ausreichen, antworte mit \`{"answered": false, "reason": "..."}\`.
5. Antworte AUSSCHLIESSLICH als valides JSON gemäß Schema. Keine Prosa außerhalb des JSON.
6. Gib niemals konkrete Einzelfall-Rechtsberatung. Erkläre, strukturiere, fasse zusammen, benenne Handlungsschritte.
7. Verwende deutsche Sprache. Duze nicht. Schreibe sachlich und ohne Werbung.
8. Nutze nur die Rechtsgrundlagen, deren \`refId\` du siehst.`;

export const ANSWER_SCHEMA_HINT = `JSON-Antwortformat (strikt einzuhalten):
{
  "answered": boolean,
  "reason": string | null,                    // nur wenn answered=false
  "sections": {
    "kurzantwort": string,                    // 1-2 Sätze
    "einordnung": string,                     // Einordnung des Sachverhalts
    "empfohleneHandlung": string[],           // Sofortmaßnahmen in Reihenfolge
    "begruendung": string,                    // mit [R#]-Verweisen
    "hinweise": string[],
    "unsicherheiten": string[],
    "typischeFehler": string[],
    "naechsteSchritte": string[]
  },
  "citationRefs": string[],                   // z. B. ["R1","R3"] – ausschließlich vorhandene refIds
  "checklist": [{"label": string, "role": string | null}],
  "followUps": [{"code": string, "question": string}]
}`;

export function buildUserPrompt(params: {
  mode: string;
  modeInstruction: string;
  question: string;
  grounded: Array<{ refId: string; citation: string; law: string | null; excerpt: string; reviewStatus?: string; score: number }>;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  caseContext?: {
    title: string;
    category?: string | null;
    shortAnswer?: string | null;
    legalExplanation?: string | null;
    openQuestions?: string[];
  } | null;
}): string {
  const { mode, modeInstruction, question, grounded, history, caseContext } = params;
  const rechtsblock = grounded.length === 0
    ? "(KEINE RECHTSGRUNDLAGEN GEFUNDEN)"
    : grounded
        .map((g) =>
          [
            `[${g.refId}] ${g.citation}`,
            `Quelle: ${g.law ?? "unbekannt"} · Review: ${g.reviewStatus ?? "unverified"} · Score: ${g.score.toFixed(2)}`,
            `Auszug: ${g.excerpt.replace(/\s+/g, " ").trim().slice(0, 800)}`,
          ].join("\n"),
        )
        .join("\n---\n");

  const histBlock = history.length === 0
    ? "(kein Verlauf)"
    : history.map((h) => `${h.role === "user" ? "Nutzer" : "Copilot"}: ${h.text}`).join("\n");

  const fallBlock = !caseContext
    ? ""
    : `
FALLKONTEXT (die Rückfrage bezieht sich auf diesen Praxisfall; nur zum Verständnis – Zitate ausschließlich über [R#] aus RECHTSGRUNDLAGEN):
Titel: ${caseContext.title}${caseContext.category ? `\nKategorie: ${caseContext.category}` : ""}${
        caseContext.shortAnswer ? `\nKurzantwort des Falls: ${caseContext.shortAnswer.replace(/\s+/g, " ").trim().slice(0, 600)}` : ""
      }${
        caseContext.legalExplanation
          ? `\nRechtliche Einordnung des Falls: ${caseContext.legalExplanation.replace(/\s+/g, " ").trim().slice(0, 1200)}`
          : ""
      }${
        caseContext.openQuestions && caseContext.openQuestions.length > 0
          ? `\nOffene Rechtsfragen dieses Falls (hierzu KEINE spekulative Antwort geben, sondern auf die laufende redaktionelle Prüfung verweisen):\n${caseContext.openQuestions
              .slice(0, 8)
              .map((q) => `- ${q.replace(/\s+/g, " ").trim().slice(0, 300)}`)
              .join("\n")}`
          : ""
      }
`;

  return `MODUS: ${mode}
STIL: ${modeInstruction}

VERLAUF (nur für Kontext, keine neuen Fakten):
${histBlock}
${fallBlock}
FRAGE:
${question}

RECHTSGRUNDLAGEN:
${rechtsblock}

${ANSWER_SCHEMA_HINT}

Antworte jetzt ausschließlich als JSON gemäß Schema.`;
}

export const NO_SOURCES_ANSWER =
  "Zu dieser Frage konnte keine ausreichende Rechtsgrundlage gefunden werden.";
