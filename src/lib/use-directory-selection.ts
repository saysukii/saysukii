import { useCallback, useMemo, useState } from "react";

export type DirectorySelection = ReturnType<typeof useDirectorySelection>;

export function useDirectorySelection() {
  const [on, setOn] = useState(false);
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const start = useCallback(() => setOn(true), []);
  const stop = useCallback(() => {
    setOn(false);
    setIds(new Set());
  }, []);

  return useMemo(
    () => ({ on, ids, toggle, start, stop, pickAll: (all: string[]) => setIds(new Set(all)) }),
    [ids, on, start, stop, toggle],
  );
}
