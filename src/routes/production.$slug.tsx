import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Shell } from "@/components/portal/Shell";
import { BloomWait, releaseLoginBloom } from "@/components/portal/StudioLoader";
import { ProductionPage } from "@/components/production/ProductionPage";
import { supabase } from "@/integrations/supabase/client";
import { DEV_PREVIEW_PROFILE, DEV_PREVIEW_USER, isDevPreviewEnabled } from "@/lib/dev-preview";
import { getProductionTitle } from "@/lib/os/production.functions";
import { StudioSessionContext, type StudioSession } from "@/lib/studio-session";

// A production at its shared address: inside.saysukii.com/production/<slug>. The title is drawn on
// the server, so the link reads "Say Sukii x <project>" when it's texted or emailed; everything
// else waits for sign-in, and only an admin or a member assigned to it ever sees more.
export const Route = createFileRoute("/production/$slug")({
  // "?view=team" shows an admin the page the way the team sees it
  validateSearch: z.object({ view: z.enum(["team"]).optional(), as: z.string().optional() }),
  loader: async ({ params }) => {
    const { title } = await getProductionTitle({ data: { slug: params.slug } }).catch(() => ({
      title: null,
    }));
    return { title };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.title ?? "Say Sukii";
    return {
      meta: [
        { title },
        { property: "og:title", content: title },
        { name: "twitter:title", content: title },
        { property: "og:description", content: "the production, for the team working it." },
        { name: "description", content: "the production, for the team working it." },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: ProductionRoute,
});

function ProductionRoute() {
  const { slug } = Route.useParams();
  const { view } = Route.useSearch();
  const session = useSignedIn();
  if (!session) return <BloomWait label="opening the production" />;
  return (
    <StudioSessionContext.Provider value={session}>
      <Shell>
        <ProductionPage slug={slug} asTeam={view === "team"} />
      </Shell>
    </StudioSessionContext.Provider>
  );
}

/** the signed-in, active member, or off to sign in and straight back here after */
function useSignedIn() {
  const navigate = useNavigate();
  const [session, setSession] = useState<StudioSession | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      if (isDevPreviewEnabled()) {
        const { applyPreviewAs, previewSession } = await import("@/lib/preview-production");
        applyPreviewAs(new URLSearchParams(window.location.search).get("as"));
        if (!cancel) {
          setSession({
            ...previewSession({ user: DEV_PREVIEW_USER, profile: DEV_PREVIEW_PROFILE }),
            devPreview: true,
          });
        }
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .eq("active", true)
          .maybeSingle();
        if (profile) {
          if (!cancel) setSession({ user: data.user, profile, devPreview: false });
          return;
        }
        await supabase.auth.signOut();
      }
      releaseLoginBloom();
      if (!cancel) {
        await navigate({
          to: "/auth",
          search: { next: window.location.pathname },
          replace: true,
        });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [navigate]);

  return session;
}
