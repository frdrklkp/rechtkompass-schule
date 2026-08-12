import { createFileRoute } from "@tanstack/react-router";
import { Upload, FileJson, FileSpreadsheet, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/import")({
  component: () => (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Werkzeuge</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Import-Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Praxisfälle, Rechtsgrundlagen und Vorlagen importieren oder exportieren.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: FileJson, title: "JSON-Import", desc: "Bulk-Import von Praxisfällen aus einer JSON-Datei." },
          { icon: FileSpreadsheet, title: "CSV-Import", desc: "Import von Kategorien, Schlagwörtern und Zuständigkeiten." },
          { icon: Database, title: "Supabase-Sync", desc: "Vorbereitet – Anbindung erfolgt in Phase 2." },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.title} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-semibold">{c.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
              <Button variant="outline" size="sm" className="mt-4 w-full">
                <Upload className="h-4 w-4" />
                Datei auswählen
              </Button>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Dateien hierher ziehen</p>
        <p className="text-xs text-muted-foreground">JSON, CSV oder ZIP (max. 20 MB)</p>
      </div>
    </div>
  ),
});
