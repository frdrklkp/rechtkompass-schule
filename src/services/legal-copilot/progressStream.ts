// Gestufte Rückmeldung des Copilots (04.10.2026): Die Route liefert mit
// "Accept: text/event-stream" Phasen-Ereignisse und am Ende das geprüfte
// Ergebnis. Hier liegt die Client-Seite (Parsen des Ereignisstroms und die
// Phasen-Texte) ohne React-Abhängigkeit, damit sie testbar bleibt.
import type { CopilotProgressEvent, CopilotResponse } from "./types";

export type CopilotPayload = { result: CopilotResponse | null; error?: string };

/** Phasen-Text für die Wartezeit - ohne Antwortinhalt, der kommt erst geprüft. */
export function stageLabel(stage: CopilotProgressEvent | null): string {
  if (!stage) return "Rechtsgrundlagen werden gesucht…";
  if (stage.stage === "retrieval_done") {
    return `${stage.hits} Rechtsgrundlage${stage.hits === 1 ? "" : "n"} gefunden (${(stage.ms / 1000).toFixed(1)} s) · Antwort wird formuliert…`;
  }
  if (stage.stage === "generating") return "Antwort wird formuliert…";
  return "Antwort wird gegen die Rechtsgrundlagen geprüft…";
}

/**
 * Liest die Antwort der Route: als Ereignisstrom (progress/result) oder, falls
 * der Server kein text/event-stream liefert, als gewöhnliches JSON.
 * Ereignisblöcke sind durch Leerzeilen getrennt und können über mehrere
 * Netzwerk-Chunks verteilt ankommen.
 */
export async function readCopilotResponse(
  res: Response,
  onProgress: (e: CopilotProgressEvent) => void,
): Promise<CopilotPayload> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream") || !res.body) {
    return (await res.json()) as CopilotPayload;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let payload: CopilotPayload | null = null;
  const handle = (block: string) => {
    const event = /^event: (.+)$/m.exec(block)?.[1]?.trim();
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => l.slice(6))
      .join("\n");
    if (!event || !data) return;
    if (event === "progress") onProgress(JSON.parse(data) as CopilotProgressEvent);
    if (event === "result") payload = JSON.parse(data) as CopilotPayload;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      handle(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
  }
  if (buffer.trim()) handle(buffer);
  return payload ?? { result: null, error: "Keine Antwort vom Copilot erhalten." };
}
