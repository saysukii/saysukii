import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAccess, requireStudioAuth } from "@/integrations/supabase/studio-auth-middleware";
import { hasAccess } from "@/lib/os/access";
import type { ProductionRow } from "@/integrations/supabase/types";
import { productionTitle, rateMap } from "@/lib/os/production";

const id = z.string().uuid();

/** the fields that were sent, without the ones left out */
function defined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
const text = (max: number) => z.string().trim().max(max);

async function server() {
  const [{ supabaseAdmin }, production] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("./production.server"),
  ]);
  return { supabaseAdmin, ...production };
}

/** The production tab on a booked inquiry, made the first time it's opened. */
export const getProduction = createServerFn({ method: "GET" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => z.object({ inquiry_id: id }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, loadProductionView } = await server();
    return loadProductionView(supabaseAdmin, data.inquiry_id, {
      id: context.profile.id,
      role: "admin",
      pay: hasAccess(context.profile, "pay"),
    });
  });

export const updateProduction = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: id,
        project_name: text(120).min(1).optional(),
        studio_address: text(300).optional(),
        dress_code: text(1000).optional(),
        vision_proposal_id: id.nullable().optional(),
        vision_pages: z.array(z.number().int().min(1).max(200)).max(40).optional(),
        reflection: z.string().max(20000).optional(),
        has_team: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { inquiry_id, ...patch } = data;
    const update: Partial<ProductionRow> = defined(patch);
    if (patch.project_name) {
      // the address follows the name until anyone has been sent it; after that it stays put
      const tasks = await context.supabase
        .from("production_tasks")
        .select("id")
        .eq("inquiry_id", inquiry_id);
      const taskIds = (tasks.data ?? []).map((task) => task.id);
      const sent = taskIds.length
        ? await context.supabase
            .from("production_task_people")
            .select("task_id", { count: "exact", head: true })
            .in("task_id", taskIds)
            .not("notified_at", "is", null)
        : { count: 0 };
      if (!sent.count) {
        const { slugForName } = await server();
        update.slug = await slugForName(context.supabase, inquiry_id, patch.project_name);
      }
    }
    if (patch.vision_pages)
      update.vision_pages = [...new Set(patch.vision_pages)].sort((a, b) => a - b);
    const { data: row, error } = await context.supabase
      .from("productions")
      .update(update)
      .eq("inquiry_id", inquiry_id)
      .select("slug, project_name")
      .single();
    if (error) throw new Error(error.message);
    return { slug: row.slug, title: productionTitle(row.project_name) };
  });

export const saveProductionDay = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: id,
        id: id.optional(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        hours: text(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = { inquiry_id: data.inquiry_id, day: data.day, hours: data.hours };
    const result = data.id
      ? await context.supabase
          .from("production_days")
          .update(row)
          .eq("id", data.id)
          .select("id")
          .single()
      : await context.supabase.from("production_days").insert(row).select("id").single();
    if (result.error) throw new Error(result.error.message);
    return { id: result.data.id };
  });

const removable = z.object({ id });

export const removeProductionDay = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => removable.parse(input))
  .handler(async ({ data, context }) => {
    // the day's shifts go with it, so the schedule and the hours never count a day that isn't on
    const { data: row } = await context.supabase
      .from("production_days")
      .select("inquiry_id, day")
      .eq("id", data.id)
      .maybeSingle();
    if (row) {
      const shifts = await context.supabase
        .from("production_shifts")
        .delete()
        .eq("inquiry_id", row.inquiry_id)
        .eq("day", row.day)
        .select("profile_id");
      if (shifts.error) throw new Error(shifts.error.message);
      const { markChanged } = await server();
      await markChanged(
        context.supabase,
        row.inquiry_id,
        (shifts.data ?? []).map((shift) => shift.profile_id),
      );
    }
    const { error } = await context.supabase.from("production_days").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Move a floral order line along: to do, in progress, done. Anyone on the production can, and the
 * line remembers who did it last, and when.
 */
export const setProductionItemStatus = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) =>
    z.object({ id, status: z.enum(["todo", "in_progress", "done"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, memberCanOpen } = await server();
    const { data: item } = await supabaseAdmin
      .from("production_items")
      .select("id, inquiry_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!item) throw new Error("that line isn't on the order anymore.");
    const allowed =
      context.profile.role === "admin"
        ? hasAccess(context.profile, "productions")
        : await memberCanOpen(supabaseAdmin, context.profile.id, item.inquiry_id);
    if (!allowed) throw new Error("that production isn't open to you.");
    const { error } = await supabaseAdmin
      .from("production_items")
      .update({
        status: data.status,
        status_by: context.profile.id,
        status_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
    return { id: item.id };
  });

export const saveProductionItem = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: id,
        id: id.optional(),
        kind: text(60),
        name: text(200).min(1),
        quantity: z.number().min(0).max(100000),
        status: z.enum(["todo", "in_progress", "done"]),
        sort: z.number().int().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id: itemId, ...fields } = data;
    const row = defined(fields);
    const result = itemId
      ? await context.supabase
          .from("production_items")
          .update(row)
          .eq("id", itemId)
          .select("id")
          .single()
      : await context.supabase.from("production_items").insert(row).select("id").single();
    if (result.error) throw new Error(result.error.message);
    return { id: result.data.id };
  });

export const removeProductionItem = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => removable.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("production_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const stemFields = {
  name: text(120)
    .min(1)
    .transform((value) => value.toLowerCase()),
  color: text(60).transform((value) => value.toLowerCase()),
  quantity: z.number().min(0).max(100000).nullable(),
  item_id: id.nullable(),
};

/** A stem in the recipe, written lowercase: what it is, its color, how many, and what it's for. */
export const addProductionStem = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => z.object({ inquiry_id: id, ...stemFields }).parse(input))
  .handler(async ({ data, context }) => {
    const existing = await context.supabase
      .from("production_stems")
      .select("sort")
      .eq("inquiry_id", data.inquiry_id);
    const sort = Math.max(0, ...(existing.data ?? []).map((row) => row.sort + 1));
    const { data: row, error } = await context.supabase
      .from("production_stems")
      .insert({ ...data, sort })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateProductionStem = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) =>
    z
      .object({
        id,
        name: stemFields.name.optional(),
        color: stemFields.color.optional(),
        quantity: stemFields.quantity.optional(),
        item_id: stemFields.item_id.optional(),
        done: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id: stemId, ...patch } = data;
    const { error } = await context.supabase
      .from("production_stems")
      .update(defined(patch))
      .eq("id", stemId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const removeProductionStem = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => removable.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("production_stems").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Put a member on the production. They hear about it on the next sweep. */
export const addProductionPerson = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => z.object({ inquiry_id: id, profile_id: id }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await context.supabase
      .from("profiles")
      .select("id, active")
      .eq("id", data.profile_id)
      .maybeSingle();
    if (!member.data?.active) {
      throw new Error("only active members can be added. activate them in the gang.");
    }
    const { addToCrew } = await server();
    await addToCrew(context.supabase, data.inquiry_id, [data.profile_id]);
    return { ok: true as const };
  });

const clock = z.string().regex(/^[0-2]\d:[0-5]\d$/);

/** A shift on the schedule: who, which day, from when to when, as what, and where. */
export const saveProductionShift = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: id,
        id: id.optional(),
        profile_id: id,
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        starts: clock,
        ends: clock,
        role: text(80),
        location: text(160),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await context.supabase
      .from("profiles")
      .select("id, active")
      .eq("id", data.profile_id)
      .maybeSingle();
    if (!member.data?.active) {
      throw new Error("only active members can be scheduled. activate them in the gang.");
    }
    const { id: shiftId, ...row } = data;
    // a changed shift is news again: they hear the new times on the next sweep
    const saved = shiftId
      ? await context.supabase
          .from("production_shifts")
          .update({ ...row, notified_at: null })
          .eq("id", shiftId)
          .select("id")
          .single()
      : await context.supabase.from("production_shifts").insert(row).select("id").single();
    if (saved.error) throw new Error(saved.error.message);
    const { addToCrew } = await server();
    await addToCrew(context.supabase, data.inquiry_id, [data.profile_id]);
    return { id: saved.data.id };
  });

export const removeProductionShift = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => removable.parse(input))
  .handler(async ({ data, context }) => {
    const { data: shift } = await context.supabase
      .from("production_shifts")
      .select("inquiry_id, profile_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("production_shifts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    // their schedule changed: the next share sends them the new one
    if (shift) {
      const { markChanged } = await server();
      await markChanged(context.supabase, shift.inquiry_id, [shift.profile_id]);
    }
    return { ok: true as const };
  });

/**
 * Share the production with the team, everyone at once, once editing's done: each person with
 * something new or changed gets their schedule, and anyone not invited yet gets their invitation.
 */
export const shareProductionWithTeam = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => z.object({ inquiry_id: id }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, shareProduction } = await server();
    return shareProduction(supabaseAdmin, data.inquiry_id, context.profile);
  });

/**
 * What someone is paid on this production: by the hour, or one flat amount. Rates live on each
 * production, since a big job and a small one pay differently. Only those who handle pay set them.
 */
export const setProductionRate = createServerFn({ method: "POST" })
  .middleware([requireAccess("pay")])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: id,
        profile_id: id,
        rate: z
          .object({
            cents: z.number().int().min(0).max(10_000_000),
            per: z.enum(["hour", "production"]),
          })
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await server();
    const saved =
      data.rate == null
        ? await supabaseAdmin
            .from("production_rates")
            .delete()
            .eq("inquiry_id", data.inquiry_id)
            .eq("profile_id", data.profile_id)
        : await supabaseAdmin.from("production_rates").upsert({
            inquiry_id: data.inquiry_id,
            profile_id: data.profile_id,
            cents: data.rate.cents,
            per: data.rate.per,
            updated_at: new Date().toISOString(),
          });
    if (saved.error) throw new Error(saved.error.message);
    return { ok: true as const };
  });

/** Take a member off the production, and off its tasks with them. */
export const removeProductionPerson = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => z.object({ inquiry_id: id, profile_id: id }).parse(input))
  .handler(async ({ data, context }) => {
    const tasks = await context.supabase
      .from("production_tasks")
      .select("id")
      .eq("inquiry_id", data.inquiry_id);
    const taskIds = (tasks.data ?? []).map((task) => task.id);
    let untasked = 0;
    if (taskIds.length) {
      const removed = await context.supabase
        .from("production_task_people")
        .delete()
        .eq("profile_id", data.profile_id)
        .in("task_id", taskIds)
        .select("task_id");
      if (removed.error) throw new Error(removed.error.message);
      untasked = removed.data?.length ?? 0;
    }
    const { error } = await context.supabase
      .from("production_people")
      .delete()
      .eq("inquiry_id", data.inquiry_id)
      .eq("profile_id", data.profile_id);
    if (error) throw new Error(error.message);
    return { untasked };
  });

/** A task and who it's assigned to. Anyone newly assigned hears about it on the next sweep. */
export const saveProductionTask = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: id,
        id: id.optional(),
        title: text(200).min(1),
        starts_at: z.string().datetime().nullable(),
        category: text(80),
        location: text(160),
        people: z.array(id).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id: taskId, people, ...row } = data;
    if (people.length) {
      const active = await context.supabase
        .from("profiles")
        .select("id")
        .in("id", people)
        .eq("active", true);
      const activeIds = new Set((active.data ?? []).map((profile) => profile.id));
      const before = taskId
        ? await context.supabase
            .from("production_task_people")
            .select("profile_id")
            .eq("task_id", taskId)
        : { data: [] };
      const already = new Set((before.data ?? []).map((person) => person.profile_id));
      // someone deactivated can stay on a task they already had, but can't be newly assigned
      if (people.some((person) => !activeIds.has(person) && !already.has(person))) {
        throw new Error("only active members can be assigned. activate them in the gang.");
      }
    }
    const saved = taskId
      ? await context.supabase
          .from("production_tasks")
          .update(row)
          .eq("id", taskId)
          .select("id")
          .single()
      : await context.supabase.from("production_tasks").insert(row).select("id").single();
    if (saved.error) throw new Error(saved.error.message);
    const savedId = saved.data.id;

    const current = await context.supabase
      .from("production_task_people")
      .select("profile_id")
      .eq("task_id", savedId);
    const had = new Set((current.data ?? []).map((person) => person.profile_id));
    const want = new Set(people);
    const gone = [...had].filter((person) => !want.has(person));
    const added = [...want].filter((person) => !had.has(person));
    if (gone.length) {
      const { error } = await context.supabase
        .from("production_task_people")
        .delete()
        .eq("task_id", savedId)
        .in("profile_id", gone);
      if (error) throw new Error(error.message);
    }
    if (added.length) {
      const { error } = await context.supabase
        .from("production_task_people")
        .insert(added.map((profile_id) => ({ task_id: savedId, profile_id })));
      if (error) throw new Error(error.message);
    }
    // whoever's on a task is on the production
    const { addToCrew, markChanged } = await server();
    await addToCrew(context.supabase, data.inquiry_id, people);
    // a changed task, or one someone was taken off, is news for them on the next share
    await markChanged(context.supabase, data.inquiry_id, taskId ? [...had] : gone);
    return { id: savedId };
  });

export const removeProductionTask = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => removable.parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: task }, { data: people }] = await Promise.all([
      context.supabase
        .from("production_tasks")
        .select("inquiry_id")
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase.from("production_task_people").select("profile_id").eq("task_id", data.id),
    ]);
    const { error } = await context.supabase.from("production_tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (task) {
      const { markChanged } = await server();
      await markChanged(
        context.supabase,
        task.inquiry_id,
        (people ?? []).map((row) => row.profile_id),
      );
    }
    return { ok: true as const };
  });

/** Check a task off, or back on. Admins can mark any; a member only their own, while it's open. */
export const setProductionTaskDone = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) => z.object({ id, done: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, productionStillOpen } = await server();
    const task = await supabaseAdmin
      .from("production_tasks")
      .select("id, inquiry_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!task.data) throw new Error("that task isn't here anymore.");
    if (context.profile.role !== "admin") {
      const mine = await supabaseAdmin
        .from("production_task_people")
        .select("task_id", { count: "exact", head: true })
        .eq("task_id", data.id)
        .eq("profile_id", context.profile.id);
      if (!mine.count) throw new Error("only the people on a task can check it off.");
      if (!(await productionStillOpen(supabaseAdmin, task.data.inquiry_id))) {
        throw new Error("this production has wrapped.");
      }
    }
    const { error } = await supabaseAdmin
      .from("production_tasks")
      .update({
        status: data.done ? "done" : "open",
        done_at: data.done ? new Date().toISOString() : null,
        done_by: data.done ? context.profile.id : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** A logistics file or vision image, after the browser has put it in storage. */
export const addProductionFile = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) =>
    z
      .object({
        inquiry_id: id,
        file_path: text(500).min(1),
        file_type: text(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (
      !data.file_path.startsWith(`productions/${data.inquiry_id}/`) ||
      data.file_path.includes("..")
    ) {
      throw new Error("that file belongs somewhere else.");
    }
    const { error } = await context.supabase.from("files").insert({
      owner_type: "production",
      owner_id: data.inquiry_id,
      file_path: data.file_path,
      file_type: data.file_type,
      uploaded_by: context.profile.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const removeProductionFile = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) => removable.parse(input))
  .handler(async ({ data, context }) => {
    const { data: file, error } = await context.supabase
      .from("files")
      .select("id, owner_type, file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!file || file.owner_type !== "production") throw new Error("that file is already gone.");
    await context.supabase.storage.from("project-files").remove([file.file_path]);
    const removed = await context.supabase.from("files").delete().eq("id", data.id);
    if (removed.error) throw new Error(removed.error.message);
    return { ok: true as const };
  });

/** Only the name, for the link's preview in a text thread: nothing else is public. */
export const getProductionTitle = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: text(80).min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("productions")
      .select("project_name")
      .eq("slug", data.slug.toLowerCase())
      .maybeSingle();
    return { title: row ? productionTitle(row.project_name) : null };
  });

/** The production page at its shared address, for an admin or an assigned member. */
export const getProductionPage = createServerFn({ method: "GET" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) => z.object({ slug: text(80).min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, loadProductionView, memberCanOpen } = await server();
    const { data: row } = await supabaseAdmin
      .from("productions")
      .select("inquiry_id")
      .eq("slug", data.slug.toLowerCase())
      .maybeSingle();
    // the same answer for a production that doesn't exist and one they can't open
    const closed = { view: null, reason: "closed" as const };
    if (!row) return closed;
    if (context.profile.role !== "admin") {
      if (!(await memberCanOpen(supabaseAdmin, context.profile.id, row.inquiry_id))) return closed;
    } else if (!hasAccess(context.profile, "productions")) {
      return closed;
    }
    const view = await loadProductionView(supabaseAdmin, row.inquiry_id, {
      id: context.profile.id,
      role: context.profile.role,
      pay: hasAccess(context.profile, "pay"),
    });
    return { view, reason: null };
  });

/** Every booked job's production, for the studio's productions room. */
export const listProductions = createServerFn({ method: "GET" })
  .middleware([requireAccess("productions")])
  .handler(async () => {
    const { supabaseAdmin, allProductions } = await server();
    return { productions: await allProductions(supabaseAdmin) };
  });

/** A member's today: the productions they're on, soonest first, and their tasks there. */
export const listMyProductions = createServerFn({ method: "GET" })
  .middleware([requireStudioAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, memberProductions } = await server();
    const [productions, rates] = await Promise.all([
      memberProductions(supabaseAdmin, context.profile.id),
      // their own rates, and only theirs, so they can see what their hours come to
      supabaseAdmin
        .from("production_rates")
        .select("inquiry_id, cents, per")
        .eq("profile_id", context.profile.id),
    ]);
    return {
      productions,
      // by production, since each one sets its own
      rates: rateMap(
        (rates.data ?? []).map((row) => ({
          profile_id: row.inquiry_id,
          cents: row.cents,
          per: row.per,
        })),
      ),
    };
  });

export const listMemberNotices = createServerFn({ method: "GET" })
  .middleware([requireStudioAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("member_notices")
      .select("*")
      .eq("profile_id", context.profile.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { notices: data ?? [] };
  });

export const readMemberNotices = createServerFn({ method: "POST" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) => z.object({ ids: z.array(id).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!data.ids.length) return { ok: true as const };
    const { error } = await context.supabase
      .from("member_notices")
      .update({ read_at: new Date().toISOString() })
      .eq("profile_id", context.profile.id)
      .in("id", data.ids)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Clients to link a new production to, for the add production pop-up. */
export const listProductionClients = createServerFn({ method: "GET" })
  .middleware([requireAccess("productions")])
  .handler(async () => {
    const { supabaseAdmin } = await server();
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, organization, email")
      .eq("archived", false)
      .order("name");
    if (error) throw new Error(error.message);
    return { clients: data ?? [] };
  });

/**
 * A production added by hand, for work that never came in as an inquiry: it's linked to a client,
 * says what kind of work it is, and is booked from the start, so it's in the book with the rest.
 * Then it opens in edit. A smaller engagement can go without a team: no crew, schedule, or sharing.
 */
export const createManualProduction = createServerFn({ method: "POST" })
  .middleware([requireAccess("productions")])
  .validator((input: unknown) =>
    z
      .object({
        project_name: text(120).min(1),
        event_type: z.enum([
          "wedding",
          "brand_activation",
          "corporate",
          "private",
          "photoshoot",
          "subscription",
          "other",
        ]),
        client_id: id.optional(),
        new_client: z
          .object({ name: text(120).min(1), email: z.string().trim().email().max(320) })
          .optional(),
        event_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        /** the day's hours, "10:00am – 6:00pm", made its first production day */
        hours: z.string().trim().max(200).optional(),
        has_team: z.boolean(),
      })
      .refine((value) => value.client_id || value.new_client, "pick a client, or add one.")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, ensureProduction } = await server();
    let clientId = data.client_id ?? null;
    if (!clientId && data.new_client) {
      const email = data.new_client.email.toLowerCase();
      const found = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (found.data) clientId = found.data.id;
      else {
        const made = await supabaseAdmin
          .from("clients")
          .insert({ name: data.new_client.name, email, type: "individual", source: "production" })
          .select("id")
          .single();
        if (made.error) throw new Error(made.error.message);
        clientId = made.data.id;
      }
    }
    const now = new Date().toISOString();
    const inquiry = await supabaseAdmin
      .from("inquiries")
      .insert({
        client_id: clientId!,
        event_name: data.project_name,
        event_type: data.event_type,
        event_date: data.event_date,
        event_date_tbd: !data.event_date,
        status: "booked",
        booked_at: now,
        source: "added as a production",
        origin: "manual",
        detection_status: "na",
        created_by: context.profile.id,
      })
      .select("id")
      .single();
    if (inquiry.error) throw new Error(inquiry.error.message);
    const production = await ensureProduction(supabaseAdmin, inquiry.data.id);
    if (data.event_date) {
      await supabaseAdmin.from("production_days").insert({
        inquiry_id: inquiry.data.id,
        day: data.event_date,
        hours: data.hours ?? "",
      });
    }
    if (!data.has_team) {
      await supabaseAdmin
        .from("productions")
        .update({ has_team: false })
        .eq("inquiry_id", inquiry.data.id);
    }
    return { slug: production.slug, inquiry_id: inquiry.data.id };
  });
