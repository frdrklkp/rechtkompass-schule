/**
 * Sprint 4.3D – Übersicht redaktioneller Workflow-Templates.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Upload } from "lucide-react";
import { useEditorialRole } from "@/hooks/editorial/useEditorialRole";
import {
  createTemplate,
  importTemplateJson,
  listAllTemplates,
} from "@/lib/workflowDesigner.functions";
import type { WorkflowTemplate } from "@/services/legal-workflows/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/editorial/workflows/")({
  component: WorkflowsListPage,
});

const STATUS_LABEL: Record<WorkflowTemplate["workflowStatus"], string> = {
  draft: "Entwurf",
  in_review: "In Prüfung",
  approved: "Freigegeben",
  published: "Veröffentlicht",
  archived: "Archiviert",
};

function WorkflowsListPage() {
  const role = useEditorialRole();
  const listFn = useServerFn(listAllTemplates);
  const createFn = useServerFn(createTemplate);
  const importFn = useServerFn(importTemplateJson);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkflowTemplate["workflowStatus"] | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const query = useQuery({
    queryKey: ["designer", "templates"],
    queryFn: () => listFn(),
    enabled: role.ready && role.canEdit,
  });

  const createMut = useMutation({
    mutationFn: (input: { slug: string; title: string }) => createFn({ data: input }),
    onSuccess: ({ id }) => {
      toast.success("Template angelegt.");
      qc.invalidateQueries({ queryKey: ["designer", "templates"] });
      setCreateOpen(false);
      navigate({ to: "/admin/editorial/workflows/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importMut = useMutation({
    mutationFn: (json: string) => importFn({ data: { json } }),
    onSuccess: ({ id }) => {
      toast.success("Template importiert.");
      qc.invalidateQueries({ queryKey: ["designer", "templates"] });
      setImportOpen(false);
      navigate({ to: "/admin/editorial/workflows/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const list = query.data?.templates ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((t) => {
      if (statusFilter !== "all" && t.workflowStatus !== statusFilter) return false;
      if (!needle) return true;
      return (
        t.title.toLowerCase().includes(needle) ||
        t.slug.toLowerCase().includes(needle) ||
        (t.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [query.data, q, statusFilter]);

  if (!role.ready) return null;
  if (!role.canEdit) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Der Workflow Designer ist nur für Redaktion, Review und Admin freigegeben.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Redaktion</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Workflow Designer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pflege datengetriebener Workflows für die Runtime. Änderungen werden erst mit einer neuen Version aktiv.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Upload className="mr-2 h-4 w-4" />JSON importieren</Button>
            </DialogTrigger>
            <ImportDialog onSubmit={(json) => importMut.mutate(json)} loading={importMut.isPending} />
          </Dialog>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />Neuer Workflow</Button>
            </DialogTrigger>
            <CreateDialog onSubmit={(v) => createMut.mutate(v)} loading={createMut.isPending} />
          </Dialog>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche nach Titel, Slug oder Beschreibung…"
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="all">Alle Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(query.error as Error).message}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Keine Templates gefunden.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link
                to="/admin/editorial/workflows/$id"
                params={{ id: t.id }}
                className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{t.title}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {STATUS_LABEL[t.workflowStatus]}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t.slug} · {t.phases.length} Phasen · {t.phases.reduce((n, p) => n + p.steps.length, 0)} Schritte
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">Öffnen →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateDialog({ onSubmit, loading }: { onSubmit: (v: { slug: string; title: string }) => void; loading: boolean }) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Neuer Workflow</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Titel</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ordnungsmaßnahme prüfen" />
        </div>
        <div>
          <Label>Slug</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ordnungsmassnahme-pruefen" />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={loading || !slug.trim() || !title.trim()}
          onClick={() => onSubmit({ slug: slug.trim(), title: title.trim() })}
        >
          {loading ? "Anlegen…" : "Anlegen"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ImportDialog({ onSubmit, loading }: { onSubmit: (json: string) => void; loading: boolean }) {
  const [json, setJson] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Workflow aus JSON importieren</DialogTitle></DialogHeader>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder='{ "kind": "workflow_template", "template": { ... } }'
        className="min-h-[240px] w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
      />
      <DialogFooter>
        <Button disabled={loading || !json.trim()} onClick={() => onSubmit(json)}>
          {loading ? "Importieren…" : "Importieren"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
