import { createFileRoute } from "@tanstack/react-router";
import { GitBranch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const TREES = [
  { id: "standard", title: "Standard – Ampel Grün/Gelb/Rot", nodes: 6, used: 214 },
  { id: "ordnung", title: "Ordnungsmaßnahme – Ablauf", nodes: 12, used: 34 },
  { id: "kindeswohl", title: "Kindeswohlgefährdung – Meldung", nodes: 9, used: 8 },
  { id: "pruefung", title: "Prüfungsvorfall – Ablauf", nodes: 10, used: 21 },
  { id: "datenschutz", title: "Datenschutz – Bild- und Videoaufnahmen", nodes: 7, used: 15 },
];

export const Route = createFileRoute("/admin/entscheidungsbaeume")({
  component: () => (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Logik</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Entscheidungsbäume</h1>
          <p className="mt-1 text-sm text-muted-foreground">Verzweigungslogik für die Praxisfall-Assistenten.</p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          Neuer Baum
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {TREES.map((t) => (
          <div key={t.id} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitBranch className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{t.title}</h2>
              <p className="text-xs text-muted-foreground">
                {t.nodes} Knoten · in {t.used} Fällen verwendet
              </p>
            </div>
            <button className="text-xs text-primary hover:underline">öffnen</button>
          </div>
        ))}
      </div>
    </div>
  ),
});
