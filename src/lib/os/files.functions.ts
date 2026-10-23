import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";

export type StudioFile = {
  id: string;
  name: string;
  kind: string;
  href: string | null;
};

function fileName(path: string) {
  return path.split("/").filter(Boolean).at(-1) || path;
}

function fileKind(name: string) {
  const ext = name.split(/[./]/).pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "zip") return "zip";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  return ext || "file";
}

export const listStudioFiles = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<StudioFile[]> => {
    const { data, error } = await context.supabase
      .from("files")
      .select("id, file_path, file_type, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return Promise.all(
      (data ?? []).map(async (file) => {
        const name = fileName(file.file_path);
        const signed = await context.supabase.storage
          .from("project-files")
          .createSignedUrl(file.file_path, 60 * 30);
        return {
          id: file.id,
          name,
          kind: fileKind(file.file_type || name),
          href: signed.data?.signedUrl ?? null,
        };
      }),
    );
  });
