/** Sprint 4.5H – Strukturierte Importvorschau (Allgemein / Übersicht / Delta). */
import { FileText, Layers, GitCompare } from "lucide-react";
import type { ImportPreviewModel } from "@/services/legal-knowledge/import-experience";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function Block({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function DeltaCell({ value, tone }: { value: number; tone: "added" | "updated" | "removed" }) {
  const map = {
    added: "bg-emerald-500/10 text-emerald-800",
    updated: "bg-amber-500/10 text-amber-800",
    removed: "bg-rose-500/10 text-rose-800",
  } as const;
  return (
    <td
      className={`px-2 py-1 text-right tabular-nums font-medium ${value > 0 ? map[tone] : "text-muted-foreground"}`}
    >
      {value}
    </td>
  );
}

export function ImportPreviewPanel({ model }: { model: ImportPreviewModel }) {
  const g = model.general;
  const o = model.overview;
  const d = model.delta;
  const statusTone =
    g.status === "blocked"
      ? "bg-rose-500/10 text-rose-800"
      : g.status === "no_change"
        ? "bg-muted text-muted-foreground"
        : "bg-emerald-500/10 text-emerald-800";

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Block title="Allgemein" icon={<FileText className="h-3.5 w-3.5" />}>
        <dl className="text-xs">
          <Row label="Quelle" value={g.sourceTitle} />
          <Row label="Parser" value={g.parserLabel} />
          <Row label="Version" value={g.versionLabel} />
          <Row label="Importdatum" value={new Date(g.importedAt).toLocaleString("de-DE")} />
          <Row label="Importdauer" value={`${g.durationMs} ms`} />
          <div className="flex items-center justify-between gap-3 py-1">
            <dt className="text-muted-foreground">Importstatus</dt>
            <dd>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone}`}>
                {g.statusLabel}
              </span>
            </dd>
          </div>
        </dl>
      </Block>

      <Block title="Dokumentübersicht" icon={<Layers className="h-3.5 w-3.5" />}>
        <dl className="text-xs">
          <Row label="Importierte Dokumente" value={String(o.documents)} />
          <Row label="Paragraphen" value={String(o.paragraphs)} />
          <Row label="Absätze" value={String(o.subsections)} />
          <Row label="Anlagen" value={String(o.attachments)} />
          <Row label="Interne Verweise" value={String(o.internalReferences)} />
          <Row label="Externe Verweise" value={String(o.externalReferences)} />
        </dl>
      </Block>

      <Block title="Delta" icon={<GitCompare className="h-3.5 w-3.5" />}>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left">Bereich</th>
              <th className="px-2 py-1 text-right text-emerald-700">Neu</th>
              <th className="px-2 py-1 text-right text-amber-700">Geändert</th>
              <th className="px-2 py-1 text-right text-rose-700">Entfernt</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Dokumente", d.documents],
                ["Paragraphen", d.paragraphs],
                ["Absätze", d.subsections],
                ["Anlagen", d.attachments],
              ] as const
            ).map(([label, c]) => (
              <tr key={label} className="border-t border-border/60">
                <td className="px-2 py-1">{label}</td>
                <DeltaCell value={c.added} tone="added" />
                <DeltaCell value={c.updated} tone="updated" />
                <DeltaCell value={c.removed} tone="removed" />
              </tr>
            ))}
            <tr className="border-t border-border font-semibold">
              <td className="px-2 py-1">Gesamt</td>
              <DeltaCell value={d.total.added} tone="added" />
              <DeltaCell value={d.total.updated} tone="updated" />
              <DeltaCell value={d.total.removed} tone="removed" />
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {d.total.unchanged} Knoten unverändert · Farben: grün = neu, gelb = geändert, rot =
          entfernt
        </p>
      </Block>
    </div>
  );
}
