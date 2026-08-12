import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { useLegalSources } from "@/hooks/legal-knowledge/useLegalKnowledge";
import {
  LEGAL_SOURCE_LIFECYCLE_LABELS,
  LEGAL_SOURCE_TYPE_LABELS,
  LEGAL_SOURCE_VERIFICATION_LABELS,
  type LegalSourceLifecycle,
  type LegalSourceType,
  type LegalSourceVerification,
} from "@/services/legal-knowledge";
import { ArrowRight, ShieldCheck, ShieldAlert, ShieldQuestion, BadgeCheck } from "lucide-react";

// Gleiche Semantik wie zuvor: unbekannte/fehlende Werte fallen auf die
// bisherigen Defaults zurück, `onlyOfficial` nur bei true bzw. "true".
const searchSchema = z.object({
  q: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()).default(""),
  lifecycle: z
    .preprocess((v) => (typeof v === "string" ? v : "all"), z.string())
    .default("all"),
  verification: z
    .preprocess((v) => (typeof v === "string" ? v : "all"), z.string())
    .default("all"),
  type: z.preprocess((v) => (typeof v === "string" ? v : "all"), z.string()).default("all"),
  onlyOfficial: z
    .preprocess((v) => v === true || v === "true", z.boolean())
    .default(false),
});

export const Route = createFileRoute("/admin/legal-knowledge/sources")({
  validateSearch: zodValidator(searchSchema),
  component: LegalSourcesListPage,
});

// Aus der Route abgeleitete, vollständig validierte Search-Form.
type SourcesSearch = ReturnType<typeof Route.useSearch>;


function LifecycleBadge({ v }: { v: LegalSourceLifecycle }) {
  const tone: Record<LegalSourceLifecycle, string> = {
    draft: "bg-muted text-muted-foreground",
    imported: "bg-blue-500/10 text-blue-700",
    needs_review: "bg-amber-500/10 text-amber-700",
    verified: "bg-emerald-500/10 text-emerald-700",
    active: "bg-emerald-600/15 text-emerald-800",
    outdated: "bg-orange-500/10 text-orange-700",
    archived: "bg-neutral-500/10 text-neutral-600",
    rejected: "bg-red-500/10 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone[v]}`}>
      {LEGAL_SOURCE_LIFECYCLE_LABELS[v]}
    </span>
  );
}

function VerificationIcon({ v }: { v: LegalSourceVerification }) {
  if (v === "authority_verified") return <BadgeCheck className="h-4 w-4 text-emerald-600" />;
  if (v === "editorial_reviewed") return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
  if (v === "technical_validated") return <ShieldQuestion className="h-4 w-4 text-blue-600" />;
  return <ShieldAlert className="h-4 w-4 text-amber-600" />;
}

function LegalSourcesListPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filter = {
    search: search.q || undefined,
    lifecycle: search.lifecycle as LegalSourceLifecycle | "all",
    verification: search.verification as LegalSourceVerification | "all",
    type: search.type as LegalSourceType | "all",
    onlyOfficial: search.onlyOfficial,
  };
  const { data, isLoading, error } = useLegalSources(filter);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground">Suche</label>
          <input
            type="search"
            value={search.q}
            onChange={(e) => navigate({ to: ".", search: (p: SourcesSearch) => ({ ...p, q: e.target.value }) })}
            placeholder="Titel, Kurzname, Herausgeber …"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <SelectFilter
          label="Status"
          value={search.lifecycle}
          onChange={(v) => navigate({ to: ".", search: (p: SourcesSearch) => ({ ...p, lifecycle: v }) })}
          options={[["all", "Alle"], ...Object.entries(LEGAL_SOURCE_LIFECYCLE_LABELS)]}
        />
        <SelectFilter
          label="Prüfung"
          value={search.verification}
          onChange={(v) => navigate({ to: ".", search: (p: SourcesSearch) => ({ ...p, verification: v }) })}
          options={[["all", "Alle"], ...Object.entries(LEGAL_SOURCE_VERIFICATION_LABELS)]}
        />
        <SelectFilter
          label="Typ"
          value={search.type}
          onChange={(v) => navigate({ to: ".", search: (p: SourcesSearch) => ({ ...p, type: v }) })}
          options={[["all", "Alle"], ...Object.entries(LEGAL_SOURCE_TYPE_LABELS)]}
        />
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={search.onlyOfficial}
            onChange={(e) => navigate({ to: ".", search: (p: SourcesSearch) => ({ ...p, onlyOfficial: e.target.checked }) })}
          />
          Nur amtlich
        </label>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Lade Quellen …</p>}
      {error && (
        <p className="text-sm text-red-600">
          Konnte Quellen nicht laden: {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Titel</th>
                <th className="py-2 pr-3">Kurzname</th>
                <th className="py-2 pr-3">Typ</th>
                <th className="py-2 pr-3">Zuständigkeit</th>
                <th className="py-2 pr-3">Prüfung</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{s.title}</div>
                    {s.authority && (
                      <div className="text-[11px] text-muted-foreground">{s.authority}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{s.shortName ?? "—"}</td>
                  <td className="py-2 pr-3">{LEGAL_SOURCE_TYPE_LABELS[s.sourceType]}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {s.jurisdiction ?? s.federalState ?? "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1">
                      <VerificationIcon v={s.verificationStatus} />
                      <span className="text-[11px]">
                        {LEGAL_SOURCE_VERIFICATION_LABELS[s.verificationStatus]}
                      </span>
                    </span>
                  </td>
                  <td className="py-2 pr-3"><LifecycleBadge v={s.lifecycleStatus} /></td>
                  <td className="py-2 pr-3 text-right">
                    <Link
                      to="/admin/legal-knowledge/sources/$id"
                      params={{ id: s.id }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      Öffnen <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Keine Rechtsquellen gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SelectFilter({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}
