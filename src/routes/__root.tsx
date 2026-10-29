import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { GlitterCursorTrail, QuietCursorContext } from "@/components/glitter-cursor-trail";
import { NotOnTheBooks } from "@/components/studio/NotOnTheBooks";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_14px_34px_rgba(75,61,66,0.14)] transition-transform hover:-translate-y-0.5"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-card px-5 py-2.5 text-sm font-medium text-foreground shadow-[0_14px_34px_rgba(75,61,66,0.10)] transition-transform hover:-translate-y-0.5"
          >
            Go home
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
      { title: "Say Sukii OS" },
      {
        name: "description",
        content: "The studio operating system for Say Sukii.",
      },
      { name: "author", content: "Say Sukii" },
      { name: "theme-color", content: "#f5e6e8" },
      { property: "og:title", content: "say sukii" },
      { property: "og:site_name", content: "say sukii" },
      {
        property: "og:description",
        content: "The studio operating system for Say Sukii.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://inside.saysukii.com/og.jpg" },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "750" },
      { property: "og:image:height", content: "924" },
      {
        property: "og:image:alt",
        content: "A long table dressed with anthuriums, roses, and glassware.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "say sukii" },
      { name: "twitter:image", content: "https://inside.saysukii.com/og.jpg" },
      {
        name: "twitter:image:alt",
        content: "A long table dressed with anthuriums, roses, and glassware.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotOnTheBooks,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(sessionStorage.getItem("say-sukii-bloom-login")!=="1")return;var cover=document.createElement("div");cover.id="studio-login-bloom";cover.className="studio-bloom-pass";cover.setAttribute("role","status");cover.setAttribute("aria-label","opening the studio");cover.innerHTML='<div class="studio-bloom-mark"><span class="is-playing"><span class="studio-loader is-bloom" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></span></div>';var place=function(){if(!document.getElementById("studio-login-bloom"))document.body.appendChild(cover);};if(document.body)place();else document.addEventListener("DOMContentLoaded",place);}catch(e){}})();`,
          }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // a page like the 404 can ask for a calm cursor while it's open
  const [quietPage, setQuietPage] = useState(false);
  // sign-in and the public inquiry form stay calm, without the trail
  const showGlitter =
    !quietPage &&
    !["/auth", "/inquire"].some((quiet) => pathname === quiet || pathname.startsWith(`${quiet}/`));

  return (
    <QueryClientProvider client={queryClient}>
      {showGlitter ? <GlitterCursorTrail /> : null}
      <QuietCursorContext.Provider value={setQuietPage}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </QuietCursorContext.Provider>
      <Toaster />
    </QueryClientProvider>
  );
}
