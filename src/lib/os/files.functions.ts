import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/studio-auth-middleware";
import type { Database, FileRow } from "@/integrations/supabase/types";
import { invoiceTitle } from "@/lib/invoice-title";
import { clientSlugs } from "@/lib/os/inquiry-desk";

export type FileRelation =
  | { scope: "studio" }
  | { scope: "client"; name: string; id: string; person: boolean }
  | { scope: "venue"; name: string; id: string };

/** what a file is, read from its name, so the library can group and sort it */
export type FileCategory = "proposal" | "agreement" | "invoice" | "receipt" | "image" | "other";

export type StudioFile = {
  id: string;
  name: string;
  kind: string;
  href: string | null;
  relation: FileRelation;
  category: FileCategory;
  /** when it was filed, for the newest first */
  addedAt: string;
};

export function fileCategory(name: string, kind = ""): FileCategory {
  const lower = name.toLowerCase();
  if (/receipt/.test(lower)) return "receipt";
  if (/agreement|contract/.test(lower)) return "agreement";
  if (/proposal/.test(lower)) return "proposal";
  if (/invoice|^sqinv/.test(lower)) return "invoice";
  if (kind === "image") return "image";
  return "other";
}

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

/**
 * Every file the studio keeps: its own uploads, and everything tied to a client. That includes the
 * proposals, signed agreements, and invoices kept with the documents, each listed once.
 */
export const listStudioFiles = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<StudioFile[]> => {
    const { data, error } = await context.supabase
      .from("files")
      .select("id, file_path, file_type, owner_type, owner_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // a paid document is filed under the client and the inquiry; it shows once
    const seenPaths = new Set<string>();
    const files = (data ?? []).filter((file) => {
      if (seenPaths.has(file.file_path)) return false;
      seenPaths.add(file.file_path);
      return true;
    });
    const documents = await clientDocuments(context.supabase);
    const relations = await resolveRelations(context.supabase, [
      ...files,
      ...documents.map((doc) => ({
        id: doc.id,
        owner_type: "client" as const,
        owner_id: doc.clientId,
      })),
    ]);

    const filed = await signedUrls(
      context.supabase,
      "project-files",
      files.map((file) => file.file_path),
    );
    const rows: StudioFile[] = files.map((file) => {
      const name = fileName(file.file_path);
      const kind = fileKind(file.file_type || name);
      return {
        id: file.id,
        name,
        kind,
        href: filed.get(file.file_path) ?? null,
        relation: relations.get(file.id) ?? { scope: "studio" },
        category: fileCategory(name, kind),
        addedAt: file.created_at,
      };
    });

    // a document already filed for that client (after they paid) isn't listed twice
    const filedNames = new Set(
      rows.map((row) => `${row.relation.scope === "client" ? row.relation.id : ""}/${row.name}`),
    );
    const kept = await signedUrls(
      context.supabase,
      "documents",
      documents.map((doc) => doc.path),
    );
    for (const doc of documents) {
      const relation = relations.get(doc.id) ?? { scope: "studio" as const };
      const key = `${relation.scope === "client" ? relation.id : ""}/${doc.name}`;
      if (filedNames.has(key) || relation.scope !== "client") continue;
      filedNames.add(key);
      rows.push({
        id: doc.id,
        name: doc.name,
        kind: "pdf",
        href: kept.get(doc.path) ?? null,
        relation,
        category: doc.category,
        addedAt: doc.addedAt,
      });
    }
    return rows.sort((left, right) => right.addedAt.localeCompare(left.addedAt));
  });

/** the proposals, signed agreements, and invoices kept with the documents, named the way they're filed */
async function clientDocuments(supabase: SupabaseClient<Database>) {
  const [proposals, agreements, invoices] = await Promise.all([
    supabase
      .from("proposals")
      .select("id, number, client_id, pdf_path, created_at, sent_at")
      .eq("archived", false)
      .not("pdf_path", "is", null),
    supabase
      .from("agreements")
      .select("id, proposal_id, pdf_path, signed_at")
      .not("pdf_path", "is", null)
      .not("signed_at", "is", null),
    supabase
      .from("invoices")
      .select("id, proposal_id, number, pdf_path, created_at")
      .not("pdf_path", "is", null),
  ]);
  for (const result of [proposals, agreements, invoices]) {
    if (result.error) throw new Error(result.error.message);
  }
  const proposalById = new Map((proposals.data ?? []).map((row) => [row.id, row]));
  const docs: Array<{
    id: string;
    clientId: string;
    path: string;
    name: string;
    category: FileCategory;
    addedAt: string;
  }> = [];
  for (const row of proposals.data ?? []) {
    if (!row.pdf_path || !row.client_id) continue;
    docs.push({
      id: `proposal-${row.id}`,
      clientId: row.client_id,
      path: row.pdf_path,
      name: `say-sukii-proposal-${row.number}.pdf`,
      category: "proposal",
      addedAt: row.sent_at ?? row.created_at,
    });
  }
  for (const row of agreements.data ?? []) {
    const proposal = proposalById.get(row.proposal_id);
    if (!row.pdf_path || !proposal?.client_id) continue;
    docs.push({
      id: `agreement-${row.id}`,
      clientId: proposal.client_id,
      path: row.pdf_path,
      name: `floral-service-agreement-${proposal.number}.pdf`,
      category: "agreement",
      addedAt: row.signed_at ?? proposal.created_at,
    });
  }
  for (const row of invoices.data ?? []) {
    const proposal = proposalById.get(row.proposal_id);
    if (!row.pdf_path || !proposal?.client_id) continue;
    docs.push({
      id: `invoice-${row.id}`,
      clientId: proposal.client_id,
      path: row.pdf_path,
      name: `say-sukii-invoice-${invoiceTitle(row.number)}.pdf`,
      category: "invoice",
      addedAt: row.created_at,
    });
  }
  return docs;
}

/** signed links for many files at once, by path */
async function signedUrls(supabase: SupabaseClient<Database>, bucket: string, paths: string[]) {
  const links = new Map<string, string>();
  if (paths.length === 0) return links;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 30);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) links.set(row.path, row.signedUrl);
  }
  return links;
}

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
