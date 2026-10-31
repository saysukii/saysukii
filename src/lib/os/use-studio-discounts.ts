import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { SavedDiscount } from "@/lib/discount";
import {
  listStudioDiscounts,
  removeStudioDiscount,
  saveStudioDiscount,
} from "@/lib/os/discounts.functions";
import { useDevPreview } from "@/lib/use-dev-preview";

const KEY = ["os", "studio-discounts"] as const;
// the local preview keeps them in this browser
const STORAGE_KEY = "say-sukii-studio-discounts";

function readLocal(): SavedDiscount[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedDiscount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: SavedDiscount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // nothing to keep it in
  }
}

/** The studio's named discounts, with ways to keep a new one and let one go. */
export function useStudioDiscounts() {
  const devPreview = useDevPreview();
  const list = useServerFn(listStudioDiscounts);
  const save = useServerFn(saveStudioDiscount);
  const remove = useServerFn(removeStudioDiscount);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => (devPreview ? readLocal() : list()),
    staleTime: 60_000,
  });
  const done = () => queryClient.invalidateQueries({ queryKey: KEY });

  const keep = useMutation({
    mutationFn: async (discount: Omit<SavedDiscount, "id">) => {
      if (devPreview) {
        const rows = readLocal().filter(
          (row) => row.name.toLowerCase() !== discount.name.toLowerCase(),
        );
        writeLocal([...rows, { ...discount, id: crypto.randomUUID() }]);
        return;
      }
      await save({ data: discount });
    },
    onSuccess: done,
  });

  const letGo = useMutation({
    mutationFn: async (id: string) => {
      if (devPreview) {
        writeLocal(readLocal().filter((row) => row.id !== id));
        return;
      }
      await remove({ data: { id } });
    },
    onSuccess: done,
  });

  return {
    discounts: (query.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    keep: keep.mutate,
    letGo: letGo.mutate,
  };
}
