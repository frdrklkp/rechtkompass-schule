/** Sprint 4.6C – Hinweis auf eine veraltete Bewertung nach Änderung der Situation. */
export function AssessmentStaleNotice({ onReevaluate }: { onReevaluate: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-accent/50 bg-accent/10 p-4"
    >
      <p className="text-sm font-semibold text-foreground">Bewertung veraltet</p>
      <p className="mt-1 text-sm text-foreground/85">
        Die erfassten Angaben wurden nach der letzten Bewertung verändert. Das angezeigte Ergebnis
        bezieht sich noch auf den vorherigen Stand und wird nicht automatisch überschrieben.
      </p>
      <button
        type="button"
        onClick={onReevaluate}
        className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        Bewertung erneut ausführen
      </button>
    </div>
  );
}
