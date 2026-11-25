import type { User } from "@supabase/supabase-js";
import { useRouteContext } from "@tanstack/react-router";
import { createContext, useContext } from "react";

import type { ProfileRow } from "@/integrations/supabase/types";

export type StudioSession = { user: User; profile: ProfileRow; devPreview: boolean };

/**
 * Who's signed in, for a page that checks it on its own instead of living under the signed-in
 * routes, like a production's shared page, which is drawn on the server so its link reads well in a
 * text thread.
 */
export const StudioSessionContext = createContext<StudioSession | null>(null);

/** the signed-in member: from a page that provided it, or from the signed-in routes */
export function useStudioSession(): StudioSession {
  const provided = useContext(StudioSessionContext);
  const fromRoutes = useRouteContext({ strict: false }) as Partial<StudioSession>;
  if (provided) return provided;
  if (!fromRoutes.user || !fromRoutes.profile) {
    throw new Error("useStudioSession needs a signed-in page");
  }
  return {
    user: fromRoutes.user,
    profile: fromRoutes.profile,
    devPreview: Boolean(fromRoutes.devPreview),
  };
}
