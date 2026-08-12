// Fachliche Fehlerklassen für Legal Knowledge. Alle mit userMessage.

export interface LegalKnowledgeErrorPayload {
  code: string;
  userMessage: string;
  detail?: string;
  cause?: unknown;
}

export class LegalKnowledgeError extends Error {
  code: string;
  userMessage: string;
  detail?: string;
  constructor(p: LegalKnowledgeErrorPayload) {
    super(p.userMessage);
    this.code = p.code;
    this.userMessage = p.userMessage;
    this.detail = p.detail;
  }
}

export class LegalSourceNotFoundError extends LegalKnowledgeError {
  constructor(id: string) {
    super({ code: "legal_source_not_found", userMessage: `Rechtsquelle ${id} wurde nicht gefunden.` });
  }
}

export class LegalSourceValidationError extends LegalKnowledgeError {
  constructor(detail: string) {
    super({ code: "legal_source_validation", userMessage: "Die Angaben zur Rechtsquelle sind unvollständig.", detail });
  }
}

export class LegalSourceDuplicateError extends LegalKnowledgeError {
  duplicateId: string;
  constructor(duplicateId: string, reason: string) {
    super({ code: "legal_source_duplicate", userMessage: "Es existiert bereits eine passende Rechtsquelle.", detail: reason });
    this.duplicateId = duplicateId;
  }
}

export class LegalIngestionFailedError extends LegalKnowledgeError {
  constructor(detail: string) {
    super({ code: "legal_ingestion_failed", userMessage: "Der Importvorgang konnte nicht abgeschlossen werden.", detail });
  }
}

export class UnsupportedSourceFormatError extends LegalKnowledgeError {
  constructor(format: string) {
    super({
      code: "legal_unsupported_format",
      userMessage: `Das Format "${format}" ist in dieser Version noch nicht unterstützt.`,
      detail: "Bitte manuell als Text einfügen oder eine offizielle URL angeben.",
    });
  }
}

export class InvalidSourceStatusTransitionError extends LegalKnowledgeError {
  constructor(from: string, to: string) {
    super({
      code: "legal_invalid_transition",
      userMessage: `Der Statuswechsel von "${from}" nach "${to}" ist nicht zulässig.`,
    });
  }
}

export class LegalSourceVersionConflictError extends LegalKnowledgeError {
  constructor(detail: string) {
    super({
      code: "legal_version_conflict",
      userMessage: "Die Versionsbeziehung ist widersprüchlich.",
      detail,
    });
  }
}
