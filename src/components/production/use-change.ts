import { useState } from "react";
import { toast } from "sonner";

import type { BoardProps } from "@/components/production/parts";

/** run a change, say so if it fails, then draw the production again */
export function useChange(onChanged: BoardProps["onChanged"]) {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    async run<T>(work: () => Promise<T>, done?: string): Promise<T | undefined> {
      setBusy(true);
      try {
        const result = await work();
        if (done) toast.success(done);
        await onChanged();
        return result;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "that didn't save. try again.");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
  };
}
