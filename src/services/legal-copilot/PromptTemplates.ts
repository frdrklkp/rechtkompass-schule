/**
 * Versionierte, deterministische Prompt-Templates.
 * Änderungen erhöhen die Version. Keine dynamische Konkatenation im Prompt.
 */
// 1.2.0 (04.10.2026): Längenregel. Gemessen: beantwortete Rückfragen erzeugten
// 1.500–2.000 Ausgabe-Token (Obergrenze erreicht) und damit 15–19 s Wartezeit;
// Ziel sind < 10 s. Die Struktur bleibt, jeder Abschnitt wird kurz.
// 1.3.0 (04.10.2026): Schlankes Format - hinweise, typischeFehler,
// naechsteSchritte und checklist entfallen standardmäßig (werden im Dialog
// nicht angezeigt, kosteten aber ~40 % der Ausgabe-Token).
export const PROMPT_TEMPLATES_VERSION = "grounded-copilot-1.3.0";

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
8. Nutze nur die Rechtsgrundlagen, deren \`refId\` du siehst.
9. Fasse dich kurz (siehe LÄNGENVORGABE in der Anfrage). Wiederhole weder den Fallkontext noch den Wortlaut der Rechtsgrundlagen; verweise stattdessen mit [R#].`;

// Direkt vor der Frage platziert, weil Haiku 4.5 eine Längenregel am Ende des
// Systemprompts ignorierte (Messung 04.10.2026: 1.300–2.000 Ausgabe-Token,
// Obergrenze erreicht, Antwort abgeschnitten). Mit dieser Vorgabe plus kurzen
// Fundstellen-Labels und maxItems im Schema: vollständig bei ~1.200 Token.
export const LAENGENVORGABE = `LÄNGENVORGABE (verbindlich): Gesamtantwort höchstens 160 Wörter. kurzantwort ≤ 2 Sätze; einordnung ≤ 3 Sätze; begruendung ≤ 3 Sätze; empfohleneHandlung ≤ 4 Einträge, je ein kurzer Satz; unsicherheiten ≤ 2 Einträge; followUps ≤ 2. Erzeuge KEINE Felder hinweise, typischeFehler, naechsteSchritte oder checklist. Fundstellen nur als [R#] - niemals Gesetzesnamen oder Paragraphen ausschreiben.`;

export const ANSWER_SCHEMA_HINT = `JSON-Antwortformat (strikt einzuhalten):
{
  "answered": boolean,
  "reason": string | null,                    // nur wenn answered=false
  "sections": {
    "kurzantwort": string,                    // 1-2 Sätze
    "einordnung": string,                     // höchstens 4 Sätze
    "empfohleneHandlung": string[],           // höchstens 4 Schritte in Reihenfolge, je ein Satz
    "begruendung": string,                    // höchstens 4 Sätze, mit [R#]-Verweisen
    "unsicherheiten": string[]                // höchstens 2 Einträge; [] wenn keine
  },
  "citationRefs": string[],                   // z. B. ["R1","R3"] – ausschließlich vorhandene refIds
  "followUps": [{"code": string, "question": string}]        // höchstens 2 Einträge
}
Weglassen (nicht erzeugen): "hinweise", "typischeFehler", "naechsteSchritte", "checklist".`;

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
${LAENGENVORGABE}

FRAGE:
${question}

RECHTSGRUNDLAGEN:
${rechtsblock}

${ANSWER_SCHEMA_HINT}

Antworte jetzt ausschließlich als JSON gemäß Schema.`;
}

export const NO_SOURCES_ANSWER =
  "Zu dieser Frage konnte keine ausreichende Rechtsgrundlage gefunden werden.";
