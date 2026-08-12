import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Copy, FileText } from "lucide-react";
import { TEMPLATES } from "../data/templates";
import { PageShell } from "../components/PageShell";
import { Disclaimer } from "../components/Disclaimer";

export const Route = createFileRoute("/dokumentation")({
  head: () => ({
    meta: [
      { title: "Dokumentation – RechtKompass Schule" },
      {
        name: "description",
        content:
          "Vorlagen für Aktennotiz, Gesprächsprotokoll, Elterninformation, Anhörung und Schulleitungsinformation.",
      },
    ],
  }),
  component: DokuPage,
});

function DokuPage() {
  const [activeId, setActiveId] = useState(TEMPLATES[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const active = useMemo(
    () => TEMPLATES.find((t) => t.id === activeId)!,
    [activeId],
  );
  const preview = active.render(values);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
    } catch {
      /* ignore */
    }
  };

  return (
    <PageShell
      title="Dokumentation"
      subtitle="Vorlagen ausfüllen und als Text übernehmen."
    >
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="mb-5 flex gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveId(t.id);
                setValues({});
              }}
              data-active={activeId === t.id}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 data-[active=true]:border-accent data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
            >
              {t.title}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold">{active.title}</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{active.description}</p>

        <div className="mt-4 space-y-3">
          {active.fields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-medium text-foreground">
                {f.label}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  value={values[f.name] || ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.name]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              ) : (
                <input
                  type={f.type === "date" ? "date" : "text"}
                  value={values[f.name] || ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.name]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Vorschau</h3>
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-accent hover:text-accent"
          >
            <Copy className="h-3.5 w-3.5" />
            Kopieren
          </button>
        </div>
        <pre className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs leading-relaxed text-foreground">
          {preview}
        </pre>
      </div>

      <Disclaimer />
    </PageShell>
  );
}
