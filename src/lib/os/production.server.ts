import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

import type {
  AppRole,
  Database,
  ProductionRow,
  ProductionStatus,
  ProductionTaskRow,
} from "@/integrations/supabase/types";
import { appFileLink, FILE_LINK_SECONDS } from "@/lib/app-file-link";
import { hasAccess } from "@/lib/os/access";
import { inquiryHoldDates } from "@/lib/os/inquiry-holds";
import {
  assignmentHeadline,
  assignmentLetters,
  defaultProjectName,
  firstName,
  firstProductionDay,
  freeSlug,
  lastProductionDay,
  hoursCsv,
  hoursLabel,
  hoursSummary,
  productionDateRange,
  productionDayLabel,
  productionPhase,
  productionSchedule,
  productionSlug,
  productionTitle,
  shiftHours,
  shiftSpan,
  DEFAULT_DRESS_CODE,
  STUDIO_ADDRESS,
  teamCanOpen,
  type ProductionFileView,
  type ProductionPerson,
  type ProductionView,
  rateMap,
  hoursDueAt,
  personName,
  personStanding,
  unsharedPeople,
  PRODUCTION_CHANGED,
} from "@/lib/os/production";

type Db = SupabaseClient<Database>;

/** where a production's own files live in storage */
export const productionFolder = (inquiryId: string) => `productions/${inquiryId}`;

/** The production for a booked inquiry, made the first time the studio opens its tab. */
export async function ensureProduction(db: Db, inquiryId: string): Promise<ProductionRow> {
  const existing = await db
    .from("productions")
    .select("*")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const inquiry = await db
    .from("inquiries")
    .select("id, status, client_id, event_name")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inquiry.error) throw new Error(inquiry.error.message);
  if (!inquiry.data) throw new Error("that inquiry isn't here anymore.");
  if (inquiry.data.status !== "booked") {
    throw new Error("a production opens once the inquiry is booked.");
  }
  const client = await db
    .from("clients")
    .select("name, organization")
    .eq("id", inquiry.data.client_id)
    .maybeSingle();
  // the event's own name when it has one, else the client's
  const name = inquiry.data.event_name?.trim() || defaultProjectName(client.data ?? {});

  // two tabs opening at once can race for the same address; the second takes the next one
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const base = productionSlug(name);
    const taken = await db.from("productions").select("slug").like("slug", `${base}%`);
    const slug = freeSlug(
      base,
      (taken.data ?? []).map((row) => row.slug),
    );
    const made = await db
      .from("productions")
      .insert({
        inquiry_id: inquiryId,
        slug,
        project_name: name,
        studio_address: STUDIO_ADDRESS,
        dress_code: DEFAULT_DRESS_CODE,
      })
      .select("*")
      .single();
    if (!made.error) {
      // the order starts as the proposal had it, so nobody has to bring it in by hand
      await fillOrderFromProposal(db, inquiryId).catch(() => undefined);
      return made.data;
    }
    const again = await db
      .from("productions")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .maybeSingle();
    if (again.data) return again.data;
    if (!/duplicate|unique/i.test(made.error.message)) throw new Error(made.error.message);
  }
  throw new Error("the production couldn't be opened. try again in a moment.");
}

const ITEM_KIND_FROM_PROPOSAL: Record<string, string> = {
  arrangement: "arrangements",
  install: "installation",
  custom: "",
};

/** The floral order from the proposal's line items: the flowers, not labor or delivery. */
export async function fillOrderFromProposal(db: Db, inquiryId: string) {
  const proposals = await db
    .from("proposals")
    .select("id, status")
    .eq("inquiry_id", inquiryId)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  const chosen =
    proposals.data?.find((proposal) => proposal.status === "accepted") ?? proposals.data?.[0];
  if (!chosen) return 0;
  const lines = await db
    .from("proposal_line_items")
    .select("kind, label, quantity, sort_order")
    .eq("proposal_id", chosen.id)
    .order("sort_order");
  const floral = (lines.data ?? []).filter((line) => line.kind in ITEM_KIND_FROM_PROPOSAL);
  if (!floral.length) return 0;
  const existing = await db.from("production_items").select("name").eq("inquiry_id", inquiryId);
  const have = new Set((existing.data ?? []).map((row) => row.name.toLowerCase()));
  const rows = floral
    .filter((line) => !have.has(line.label.toLowerCase()))
    .map((line, index) => ({
      inquiry_id: inquiryId,
      kind: ITEM_KIND_FROM_PROPOSAL[line.kind] ?? "",
      name: line.label,
      quantity: Number(line.quantity) || 1,
      status: "todo" as const,
      sort: index,
    }));
  if (rows.length) await db.from("production_items").insert(rows);
  return rows.length;
}

/** Put people on a production. Anyone new hears about it on the next sweep. */
export async function addToCrew(db: Db, inquiryId: string, profileIds: string[]) {
  if (!profileIds.length) return;
  const { error } = await db.from("production_people").upsert(
    profileIds.map((profile_id) => ({ inquiry_id: inquiryId, profile_id })),
    { onConflict: "inquiry_id,profile_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

/** A new address for a renamed production, kept unique among the others. */
export async function slugForName(db: Db, inquiryId: string, name: string) {
  const base = productionSlug(name);
  const taken = await db
    .from("productions")
    .select("slug, inquiry_id")
    .like("slug", `${base}%`)
    .neq("inquiry_id", inquiryId);
  return freeSlug(
    base,
    (taken.data ?? []).map((row) => row.slug),
  );
}

/**
 * The chosen proposal pages, copied into their own pdf. The team only ever receives this copy, so
 * the priced pages of the proposal never leave the studio. It's made again when the proposal is
 * re-uploaded or the pages change.
 */
export async function ensureVisionPdf(admin: Db, production: ProductionRow) {
  if (!production.vision_proposal_id || !production.vision_pages.length) return null;
  const proposal = await admin
    .from("proposals")
    .select("id, pdf_path, updated_at")
    .eq("id", production.vision_proposal_id)
    .maybeSingle();
  if (proposal.error || !proposal.data?.pdf_path) return null;
  const pages = [...production.vision_pages].sort((a, b) => a - b);
  const stamp = `${proposal.data.pdf_path}|${proposal.data.updated_at}|${pages.join(",")}`;
  if (production.vision_stamp === stamp && production.vision_path) return production.vision_path;

  const download = await admin.storage.from("documents").download(proposal.data.pdf_path);
  if (download.error || !download.data) return production.vision_path;
  const source = await PDFDocument.load(new Uint8Array(await download.data.arrayBuffer()), {
    ignoreEncryption: true,
  });
  const indices = pages.map((page) => page - 1).filter((i) => i >= 0 && i < source.getPageCount());
  if (!indices.length) return null;
  const vision = await PDFDocument.create();
  for (const page of await vision.copyPages(source, indices)) vision.addPage(page);
  const bytes = await vision.save();

  // a fresh name each time, so no browser holds on to the old pages
  const path = `${productionFolder(production.inquiry_id)}/vision-${Date.now()}.pdf`;
  const upload = await admin.storage
    .from("documents")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (upload.error) throw new Error(upload.error.message);
  if (production.vision_path && production.vision_path !== path) {
    await admin.storage.from("documents").remove([production.vision_path]);
  }
  await admin
    .from("productions")
    .update({ vision_path: path, vision_stamp: stamp })
    .eq("inquiry_id", production.inquiry_id);
  return path;
}

async function signed(admin: Db, bucket: string, path: string | null, seconds = FILE_LINK_SECONDS) {
  if (!path) return null;
  const link = await admin.storage.from(bucket).createSignedUrl(path, seconds);
  return appFileLink(link.data?.signedUrl);
}

/**
 * Everything a production page draws. Admins get the whole studio's people to assign and the
 * proposals to choose vision pages from; a member gets only the names on its tasks.
 */
export async function loadProductionView(
  admin: Db,
  inquiryId: string,
  viewer: { id: string; role: AppRole; pay?: boolean },
): Promise<ProductionView> {
  const isAdmin = viewer.role === "admin";
  // what people are paid shows only to those who handle pay
  const canPay = isAdmin && Boolean(viewer.pay);
  const production = await ensureProduction(admin, inquiryId);
  const [inquiry, days, items, stems, tasks, files, proposals] = await Promise.all([
    admin
      .from("inquiries")
      .select(
        "id, client_id, event_type, event_date, event_date_tbd, message, venue_id, venue_text",
      )
      .eq("id", inquiryId)
      .single(),
    admin.from("production_days").select("*").eq("inquiry_id", inquiryId).order("day"),
    admin.from("production_items").select("*").eq("inquiry_id", inquiryId).order("sort"),
    admin.from("production_stems").select("*").eq("inquiry_id", inquiryId).order("sort"),
    admin
      .from("production_tasks")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("sort"),
    admin
      .from("files")
      .select("id, file_path, file_type, created_at")
      .eq("owner_type", "production")
      .eq("owner_id", inquiryId)
      .order("created_at"),
    isAdmin
      ? admin
          .from("proposals")
          .select("id, number, pdf_path, created_at")
          .eq("inquiry_id", inquiryId)
          .eq("archived", false)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [inquiry, days, items, stems, tasks, files, proposals]) {
    if (result.error) throw new Error(result.error.message);
  }

  const crewRows = await admin
    .from("production_people")
    .select("profile_id, added_at, notified_at, changed_at")
    .eq("inquiry_id", inquiryId)
    .order("added_at");
  const crew = (crewRows.data ?? []).map((row) => row.profile_id);
  const shiftRows = await admin
    .from("production_shifts")
    .select("*")
    .eq("inquiry_id", inquiryId)
    .order("day")
    .order("starts");
  const shifts = shiftRows.data ?? [];
  // only admins see what anyone is paid
  const rateRows = canPay
    ? await admin
        .from("production_rates")
        .select("profile_id, cents, per")
        .eq("inquiry_id", inquiryId)
    : { data: [] as Array<{ profile_id: string; cents: number; per: string }> };
  const rates = rateMap(rateRows.data ?? []);
  const taskIds = (tasks.data ?? []).map((task) => task.id);
  const people = taskIds.length
    ? await admin
        .from("production_task_people")
        .select("task_id, profile_id, notified_at")
        .in("task_id", taskIds)
    : { data: [], error: null };
  const assigned = new Set([
    ...crew,
    ...(people.data ?? []).map((row) => row.profile_id),
    ...shifts.map((shift) => shift.profile_id),
  ]);
  const profiles = isAdmin
    ? await admin
        .from("profiles")
        .select("id, full_name, added_name, invited_at, email, role, active")
        .order("full_name")
    : assigned.size
      ? await admin
          .from("profiles")
          .select("id, full_name, added_name, invited_at, email, role, active")
          .in("id", [...assigned])
      : { data: [], error: null };

  const [client, venue] = await Promise.all([
    isAdmin
      ? admin.from("clients").select("name").eq("id", inquiry.data!.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    inquiry.data!.venue_id
      ? admin
          .from("venues")
          .select("name, address, load_in_notes")
          .eq("id", inquiry.data!.venue_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const holds = inquiryHoldDates(inquiry.data!);
  const dayRows = days.data ?? [];
  const lastDay = lastProductionDay(dayRows, holds);
  const schedule = productionSchedule(dayRows, holds);
  const status = productionPhase(schedule);
  const venueText = inquiry.data!.venue_text?.trim() ?? "";
  const visionPath = await ensureVisionPdf(admin, production).catch(() => production.vision_path);

  const fileViews: ProductionFileView[] = await Promise.all(
    (files.data ?? []).map(async (file) => ({
      id: file.id,
      name: (file.file_path.split("/").pop() ?? "file").replace(/^\d{10,}-/, ""),
      kind: file.file_path.includes("/vision/") ? ("vision" as const) : ("logistics" as const),
      // the team's links last only minutes: long enough to open in the viewer, not to pass on
      href: await signed(admin, "project-files", file.file_path, isAdmin ? FILE_LINK_SECONDS : 300),
      file_type: file.file_type,
      created_at: file.created_at,
    })),
  );

  const peopleViews: ProductionPerson[] = (profiles.data ?? []).map((profile) => ({
    id: profile.id,
    name: personName(profile),
    email: isAdmin ? profile.email : null,
    active: profile.active,
    role: profile.role,
    standing: personStanding(profile),
  }));

  const fresh = await admin.from("productions").select("*").eq("inquiry_id", inquiryId).single();
  // the flowers the studio has written into recipes before, suggested as the admin types
  const used = isAdmin
    ? await admin.from("production_stems").select("name").limit(1000)
    : { data: [] as Array<{ name: string }> };
  const stemSuggestions = [...new Set((used.data ?? []).map((row) => row.name.toLowerCase()))];

  return {
    // the reflection is the studio's own, and where the vision copy lives is the server's business
    production: isAdmin
      ? (fresh.data ?? production)
      : { ...(fresh.data ?? production), reflection: "", vision_path: null, vision_stamp: null },
    title: productionTitle(production.project_name),
    path: `/production/${production.slug}`,
    event: {
      type: inquiry.data!.event_type,
      first: firstProductionDay(dayRows, holds),
      last: lastDay,
      venueName: venue.data?.name ?? venueText.split(",")[0]?.trim() ?? "",
      venueAddress: venue.data?.address ?? venueText,
      loadIn: venue.data?.load_in_notes ?? null,
      clientName: client.data?.name ?? "",
    },
    days: dayRows,
    items: items.data ?? [],
    stems: stems.data ?? [],
    tasks: (tasks.data ?? []).map((task) => ({
      ...task,
      people: (people.data ?? [])
        .filter((row) => row.task_id === task.id)
        .map((row) => row.profile_id),
    })),
    files: fileViews,
    people: peopleViews,
    // someone on a task is on the production, even from before the two were tied together
    crew: [...assigned].filter((id) => peopleViews.some((person) => person.id === id)),
    stemSuggestions,
    shifts,
    rates,
    unshared: isAdmin ? unsharedPeople(crewRows.data ?? [], shifts, people.data ?? []) : [],
    canPay,
    told: isAdmin
      ? (crewRows.data ?? []).filter((row) => row.notified_at).map((row) => row.profile_id)
      : [],
    visionUrl: await signed(admin, "documents", visionPath),
    proposals: await Promise.all(
      (proposals.data ?? [])
        .filter((proposal) => proposal.pdf_path)
        .map(async (proposal) => ({
          id: proposal.id,
          number: proposal.number,
          href: await signed(admin, "documents", proposal.pdf_path),
        })),
    ),
    status,
    schedule,
    access: { open: teamCanOpen(status), lastDay },
    viewer,
  };
}

/** Whether a member can open this production: on it, or on one of its tasks, while it's open. */
export async function memberCanOpen(admin: Db, profileId: string, inquiryId: string) {
  // nothing is the team's until the studio shares it
  const shared = await admin
    .from("productions")
    .select("shared_at")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();
  if (!shared.data?.shared_at) return false;
  const onCrew = await admin
    .from("production_people")
    .select("profile_id", { count: "exact", head: true })
    .eq("inquiry_id", inquiryId)
    .eq("profile_id", profileId);
  if (!onCrew.count) {
    const tasks = await admin.from("production_tasks").select("id").eq("inquiry_id", inquiryId);
    const ids = (tasks.data ?? []).map((task) => task.id);
    if (!ids.length) return false;
    const mine = await admin
      .from("production_task_people")
      .select("task_id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .in("task_id", ids);
    if (!mine.count) return false;
  }
  return productionStillOpen(admin, inquiryId);
}

/** whether the team's access to a production hasn't ended yet */
export async function productionStillOpen(admin: Db, inquiryId: string) {
  const [production, inquiry, days] = await Promise.all([
    admin.from("productions").select("inquiry_id").eq("inquiry_id", inquiryId).maybeSingle(),
    admin
      .from("inquiries")
      .select("event_date, event_date_tbd, message")
      .eq("id", inquiryId)
      .maybeSingle(),
    admin.from("production_days").select("day, hours").eq("inquiry_id", inquiryId),
  ]);
  if (!production.data || !inquiry.data) return false;
  return teamCanOpen(
    productionPhase(productionSchedule(days.data ?? [], inquiryHoldDates(inquiry.data))),
  );
}

/** a production as the productions list shows it */
export type ProductionListing = {
  inquiry_id: string;
  title: string;
  project_name: string;
  path: string;
  status: ProductionStatus;
  first: string | null;
  last: string | null;
  venue: string;
  /** the full place, for opening it in maps */
  address: string;
  client: string;
  open_tasks: number;
  tasks: number;
  crew: number;
  /** first names of who's on it */
  people: string[];
  team_open: boolean;
};

/**
 * Every booked job's production, for the studio's productions room. A booked job that hasn't had
 * its production opened yet gets one here, so nothing booked is missing from the list.
 */
export async function allProductions(admin: Db): Promise<ProductionListing[]> {
  const booked = await admin
    .from("inquiries")
    .select("id, client_id, event_date, event_date_tbd, message, venue_id, venue_text")
    .eq("status", "booked")
    .eq("archived", false);
  if (booked.error) throw new Error(booked.error.message);
  const inquiries = booked.data ?? [];
  if (!inquiries.length) return [];
  const ids = inquiries.map((row) => row.id);
  // a booked job that can't open its production is said out loud, not skipped quietly
  const failures: string[] = [];
  for (const id of ids) {
    await ensureProduction(admin, id).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`production for inquiry ${id} didn't open:`, message);
      failures.push(message);
    });
  }

  const [productions, days, tasks, crew, clients, venues] = await Promise.all([
    admin.from("productions").select("*").in("inquiry_id", ids),
    admin.from("production_days").select("inquiry_id, day, hours").in("inquiry_id", ids),
    admin.from("production_tasks").select("inquiry_id, status").in("inquiry_id", ids),
    admin.from("production_people").select("inquiry_id, profile_id").in("inquiry_id", ids),
    admin
      .from("clients")
      .select("id, name")
      .in("id", [...new Set(inquiries.map((row) => row.client_id))]),
    admin.from("venues").select("id, name, address"),
  ]);
  if (productions.error) throw new Error(`productions didn't load: ${productions.error.message}`);
  if (!productions.data?.length && failures.length) {
    throw new Error(`${inquiries.length} booked, but none opened: ${failures[0]}`);
  }
  const venueAddress = new Map((venues.data ?? []).map((row) => [row.id, row.address]));
  const clientName = new Map((clients.data ?? []).map((row) => [row.id, row.name]));
  const venueName = new Map((venues.data ?? []).map((row) => [row.id, row.name]));
  const crewIds = [...new Set((crew.data ?? []).map((row) => row.profile_id))];
  const profiles = crewIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", crewIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string }> };
  const firstOf = new Map((profiles.data ?? []).map((row) => [row.id, firstName(personName(row))]));

  return (productions.data ?? [])
    .map((production) => {
      const inquiry = inquiries.find((row) => row.id === production.inquiry_id)!;
      const dayRows = (days.data ?? []).filter((row) => row.inquiry_id === production.inquiry_id);
      const holds = inquiryHoldDates(inquiry);
      const last = lastProductionDay(dayRows, holds);
      const status = productionPhase(productionSchedule(dayRows, holds));
      const theirs = (tasks.data ?? []).filter((row) => row.inquiry_id === production.inquiry_id);
      return {
        inquiry_id: production.inquiry_id,
        title: productionTitle(production.project_name),
        project_name: production.project_name,
        path: `/production/${production.slug}`,
        status,
        first: firstProductionDay(dayRows, holds),
        last,
        venue:
          (inquiry.venue_id ? venueName.get(inquiry.venue_id) : null) ??
          inquiry.venue_text?.split(",")[0]?.trim() ??
          "",
        address:
          (inquiry.venue_id ? venueAddress.get(inquiry.venue_id) : null) ??
          inquiry.venue_text?.trim() ??
          "",
        client: clientName.get(inquiry.client_id) ?? "",
        open_tasks: theirs.filter((row) => row.status === "open").length,
        tasks: theirs.length,
        crew: (crew.data ?? []).filter((row) => row.inquiry_id === production.inquiry_id).length,
        people: (crew.data ?? [])
          .filter((row) => row.inquiry_id === production.inquiry_id)
          .map((row) => firstOf.get(row.profile_id) ?? "")
          .filter(Boolean),
        team_open: teamCanOpen(status),
      };
    })
    .sort((a, b) => (a.first ?? "9").localeCompare(b.first ?? "9"));
}

/**
 * The productions a member is on and still open, soonest first, with their tasks there.
 */
export async function memberProductions(admin: Db, profileId: string) {
  const mine = await admin
    .from("production_task_people")
    .select("task_id")
    .eq("profile_id", profileId);
  const taskIds = (mine.data ?? []).map((row) => row.task_id);
  const [crew, myShifts] = await Promise.all([
    admin.from("production_people").select("inquiry_id").eq("profile_id", profileId),
    admin
      .from("production_shifts")
      .select("*")
      .eq("profile_id", profileId)
      .order("day")
      .order("starts"),
  ]);
  const tasks = taskIds.length
    ? await admin.from("production_tasks").select("*").in("id", taskIds)
    : { data: [] as ProductionTaskRow[] };
  const inquiryIds = [
    ...new Set([
      ...(tasks.data ?? []).map((task) => task.inquiry_id),
      ...(crew.data ?? []).map((row) => row.inquiry_id),
      ...(myShifts.data ?? []).map((row) => row.inquiry_id),
    ]),
  ];
  if (!inquiryIds.length) return [];
  const [productions, inquiries, days, venues] = await Promise.all([
    // a member only has what's been shared
    admin.from("productions").select("*").in("inquiry_id", inquiryIds).not("shared_at", "is", null),
    admin
      .from("inquiries")
      .select("id, event_type, event_date, event_date_tbd, message, venue_id, venue_text")
      .in("id", inquiryIds),
    admin.from("production_days").select("inquiry_id, day, hours").in("inquiry_id", inquiryIds),
    admin.from("venues").select("id, name, address"),
  ]);
  const venueName = new Map((venues.data ?? []).map((venue) => [venue.id, venue.name]));
  const venueAddress = new Map((venues.data ?? []).map((venue) => [venue.id, venue.address]));
  // who else is on each, by first name, for the faces on their list
  const everyone = await admin
    .from("production_people")
    .select("inquiry_id, profile_id")
    .in("inquiry_id", inquiryIds);
  const ids = [...new Set((everyone.data ?? []).map((row) => row.profile_id))];
  const profiles = ids.length
    ? await admin.from("profiles").select("id, full_name, added_name, email").in("id", ids)
    : {
        data: [] as Array<{
          id: string;
          full_name: string | null;
          added_name: string | null;
          email: string;
        }>,
      };
  const firstOf = new Map((profiles.data ?? []).map((row) => [row.id, firstName(personName(row))]));

  return (productions.data ?? [])
    .map((production) => {
      const inquiry = (inquiries.data ?? []).find((row) => row.id === production.inquiry_id);
      const dayRows = (days.data ?? []).filter((row) => row.inquiry_id === production.inquiry_id);
      const holds = inquiry ? inquiryHoldDates(inquiry) : [];
      const first = firstProductionDay(dayRows, holds);
      const last = lastProductionDay(dayRows, holds);
      const status = productionPhase(productionSchedule(dayRows, holds));
      return {
        inquiry_id: production.inquiry_id,
        title: productionTitle(production.project_name),
        project_name: production.project_name,
        path: `/production/${production.slug}`,
        status,
        first,
        last,
        venue:
          (inquiry?.venue_id ? venueName.get(inquiry.venue_id) : null) ??
          inquiry?.venue_text?.split(",")[0]?.trim() ??
          "",
        address:
          (inquiry?.venue_id ? venueAddress.get(inquiry.venue_id) : null) ??
          inquiry?.venue_text?.trim() ??
          "",
        open: teamCanOpen(status),
        days: dayRows.map((row) => row.day).sort(),
        people: (everyone.data ?? [])
          .filter((row) => row.inquiry_id === production.inquiry_id)
          .flatMap((row) => {
            const first = firstOf.get(row.profile_id);
            return first ? [first] : [];
          }),
        shifts: (myShifts.data ?? []).filter((shift) => shift.inquiry_id === production.inquiry_id),
        tasks: (tasks.data ?? [])
          .filter((task) => task.inquiry_id === production.inquiry_id)
          .sort((a, b) => (a.starts_at ?? "9").localeCompare(b.starts_at ?? "9")),
      };
    })
    .filter((production) => production.open)
    .sort((a, b) => (a.first ?? "9").localeCompare(b.first ?? "9"));
}

function appOrigin() {
  return (process.env["APP_URL"] ?? "http://localhost:8080").replace(/\/$/, "");
}

/** something of theirs was taken off this production, so the next share sends them their schedule */
export async function markChanged(db: Db, inquiryId: string, profileIds: string[]) {
  if (!profileIds.length) return;
  await db
    .from("production_people")
    .update({ changed_at: new Date().toISOString() })
    .eq("inquiry_id", inquiryId)
    .in("profile_id", [...new Set(profileIds)]);
}

/**
 * Once a production is shared, two things reach a member on their own, a few minutes after the
 * studio saves them: being put on the production, and being given a task. Each is a notice on their
 * bell and shows on their today; no email goes out. Their shifts still wait for the studio to share
 * the updates, and anyone not in the studio yet is invited when the studio shares.
 */
export async function sendNewsLetters(admin: Db, now = Date.now()) {
  const settled = new Date(now - 2 * 60_000).toISOString();
  const [crew, taskPeople] = await Promise.all([
    admin
      .from("production_people")
      .select("inquiry_id, profile_id")
      .is("notified_at", null)
      .lte("added_at", settled)
      .limit(300),
    admin
      .from("production_task_people")
      .select("task_id, profile_id")
      .is("notified_at", null)
      .lte("assigned_at", settled)
      .limit(300),
  ]);
  const taskIds = [...new Set((taskPeople.data ?? []).map((row) => row.task_id))];
  const tasks = taskIds.length
    ? await admin
        .from("production_tasks")
        .select("id, inquiry_id, title, starts_at, location")
        .in("id", taskIds)
    : {
        data: [] as Array<{
          id: string;
          inquiry_id: string;
          title: string;
          starts_at: string | null;
          location: string;
        }>,
      };
  const taskById = new Map((tasks.data ?? []).map((task) => [task.id, task]));
  // one letter per person and production: whether they were put on it, and their new tasks
  const letters = new Map<
    string,
    { inquiry_id: string; profile_id: string; added: boolean; tasks: string[] }
  >();
  const letterFor = (inquiryId: string, profileId: string) => {
    const key = `${inquiryId}:${profileId}`;
    const letter = letters.get(key) ?? {
      inquiry_id: inquiryId,
      profile_id: profileId,
      added: false,
      tasks: [],
    };
    letters.set(key, letter);
    return letter;
  };
  for (const row of crew.data ?? []) letterFor(row.inquiry_id, row.profile_id).added = true;
  for (const row of taskPeople.data ?? []) {
    const task = taskById.get(row.task_id);
    if (task) letterFor(task.inquiry_id, row.profile_id).tasks.push(task.id);
  }
  if (!letters.size) return { letters: 0 };

  const inquiryIds = [...new Set([...letters.values()].map((letter) => letter.inquiry_id))];
  const profileIds = [...new Set([...letters.values()].map((letter) => letter.profile_id))];
  const [productions, profiles, shifts] = await Promise.all([
    admin.from("productions").select("*").in("inquiry_id", inquiryIds).not("shared_at", "is", null),
    admin
      .from("profiles")
      .select("id, email, full_name, invited_at, active, role")
      .in("id", profileIds),
    admin
      .from("production_shifts")
      .select("*")
      .in("inquiry_id", inquiryIds)
      .in("profile_id", profileIds),
  ]);
  let sent = 0;
  for (const letter of letters.values()) {
    const production = (productions.data ?? []).find((row) => row.inquiry_id === letter.inquiry_id);
    const person = (profiles.data ?? []).find((row) => row.id === letter.profile_id);
    // not shared yet, not joined yet, or turned off: it waits for the studio to share
    if (!production || !person?.active || personStanding(person) !== "joined") continue;
    const name = production.project_name;
    const path = `/production/${production.slug}`;
    const newTasks = letter.tasks
      .map((id) => taskById.get(id))
      .filter((task): task is NonNullable<typeof task> => Boolean(task))
      .sort((a, b) => (a.starts_at ?? "9").localeCompare(b.starts_at ?? "9"));
    // someone just put on it has their whole schedule there marked sent; someone tasked, the new tasks
    const theirShifts = letter.added
      ? (shifts.data ?? [])
          .filter(
            (shift) => shift.inquiry_id === letter.inquiry_id && shift.profile_id === person.id,
          )
          .sort((a, b) => `${a.day}${a.starts}`.localeCompare(`${b.day}${b.starts}`))
      : [];
    const headline = letter.added
      ? `you're on the team for ${name}`
      : `${newTasks.length === 1 ? "a new task" : `${newTasks.length} new tasks`} for ${name}`;
    await admin.from("member_notices").insert({
      profile_id: person.id,
      kind: letter.added ? "added_to_production" : "tasks_assigned",
      inquiry_id: letter.inquiry_id,
      title: headline,
      body:
        newTasks.map((task) => task.title).join(" · ") ||
        "open it for the event, the vision, and the order.",
      href: path,
    });
    await markLetterSent(
      admin,
      letter,
      new Date(now).toISOString(),
      theirShifts.map((shift) => shift.id),
    );
    sent += 1;
  }
  return { letters: sent };
}

async function markLetterSent(
  admin: Db,
  letter: { inquiry_id: string; profile_id: string; added: boolean; tasks: string[] },
  at: string,
  shiftIds: string[] = [],
) {
  await Promise.all([
    letter.added
      ? admin
          .from("production_people")
          .update({ notified_at: at })
          .eq("inquiry_id", letter.inquiry_id)
          .eq("profile_id", letter.profile_id)
      : Promise.resolve(null),
    letter.tasks.length
      ? admin
          .from("production_task_people")
          .update({ notified_at: at })
          .eq("profile_id", letter.profile_id)
          .in("task_id", letter.tasks)
      : Promise.resolve(null),
    shiftIds.length
      ? admin.from("production_shifts").update({ notified_at: at }).in("id", shiftIds)
      : Promise.resolve(null),
  ]);
}

/**
 * Share a production with the team, everyone at once, when the studio is done editing. Members
 * already in the studio see it on their today and their bell; nothing is emailed. Someone added but
 * not in the studio yet gets the one email the team ever gets: their invitation, with a link to
 * create their account. Their schedule waits for them inside. Until a production is first shared,
 * the team can't see it.
 */
export async function shareProduction(
  admin: Db,
  inquiryId: string,
  sharedBy: { id: string; full_name: string | null },
  now = Date.now(),
) {
  const at = new Date(now).toISOString();
  const [production, crew, shifts, tasks] = await Promise.all([
    admin.from("productions").select("*").eq("inquiry_id", inquiryId).maybeSingle(),
    admin
      .from("production_people")
      .select("profile_id, notified_at, changed_at")
      .eq("inquiry_id", inquiryId),
    admin.from("production_shifts").select("*").eq("inquiry_id", inquiryId),
    admin
      .from("production_tasks")
      .select("id, title, starts_at, location")
      .eq("inquiry_id", inquiryId),
  ]);
  if (!production.data) throw new Error("that production isn't here anymore.");
  const taskIds = (tasks.data ?? []).map((task) => task.id);
  const taskPeople = taskIds.length
    ? await admin
        .from("production_task_people")
        .select("task_id, profile_id, notified_at")
        .in("task_id", taskIds)
    : { data: [] as Array<{ task_id: string; profile_id: string; notified_at: string | null }> };
  const pending = unsharedPeople(crew.data ?? [], shifts.data ?? [], taskPeople.data ?? []);
  const profiles = pending.length
    ? await admin
        .from("profiles")
        .select("id, email, full_name, added_name, invited_at, active, role")
        .in("id", pending)
    : { data: [] };

  const name = production.data.project_name;
  const path = `/production/${production.data.slug}`;
  const origin = appOrigin();
  const { teamInviteHtml } = await import("@/lib/os/production-email");
  const { sendStudioEmail } = await import("@/lib/os/email.server");

  let letters = 0;
  let invited = 0;
  for (const person of profiles.data ?? []) {
    // someone turned off since they were scheduled hears nothing until they're turned back on
    if (!person.active) continue;
    const theirShifts = (shifts.data ?? [])
      .filter((shift) => shift.profile_id === person.id)
      .sort((a, b) => `${a.day}${a.starts}`.localeCompare(`${b.day}${b.starts}`));
    const theirTaskIds = new Set(
      (taskPeople.data ?? [])
        .filter((row) => row.profile_id === person.id)
        .map((row) => row.task_id),
    );
    const theirTasks = (tasks.data ?? [])
      .filter((task) => theirTaskIds.has(task.id))
      .sort((a, b) => (a.starts_at ?? "9").localeCompare(b.starts_at ?? "9"));
    const told = (crew.data ?? []).some(
      (row) => row.profile_id === person.id && Boolean(row.notified_at),
    );
    const joined = personStanding(person) === "joined";

    // someone who hasn't joined gets their invitation: a fresh link to create their account, which
    // goes on to choosing their name and a password, then their today and its tour
    if (!joined) {
      const { invitationLink } = await import("./invite-link.server");
      const link = await invitationLink(admin, {
        email: person.email,
        role: person.role === "admin" ? "admin" : "team",
        invitedBy: sharedBy.id,
        origin,
      });
      const sent = await sendStudioEmail({
        to: person.email,
        subject: "you're invited to the say sukii studio",
        eventType: "team_invite",
        referenceType: "production",
        referenceId: inquiryId,
        html: teamInviteHtml({
          link,
          role: person.role === "admin" ? "admin" : "team",
          invitedBy: sharedBy.full_name,
          given: person.added_name || person.full_name || null,
          projectName: name,
          origin,
        }),
      });
      if (sent.skipped) {
        throw new Error(
          "the invitations didn't go out: connect the studio's gmail in settings, then share again.",
        );
      }
    }

    if (joined) {
      const hours = theirShifts.reduce(
        (sum, shift) => sum + shiftHours(shift.starts, shift.ends),
        0,
      );
      await admin.from("member_notices").insert({
        profile_id: person.id,
        kind: theirShifts.length || theirTasks.length ? "tasks_assigned" : "added_to_production",
        inquiry_id: inquiryId,
        title: told
          ? PRODUCTION_CHANGED
          : theirShifts.length
            ? `you're on for ${name}: ${hoursLabel(hours)}`
            : assignmentHeadline(theirTasks.length, name),
        body: told
          ? name
          : [
              ...theirShifts.map(
                (shift) =>
                  `${productionDayLabel(shift.day)} ${shiftSpan(shift.starts, shift.ends)}`,
              ),
              ...theirTasks.map((task) => task.title),
            ].join(" · ") || "open it for the event, the vision, and the order.",
        href: path,
      });
    } else {
      await admin.from("profiles").update({ invited_at: at }).eq("id", person.id);
      invited += 1;
    }

    // everything of theirs here has been sent
    await Promise.all([
      admin
        .from("production_people")
        .upsert({ inquiry_id: inquiryId, profile_id: person.id, notified_at: at }),
      admin
        .from("production_shifts")
        .update({ notified_at: at })
        .eq("inquiry_id", inquiryId)
        .eq("profile_id", person.id),
      theirTaskIds.size
        ? admin
            .from("production_task_people")
            .update({ notified_at: at })
            .eq("profile_id", person.id)
            .in("task_id", [...theirTaskIds])
        : Promise.resolve(null),
    ]);
    letters += 1;
  }

  await admin.from("productions").update({ shared_at: at }).eq("inquiry_id", inquiryId);
  return { letters, invited, shared_at: at };
}

/**
 * Every sweep: each production whose last shift has ended sends its hours to the studio's admins,
 * once, with the spreadsheet. A production is claimed before it sends, so two sweeps never both
 * send it; if the send fails it's let go, and the next sweep tries again.
 */
export async function sendDueHours(admin: Db, now = Date.now()) {
  const waiting = await admin
    .from("productions")
    .select("inquiry_id")
    .is("hours_sent_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = (waiting.data ?? []).map((row) => row.inquiry_id);
  if (!ids.length) return { sent: 0 };
  const [shifts, inquiries, admins] = await Promise.all([
    admin.from("production_shifts").select("inquiry_id, day, starts, ends").in("inquiry_id", ids),
    admin.from("inquiries").select("id").in("id", ids).eq("status", "booked"),
    admin.from("profiles").select("email, is_owner, access").eq("role", "admin").eq("active", true),
  ]);
  // the hours go to the founder, and to the admins who handle pay
  const to = [
    ...new Set(
      (admins.data ?? [])
        .filter((row) => hasAccess({ role: "admin", ...row }, "pay"))
        .map((row) => row.email)
        .filter(Boolean),
    ),
  ];
  if (!to.length) return { sent: 0 };
  let sent = 0;
  for (const inquiry of inquiries.data ?? []) {
    const theirShifts = (shifts.data ?? []).filter((row) => row.inquiry_id === inquiry.id);
    // as soon as the last shift on the schedule ends
    const due = hoursDueAt(theirShifts);
    if (!due || Date.parse(due) > now) continue;
    const stamp = new Date(now).toISOString();
    const claimed = await admin
      .from("productions")
      .update({ hours_sent_at: stamp })
      .eq("inquiry_id", inquiry.id)
      .is("hours_sent_at", null)
      .select("inquiry_id");
    if (!claimed.data?.length) continue;
    try {
      await sendHoursSummary(admin, inquiry.id, to);
      sent += 1;
    } catch {
      await admin.from("productions").update({ hours_sent_at: null }).eq("inquiry_id", inquiry.id);
    }
  }
  return { sent };
}

/**
 * The hours for a production, to the studio: each person's scheduled hours at their rate, with
 * the spreadsheet attached for google sheets.
 */
export async function sendHoursSummary(admin: Db, inquiryId: string, to: string | string[]) {
  const [production, shifts, rates] = await Promise.all([
    admin.from("productions").select("*").eq("inquiry_id", inquiryId).maybeSingle(),
    admin.from("production_shifts").select("*").eq("inquiry_id", inquiryId),
    admin.from("production_rates").select("profile_id, cents, per").eq("inquiry_id", inquiryId),
  ]);
  if (!production.data) throw new Error("that production isn't here anymore.");
  if (!shifts.data?.length) throw new Error("there aren't any shifts on the schedule yet.");
  const ids = [...new Set(shifts.data.map((shift) => shift.profile_id))];
  const profiles = await admin.from("profiles").select("id, full_name, email").in("id", ids);
  const names = new Map((profiles.data ?? []).map((row) => [row.id, personName(row)]));
  const summary = hoursSummary(shifts.data, names, rateMap(rates.data ?? []));
  const [days, inquiry] = await Promise.all([
    admin.from("production_days").select("day, hours").eq("inquiry_id", inquiryId),
    admin
      .from("inquiries")
      .select("event_date, event_date_tbd, message")
      .eq("id", inquiryId)
      .maybeSingle(),
  ]);
  const holds = inquiry.data ? inquiryHoldDates(inquiry.data) : [];
  const name = production.data.project_name;
  const { hoursSummaryHtml } = await import("@/lib/os/production-email");
  const { sendStudioEmail } = await import("@/lib/os/email.server");
  const sent = await sendStudioEmail({
    to,
    subject: `${productionTitle(name)}: the hours`,
    eventType: "production_hours",
    referenceType: "production",
    referenceId: inquiryId,
    html: hoursSummaryHtml({
      projectName: name,
      range: productionDateRange(
        firstProductionDay(days.data ?? [], holds),
        lastProductionDay(days.data ?? [], holds),
      ),
      url: `${appOrigin()}/production/${production.data.slug}`,
      summary,
    }),
    attachments: [
      {
        name: `${production.data.slug}-hours.csv`,
        type: "text/csv",
        data: new TextEncoder().encode(hoursCsv(name, summary)),
      },
    ],
  });
  if (sent.skipped) throw new Error("the email didn't go out. check gmail in settings.");
  return { hours: summary.hours, pay_cents: summary.pay_cents };
}
