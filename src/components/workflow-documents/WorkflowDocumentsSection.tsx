/**
 * Sprint 4.5A – Bereich „Dokumente" innerhalb der bestehenden Workflow-Runtime.
 * Nutzt vorhandene UI-Primitives; keine zweite Runtime.
 */
import { useMemo, useState } from "react";
import {
  Copy,
  Download,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
  Trash2,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/adminAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useSessionDocuments,
  useGenerateDocument,
  useRegenerateDocument,
  useDeleteDocument,
} from "@/hooks/workflow/useSessionDocuments";
import { DocumentGenerationApi } from "@/lib/documentGeneration.api";
import { docGenTelemetry } from "@/services/document-generation";
import { toast } from "sonner";
import type { GeneratedDocument, DocumentTemplateInput } from "@/services/document-generation";

type ExportFormat = "md" | "docx" | "pdf";

async function downloadExport(doc: GeneratedDocument, format: ExportFormat) {
  try {
    const { blob, filename } = await DocumentGenerationApi.download(doc.sessionId, doc.id, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    docGenTelemetry.emit({
      event: "document_downloaded",
      sessionId: doc.sessionId, documentId: doc.id, templateSlug: doc.templateSlug,
      detail: { format },
    });
  } catch (err) {
    docGenTelemetry.emit({
      event: "document_export_failed",
      sessionId: doc.sessionId, documentId: doc.id, templateSlug: doc.templateSlug,
      detail: { format, message: (err as Error)?.message },
    });
    toast.error((err as Error)?.message || "Export fehlgeschlagen.");
  }
}

export function WorkflowDocumentsSection({ sessionId }: { sessionId: string }) {
  const { data, isLoading, isError, error } = useSessionDocuments(sessionId);
  const generate = useGenerateDocument(sessionId);
  const regenerate = useRegenerateDocument(sessionId);
  const remove = useDeleteDocument(sessionId);
  const [preview, setPreview] = useState<GeneratedDocument | null>(null);
  const [emailDoc, setEmailDoc] = useState<GeneratedDocument | null>(null);

  const templates = data?.templates ?? [];
  const documents = data?.documents ?? [];
  const byTemplate = useMemo(() => {
    const m = new Map<string, GeneratedDocument[]>();
    for (const d of documents) {
      const arr = m.get(d.templateSlug) ?? [];
      arr.push(d);
      m.set(d.templateSlug, arr);
    }
    return m;
  }, [documents]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" /> Dokumente
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Erzeugt strukturierte Markdown-Dokumente aus dem aktuellen Vorgang. Fehlende Werte werden
          sichtbar markiert und niemals erfunden.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Vorlagen werden geladen …
          </div>
        )}
        {isError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {(error as Error)?.message ?? "Fehler beim Laden."}
          </div>
        )}
        {!isLoading && templates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Für diesen Workflow sind derzeit keine Dokumentvorlagen hinterlegt.
          </p>
        )}
        {templates.length > 0 && (
          <ul className="space-y-3">
            {templates.map((t) => (
              <TemplateRow
                key={t.slug}
                template={t}
                docs={byTemplate.get(t.slug) ?? []}
                onGenerate={() => generate.mutate({ templateSlug: t.slug })}
                onRegenerate={(docId) => regenerate.mutate({ docId })}
                onDelete={(docId) => remove.mutate(docId)}
                onPreview={(doc) => setPreview(doc)}
                onEmail={(doc) => setEmailDoc(doc)}
                busy={generate.isPending || regenerate.isPending}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <PreviewDialog doc={preview} onClose={() => setPreview(null)} />
      <EmailDialog doc={emailDoc} onClose={() => setEmailDoc(null)} />
    </Card>
  );
}

function TemplateRow({
  template,
  docs,
  onGenerate,
  onRegenerate,
  onDelete,
  onPreview,
  onEmail,
  busy,
}: {
  template: DocumentTemplateInput;
  docs: GeneratedDocument[];
  onGenerate: () => void;
  onRegenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onPreview: (doc: GeneratedDocument) => void;
  onEmail: (doc: GeneratedDocument) => void;
  busy: boolean;
}) {
  return (
    <li className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium">{template.title}</div>
            {template.documentType && (
              <Badge variant="outline" className="text-[10px] uppercase">
                {template.documentType}
              </Badge>
            )}
            {template.aiFields.length > 0 && (
              <Badge className="bg-primary/10 text-primary text-[10px]">
                <Sparkles className="mr-1 h-3 w-3" /> KI-Felder
              </Badge>
            )}
          </div>
          {template.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
          )}
        </div>
        <Button size="sm" onClick={onGenerate} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}
          Dokument erzeugen
        </Button>
      </div>

      {docs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
              <span className="font-mono text-[10px] text-muted-foreground">
                {new Date(d.createdAt).toLocaleString("de-DE")}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {statusLabel(d.status)}
              </Badge>
              {d.missingPlaceholders.length > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  {d.missingPlaceholders.length} fehlend
                </span>
              )}
              <span className="ml-auto flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => onPreview(d)}>
                  <Eye className="mr-1 h-3.5 w-3.5" /> Vorschau
                </Button>
                <Button size="sm" variant="ghost" onClick={() => downloadExport(d, "md")} title="Markdown herunterladen">
                  <Download className="mr-1 h-3.5 w-3.5" /> MD
                </Button>
                <Button size="sm" variant="ghost" onClick={() => downloadExport(d, "docx")} title="DOCX herunterladen">
                  <Download className="mr-1 h-3.5 w-3.5" /> DOCX
                </Button>
                <Button size="sm" variant="ghost" onClick={() => downloadExport(d, "pdf")} title="PDF herunterladen">
                  <Download className="mr-1 h-3.5 w-3.5" /> PDF
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onEmail(d)} title="Als PDF per E-Mail senden">
                  <Mail className="mr-1 h-3.5 w-3.5" /> E-Mail
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onRegenerate(d.id)}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Neu erzeugen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(d.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Entfernen
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function PreviewDialog({ doc, onClose }: { doc: GeneratedDocument | null; onClose: () => void }) {
  if (!doc) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(doc.markdown);
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> {doc.title}
          </DialogTitle>
          <DialogDescription>
            Markdown-Vorschau. Version:{" "}
            <span className="font-mono">{doc.workflowVersionId?.slice(0, 8) ?? "—"}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copy}>
            <Copy className="mr-1 h-4 w-4" /> Kopieren
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadExport(doc, "md")}>
            <Download className="mr-1 h-4 w-4" /> Markdown
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadExport(doc, "docx")}>
            <Download className="mr-1 h-4 w-4" /> DOCX
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadExport(doc, "pdf")}>
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
        </div>
        {doc.missingPlaceholders.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs dark:bg-amber-500/10">
            <div className="mb-1 font-medium text-amber-900 dark:text-amber-200">
              Fehlende Angaben ({doc.missingPlaceholders.length})
            </div>
            <ul className="ml-4 list-disc text-amber-900/90 dark:text-amber-200/90">
              {doc.missingPlaceholders.slice(0, 10).map((m, i) => (
                <li key={i}>
                  <span className="font-mono">{m.key}</span> · {reasonLabel(m.reason)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
          {doc.markdown}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

function statusLabel(s: GeneratedDocument["status"]): string {
  switch (s) {
    case "generated": return "erzeugt";
    case "regenerated": return "neu erzeugt";
    case "partial": return "unvollständig";
    case "manual": return "manuell bearbeitet";
    default: return "Entwurf";
  }
}
function reasonLabel(r: string): string {
  switch (r) {
    case "unknown": return "unbekannt";
    case "empty": return "leer";
    case "ai_disabled": return "KI-Feld nicht gefüllt";
    default: return r;
  }
}

/**
 * E-Mail-Versand eines Vorgangs-Dokuments als PDF-Anhang (2026-09-02).
 * Empfänger vorbefüllt mit der eigenen Login-Adresse; Versand läuft über
 * die authentifizierte Route /api/workflow-sessions/:id/documents/:docId/email.
 */
function EmailDialog({ doc, onClose }: { doc: GeneratedDocument | null; onClose: () => void }) {
  const { user } = useAuthSession();
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [lastDocId, setLastDocId] = useState<string | null>(null);

  if (doc && doc.id !== lastDocId) {
    setLastDocId(doc.id);
    setRecipient(user?.email ?? "");
    setMessage("");
  }
  if (!doc) return null;

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());

  const send = async () => {
    if (!valid || sending) return;
    setSending(true);
    try {
      await DocumentGenerationApi.sendEmail(doc.sessionId, doc.id, recipient.trim(), message.trim() || undefined);
      toast.success("Dokument wurde als PDF per E-Mail versendet.");
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || "Versand fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Dokument per E-Mail senden
          </DialogTitle>
          <DialogDescription>
            „{doc.title}" wird als PDF-Anhang versendet – z.&nbsp;B. an das eigene Postfach zur Ablage
            oder an die Schulleitung.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Empfänger-E-Mail</label>
            <Input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="name@schule.de"
            />
            {recipient.trim() && !valid && (
              <p className="mt-1 text-xs text-destructive">Ungültige E-Mail-Adresse.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Nachricht (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
              rows={3}
              className="w-full rounded-md border border-input bg-background p-2 text-sm outline-none focus:border-primary"
              placeholder="Kurze Anmerkung für den Empfänger …"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={sending}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={send} disabled={!valid || sending}>
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Mail className="mr-1 h-4 w-4" />}
              Senden
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
