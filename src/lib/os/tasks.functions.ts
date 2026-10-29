import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireStudioAuth } from "@/integrations/supabase/studio-auth-middleware";
import type { Database, InquiryRow, TaskRow } from "@/integrations/supabase/types";
import {
  desiredInquiryAutoTask,
  inquiryAutoKind,
  openInquiryAutoTasks,
  shouldSpawnInquiryAutoTask,
  type InquiryAutoDraft,
} from "@/lib/os/inquiry-tasks";

type StudioClient = SupabaseClient<Database>;

const linkedType = z.enum(["inquiry", "project", "none"]);

export async function listStudioTasks(client: StudioClient): Promise<TaskRow[]> {
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function lastInboundAt(client: StudioClient, inquiryId: string) {
  const { data, error } = await client
    .from("inquiry_messages")
    .select("sent_at")
    .eq("inquiry_id", inquiryId)
    .eq("direction", "inbound")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.sent_at ?? null;
}

async function lastInboundByInquiry(client: StudioClient, inquiryIds: string[]) {
  const times = new Map<string, string>();
  if (inquiryIds.length === 0) return times;
  const { data, error } = await client
    .from("inquiry_messages")
    .select("inquiry_id, sent_at")
    .eq("direction", "inbound")
    .in("inquiry_id", inquiryIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const current = times.get(row.inquiry_id);
    if (!current || row.sent_at > current) times.set(row.inquiry_id, row.sent_at);
  }
  return times;
}

async function retireAutoTasks(client: StudioClient, tasks: TaskRow[]) {
  const ids = tasks.map((task) => task.id);
  if (ids.length === 0) return;
  const { error } = await client.from("tasks").update({ status: "done" }).in("id", ids);
  if (error) throw new Error(error.message);
}

async function closeOpenTasks(
  client: StudioClient,
  linkedType: "inquiry" | "project",
  linkedIds: string[],
) {
  if (linkedIds.length === 0) return;
  const { error } = await client
    .from("tasks")
    .update({ status: "done" })
    .eq("linked_type", linkedType)
    .in("linked_id", linkedIds)
    .eq("status", "open");
  if (error) throw new Error(error.message);
}

/** Open tasks for this client's inquiries and projects leave the desk. */
export async function archiveTasksForClient(client: StudioClient, clientId: string) {
  const [inquiries, projects] = await Promise.all([
    client.from("inquiries").select("id").eq("client_id", clientId),
    client.from("projects").select("id").eq("client_id", clientId),
  ]);
  if (inquiries.error) throw new Error(inquiries.error.message);
  if (projects.error) throw new Error(projects.error.message);
  await closeOpenTasks(
    client,
    "inquiry",
    (inquiries.data ?? []).map((row) => row.id),
  );
  await closeOpenTasks(
    client,
    "project",
    (projects.data ?? []).map((row) => row.id),
  );
}

async function insertAutoTask(client: StudioClient, draft: InquiryAutoDraft) {
  const { error } = await client.from("tasks").insert({
    title: draft.title,
    linked_type: draft.linked_type,
    linked_id: draft.linked_id,
    source: draft.source,
    trigger_stage: draft.trigger_stage,
    due_at: draft.due_at,
    status: "open",
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function applyInquiryAutoTask(
  client: StudioClient,
  inquiry: InquiryRow,
  clientName: string | null,
  existing: TaskRow[],
  inboundAt: string | null,
  now = new Date(),
) {
  const desired = desiredInquiryAutoTask({
    inquiry,
    clientName,
    lastInboundAt: inboundAt,
    now,
  });
  const open = openInquiryAutoTasks(existing, inquiry.id);

  if (!desired) {
    await retireAutoTasks(client, open);
    return;
  }

  const matching = open.filter((task) => inquiryAutoKind(task) === desired.kind);
  await retireAutoTasks(
    client,
    open.filter((task) => inquiryAutoKind(task) !== desired.kind),
  );
  if (matching.length > 0) {
    const keep = matching[0];
    await retireAutoTasks(client, matching.slice(1));
    if (keep && keep.title !== desired.title) {
      const { error } = await client
        .from("tasks")
        .update({ title: desired.title })
        .eq("id", keep.id);
      if (error) throw new Error(error.message);
    }
    return;
  }
  if (!shouldSpawnInquiryAutoTask(desired, existing)) return;
  await insertAutoTask(client, desired);
}

export async function syncInquiryAutoTaskFor(client: StudioClient, inquiryId: string) {
  const { data: inquiry, error: inquiryError } = await client
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inquiryError) throw new Error(inquiryError.message);
  if (!inquiry) return;

  const [{ data: person, error: personError }, { data: tasks, error: taskError }, inboundAt] =
    await Promise.all([
      client.from("clients").select("name").eq("id", inquiry.client_id).maybeSingle(),
      client.from("tasks").select("*").eq("linked_type", "inquiry").eq("linked_id", inquiryId),
      lastInboundAt(client, inquiryId),
    ]);
  if (personError) throw new Error(personError.message);
  if (taskError) throw new Error(taskError.message);

  await applyInquiryAutoTask(client, inquiry, person?.name ?? null, tasks ?? [], inboundAt);
}

export async function syncInquiryAutoTasks(
  client: StudioClient,
  inquiries: InquiryRow[],
  names: Map<string, string | null>,
  existing: TaskRow[],
) {
  const inbound = await lastInboundByInquiry(
    client,
    inquiries.map((inquiry) => inquiry.id),
  );
  const now = new Date();
  for (const inquiry of inquiries) {
    await applyInquiryAutoTask(
      client,
      inquiry,
      names.get(inquiry.client_id) ?? null,
      existing.filter((task) => task.linked_type === "inquiry" && task.linked_id === inquiry.id),
      inbound.get(inquiry.id) ?? null,
      now,
    );
  }
  // an inquiry that was deleted, archived, or left the book has nothing left to reply to
  const listed = new Set(inquiries.map((inquiry) => inquiry.id));
  await retireAutoTasks(
    client,
    existing.filter(
      (task) =>
        task.source === "auto" &&
        task.status === "open" &&
        task.linked_type === "inquiry" &&
        Boolean(task.linked_id) &&
        !listed.has(task.linked_id as string),
    ),
  );
}

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireStudioAuth])
  .handler(async ({ context }) => listStudioTasks(context.supabase));

export const createManualTask = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(240),
        linked_type: linkedType.default("none"),
        linked_id: z.string().uuid().nullable().optional(),
        due_at: z.string().datetime().nullable().optional(),
      })
      .superRefine((value, context) => {
        if (value.linked_type === "none" && value.linked_id) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["linked_id"],
            message: "A standalone task cannot be linked",
          });
        }
        if (value.linked_type !== "none" && !value.linked_id) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["linked_id"],
            message: "Choose what this task is for",
          });
        }
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.linked_type === "inquiry" && data.linked_id) {
      const { error } = await context.supabase
        .from("inquiries")
        .select("id")
        .eq("id", data.linked_id)
        .eq("archived", false)
        .single();
      if (error) throw new Error("Inquiry not found");
    }
    if (data.linked_type === "project" && data.linked_id) {
      const { error } = await context.supabase
        .from("projects")
        .select("id")
        .eq("id", data.linked_id)
        .eq("archived", false)
        .single();
      if (error) throw new Error("Project not found");
    }

    const { data: task, error } = await context.supabase
      .from("tasks")
      .insert({
        title: data.title,
        linked_type: data.linked_type,
        linked_id: data.linked_type === "none" ? null : (data.linked_id ?? null),
        source: "manual",
        trigger_stage: null,
        due_at: data.due_at ?? null,
        status: "open",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return task;
  });

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: task, error } = await context.supabase
      .from("tasks")
      .update({ status: "done" })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return task;
  });
