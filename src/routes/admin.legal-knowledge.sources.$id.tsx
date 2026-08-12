import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  useLegalSource,
  useLegalSourceReviewEvents,
  useLegalSourceVersions,
  useLegalIngestionJobsForSource,
  useTransitionLegalSourceStatus,
  useSetLegalSourceVerification,
  useUpdateLegalSource,
} from "@/hooks/legal-knowledge/useLegalKnowledge";
import {
  LEGAL_LIFECYCLE_TRANSITIONS,
  LEGAL_SOURCE_LIFECYCLE_LABELS,
  LEGAL_SOURCE_TYPE_LABELS,
  LEGAL_SOURCE_VERIFICATION_LABELS,
  type LegalSourceLifecycle,
  type LegalSourceVerification,
} from "@/services/legal-knowledge";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocumentStructurePanel } from "@/components/legal-knowledge/DocumentStructurePanel";
import { ChunksPanel } from "@/components/legal-knowledge/ChunksPanel";
import { EmbeddingIndexPanel } from "@/components/legal-knowledge/EmbeddingIndexPanel";

export const Route = createFileRoute("/admin/legal-knowledge/sources/$id")({
  component: LegalSourceDetailPage,
});

const TABS = [
  "overview", "content", "structure", "chunks", "embeddings", "metadata", "versions",
  "ingestion", "validation", "history",
] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABELS: Record<TabKey, string> = {
  overview: "Übersicht",
  content: "Inhalt",
  structure: "Dokumentstruktur",
  chunks: "Chunks",
  embeddings: "Wissensindex",
  metadata: "Metadaten",
  versions: "Versionen",
  ingestion: "Ingestion",
  validation: "Validierung",
  history: "Historie",
};

function LegalSourceDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useLegalSource(id);
  const [tab, setTab] = useState<TabKey>("overview");

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Lade Quelle …</p>;
  if (error || !data) return <p className="p-4 text-sm text-red-600">Quelle konnte nicht geladen werden.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/admin/legal-knowledge/sources"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Zurück zum Register
        </Link>
        {data.officialUrl && (
          <a
            href={data.officialUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Offizielle Quelle <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {LEGAL_SOURCE_TYPE_LABELS[data.sourceType]}
          {data.shortName && <> · {data.shortName}</>}
        </div>
        <h1 className="mt-1 text-lg font-semibold">{data.title}</h1>
        {data.description && (
          <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-muted px-2 py-0.5">
            Status: {LEGAL_SOURCE_LIFECYCLE_LABELS[data.lifecycleStatus]}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5">
            Prüfung: {LEGAL_SOURCE_VERIFICATION_LABELS[data.verificationStatus]}
          </span>
          {data.jurisdiction && (
            <span className="rounded-full bg-muted px-2 py-0.5">Zuständigkeit: {data.jurisdiction}</span>
          )}
          {data.versionLabel && (
            <span className="rounded-full bg-muted px-2 py-0.5">Fassung: {data.versionLabel}</span>
          )}
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              tab === t
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      <div className="rounded-2xl border border-border bg-card p-5">
        {tab === "overview" && <OverviewTab source={data} />}
        {tab === "content" && <ContentTab source={data} />}
        {tab === "structure" && <DocumentStructurePanel source={data} />}
        {tab === "chunks" && <ChunksPanel source={data} />}
        {tab === "embeddings" && <EmbeddingIndexPanel source={data} />}
        {tab === "metadata" && <MetadataTab source={data} />}
        {tab === "versions" && <VersionsTab id={data.id} />}
        {tab === "ingestion" && <IngestionTab id={data.id} />}
        {tab === "validation" && <ValidationTab source={data} />}
        {tab === "history" && <HistoryTab id={data.id} />}
      </div>
    </div>
  );
}

function OverviewTab({ source }: { source: import("@/services/legal-knowledge").LegalSourceDomain }) {
  const transition = useTransitionLegalSourceStatus();
  const setVerification = useSetLegalSourceVerification();
  const allowed = LEGAL_LIFECYCLE_TRANSITIONS[source.lifecycleStatus] ?? [];
  const [note, setNote] = useState("");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Statuswechsel</h2>
        <p className="text-xs text-muted-foreground">
          Nur zulässige Übergänge werden angezeigt. Alle Wechsel werden protokolliert.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notiz zur Statusänderung (empfohlen)"
          className="min-h-[64px] w-full rounded-md border border-input bg-background p-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {allowed.length === 0 && (
            <p className="text-xs text-muted-foreground">Kein Statuswechsel möglich.</p>
          )}
          {allowed.map((to) => (
            <button
              key={to}
              disabled={transition.isPending}
              onClick={() => transition.mutate({ id: source.id, to, note: note || null })}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent"
            >
              → {LEGAL_SOURCE_LIFECYCLE_LABELS[to]}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Prüfstufe setzen</h2>
        <p className="text-xs text-muted-foreground">
          Die Prüfstufe dokumentiert die redaktionelle bzw. amtliche Verifikation.
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LEGAL_SOURCE_VERIFICATION_LABELS) as LegalSourceVerification[]).map((v) => (
            <button
              key={v}
              disabled={setVerification.isPending}
              onClick={() => setVerification.mutate({ id: source.id, verification: v })}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                source.verificationStatus === v
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-background hover:border-accent"
              }`}
            >
              {LEGAL_SOURCE_VERIFICATION_LABELS[v]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContentTab({ source }: { source: import("@/services/legal-knowledge").LegalSourceDomain }) {
  const update = useUpdateLegalSource();
  const [original, setOriginal] = useState(source.originalContent ?? "");
  const [normalized, setNormalized] = useState(source.normalizedContent ?? "");
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Original</label>
        <textarea
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
          className="mt-1 min-h-[160px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Normalisiert</label>
        <textarea
          value={normalized}
          onChange={(e) => setNormalized(e.target.value)}
          className="mt-1 min-h-[160px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
      </div>
      <button
        onClick={() => update.mutate({ id: source.id, patch: { originalContent: original, normalizedContent: normalized } })}
        disabled={update.isPending}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
      >
        {update.isPending ? "Speichere …" : "Speichern"}
      </button>
    </div>
  );
}

function MetadataTab({ source }: { source: import("@/services/legal-knowledge").LegalSourceDomain }) {
  const rows: [string, string | null | undefined][] = [
    ["Kurzname", source.shortName],
    ["Rechtsgebiet", source.legalArea],
    ["Zuständigkeit", source.jurisdiction],
    ["Herausgeber", source.authority],
    ["Bundesland", source.federalState],
    ["Schulform", source.schoolType],
    ["Bildungsbereich", source.educationalArea],
    ["Rechtsdomäne", source.legalDomain],
    ["Fassung", source.versionLabel],
    ["Veröffentlicht", source.publishedAt],
    ["Gültig ab", source.validFrom],
    ["Gültig bis", source.validTo],
    ["Zuletzt geprüft", source.lastReviewedAt],
    ["Zuletzt verifiziert", source.lastVerifiedAt],
    ["Format", source.sourceFormat],
    ["Sprache", source.sourceLanguage],
    ["Prüfsumme", source.checksum],
    ["Amtlich", source.officialSource ? "ja" : "nein"],
  ];
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="rounded-md border border-border bg-background p-2 text-xs">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function VersionsTab({ id }: { id: string }) {
  const { data, isLoading } = useLegalSourceVersions(id);
  if (isLoading) return <p className="text-sm text-muted-foreground">Lade Versionen …</p>;
  const rows = data ?? [];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-md border border-border bg-background p-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{r.title}</div>
              <div className="text-[11px] text-muted-foreground">
                {LEGAL_SOURCE_LIFECYCLE_LABELS[r.lifecycleStatus]}
                {r.versionLabel && <> · {r.versionLabel}</>}
                {r.publishedAt && <> · {r.publishedAt}</>}
              </div>
            </div>
            {r.id !== id && (
              <Link
                to="/admin/legal-knowledge/sources/$id"
                params={{ id: r.id }}
                className="text-xs font-medium text-accent hover:underline"
              >
                Öffnen
              </Link>
            )}
          </div>
        </li>
      ))}
      {rows.length === 0 && (
        <li className="text-xs text-muted-foreground">Keine Versionsbeziehungen erfasst.</li>
      )}
    </ul>
  );
}

function IngestionTab({ id }: { id: string }) {
  const { data } = useLegalIngestionJobsForSource(id);
  const jobs = data ?? [];
  if (jobs.length === 0) return <p className="text-sm text-muted-foreground">Keine Ingestion-Läufe zu dieser Quelle.</p>;
  return (
    <ul className="space-y-2">
      {jobs.map((j) => (
        <li key={j.id} className="rounded-md border border-border bg-background p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">{j.inputType}</span>
            <span className="text-muted-foreground">{j.status}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {j.createdAt}{j.errorMessage ? ` · Fehler: ${j.errorMessage}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ValidationTab({ source }: { source: import("@/services/legal-knowledge").LegalSourceDomain }) {
  const missing: string[] = [];
  if (!source.jurisdiction) missing.push("Zuständigkeit");
  if (!source.authority) missing.push("Herausgeber");
  if (!source.publishedAt) missing.push("Veröffentlichungsdatum");
  if (!source.officialUrl) missing.push("offizielle URL");
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Deterministische Prüfung – zeigt fehlende Kernangaben. Keine KI-Bewertung.
      </p>
      {missing.length === 0 ? (
        <p className="text-emerald-700">Alle Kernangaben vorhanden.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-amber-700">
          {missing.map((m) => <li key={m}>Fehlt: {m}</li>)}
        </ul>
      )}
    </div>
  );
}

function HistoryTab({ id }: { id: string }) {
  const { data } = useLegalSourceReviewEvents(id);
  const events = data ?? [];
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Keine Statusereignisse.</p>;
  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="rounded-md border border-border bg-background p-3 text-xs">
          <div className="font-medium">
            {(e.fromStatus ? LEGAL_SOURCE_LIFECYCLE_LABELS[e.fromStatus] : "—")}
            {" → "}
            {LEGAL_SOURCE_LIFECYCLE_LABELS[e.toStatus]}
          </div>
          <div className="text-[11px] text-muted-foreground">{e.createdAt}</div>
          {e.note && <p className="mt-1 text-foreground/80">{e.note}</p>}
        </li>
      ))}
    </ul>
  );
}
