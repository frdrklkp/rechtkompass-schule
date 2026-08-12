/**
 * Sprint 4.6H – Deterministische Auflösung passender Dokumentvorlagen.
 *
 * Reihenfolge (keine KI-Auswahl):
 *   1. Praxisfall-Verknüpfung (case_templates des bestätigten Praxisfalls)
 *   2. Kategorie/Typ-Übereinstimmung (document_type entspricht der Fallkategorie)
 *   3. Generische Vorlagen (ohne Typ bzw. ausdrücklich „generic“/„allgemein“)
 *
 * Der Datenabruf ist injizierbar (fetcher), damit die Auflösung ohne
 * Netzwerk testbar bleibt. Standard ist der Supabase-Zugriff auf die
 * bestehenden Tabellen document_templates und case_templates.
 */
import type {
  DocumentationSkippedTemplate,
  DocumentationTemplateRef,
  DocumentationTemplateSource,
} from "./types";

/** Zeile aus document_templates (alle historisch belegten Spaltenvarianten). */
export interface DocumentationTemplateRow {
  id: string;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  markdown_body?: string | null;
  document_type?: string | null;
  template_type?: string | null;
  body?: string | null;
  fields?: unknown;
}

/** Flache Eingabe für die Auflösung. */
export interface DocumentationTemplateData {
  /** Vorlagen, die dem bestätigten Praxisfall zugeordnet sind. */
  caseTemplates: DocumentationTemplateRow[];
  /** Alle übrigen Vorlagen (Kandidaten für Kategorie- und generische Stufe). */
  allTemplates: DocumentationTemplateRow[];
}

export type DocumentationTemplateFetcher = (
  caseId: string | null,
) => Promise<DocumentationTemplateData>;

export interface DocumentationTemplateResolution {
  templates: DocumentationTemplateRef[];
  skipped: DocumentationSkippedTemplate[];
}

const GENERIC_TYPES = new Set(["generic", "allgemein", "general", "universal"]);

function extractBody(row: DocumentationTemplateRow): string {
  if (typeof row.markdown_body === "string" && row.markdown_body.trim() !== "") {
    return row.markdown_body;
  }
  const fields = row.fields;
  if (fields && typeof fields === "object") {
    const f = fields as Record<string, unknown>;
    if (typeof f.markdown_body === "string" && f.markdown_body.trim() !== "") {
      return f.markdown_body;
    }
    if (typeof f.body === "string" && f.body.trim() !== "") return f.body;
  }
  if (typeof row.body === "string" && row.body.trim() !== "") return row.body;
  return "";
}

function extractDocumentType(row: DocumentationTemplateRow): string | null {
  if (typeof row.document_type === "string" && row.document_type.trim() !== "") {
    return row.document_type;
  }
  const fields = row.fields;
  if (fields && typeof fields === "object") {
    const f = fields as Record<string, unknown>;
    if (typeof f.document_type === "string" && f.document_type.trim() !== "") {
      return f.document_type;
    }
    if (typeof f.type === "string" && f.type.trim() !== "") return f.type;
  }
  if (typeof row.template_type === "string" && row.template_type.trim() !== "") {
    return row.template_type;
  }
  return null;
}

const SOURCE_RANK: Record<DocumentationTemplateSource, number> = {
  practice_case: 0,
  category: 1,
  generic: 2,
};

/**
 * Löst die Vorlagen deterministisch auf. Duplikate (über mehrere Stufen
 * erreichbar) werden der höchstrangigen Stufe zugeordnet.
 */
export function resolveDocumentationTemplates(
  data: DocumentationTemplateData,
  category: string | null,
): DocumentationTemplateResolution {
  const normalizedCategory = category?.trim().toLowerCase() || null;
  const caseIds = new Set(data.caseTemplates.map((t) => t.id));
  const byId = new Map<string, { row: DocumentationTemplateRow; source: DocumentationTemplateSource }>();

  for (const row of data.caseTemplates) {
    byId.set(row.id, { row, source: "practice_case" });
  }
  for (const row of data.allTemplates) {
    if (caseIds.has(row.id)) continue;
    const type = extractDocumentType(row)?.trim().toLowerCase() ?? null;
    if (normalizedCategory && type && type === normalizedCategory) {
      byId.set(row.id, { row, source: "category" });
    } else if (!type || GENERIC_TYPES.has(type)) {
      byId.set(row.id, { row, source: "generic" });
    }
    // Vorlagen anderer Kategorien werden nicht angeboten.
  }

  const skipped: DocumentationSkippedTemplate[] = [];
  const templates: DocumentationTemplateRef[] = [];
  for (const { row, source } of byId.values()) {
    const body = extractBody(row);
    const title = row.title?.trim() || "Dokumentvorlage";
    if (!body) {
      skipped.push({ id: row.id, title, reason: "Die Vorlage hat keinen Inhalt." });
      continue;
    }
    templates.push({
      id: row.id,
      slug: row.slug ?? row.id,
      title,
      description: row.description ?? null,
      documentType: extractDocumentType(row),
      markdownBody: body,
      source,
      sortOrder: 0,
    });
  }

  templates.sort((a, b) => {
    const rank = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (rank !== 0) return rank;
    return a.title.localeCompare(b.title, "de-DE");
  });
  templates.forEach((t, i) => {
    t.sortOrder = i;
  });

  skipped.sort((a, b) => a.title.localeCompare(b.title, "de-DE"));
  return { templates, skipped };
}

/**
 * Standard-Datenabruf über Supabase (document_templates + case_templates).
 * Dynamischer Import, damit die Auflösung in Tests ohne Netzwerk bleibt.
 *
 * Es wird "*" selektiert, weil die Vorlagentabelle historisch unterschiedliche
 * Spalten führt (markdown_body/body bzw. fields). Fehlt die Verknüpfungstabelle
 * case_templates, entfällt die Praxisfall-Stufe – ohne Abbruch.
 */
export const defaultDocumentationTemplateFetcher: DocumentationTemplateFetcher = async (caseId) => {
  const { supabase } = await import("@/integrations/supabase/client");
  const db = supabase as never as {
    from: (t: string) => {
      select: (c: string) => Promise<{ data: unknown; error: unknown }> & {
        eq: (k: string, v: string) => Promise<{ data: unknown; error: unknown }>;
        in: (k: string, v: string[]) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  let caseTemplates: DocumentationTemplateRow[] = [];
  if (caseId) {
    const { data: links, error: linkError } = await db
      .from("case_templates")
      .select("template_id")
      .eq("case_id", caseId);
    /* Fehlende Verknüpfungstabelle ist kein Fehlerfall – Stufe entfällt. */
    if (!linkError) {
      const ids = ((links ?? []) as Array<{ template_id?: string | null }>)
        .map((l) => l.template_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      if (ids.length > 0) {
        const { data, error } = await db.from("document_templates").select("*").in("id", ids);
        if (error) throw error;
        caseTemplates = (data ?? []) as DocumentationTemplateRow[];
      }
    }
  }

  const { data: all, error: allError } = await db.from("document_templates").select("*");
  if (allError) throw allError;

  return { caseTemplates, allTemplates: (all ?? []) as DocumentationTemplateRow[] };
};

