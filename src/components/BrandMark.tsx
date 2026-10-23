import { Scale } from "lucide-react";

/** Wort-Bild-Marke: marineblaues Siegel mit goldener Waage, Name in Serifenschrift. */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-gold shadow-sm ring-1 ring-inset ring-white/10">
        <Scale className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[17px] font-semibold tracking-tight text-foreground">RechtKompass</span>
        {!compact && (
          <span className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Schule · NRW</span>
        )}
      </span>
    </span>
  );
}
