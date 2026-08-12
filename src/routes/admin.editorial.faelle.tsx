/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEditorialCases } from "@/hooks/editorial/useWorkflowActions";
import {
  WorkflowBadge,
  PublicationBadge,
  QualityBadge,
  LegalUpdateBadge,
} from "@/components/editorial/badges";
import type {
  CaseFilters,
  PublicationTier,
  WorkflowStatus,
} from "@/services/editorial";

const searchSchema = z.object({
  status: z.string().optional(),
  tier: z.string().optional(),
  category: z.string().optional(),
  legalUpdate: z.number().optional(),
  q: z.string().optional(),
  page: z.number().default(1),
  sort: z.enum(["title", "updated_at", "workflow_status", "quality_status"]).default("updated_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export const Route = createFileRoute("/admin/editorial/faelle")({
  validateSearch: zodValidator(searchSchema),
  component: EditorialCasesList,
});

function EditorialCasesList() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/editorial/faelle" });
  const [qLocal, setQLocal] = useState(search.q ?? "");

  const filters: CaseFilters = {
    workflowStatus: search.status ? [search.status as WorkflowStatus] : undefined,
    publicationTier: search.tier ? [search.tier as PublicationTier] : undefined,
    category: search.category ?? null,
    legalUpdateOnly: !!search.legalUpdate,
    search: search.q,
  };
  const pageSize = 25;
  const q = useEditorialCases(
    filters,
    { page: search.page, pageSize },
    { field: search.sort, direction: search.dir },
  );

  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Redaktion</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Praxisfälle</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {q.isLoading ? "…" : `${total} Fälle`}
          </p>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ search: (p: any) => ({ ...p, q: qLocal || undefined, page: 1 }) });
        }}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            placeholder="Titel suchen…"
            className="pl-9"
          />
        </div>
        <select
          value={search.status ?? ""}
          onChange={(e) =>
            navigate({ search: (p: any) => ({ ...p, status: e.target.value || undefined, page: 1 }) })
          }
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Alle Workflow-Status</option>
          <option value="draft">Entwurf</option>
          <option value="in_review">In Prüfung</option>
          <option value="approved">Genehmigt</option>
          <option value="published">Veröffentlicht</option>
          <option value="archived">Archiviert</option>
        </select>
        <select
          value={search.tier ?? ""}
          onChange={(e) =>
            navigate({ search: (p: any) => ({ ...p, tier: e.target.value || undefined, page: 1 }) })
          }
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Alle Sichtbarkeiten</option>
          <option value="internal">Intern</option>
          <option value="beta">Beta</option>
          <option value="public">Öffentlich</option>
          <option value="premium">Premium</option>
        </select>
        <Button type="submit" variant="outline">
          Anwenden
        </Button>
      </form>

      {q.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {q.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Fehler beim Laden der Fälle.
        </div>
      )}

      {q.data && q.data.rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Keine Fälle mit diesen Filtern.
        </div>
      )}

      {q.data && q.data.rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2.5"></th>
                <th className="px-3 py-2.5 text-left font-medium">Titel</th>
                <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Kategorie</th>
                <th className="px-3 py-2.5 text-left font-medium">Workflow</th>
                <th className="px-3 py-2.5 text-left font-medium">Sichtbar.</th>
                <th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Qualität</th>
                <th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Aktualisiert</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data.rows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Fall ${c.title} auswählen`}
                      className="h-4 w-4 rounded border-input"
                      disabled
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      to="/admin/editorial/faelle/$id"
                      params={{ id: c.id }}
                      className="font-medium hover:underline"
                    >
                      {c.title}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2">
                      <LegalUpdateBadge active={c.legal_update_required} />
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                    {c.category ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <WorkflowBadge status={c.workflow_status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <PublicationBadge tier={c.publication_tier} />
                  </td>
                  <td className="hidden px-3 py-2.5 lg:table-cell">
                    <QualityBadge status={c.quality_status} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground lg:table-cell">
                    {c.updated_at ? new Date(c.updated_at).toLocaleDateString("de-DE") : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      to="/admin/editorial/faelle/$id"
                      params={{ id: c.id }}
                      className="text-xs text-primary hover:underline"
                    >
                      öffnen
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Seite {search.page} von {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={search.page <= 1}
              onClick={() => navigate({ search: (p: any) => ({ ...p, page: p.page - 1 }) })}
            >
              Zurück
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={search.page >= totalPages}
              onClick={() => navigate({ search: (p: any) => ({ ...p, page: p.page + 1 }) })}
            >
              Weiter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
