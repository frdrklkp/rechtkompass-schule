/**
 * Sprint 4.5H – Verständliche Fehlerdarstellung für den Importprozess.
 * Übersetzt technische Fehler in Ursache + Handlungsempfehlung.
 */

export type ImportErrorCode =
  | "source_unreachable"
  | "whitelist_violation"
  | "parser_failed"
  | "unknown_version"
  | "timeout"
  | "invalid_html"
  | "validation_failed"
  | "version_conflict"
  | "unknown";

export interface FriendlyImportError {
  code: ImportErrorCode;
  title: string;
  explanation: string;
  recommendation: string;
  technical: string;
}

const RULES: {
  code: ImportErrorCode;
  test: RegExp;
  title: string;
  explanation: string;
  recommendation: string;
}[] = [
  {
    code: "timeout",
    test: /timeout|timed out|abort|zeitüberschreitung/i,
    title: "Zeitüberschreitung beim Abruf",
    explanation: "Die offizielle Quelle hat nicht innerhalb der erlaubten Zeit geantwortet.",
    recommendation: "Abruf später erneut starten oder die Anzahl der Seiten (Tiefe) reduzieren.",
  },
  {
    code: "whitelist_violation",
    test: /whitelist|nicht erlaubt|url_rejected|https|host/i,
    title: "Adresse nicht freigegeben",
    explanation:
      "Die angegebene URL liegt außerhalb der freigegebenen amtlichen Domains oder nutzt kein HTTPS.",
    recommendation:
      "Nur die vorbelegten Start-URLs der amtlichen Quellen verwenden (HTTPS, Whitelist-Domain).",
  },
  {
    code: "source_unreachable",
    test: /http (4|5)\d\d|fetch failed|network|econn|not found|nicht erreichbar|503|404/i,
    title: "Quelle nicht erreichbar",
    explanation:
      "Der Server der amtlichen Quelle hat den Abruf abgelehnt oder ist derzeit nicht verfügbar.",
    recommendation: "Verfügbarkeit der Seite im Browser prüfen und den Abruf danach wiederholen.",
  },
  {
    code: "invalid_html",
    test: /html|markup|kein text|leerer inhalt|no_documents/i,
    title: "Inhalt konnte nicht gelesen werden",
    explanation: "Die geladene Seite enthielt keinen auswertbaren Textinhalt.",
    recommendation:
      "Eine konkretere Unterseite als Start-URL wählen oder den Inhalt manuell im Import-Wizard einfügen.",
  },
  {
    code: "parser_failed",
    test: /parser|no_parser|parse/i,
    title: "Parser konnte das Dokument nicht lesen",
    explanation: "Kein Parser passt zur Struktur des geladenen Dokuments.",
    recommendation: "Parser im Import-Wizard manuell auswählen und die Vorschau erneut erzeugen.",
  },
  {
    code: "version_conflict",
    test: /versionskonflikt|version_conflict/i,
    title: "Versionskonflikt",
    explanation:
      "Die eingelesene Fassung trägt dieselbe Bezeichnung wie die installierte, unterscheidet sich aber inhaltlich.",
    recommendation: "Versionslabel der Quelle prüfen und den Import erst nach Klärung übernehmen.",
  },
  {
    code: "unknown_version",
    test: /missing_version|version unbekannt|keine fassung/i,
    title: "Version unbekannt",
    explanation: "Die Quelle enthält keinen erkennbaren Fassungshinweis.",
    recommendation:
      "Fassung im Import-Wizard ergänzen, damit die Versionierung nachvollziehbar bleibt.",
  },
  {
    code: "validation_failed",
    test: /validierung|validation/i,
    title: "Validierung fehlgeschlagen",
    explanation: "Die Struktur des Dokuments verletzt Pflichtregeln des Importframeworks.",
    recommendation: "Meldungen der Validierung in der Vorschau prüfen und die Quelle bereinigen.",
  },
];

export function describeImportError(error: unknown): FriendlyImportError {
  const technical = error instanceof Error ? error.message : String(error ?? "Unbekannter Fehler");
  const rule = RULES.find((r) => r.test.test(technical));
  if (!rule) {
    return {
      code: "unknown",
      title: "Import fehlgeschlagen",
      explanation: "Der Importvorgang wurde mit einem unerwarteten Fehler abgebrochen.",
      recommendation:
        "Vorgang wiederholen. Bleibt der Fehler bestehen, technische Meldung an die Redaktionsleitung geben.",
      technical,
    };
  }
  return {
    code: rule.code,
    title: rule.title,
    explanation: rule.explanation,
    recommendation: rule.recommendation,
    technical,
  };
}
