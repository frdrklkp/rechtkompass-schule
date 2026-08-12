import { AIError, type AIErrorPayload } from "./types";

export function mapHttpError(status: number, body: string): AIError {
  const lower = body.toLowerCase();
  let payload: AIErrorPayload;
  if (status === 429) {
    payload = {
      code: "rate_limited",
      status,
      userMessage:
        "KI-Dienst momentan überlastet. Bitte in wenigen Sekunden erneut versuchen.",
      detail: body.slice(0, 300),
    };
  } else if (status === 402 || lower.includes("credit")) {
    payload = {
      code: "credits_exhausted",
      status,
      userMessage:
        "KI-Kontingent erschöpft. Bitte im Workspace neue Credits hinzufügen.",
      detail: body.slice(0, 300),
    };
  } else if (status === 401 || status === 403) {
    payload = {
      code: "unauthorized",
      status,
      userMessage: "Keine Berechtigung für den KI-Dienst.",
      detail: body.slice(0, 300),
    };
  } else if (status >= 400 && status < 500) {
    payload = {
      code: "bad_request",
      status,
      userMessage: "Anfrage an den KI-Dienst war ungültig.",
      detail: body.slice(0, 300),
    };
  } else {
    payload = {
      code: "server_error",
      status,
      userMessage: "Der KI-Dienst antwortet aktuell nicht wie erwartet.",
      detail: body.slice(0, 300),
    };
  }
  return new AIError(payload);
}

export function mapNetworkError(err: unknown): AIError {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes("abort")) {
    return new AIError({
      code: "aborted",
      userMessage: "KI-Aufruf abgebrochen.",
      detail: msg,
    });
  }
  return new AIError({
    code: "network",
    userMessage: "Netzwerkfehler beim Aufruf des KI-Dienstes.",
    detail: msg,
  });
}

export function isAIError(err: unknown): err is AIError {
  return err instanceof AIError;
}
