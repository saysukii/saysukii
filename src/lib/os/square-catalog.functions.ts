import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";

export const listSquareItems = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { listSquareCatalog } = await import("@/lib/os/square.server");
    try {
      return { items: await listSquareCatalog(), problem: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const problem = /not connected|access token/i.test(message)
        ? "connect square in settings to pick from your items."
        : /scope|permission|forbidden|unauthorized/i.test(message)
          ? "reconnect square in settings so the studio can read your items."
          : "square didn't answer. you can still add a custom item.";
      return { items: [], problem };
    }
  });
