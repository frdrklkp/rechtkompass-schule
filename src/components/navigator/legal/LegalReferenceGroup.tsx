/**
 * Sprint 4.6G – Benannte Gruppe von Rechtsgrundlagen
 * (z. B. zentrale, ergänzende, Kontextquellen).
 */
import type { LegalReference } from "@/services/legal-context";
import { LegalReferenceCard } from "./LegalReferenceCard";

export interface LegalReferenceGroupProps {
  title: string;
  description?: string;
  references: LegalReference[];
}

export function LegalReferenceGroup({ title, description, references }: LegalReferenceGroupProps) {
  if (references.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">
        {title}{" "}
        <span className="font-normal text-muted-foreground">({references.length})</span>
      </h4>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="space-y-3">
        {references.map((reference) => (
          <LegalReferenceCard key={reference.linkId} reference={reference} />
        ))}
      </div>
    </section>
  );
}
