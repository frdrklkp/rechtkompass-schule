import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import { BottomNav } from "../components/BottomNav";
import { OnboardingModal } from "../components/OnboardingModal";
import { PilotGate } from "../components/PilotGate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Seite nicht gefunden</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Die gesuchte Seite existiert nicht oder wurde verschoben.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Diese Seite konnte nicht geladen werden
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bitte versuche es erneut oder kehre zur Startseite zurück.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Erneut versuchen
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Zur Startseite
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "RechtKompass Schule – Rechtliche Orientierung für den Schulalltag am BKO" },
      {
        name: "description",
        content:
          "RechtKompass Schule liefert am Berufskolleg Olsberg schnelle, verständliche Handlungsempfehlungen, Checklisten und Rechtsgrundlagen für über 300 typische Alltagssituationen.",
      },
      { property: "og:title", content: "RechtKompass Schule – Rechtliche Orientierung für den Schulalltag am BKO" },
      {
        property: "og:description",
        content:
          "Rechtliche Orientierung für den Schulalltag am BKO – über 300 Praxisfälle, Rechtsgrundlagen und Dokumentationsvorlagen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "RechtKompass Schule – Rechtliche Orientierung für den Schulalltag am BKO" },
      { name: "twitter:description", content: "RechtKompass Schule liefert am Berufskolleg Olsberg schnelle, verständliche Handlungsempfehlungen, Checklisten und Rechtsgrundlagen für über 300 typische Alltagssituationen." },
      { name: "description", content: "RechtKompass Schule liefert am Berufskolleg Olsberg schnelle, verständliche Handlungsempfehlungen, Checklisten und Rechtsgrundlagen für über 300 typische Alltagssituationen." },
      { property: "og:description", content: "RechtKompass Schule liefert am Berufskolleg Olsberg schnelle, verständliche Handlungsempfehlungen, Checklisten und Rechtsgrundlagen für über 300 typische Alltagssituationen." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/44829825-1756-4382-820d-1dd66b5c4aee/id-preview-fd7a3538--da697b66-da47-4076-b52c-44ba7c3f20e9.lovable.app-1783204519699.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/44829825-1756-4382-820d-1dd66b5c4aee/id-preview-fd7a3538--da697b66-da47-4076-b52c-44ba7c3f20e9.lovable.app-1783204519699.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname.startsWith("/admin");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        {isAdmin ? (
          <>
            <Outlet />
            <BottomNav />
          </>
        ) : (
          <PilotGate>
            <Outlet />
            <BottomNav />
            <OnboardingModal />
          </PilotGate>
        )}
      </div>
    </QueryClientProvider>
  );
}
