import type { ReactNode } from "react";

export function PageShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-8 pb-28 sm:px-6 md:pt-12 md:pb-16">
      <header className="mb-8 flex items-start justify-between gap-4 border-b border-border pb-6">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold leading-tight text-foreground sm:text-[2.125rem]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
