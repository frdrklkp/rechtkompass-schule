import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  ClipboardEdit,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Pencil,
  RefreshCcw,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  listCaseDocuments,
  createCaseDocument,
  updateCaseDocument,
  deleteCaseDocument,
  duplicateCaseDocument,
  type CaseDocument,
  type CaseDocumentQuality,
} from "@/lib/caseDocumentsRepo";
import { cn } from "@/lib/utils";

// ————————————————————————————————————————————————————————————
// Placeholder-Utilities
// ————————————————————————————————————————————————————————————

function extractPlaceholders(text: string): string[] {
  return Array.from(new Set([...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim())));
}

type PlaceholderFieldKind = "date" | "time" | "text" | "textarea";

function placeholderLabel(raw: string): string {
  // "Datum ergänzen" -> "Datum"
  return raw
    .replace(/\s*ergänzen\s*$/i, "")
    .replace(/\s*eintragen\s*$/i, "")
    .replace(/\s*einfügen\s*$/i, "")
    .replace(/\s*angeben\s*$/i, "")
    .trim();
}

function placeholderKind(raw: string): PlaceholderFieldKind {
  const l = raw.toLowerCase();
  if (/uhrzeit|zeit\b/.test(l)) return "time";
  if (/datum|wiedervorlage|frist/.test(l)) return "date";
  if (/(anzahl|status|inhalt|fehlzeit|zeitraum|vorfall|sachverhalt|beteiligt|verlauf|maßnahm|begründ)/.test(l))
    return "textarea";
  return "text";
}

function applyPlaceholderValues(content: string, values: Record<string, string>): string {
  let out = content;
  for (const [ph, val] of Object.entries(values)) {
    const trimmed = val.trim();
    if (!trimmed) continue;
    const re = new RegExp(`\\[\\s*${ph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\]`, "g");
    out = out.replace(re, trimmed);
  }
  return out;
}

type LinkedTemplate = { id: string; title: string; description?: string | null };

type GenerationResult = {
  title: string;
  content: string;
  quality: CaseDocumentQuality;
  open_issues: string[];
  placeholders: string[];
  used_sources: {
    case: { id: string; title: string };
    template: { id: string | null; title: string; body: string };
    legal_sections: Array<{ id: string; label: string; official_url: string | null }>;
    keywords: string[];
    missing: string[];
    fields_used: string[];
  };
  generation_metadata: Record<string, unknown>;
};

async function generateDraft(caseId: string, templateId: string | null): Promise<GenerationResult> {
  const res = await fetch("/api/generate-case-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ case_id: caseId, template_id: templateId }),
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j.error ?? text);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  return JSON.parse(text) as GenerationResult;
}

function QualityBadge({ q }: { q: CaseDocumentQuality | null }) {
  if (!q) return null;
  const map: Record<CaseDocumentQuality, { label: string; cls: string; icon: string }> = {
    green: {
      label: "Weitgehend vollständig",
      cls: "bg-emerald-100 text-emerald-800 border-emerald-300",
      icon: "🟢",
    },
    yellow: {
      label: "Angaben ergänzen",
      cls: "bg-amber-100 text-amber-800 border-amber-300",
      icon: "🟡",
    },
    red: {
      label: "Fachliche Prüfung erforderlich",
      cls: "bg-rose-100 text-rose-800 border-rose-300",
      icon: "🔴",
    },
  };
  const c = map[q];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", c.cls)}>
      <span>{c.icon}</span> {c.label}
    </span>
  );
}

function FillPlaceholdersDialog({
  open,
  onOpenChange,
  placeholders,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  placeholders: string[];
  onApply: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setValues({});
  }, [open, placeholders.join("|")]);

  const filledCount = Object.values(values).filter((v) => v.trim().length > 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95vh] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b border-border px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardEdit className="h-5 w-5 text-violet-600" />
            Fehlende Angaben ergänzen
          </DialogTitle>
          <DialogDescription>
            Ergänzen Sie die im Dokument offen gelassenen Angaben. Leere Felder bleiben als
            Platzhalter im Entwurf erhalten – die KI erfindet keine Informationen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          {placeholders.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Es sind keine offenen Platzhalter im Dokument.
            </div>
          )}
          {placeholders.map((ph) => {
            const kind = placeholderKind(ph);
            const label = placeholderLabel(ph);
            const val = values[ph] ?? "";
            const setVal = (v: string) => setValues((prev) => ({ ...prev, [ph]: v }));
            return (
              <div key={ph} className="space-y-1">
                <label className="block text-sm font-medium text-foreground">
                  {label}
                  <span className="ml-2 text-xs text-muted-foreground">[{ph}]</span>
                </label>
                {kind === "date" && (
                  <Input type="date" value={val} onChange={(e) => setVal(e.target.value)} />
                )}
                {kind === "time" && (
                  <Input type="time" value={val} onChange={(e) => setVal(e.target.value)} />
                )}
                {kind === "text" && (
                  <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder={label} />
                )}
                {kind === "textarea" && (
                  <Textarea
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder={label}
                    className="min-h-[80px]"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
          <span className="mr-auto text-xs text-muted-foreground">
            {filledCount} von {placeholders.length} ergänzt
          </span>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" /> Abbrechen
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(values);
              onOpenChange(false);
            }}
            disabled={filledCount === 0}
          >
            <Save className="h-4 w-4" /> Angaben übernehmen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GeneratorDialog({
  open,
  onOpenChange,
  caseId,
  template,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: string;
  template: LinkedTemplate | null;
  existing?: CaseDocument | null;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<GenerationResult | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fillOpen, setFillOpen] = useState(false);

  const genMut = useMutation({
    mutationFn: () => generateDraft(caseId, template?.id ?? null),
    onSuccess: (r) => {
      setDraft(r);
      setTitle(r.title);
      setContent(r.content);
      setOriginalContent(r.content);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  // Bestehendes Dokument öffnen bzw. Auto-Generierung bei Neuerstellung
  useEffect(() => {
    if (existing && open) {
      setTitle(existing.title);
      setContent(existing.content);
      setOriginalContent(existing.content);
      setDraft({
        title: existing.title,
        content: existing.content,
        quality: existing.quality ?? "yellow",
        open_issues: existing.open_issues,
        placeholders: extractPlaceholders(existing.content),
        used_sources: (existing.used_sources as GenerationResult["used_sources"]) ?? {
          case: { id: caseId, title: "" },
          template: { id: existing.template_id, title: template?.title ?? "", body: "" },
          legal_sections: [],
          keywords: [],
          missing: [],
          fields_used: [],
        },
        generation_metadata: existing.generation_metadata ?? {},
      });
    } else if (open && !existing && !draft && !genMut.isPending) {
      genMut.mutate();
    }
    if (!open) {
      setDraft(null);
      setTitle("");
      setContent("");
      setOriginalContent("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  const currentPlaceholders = useMemo(() => extractPlaceholders(content), [content]);
  const hasManualEdits = content !== originalContent;

  function handleRegenerate() {
    if (hasManualEdits) {
      const ok = confirm(
        "Beim erneuten Erzeugen wird der aktuelle Dokumententwurf ersetzt. Ihre manuellen Änderungen gehen verloren. Fortfahren?",
      );
      if (!ok) return;
    }
    genMut.mutate();
  }

  function handleApplyPlaceholders(values: Record<string, string>) {
    const next = applyPlaceholderValues(content, values);
    setContent(next);
    const before = currentPlaceholders.length;
    const after = extractPlaceholders(next).length;
    toast.success(
      after === 0
        ? "Alle Angaben ergänzt – Dokument vollständig."
        : `${before - after} Angabe(n) übernommen, ${after} verbleibend.`,
    );
  }

  async function handleSave() {
    if (!draft) return;
    if (currentPlaceholders.length > 0) {
      const ok = confirm(
        `Das Dokument enthält noch ${currentPlaceholders.length} offene Angabe(n). Trotzdem als Entwurf speichern?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    try {
      const openIssues: string[] = [];
      if (currentPlaceholders.length > 0)
        openIssues.push(`Offene Platzhalter: ${currentPlaceholders.length}`);
      if (draft.used_sources.legal_sections.length === 0)
        openIssues.push("Keine Rechtsgrundlage zugeordnet");
      const quality: CaseDocumentQuality =
        draft.used_sources.legal_sections.length === 0
          ? "red"
          : openIssues.length === 0
            ? "green"
            : "yellow";

      if (existing) {
        await updateCaseDocument(existing.id, {
          title,
          content,
          quality,
          open_issues: openIssues,
        });
        toast.success("Dokument aktualisiert");
      } else {
        await createCaseDocument({
          case_id: caseId,
          template_id: template?.id ?? null,
          title,
          content,
          quality,
          open_issues: openIssues,
          used_sources: draft.used_sources as unknown as Record<string, unknown>,
          generation_metadata: draft.generation_metadata,
        });
        toast.success("Dokumententwurf gespeichert");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(`Speichern fehlgeschlagen: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  const missingCount = currentPlaceholders.length;
  const statusIcon = missingCount === 0 ? "🟢" : "🟡";
  const statusText =
    missingCount === 0
      ? "Das Dokument ist vollständig und kann geprüft werden."
      : `Es fehlen noch ${missingCount} Angabe${missingCount === 1 ? "" : "n"}.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95vh] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b border-border px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-600" />
            {existing ? "Dokument bearbeiten" : "Dokument für diesen Fall erstellen"}
          </DialogTitle>
          <DialogDescription>
            Vorlage: <strong>{template?.title ?? "—"}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {genMut.isPending && !draft && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              KI erzeugt fallspezifischen Entwurf …
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          {draft && (
            <>
              {/* Status */}
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
                  missingCount === 0
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-amber-300 bg-amber-50",
                )}
              >
                <div className="flex items-start gap-2 text-sm">
                  <span aria-hidden>{statusIcon}</span>
                  <span className="font-medium text-foreground">{statusText}</span>
                </div>
                {missingCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setFillOpen(true)}
                    className="bg-violet-600 text-white hover:bg-violet-700"
                  >
                    <ClipboardEdit className="h-4 w-4" />
                    Fehlende Angaben ergänzen
                  </Button>
                )}
              </div>

              {/* Titel */}
              <div>
                <label className="mb-1 block text-xs font-medium">Dokumenttitel</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              {/* Editor */}
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium">Dokumententwurf</label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRegenerate}
                    disabled={genMut.isPending}
                  >
                    {genMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-3.5 w-3.5" />
                    )}
                    Entwurf erneut erzeugen
                  </Button>
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[340px] font-mono text-sm"
                />
                {currentPlaceholders.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-muted-foreground">Offene Platzhalter:</span>
                    {currentPlaceholders.slice(0, 12).map((p) => (
                      <Badge key={p} variant="outline" className="border-amber-300 text-amber-800">
                        {placeholderLabel(p)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Details zur Erstellung (eingeklappt) */}
              <Accordion type="single" collapsible className="rounded-lg border border-border">
                <AccordionItem value="details" className="border-none">
                  <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
                    Details zur Erstellung
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 px-3 pb-3 text-xs">
                    <div>
                      <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                        Verwendete Informationen
                      </div>
                      <ul className="space-y-1">
                        <li>✓ Praxisfall: {draft.used_sources.case.title || "—"}</li>
                        {draft.used_sources.fields_used.map((f) => (
                          <li key={f}>✓ {f.replace(/_/g, " ")}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                        Rechtsgrundlagen
                      </div>
                      {draft.used_sources.legal_sections.length === 0 ? (
                        <div className="text-amber-800">
                          ⚠ Keine Rechtsgrundlage zugeordnet – im Praxisfall verknüpfen.
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {draft.used_sources.legal_sections.map((s) => (
                            <li key={s.id} className="flex items-start gap-1">
                              <span>✓</span>
                              <span>
                                {s.label}
                                {s.official_url && (
                                  <a
                                    href={s.official_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ml-1 inline-flex text-primary hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {draft.used_sources.missing.length > 0 && (
                      <div>
                        <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                          Fehlende Angaben
                        </div>
                        <ul className="space-y-1 text-amber-800">
                          {draft.used_sources.missing.map((m) => (
                            <li key={m}>⚠ {m}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {draft.open_issues.length > 0 && (
                      <div>
                        <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                          Qualitätshinweise
                        </div>
                        <ul className="space-y-1">
                          {draft.open_issues.map((m) => (
                            <li key={m}>• {m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="h-4 w-4" />
            Schließen
          </Button>
          <Button type="button" onClick={handleSave} disabled={!draft || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {existing ? "Änderungen speichern" : "Als Entwurf speichern"}
          </Button>
        </div>

        <FillPlaceholdersDialog
          open={fillOpen}
          onOpenChange={setFillOpen}
          placeholders={currentPlaceholders}
          onApply={handleApplyPlaceholders}
        />
      </DialogContent>
    </Dialog>
  );
}


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SendEmailDialog({
  open,
  onOpenChange,
  doc,
  caseTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doc: CaseDocument | null;
  caseTitle: string;
}) {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    if (open && doc) {
      setSubject(`RechtKompass Schule: ${doc.title} – ${caseTitle}`);
      setError(null);
      setMessage("");
      try {
        const stored =
          typeof window !== "undefined"
            ? localStorage.getItem("rk_last_recipient_email") ?? ""
            : "";
        setRecipient(stored);
      } catch {
        setRecipient("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.id]);

  const empty = !doc || !(doc.content ?? "").trim();
  const validEmail = EMAIL_RE.test(recipient.trim());
  const openPlaceholders = useMemo(
    () => (doc ? extractPlaceholders(doc.content ?? "") : []),
    [doc?.content],
  );

  async function performSend() {
    if (!doc) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/send-case-document-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_document_id: doc.id,
          recipient_email: recipient.trim(),
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          msg = JSON.parse(text).error ?? text;
        } catch {
          /* noop */
        }
        throw new Error(msg || `HTTP ${res.status}`);
      }
      try {
        localStorage.setItem("rk_last_recipient_email", recipient.trim());
      } catch {
        /* noop */
      }
      toast.success("Dokument wurde per E-Mail versendet.");
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(`Versand fehlgeschlagen: ${msg}`);
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (!doc) return;
    if (openPlaceholders.length > 0) {
      const ok = window.confirm(
        `Das Dokument enthält noch ${openPlaceholders.length} offene Angabe(n). Trotzdem senden?`,
      );
      if (!ok) return;
      const confirm2 = window.confirm(
        "Bitte bestätigen: unvollständiges Dokument wirklich versenden?",
      );
      if (!confirm2) return;
    }
    await performSend();
  }

  const previewText = doc?.content ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-violet-600" />
            Dokument per E-Mail senden
          </DialogTitle>
          <DialogDescription>
            Das Dokument wird an die angegebene Adresse gesendet. Bitte Empfänger vor dem Versand
            prüfen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          {empty && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
              Dieses Dokument ist leer und kann nicht versendet werden.
            </div>
          )}
          {!empty && openPlaceholders.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              Das Dokument enthält noch {openPlaceholders.length} offene Angabe(n). Sie können
              zurück zum Dokument, um sie zu ergänzen, oder das Dokument bewusst unvollständig
              versenden (zusätzliche Bestätigung erforderlich).
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium">Empfänger-E-Mail</label>
            <Input
              type="email"
              placeholder="name@schule.nrw.de"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            {recipient && !validEmail && (
              <div className="mt-1 text-xs text-rose-700">Ungültige E-Mail-Adresse.</div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Betreff</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              Persönliche Notiz (optional)
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Kurze Notiz an den Empfänger …"
              className="min-h-[60px]"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium">Vorschau</div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {previewText || "(leer)"}
            </div>
          </div>
          {error && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
              {error}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            <X className="h-4 w-4" />
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || empty || !validEmail || !subject.trim()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Jetzt senden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CaseDocumentsPanel({

  caseId,
  linkedTemplates,
}: {
  caseId: string;
  linkedTemplates: LinkedTemplate[];
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "case-documents", caseId],
    queryFn: () => listCaseDocuments(caseId),
  });
  const [genOpen, setGenOpen] = useState(false);
  const [editing, setEditing] = useState<CaseDocument | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<LinkedTemplate | null>(null);
  const [emailDoc, setEmailDoc] = useState<CaseDocument | null>(null);


  const delMut = useMutation({
    mutationFn: (id: string) => deleteCaseDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "case-documents", caseId] });
      toast.success("Dokument gelöscht");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dupMut = useMutation({
    mutationFn: (id: string) => duplicateCaseDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "case-documents", caseId] });
      toast.success("Dokument dupliziert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templateById = useMemo(() => {
    const m = new Map<string, LinkedTemplate>();
    linkedTemplates.forEach((t) => m.set(t.id, t));
    return m;
  }, [linkedTemplates]);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-violet-600" />
            Erstellte Dokumente
          </div>
          <div className="text-xs text-muted-foreground">
            Fallspezifische Dokumententwürfe, generiert aus einer zugeordneten Vorlage.
          </div>
        </div>
      </div>

      {/* Buttons pro verknüpfter Vorlage */}
      {linkedTemplates.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Aus zugeordneter Vorlage erzeugen:
          </div>
          <div className="flex flex-wrap gap-2">
            {linkedTemplates.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant="outline"
                className="border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100"
                onClick={() => {
                  setEditing(null);
                  setSelectedTemplate(t);
                  setGenOpen(true);
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                🤖 Dokument aus „{t.title}"
              </Button>
            ))}
          </div>
        </div>
      )}
      {linkedTemplates.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          Diesem Fall ist noch keine Dokumentvorlage zugeordnet. Ordne oben eine Vorlage zu, um
          Dokumente daraus erzeugen zu können.
        </div>
      )}

      {/* Bestehende Dokumente */}
      <div className="space-y-2">
        {q.isLoading && <div className="text-xs text-muted-foreground">Lade Dokumente …</div>}
        {q.error && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
            Dokumente konnten nicht geladen werden: {(q.error as Error).message}. Migration
            <code className="mx-1">db/2026-07-12_case_documents.sql</code> ausgeführt?
          </div>
        )}
        {q.data && q.data.length === 0 && !q.isLoading && (
          <div className="text-xs text-muted-foreground">Noch keine Dokumente erstellt.</div>
        )}
        {(q.data ?? []).map((d) => {
          const tmpl = d.template_id ? templateById.get(d.template_id) : null;
          const openPh = (d.open_issues ?? []).length;
          return (
            <div
              key={d.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-background p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">{d.title}</div>
                  <QualityBadge q={d.quality} />
                  <Badge variant="outline">{d.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Vorlage: {tmpl?.title ?? "—"} · erstellt{" "}
                  {new Date(d.created_at).toLocaleString("de-DE")}
                </div>
                {openPh > 0 && (
                  <div className="mt-1 text-xs text-amber-800">
                    ⚠ {d.open_issues.join(" · ")}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(d);
                    setSelectedTemplate(tmpl ?? null);
                    setGenOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Bearbeiten
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-violet-700 hover:text-violet-800"
                  onClick={() => setEmailDoc(d)}
                  disabled={!(d.content ?? "").trim()}
                  title={
                    (d.content ?? "").trim() ? "Dokument per E-Mail versenden" : "Dokument ist leer"
                  }
                >
                  <Mail className="h-3.5 w-3.5" />
                  📧 An mich senden
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => dupMut.mutate(d.id)}
                  disabled={dupMut.isPending}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplizieren
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-rose-600 hover:text-rose-700"
                  onClick={() => {
                    if (confirm("Dokument wirklich löschen?")) delMut.mutate(d.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Löschen
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <GeneratorDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        caseId={caseId}
        template={selectedTemplate}
        existing={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "case-documents", caseId] })}
      />
      <SendEmailDialog
        open={!!emailDoc}
        onOpenChange={(v) => !v && setEmailDoc(null)}
        doc={emailDoc}
        caseTitle={
          (emailDoc?.used_sources as { case?: { title?: string } } | undefined)?.case?.title ??
          emailDoc?.title ??
          ""
        }
      />
    </div>

  );
}
