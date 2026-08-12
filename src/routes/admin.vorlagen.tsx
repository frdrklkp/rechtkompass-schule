import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TemplatePreviewModal } from "@/components/TemplatePreviewModal";
import { listCases } from "@/lib/coreBuilder";
import {
  createDocTemplate,
  deleteDocTemplate,
  listDocTemplates,
  updateDocTemplate,
  type DocTemplate,
  type TemplateInput,
} from "@/lib/templatesRepo";
import { seedStandardTemplates } from "@/lib/templateMatching";

export const Route = createFileRoute("/admin/vorlagen")({
  component: VorlagenAdmin,
});

type FormState = {
  id?: string;
  title: string;
  type: string;
  description: string;
  body: string;
  caseIds: string[];
};

const EMPTY_FORM: FormState = {
  title: "",
  type: "",
  description: "",
  body: "",
  caseIds: [],
};

function VorlagenAdmin() {
  const qc = useQueryClient();
  const templates = useQuery({
    queryKey: ["admin", "doc-templates"],
    queryFn: listDocTemplates,
  });
  const cases = useQuery({ queryKey: ["admin", "cases-basic"], queryFn: listCases });

  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [preview, setPreview] = useState<DocTemplate | null>(null);
  const [caseFilter, setCaseFilter] = useState("");

  const casesById = useMemo(() => {
    const m = new Map<string, string>();
    (cases.data ?? []).forEach((c: any) => m.set(c.id, c.title));
    return m;
  }, [cases.data]);

  const filteredCases = useMemo(() => {
    const q = caseFilter.trim().toLowerCase();
    const list = (cases.data ?? []) as any[];
    if (!q) return list.slice(0, 40);
    return list.filter((c) => (c.title ?? "").toLowerCase().includes(q)).slice(0, 40);
  }, [cases.data, caseFilter]);

  type SaveDiag = {
    action: "insert" | "update";
    table: string;
    payload: unknown;
    template_id?: string;
    case_ids?: string[];
    error?: { message?: string; code?: string; details?: string; hint?: string };
    ok?: boolean;
    at: string;
  };
  const [diag, setDiag] = useState<SaveDiag | null>(null);

  const saveMut = useMutation({
    mutationFn: async (input: TemplateInput & { id?: string }) => {
      const action = input.id ? "update" : "insert";
      const payload = {
        title: input.title,
        template_type: input.type,
        body: input.body,
        fields: { description: input.description },
      };
      setDiag({ action, table: "document_templates", payload, case_ids: input.caseIds, at: new Date().toISOString() });
      try {
        const res = input.id
          ? await updateDocTemplate(input.id, input)
          : await createDocTemplate(input);
        setDiag((d) => (d ? { ...d, template_id: res.id, ok: true } : d));
        return res;
      } catch (e: any) {
        setDiag((d) =>
          d
            ? {
                ...d,
                ok: false,
                error: {
                  message: e?.message,
                  code: e?.code,
                  details: e?.details,
                  hint: e?.hint,
                },
              }
            : d,
        );
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "doc-templates"] });
      qc.invalidateQueries({ queryKey: ["case-templates"] });
      toast.success("Vorlage gespeichert");
    },
    onError: (e: any) => toast.error(e?.message ?? "Speichern fehlgeschlagen"),
  });


  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDocTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "doc-templates"] });
      qc.invalidateQueries({ queryKey: ["case-templates"] });
      toast.success("Vorlage gelöscht");
    },
    onError: (e: any) => toast.error(e?.message ?? "Löschen fehlgeschlagen"),
  });
  const [seedReport, setSeedReport] = useState<Awaited<ReturnType<typeof seedStandardTemplates>> | null>(null);
  const seedStandardMut = useMutation({
    mutationFn: seedStandardTemplates,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin", "doc-templates"] });
      setSeedReport(res);
      const parts: string[] = [];
      if (res.created) parts.push(`✓ ${res.created} neu`);
      if (res.existing) parts.push(`✓ ${res.existing} vorhanden`);
      if (res.semanticSkipped) parts.push(`≈ ${res.semanticSkipped} semantische Dubletten`);
      if (res.failed) parts.push(`⚠ ${res.failed} Fehler`);
      toast.success(parts.length ? parts.join(" · ") : "Katalog vollständig.");
      if (res.failed && res.errors.length) {
        console.warn("[admin.vorlagen] seed errors", res.errors);
      }
    },
    onError: (e: any) =>
      toast.error("Vorlagenkatalog konnte nicht ergänzt werden: " + (e?.message ?? String(e))),
  });



  function openNew() {
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }
  function openEdit(t: DocTemplate) {
    setForm({
      id: t.id,
      title: t.title,
      type: t.meta.type,
      description: t.description ?? "",
      body: t.meta.body,
      caseIds: t.meta.caseIds,
    });
    setEditorOpen(true);
  }

  function submit() {
    if (!form.title.trim()) {
      toast.error("Titel ist erforderlich");
      return;
    }
    saveMut.mutate({
      id: form.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type.trim(),
      body: form.body,
      caseIds: form.caseIds,
    });
  }

  function toggleCase(id: string) {
    setForm((f) =>
      f.caseIds.includes(id)
        ? { ...f, caseIds: f.caseIds.filter((x) => x !== id) }
        : { ...f, caseIds: [...f.caseIds, id] },
    );
  }

  async function seedFilmingExample() {
    const list = (cases.data ?? []) as any[];
    const target = list.find((c) =>
      /(aufnahme|filmt|filmen)/i.test(c.title ?? ""),
    );
    if (!target) {
      toast.error(
        'Kein passender Fall gefunden. Bitte den Fall „Aufnahme durch Schüler:in ohne Einwilligung" anlegen.',
      );
      return;
    }
    const existing = templates.data ?? [];
    const seeds: TemplateInput[] = [
      {
        title: "Gesprächsnotiz",
        type: "Gesprächsnotiz",
        description:
          "Kurze, sachliche Notiz zu einem Gespräch mit der/dem Betroffenen und Zeug:innen.",
        body: `GESPRÄCHSNOTIZ\n\nDatum: \nOrt: \nTeilnehmende: \n\nAnlass:\nBeobachtete/gemeldete Aufnahme durch Schüler:in.\n\nGesprächsinhalt:\n- Sachverhalt aus Sicht der Beteiligten\n- Zeitpunkt, Ort, Geräte\n- Was wurde aufgenommen / geteilt?\n\nVereinbarungen / nächste Schritte:\n- \n\nUnterschrift Lehrkraft:`,
        caseIds: [target.id],
      },
      {
        title: "Aktenvermerk",
        type: "Aktenvermerk",
        description: "Sachliche Dokumentation für die Schülerakte.",
        body: `AKTENVERMERK\n\nDatum: \nVerfasser:in: \nBetroffene Person / Klasse: \n\nSachverhalt:\nHeimliche/unerlaubte Aufnahme einer Lehrkraft am ... in ...\n\nBeobachtungen (ohne Wertung):\n- \n\nErgriffene Sofortmaßnahmen:\n- Gerät gesichtet / Löschung veranlasst\n- Schulleitung informiert am ...\n- Datenschutzbeauftragte:r informiert am ...\n\nNächste Schritte:\n- Anhörung nach § 28 VwVfG NRW vorbereiten\n- Rücksprache mit Erziehungsberechtigten / Ausbildungsbetrieb`,
        caseIds: [target.id],
      },
      {
        title: "Information an Klassenleitung/Schulleitung",
        type: "Interne Information",
        description:
          "Schriftliche Information an Klassenleitung und Schulleitung über den Vorfall.",
        body: `AN: Klassenleitung / Schulleitung\nVON: \nDATUM: \nBETREFF: Unerlaubte Bild-/Tonaufnahme im Unterricht\n\nSachverhalt:\nAm ... wurde im Unterricht der Klasse ... festgestellt, dass eine Schüler:in ohne Einwilligung eine Aufnahme der Lehrkraft angefertigt hat.\n\nSofortmaßnahmen:\n- \n\nBitte um:\n- Kenntnisnahme\n- Rücksprache zum weiteren Vorgehen\n- Prüfung datenschutzrechtlicher Meldepflichten (Art. 33 DSGVO)\n\nAnlagen: Aktenvermerk, Gesprächsnotiz`,
        caseIds: [target.id],
      },
    ];

    let created = 0;
    let linked = 0;
    for (const seed of seeds) {
      const match = existing.find(
        (t) => t.title.toLowerCase() === seed.title.toLowerCase(),
      );
      try {
        if (match) {
          if (!match.meta.caseIds.includes(target.id)) {
            await updateDocTemplate(match.id, {
              title: match.title,
              description: match.description,
              type: match.meta.type || seed.type,
              body: match.meta.body || seed.body,
              caseIds: [...match.meta.caseIds, target.id],
            });
            linked += 1;
          }
        } else {
          await createDocTemplate(seed);
          created += 1;
        }
      } catch (e: any) {
        toast.error(`${seed.title}: ${e?.message ?? "Fehler"}`);
      }
    }
    qc.invalidateQueries({ queryKey: ["admin", "doc-templates"] });
    qc.invalidateQueries({ queryKey: ["case-templates"] });
    toast.success(
      `Beispieldaten aktualisiert (${created} neu, ${linked} verknüpft) für „${target.title}".`,
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Inhalte
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dokumentationsvorlagen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {templates.data
              ? `${templates.data.length} Vorlagen – mit Praxisfällen verknüpfbar.`
              : "…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={seedFilmingExample} disabled={!cases.data}>
            <Sparkles className="mr-1 h-4 w-4" /> Beispiel „Filmen"
          </Button>
          <Button
            variant="outline"
            onClick={() => seedStandardMut.mutate()}
            disabled={seedStandardMut.isPending}
            title="Vorhandenen Katalog analysieren und nur fehlende Vorlagen als Entwurf ergänzen (semantische Dubletten werden übersprungen)."
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {seedStandardMut.isPending ? "Analysiere Katalog …" : "Vorlagenkatalog intelligent ergänzen"}
          </Button>
          <Button onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Neue Vorlage
          </Button>

        </div>
      </header>

      {templates.isLoading && <LoadingState />}
      {templates.error && <ErrorState error={templates.error} />}
      {templates.data && templates.data.length === 0 && (
        <EmptyState
          title="Noch keine Vorlagen"
          description="Lege deine erste Dokumentationsvorlage an."
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {(templates.data ?? []).map((t) => (
          <div key={t.id} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">{t.title}</h2>
                  {t.meta.type && (
                    <p className="text-xs text-muted-foreground">{t.meta.type}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPreview(t)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Vorschau"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Bearbeiten"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Vorlage „${t.title}" wirklich löschen?`)) deleteMut.mutate(t.id);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  title="Löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {t.description && (
              <p className="text-xs text-muted-foreground">{t.description}</p>
            )}
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Verknüpfte Praxisfälle ({t.meta.caseIds.length})
              </p>
              {t.meta.caseIds.length === 0 ? (
                <p className="mt-1 text-[11px] italic text-muted-foreground">
                  Noch nicht verknüpft.
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {t.meta.caseIds.slice(0, 4).map((id) => (
                    <li key={id} className="text-[11px] text-foreground/80">
                      · {casesById.get(id) ?? id}
                    </li>
                  ))}
                  {t.meta.caseIds.length > 4 && (
                    <li className="text-[11px] text-muted-foreground">
                      … +{t.meta.caseIds.length - 4} weitere
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Vorlage bearbeiten" : "Neue Vorlage"}</DialogTitle>
            <DialogDescription>
              Titel, Typ, Beschreibung und Textbaustein pflegen sowie Praxisfälle verknüpfen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="tpl-title">Titel *</Label>
                <Input
                  id="tpl-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="z. B. Aktenvermerk"
                />
              </div>
              <div>
                <Label htmlFor="tpl-type">Typ</Label>
                <Input
                  id="tpl-type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  placeholder="z. B. Gesprächsnotiz"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="tpl-desc">Beschreibung / Zweck</Label>
              <Textarea
                id="tpl-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Wozu dient diese Vorlage?"
              />
            </div>

            <div>
              <Label htmlFor="tpl-body">Textbaustein</Label>
              <Textarea
                id="tpl-body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={10}
                className="font-mono text-xs"
                placeholder="Vorformulierter Text, den Lehrkräfte übernehmen und anpassen können."
              />
            </div>

            <div>
              <Label>Verknüpfte Praxisfälle ({form.caseIds.length})</Label>
              <Input
                value={caseFilter}
                onChange={(e) => setCaseFilter(e.target.value)}
                placeholder="Fälle suchen …"
                className="mt-1"
              />
              <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-background p-2">
                {cases.isLoading && (
                  <p className="p-2 text-xs text-muted-foreground">Lade Praxisfälle …</p>
                )}
                {filteredCases.length === 0 && !cases.isLoading && (
                  <p className="p-2 text-xs text-muted-foreground">Keine Fälle gefunden.</p>
                )}
                {filteredCases.map((c: any) => {
                  const checked = form.caseIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleCase(c.id)}
                        className="mt-0.5"
                      />
                      <span className="flex-1">
                        <span className="font-medium">{c.title}</span>
                        {c.category && (
                          <span className="ml-1 text-muted-foreground">· {c.category}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {diag && (
            <div
              className={`mt-4 rounded-md border p-3 text-xs ${
                diag.ok === false
                  ? "border-danger/40 bg-danger/5 text-danger"
                  : diag.ok
                    ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                    : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              <p className="font-semibold">
                Speicherdiagnose · {diag.action.toUpperCase()} {diag.table}
              </p>
              <p>Zeit: {diag.at}</p>
              {diag.template_id && <p>template_id: {diag.template_id}</p>}
              {diag.case_ids && (
                <p>case_ids ({diag.case_ids.length}): {diag.case_ids.join(", ") || "—"}</p>
              )}
              {diag.error && (
                <div className="mt-1">
                  <p>error.message: {diag.error.message}</p>
                  {diag.error.code && <p>error.code: {diag.error.code}</p>}
                  {diag.error.details && <p>error.details: {diag.error.details}</p>}
                  {diag.error.hint && <p>error.hint: {diag.error.hint}</p>}
                </div>
              )}
              <details className="mt-1">
                <summary className="cursor-pointer">Payload</summary>
                <pre className="mt-1 whitespace-pre-wrap break-all">
                  {JSON.stringify(diag.payload, null, 2)}
                </pre>
              </details>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Schließen
            </Button>
            <Button onClick={submit} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Speichere …" : "Speichern"}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      <TemplatePreviewModal
        template={preview}
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
      />

      <Dialog open={!!seedReport} onOpenChange={(v) => !v && setSeedReport(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kataloganalyse abgeschlossen</DialogTitle>
            <DialogDescription>
              Vorhandene Vorlagen wurden analysiert, semantische Dubletten erkannt und nur
              tatsächlich fehlende Vorlagen als Entwurf angelegt.
            </DialogDescription>
          </DialogHeader>
          {seedReport && (
            <div className="space-y-4 text-sm">
              <ul className="space-y-1">
                <li>✓ {seedReport.totalExistingBefore} vorhandene Vorlagen analysiert</li>
                <li>✓ {seedReport.created} fehlende Vorlagen neu angelegt (draft)</li>
                <li>✓ {seedReport.existing} Vorlagen mit identischem Titel übersprungen</li>
                <li>≈ {seedReport.semanticSkipped} semantische Dubletten übersprungen</li>
                {seedReport.failed > 0 && (
                  <li className="text-danger">⚠ {seedReport.failed} Fehler beim Anlegen</li>
                )}
                <li className="text-muted-foreground">
                  Gesamt-Katalogeinträge (Standard): {seedReport.totalCatalog}
                </li>
              </ul>

              {seedReport.createdTitles.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Neu angelegt
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs">
                    {seedReport.createdTitles.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {seedReport.semanticSkippedTitles.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Semantisch bereits abgedeckt
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {seedReport.semanticSkippedTitles.map((x) => (
                      <li key={x.seed}>
                        „{x.seed}" ≈ vorhandenes „{x.matched}"
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {seedReport.errors.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">
                    Fehler
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-danger">
                    {seedReport.errors.map((e) => (
                      <li key={e.title}>
                        {e.title}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSeedReport(null)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

