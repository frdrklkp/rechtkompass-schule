// Zentrales Mapping stabiler Backend-Fehlercodes auf nutzerfreundliche
// deutsche Meldungen. Wird von EditorialWorkflowService und
// EditorialQueryService benutzt.

export type EditorialErrorCode =
  | "authentication_required"
  | "insufficient_role"
  | "case_not_found"
  | "invalid_workflow_state"
  | "invalid_transition"
  | "pending_review_already_exists"
  | "review_not_pending"
  | "review_not_assigned"
  | "comment_required_for_changes_requested"
  | "comment_required_for_rejected"
  | "invalid_decision"
  | "unknown";

const MESSAGES: Record<EditorialErrorCode, string> = {
  authentication_required: "Bitte melden Sie sich erneut an.",
  insufficient_role: "Sie besitzen für diese Aktion keine Berechtigung.",
  case_not_found:
    "Der Praxisfall wurde nicht gefunden oder ist nicht zugänglich.",
  invalid_workflow_state:
    "Diese Aktion ist im aktuellen Bearbeitungsstand nicht möglich.",
  invalid_transition: "Dieser Workflow-Schritt ist aktuell nicht zulässig.",
  pending_review_already_exists:
    "Für diesen Fall läuft bereits eine Prüfung.",
  review_not_pending: "Diese Prüfung wurde bereits abgeschlossen.",
  review_not_assigned:
    "Diese Prüfung ist einer anderen Person zugewiesen.",
  comment_required_for_changes_requested:
    "Bitte begründen Sie die angeforderten Änderungen.",
  comment_required_for_rejected: "Bitte begründen Sie die Ablehnung.",
  invalid_decision: "Die gewählte Reviewentscheidung ist ungültig.",
  unknown:
    "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.",
};

const KNOWN_CODES: ReadonlySet<EditorialErrorCode> = new Set(
  Object.keys(MESSAGES) as EditorialErrorCode[],
);

export class EditorialError extends Error {
  public readonly code: EditorialErrorCode;
  public readonly userMessage: string;
  public readonly technical: string;
  public readonly correlationId?: string;

  constructor(
    code: EditorialErrorCode,
    technical: string,
    correlationId?: string,
  ) {
    super(MESSAGES[code]);
    this.name = "EditorialError";
    this.code = code;
    this.userMessage = MESSAGES[code];
    this.technical = technical;
    this.correlationId = correlationId;
  }
}

interface SupabaseLikeError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

function extractCode(err: SupabaseLikeError): EditorialErrorCode {
  const haystack = [err.message, err.details, err.hint]
    .filter((v): v is string => typeof v === "string")
    .join(" | ")
    .toLowerCase();
  for (const code of KNOWN_CODES) {
    if (haystack.includes(code)) return code;
  }
  return "unknown";
}

export function mapSupabaseError(
  err: unknown,
  correlationId?: string,
): EditorialError {
  if (err instanceof EditorialError) return err;
  if (!err || typeof err !== "object") {
    return new EditorialError("unknown", String(err ?? "unknown"), correlationId);
  }
  const e = err as SupabaseLikeError;
  const code = extractCode(e);
  const technical = e.message || e.details || "unknown error";
  if (code === "unknown") {
    console.error("[editorial] unbekannter Fehler", { err, correlationId });
  }
  return new EditorialError(code, technical, correlationId);
}

export function isEditorialError(err: unknown): err is EditorialError {
  return err instanceof EditorialError;
}
