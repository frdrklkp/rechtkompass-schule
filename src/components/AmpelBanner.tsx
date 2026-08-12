import type { Ampel } from "@/data/cases";

const CONFIG: Record<
  Ampel,
  { label: string; className: string; badge: string; headline: string; bullets: string[] }
> = {
  gruen: {
    label: "Grün",
    className: "border-success/40 bg-success/10",
    badge: "bg-success text-success-foreground",
    headline: "Eigenständiges pädagogisches Handeln möglich.",
    bullets: [
      "Keine unmittelbare Beteiligung der Schulleitung erforderlich.",
      "Dokumentation bei Bedarf – kurze Notiz genügt oft.",
      "Verhältnismäßigkeit und Gleichbehandlung im Blick behalten.",
    ],
  },
  gelb: {
    label: "Gelb",
    className: "border-warning/40 bg-warning/10",
    badge: "bg-warning text-warning-foreground",
    headline: "Besondere Aufmerksamkeit erforderlich.",
    bullets: [
      "Dokumentation empfohlen oder notwendig.",
      "Rücksprache mit Klassenleitung, Bildungsgangleitung oder Schulleitung sinnvoll.",
      "Frist- und Formfragen (Anhörung, Begründung) im Blick behalten.",
    ],
  },
  rot: {
    label: "Rot",
    className: "border-danger/40 bg-danger/10",
    badge: "bg-danger text-danger-foreground",
    headline: "Kritischer Fall – nicht allein entscheiden.",
    bullets: [
      "Schulleitung oder zuständige Stellen sofort einbeziehen.",
      "Vollständige, unverzügliche Dokumentation erforderlich.",
      "Externe Stellen (Jugendamt, Polizei) nach Absprache mit Schulleitung.",
    ],
  },
};

export function AmpelBanner({ ampel, note }: { ampel: Ampel; note?: string }) {
  const c = CONFIG[ampel];
  return (
    <div className={`rounded-2xl border p-4 ${c.className}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.badge}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> {c.label}
        </span>
        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{c.headline}</p>
      <ul className="mt-2 space-y-1 text-xs text-foreground/80">
        {c.bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
