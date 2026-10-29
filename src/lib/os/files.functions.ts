import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import type { Database, FileRow } from "@/integrations/supabase/types";
import { clientSlugs } from "@/lib/os/inquiry-desk";

export type FileRelation =
  | { scope: "studio" }
  | { scope: "client"; name: string; id: string; person: boolean }
  | { scope: "venue"; name: string; id: string };

export type StudioFile = {
  id: string;
  name: string;
  kind: string;
  href: string | null;
  relation: FileRelation;
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

function idsFor(
  files: Array<Pick<FileRow, "owner_type" | "owner_id">>,
  ownerType: FileRow["owner_type"],
) {
  return [
    ...new Set(files.filter((file) => file.owner_type === ownerType).map((file) => file.owner_id)),
  ];
}

export const listStudioFiles = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<StudioFile[]> => {
    const { data, error } = await context.supabase
      .from("files")
      .select("id, file_path, file_type, owner_type, owner_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const files = data ?? [];
    const relations = await resolveRelations(context.supabase, files);

    return Promise.all(
      files.map(async (file) => {
        const name = fileName(file.file_path);
        const signed = await context.supabase.storage
          .from("project-files")
          .createSignedUrl(file.file_path, 60 * 30);
        return {
          id: file.id,
          name,
          kind: fileKind(file.file_type || name),
          href: signed.data?.signedUrl ?? null,
          relation: relations.get(file.id) ?? { scope: "studio" },
        };
      }),
    );
  });

const libraryFileInput = z.object({
  file_path: z.string().trim().min(1).max(500),
  file_type: z.string().trim().max(120).optional().default(""),
});

export const addLibraryFile = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => libraryFileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("files").insert({
      owner_type: "studio",
      owner_id: context.profile.id,
      file_path: data.file_path,
      file_type: data.file_type || null,
      uploaded_by: context.profile.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

async function resolveRelations(
  supabase: SupabaseClient<Database>,
  files: Array<Pick<FileRow, "id" | "owner_type" | "owner_id">>,
) {
  const relations = new Map<string, FileRelation>();
  if (files.length === 0) return relations;

  const inquiryIds = idsFor(files, "inquiry");
  const proposalIds = idsFor(files, "proposal");
  const projectIds = idsFor(files, "project");
  const venueIds = idsFor(files, "venue");
  const [inquiries, proposals, projects, venues] = await Promise.all([
    lookup(supabase.from("inquiries").select("id, client_id").in("id", inquiryIds), inquiryIds),
    lookup(supabase.from("proposals").select("id, client_id").in("id", proposalIds), proposalIds),
    lookup(supabase.from("projects").select("id, client_id").in("id", projectIds), projectIds),
    lookup(supabase.from("venues").select("id, name").in("id", venueIds), venueIds),
  ]);

  const clientIds = new Set(idsFor(files, "client"));
  for (const row of [...inquiries, ...proposals, ...projects]) {
    if (row.client_id) clientIds.add(row.client_id);
  }
  const clientIdList = [...clientIds];

  const clients = await lookup(
    supabase.from("clients").select("id, name, type, created_at").in("id", clientIdList),
    clientIdList,
  );
  const slugs = clientSlugs(
    clients.map((row) => ({
      id: row.id,
      name: row.name ?? "client",
      created_at: row.created_at ?? undefined,
    })),
  );
  const clientById = new Map(clients.map((row) => [row.id, row]));
  const venueById = new Map(venues.map((row) => [row.id, row]));
  const clientOf = new Map<string, string>();
  for (const row of [...inquiries, ...proposals, ...projects]) {
    if (row.client_id) clientOf.set(row.id, row.client_id);
  }

  for (const file of files) {
    if (file.owner_type === "studio") {
      relations.set(file.id, { scope: "studio" });
      continue;
    }
    if (file.owner_type === "venue") {
      const venue = venueById.get(file.owner_id);
      relations.set(
        file.id,
        venue?.name ? { scope: "venue", name: venue.name, id: venue.id } : { scope: "studio" },
      );
      continue;
    }

    const clientId = file.owner_type === "client" ? file.owner_id : clientOf.get(file.owner_id);
    const client = clientId ? clientById.get(clientId) : undefined;
    if (!client?.name) {
      relations.set(file.id, { scope: "studio" });
      continue;
    }
    relations.set(file.id, {
      scope: "client",
      name: client.name,
      id: slugs.get(client.id) ?? client.id,
      person: client.type === "individual",
    });
  }

  return relations;
}

async function lookup<T extends Record<string, unknown>>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ids: string[],
) {
  if (ids.length === 0) return [] as T[];
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
