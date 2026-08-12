/** Sprint 4.6C – Transparente Grenzen jeder Bewertung. */
export function AssessmentLimitations({ limitations }: { limitations: string[] }) {
  return (
    <section className="rounded-2xl border border-border bg-muted/30 p-4">
      <h4 className="text-sm font-semibold text-foreground">Einschränkungen der Bewertung</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-foreground/85">
        {limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </section>
  );
}
