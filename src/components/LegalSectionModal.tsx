import { useEffect, useState } from "react";
import { ExternalLink, Scale } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { LegalSectionCard } from "@/data/cases";

function Block({ title, text }: { title: string; text?: string | null }) {
  const v = typeof text === "string" ? text.trim() : "";
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {v ? (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{v}</p>
      ) : (
        <p className="mt-1 text-xs italic text-muted-foreground">
          Dieser Abschnitt ist noch nicht redaktionell ausgearbeitet.
        </p>
      )}
    </section>
  );
}

function formatDate(v?: string | null): string | null {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return v;
  }
}

export function LegalSectionModal({
  section,
  sectionId,
  open,
  onOpenChange,
}: {
  section?: LegalSectionCard | null;
  sectionId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [fetched, setFetched] = useState<LegalSectionCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsFetch = !!(open && !section && sectionId);

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      const { data, error } = await (supabase.from("legal_sections") as any)
        .select(
          "id, section_number, title, summary, practice_relevance, recommendation, common_mistakes, full_text, official_url, version_label, valid_from, valid_to, status, last_reviewed_at, legal_sources(id, name, jurisdiction, official_url)",
        )
        .eq("id", sectionId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setErr(error.message || "Rechtsgrundlage konnte nicht geladen werden.");
        setFetched(null);
      } else if (!data) {
        setErr("Rechtsgrundlage nicht gefunden.");
        setFetched(null);
      } else {
        const src = (data as any).legal_sources ?? null;
        setFetched({
          ...(data as any),
          source: src
            ? {
                id: src.id,
                name: src.name ?? "",
                jurisdiction: src.jurisdiction ?? null,
                official_url: src.official_url ?? null,
              }
            : null,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [needsFetch, sectionId]);

  const s = section ?? fetched;
  const reviewed = formatDate(s?.last_reviewed_at);
  const validFrom = formatDate(s?.valid_from);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          {s?.source && (
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {s.source.name}
              {s.source.jurisdiction ? ` · ${s.source.jurisdiction}` : ""}
            </div>
          )}
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-accent" />
            <span>
              {s?.section_number || "Rechtsgrundlage"}
              {s?.title ? ` ${s.title}` : ""}
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <p className="text-sm text-muted-foreground">Wissenskarte wird geladen …</p>
        )}
        {err && !loading && (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
            {err}
          </div>
        )}

        {s && !loading && (
          <div className="space-y-4">
            {(s.version_label || validFrom || reviewed || s.status) && (
              <div className="flex flex-wrap gap-2 text-[11px]">
                {s.status && (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                    Status: {s.status}
                  </span>
                )}
                {s.version_label && (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                    Rechtsstand: {s.version_label}
                  </span>
                )}
                {validFrom && (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                    Gültig ab: {validFrom}
                  </span>
                )}
                {reviewed && (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                    Zuletzt geprüft: {reviewed}
                  </span>
                )}
              </div>
            )}

            <Block title="Kurzbeschreibung" text={s.summary} />
            <Block title="Praxisbedeutung" text={s.practice_relevance} />
            <Block title="Handlungsempfehlung" text={s.recommendation} />
            <Block title="Typische Fehler" text={s.common_mistakes} />
            {s.explanation ? (
              <Block title="Bezug zu diesem Fall" text={s.explanation} />
            ) : null}
            <Block title="Volltext (Arbeitsentwurf)" text={s.full_text} />

            {s.official_url && (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Offizielle Quelle
                </p>
                <a
                  href={s.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> {s.official_url}
                </a>
              </section>
            )}

            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] italic text-amber-800 dark:text-amber-300">
              Diese Rechtsgrundlage dient der Orientierung. Maßgeblich bleibt die offizielle
              Quelle.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
