// Local only: productions, members, and their notices as the dev preview keeps them, in this
// browser, so the production tab, the shared page, a member's today, and the gang can all
// be tried without the database. It answers the same way the server does.
import type { User } from "@supabase/supabase-js";

import type {
  AppRole,
  MemberNoticeRow,
  ProductionShiftRow,
  ProfileRow,
  ProductionDayRow,
  ProductionItemRow,
  ProductionRow,
  ProductionStemRow,
  EventType,
} from "@/integrations/supabase/types";
import {
  getDevPreviewInquiryWorkspace,
  getDevPreviewPipeline,
  PREVIEW_IDS,
} from "@/lib/dev-preview-data";
import { cleanAccess, DEFAULT_ADMIN_ACCESS, hasAccess } from "@/lib/os/access";
import { inquiryHoldDates } from "@/lib/os/inquiry-holds";
import {
  assignmentHeadline,
  defaultProjectName,
  firstName,
  firstProductionDay,
  freeSlug,
  hoursLabel,
  lastProductionDay,
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
  type ProductionTaskView,
  type ProductionView,
  type MemberRate,
  PRODUCTION_CHANGED,
} from "@/lib/os/production";

const STATE_KEY = "say-sukii-preview-production-v5";
const VIEWER_KEY = "say-sukii-preview-as";
const PREVIEW_PROPOSAL_PDF = "/attachments/fenty-beauty-proposal.pdf";
const PREVIEW_PROPOSAL_ID = "40000000-0000-4000-8000-0000000000a1";

export const PREVIEW_ADMIN_ID = "00000000-0000-4000-8000-000000000001";

type PreviewMember = {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  active: boolean;
  created_at: string;
  last_seen_at: string | null;
  /** added by the studio and not invited yet, or invited and not joined; joined when absent */
  standing?: "added" | "invited";
  /** the founder */
  is_owner?: boolean;
  /** what an admin can open, set by the founder */
  access?: string[];
  invited_at?: string | null;
  /** the version of how we flow they agreed to, and when */
  flow_version?: string | null;
  flow_agreed_at?: string | null;
  /** when they finished or skipped the tour of today */
  tour_seen_at?: string | null;
};

type PreviewInvite = {
  id: string;
  email: string;
  role: AppRole;
  expires_at: string;
  accepted_at: null;
  created_at: string;
};

type PreviewProduction = {
  production: ProductionRow;
  /** who has something new or changed that the next share sends them */
  pending?: string[];
  /** who has been sent this production before */
  told?: string[];
  /** who's on it, with or without a task */
  crew: string[];
  /** who works when */
  shifts: ProductionShiftRow[];
  /** what each person is paid on this production: by the hour, or flat */
  rates?: Record<string, MemberRate>;
  days: ProductionDayRow[];
  items: ProductionItemRow[];
  stems: ProductionStemRow[];
  tasks: ProductionTaskView[];
  files: ProductionFileView[];
};

type PreviewState = {
  productions: Record<string, PreviewProduction>;
  members: PreviewMember[];
  invites: PreviewInvite[];
  notices: MemberNoticeRow[];
  /** what each person was paid before rates moved onto each production; read once, to carry over */
  rates: Record<string, MemberRate>;
  /** one-time repairs already made to a kept preview */
  repairs?: string[];
  /** productions added by hand, with the booked inquiry and client behind each */
  manual?: Record<string, ManualRecord>;
};

const now = () => new Date().toISOString();
const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
/** a time on a day from today, in the studio's zone near enough for the preview */
const at = (offset: number, hour: number) => {
  const date = new Date(`${day(offset)}T00:00:00-05:00`);
  date.setHours(date.getHours() + hour);
  return date.toISOString();
};

const MEMBERS: PreviewMember[] = [
  {
    id: PREVIEW_ADMIN_ID,
    full_name: "Sukii",
    email: "info@saysukii.com",
    role: "admin",
    is_owner: true,
    active: true,
    created_at: day(-400),
    last_seen_at: now(),
  },
  {
    id: "70000000-0000-4000-8000-000000000071",
    full_name: "Cara Ortiz",
    email: "cara.ortiz@example.com",
    role: "team",
    active: true,
    created_at: day(-90),
    last_seen_at: day(-2),
  },
  {
    id: "70000000-0000-4000-8000-000000000072",
    full_name: "Nina Park",
    email: "nina.park@example.com",
    role: "team",
    active: true,
    created_at: day(-60),
    last_seen_at: day(-6),
  },
  {
    id: "70000000-0000-4000-8000-000000000073",
    full_name: "Theo Brandt",
    email: "theo.brandt@example.com",
    role: "team",
    active: false,
    created_at: day(-200),
    last_seen_at: day(-120),
  },
  {
    id: "70000000-0000-4000-8000-000000000074",
    full_name: "Maya Lopez",
    email: "maya.lopez@example.com",
    role: "team",
    active: true,
    created_at: day(-1),
    last_seen_at: null,
    standing: "added",
    invited_at: null,
  },
];

const [, CARA, NINA, THEO, MAYA] = MEMBERS.map((member) => member.id) as [
  string,
  string,
  string,
  string,
  string,
];

/** maya's first shift, on the sample's fourth day: scheduled, and not shared yet */
function mayaShift(day4: string): ProductionShiftRow {
  return {
    id: "82000000-0000-4000-8000-000000000090",
    inquiry_id: PREVIEW_IDS.inquiryProduction,
    profile_id: MAYA,
    day: day4,
    starts: "16:00",
    ends: "22:00",
    role: "production hands",
    location: "venue",
    notified_at: null,
    created_at: now(),
  };
}

/** a sample shift: who, which day from today, from when to when, as what, and where */
function sampleShift(
  inquiryId: string,
  n: number,
  profileId: string,
  offset: number,
  starts: string,
  ends: string,
  role: string,
  location: string,
): ProductionShiftRow {
  return {
    id: `82000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    inquiry_id: inquiryId,
    profile_id: profileId,
    day: day(offset),
    starts,
    ends,
    role,
    location,
    notified_at: now(),
    created_at: now(),
  };
}

function seedProduction(): PreviewProduction {
  const inquiryId = PREVIEW_IDS.inquiryProduction;
  const id = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const task = (
    n: number,
    title: string,
    startsAt: string | null,
    category: string,
    location: string,
    people: string[],
    done = false,
  ): ProductionTaskView => ({
    id: id(300 + n),
    inquiry_id: inquiryId,
    title,
    starts_at: startsAt,
    category,
    location,
    status: done ? "done" : "open",
    done_at: done ? now() : null,
    done_by: done ? (people[0] ?? null) : null,
    sort: n,
    created_at: now(),
    updated_at: now(),
    people,
  });
  return {
    production: {
      inquiry_id: inquiryId,
      slug: "lumen-studio-live-labs",
      project_name: "Lumen Studio: Live + Labs",
      studio_address: STUDIO_ADDRESS,
      dress_code: DEFAULT_DRESS_CODE,
      vision_proposal_id: PREVIEW_PROPOSAL_ID,
      vision_pages: [2, 3],
      vision_path: null,
      vision_stamp: null,
      hours_sent_at: null,
      shared_at: at(-3, 11),
      reflection: "",
      created_at: now(),
      updated_at: now(),
    },
    days: [
      [6, "10:00am – 10:00pm"],
      [7, "9:00am – 1:00pm\n7:00pm – 11:00pm"],
      [8, "10:00am – 7:00pm"],
      [9, "10:00am – 10:00pm (open access to the museum 6–10pm)"],
      [
        10,
        "7:00am – 1:00pm (open access to the museum 7am–10pm)\n6:00pm – 11:00pm (museum, then studio)",
      ],
    ].map(([offset, hours], index) => ({
      id: id(100 + index),
      inquiry_id: inquiryId,
      day: day(offset as number),
      hours: hours as string,
      created_at: now(),
    })),
    items: [
      ["installation", "grand entrance installation", 1, "in_progress"],
      ["installation", "blue stage installation", 1, "todo"],
      ["installation", "green stage installation", 1, "todo"],
      ["arrangements", "coffee cart / table", 1, "done"],
      ["arrangements", "mini accent table arrangements", 24, "todo"],
      ["reception", "small arrangements for the reception table", 4, "todo"],
      ["arrangements", "bar arrangements", 3, "todo"],
      ["installation", "hanging floral cloud", 1, "todo"],
      ["personals", "speaker boutonnieres", 6, "todo"],
      ["arrangements", "restroom bud vases", 8, "todo"],
    ].map(([kind, name, quantity, status], index) => ({
      id: id(200 + index),
      inquiry_id: inquiryId,
      kind: kind as string,
      name: name as string,
      quantity: quantity as number,
      status: status as ProductionItemRow["status"],
      sort: index,
      created_at: now(),
    })),
    // a recipe written the new way: the flower, its color, how many, and the piece it's for
    stems: (
      [
        ["anthurium", "salmon", 40, 0],
        ["bird of paradise", "orange", 30, 0],
        ["palm areca", "green", 12, 0],
        ["carnation", "hot pink", 150, 1],
        ["garden rose", "peach", 60, 1],
        ["orchid phalaenopsis", "hot pink", 18, 2],
        ["pincushion protea", "yellow", 24, 4],
        ["eucalyptus baby blue", "green", 30, 4],
        ["carnation", "orange", 50, 5],
      ] as Array<[string, string, number, number]>
    ).map(([name, color, quantity, item], index) => ({
      id: id(400 + index),
      inquiry_id: inquiryId,
      name,
      color,
      quantity,
      item_id: id(200 + item),
      done: index < 2,
      sort: index,
      created_at: now(),
    })),
    crew: [PREVIEW_ADMIN_ID, CARA, NINA, THEO, MAYA],
    told: [CARA, NINA, THEO],
    pending: [MAYA],
    shifts: [
      mayaShift(day(9)),
      sampleShift(
        PREVIEW_IDS.inquiryProduction,
        1,
        CARA,
        6,
        "10:00",
        "18:00",
        "production",
        "studio",
      ),
      sampleShift(
        PREVIEW_IDS.inquiryProduction,
        2,
        NINA,
        6,
        "14:00",
        "22:00",
        "production hands",
        "studio",
      ),
      sampleShift(
        PREVIEW_IDS.inquiryProduction,
        3,
        CARA,
        7,
        "09:00",
        "13:00",
        "production",
        "studio",
      ),
      sampleShift(
        PREVIEW_IDS.inquiryProduction,
        4,
        NINA,
        7,
        "19:00",
        "23:00",
        "production hands",
        "studio",
      ),
      sampleShift(PREVIEW_IDS.inquiryProduction, 5, CARA, 9, "10:00", "22:00", "lead", "studio"),
      sampleShift(
        PREVIEW_IDS.inquiryProduction,
        6,
        THEO,
        9,
        "16:00",
        "22:00",
        "production hands",
        "studio",
      ),
      sampleShift(PREVIEW_IDS.inquiryProduction, 7, CARA, 10, "07:00", "13:00", "install", "venue"),
      sampleShift(PREVIEW_IDS.inquiryProduction, 8, NINA, 10, "07:00", "13:00", "install", "venue"),
      sampleShift(
        PREVIEW_IDS.inquiryProduction,
        9,
        NINA,
        10,
        "18:00",
        "23:00",
        "breakdown",
        "venue",
      ),
    ],
    tasks: [
      task(
        1,
        "place orders for flowers + supplies",
        at(-4, 9.5),
        "supply + logistics",
        "",
        [PREVIEW_ADMIN_ID],
        true,
      ),
      task(2, "build the installation pedestals", at(2, 10), "supply + logistics", "studio", [
        CARA,
      ]),
      task(3, "clean and prep buckets", at(6, 18), "floral prep", "studio", [CARA, NINA]),
      task(4, "fill water tubes", at(7, 18), "floral prep", "studio", [NINA]),
      task(5, "process flowers, day 1", at(7, 18), "floral prep", "studio", [CARA, NINA]),
      task(
        6,
        "design: florals for the entry pedestals (20)",
        at(9, 16),
        "floral design execution",
        "studio",
        [CARA, THEO],
      ),
      task(7, "load the truck for setup", at(10, 6), "supply + logistics", "studio", [NINA]),
      task(8, "studio breakdown", at(13, 10), "breakdown", "studio", [PREVIEW_ADMIN_ID]),
    ],
    files: [
      {
        id: id(500),
        name: "museum vendor load instructions.pdf",
        kind: "logistics",
        href: "/attachments/ceremony-layout.pdf",
        file_type: "application/pdf",
        created_at: now(),
      },
      {
        id: id(501),
        name: "museum floor plan.pdf",
        kind: "logistics",
        href: "/attachments/ceremony-layout.pdf",
        file_type: "application/pdf",
        created_at: now(),
      },
    ],
  };
}

/** a wedding from a couple of weeks ago, wrapped: everything done, closed to the team */
function seedWrapped(): PreviewProduction {
  const inquiryId = PREVIEW_IDS.inquiryWrapped;
  const id = (n: number) => `81000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const items: Array<[string, string, number]> = [
    ["installation", "ceremony arch", 1],
    ["arrangements", "long table runner", 1],
    ["arrangements", "bud vases", 40],
    ["personals", "bridal bouquet", 1],
  ];
  const stems: Array<[string, string, number, number]> = [
    ["garden rose", "blush", 80, 0],
    ["sweet pea", "lavender", 60, 1],
    ["ranunculus", "ivory", 50, 2],
    ["peony", "light pink", 12, 3],
  ];
  const tasks: Array<[string, number, number, string, string, string[]]> = [
    ["order flowers for the wedding", -20, 10, "supply + logistics", "", [PREVIEW_ADMIN_ID]],
    ["process flowers", -14, 9, "floral prep", "studio", [CARA, NINA]],
    ["build the ceremony arch", -13, 8, "floral design execution", "studio", [CARA]],
    ["install at vizcaya", -12, 13, "install", "venue", [CARA, NINA]],
    ["breakdown", -12, 22, "breakdown", "venue", [NINA]],
  ];
  return {
    production: {
      inquiry_id: inquiryId,
      slug: "elena-and-marco-wedding",
      project_name: "Elena + Marco Wedding",
      studio_address: STUDIO_ADDRESS,
      dress_code: DEFAULT_DRESS_CODE,
      vision_proposal_id: null,
      vision_pages: [],
      vision_path: null,
      vision_stamp: null,
      hours_sent_at: day(-11),
      shared_at: day(-24),
      reflection: "the arch took two more hours than planned. bring a second ladder next time.",
      created_at: day(-40),
      updated_at: day(-10),
    },
    crew: [PREVIEW_ADMIN_ID, CARA, NINA],
    shifts: [
      sampleShift(
        PREVIEW_IDS.inquiryWrapped,
        21,
        CARA,
        -13,
        "10:00",
        "20:00",
        "production",
        "studio",
      ),
      sampleShift(PREVIEW_IDS.inquiryWrapped, 22, NINA, -12, "11:00", "23:30", "install", "venue"),
    ],
    days: [
      [-14, "9:00am – 6:00pm"],
      [-13, "10:00am – 8:00pm"],
      [-12, "11:00am – 11:30pm (install, then breakdown)"],
    ].map(([offset, hours], index) => ({
      id: id(100 + index),
      inquiry_id: inquiryId,
      day: day(offset as number),
      hours: hours as string,
      created_at: day(-40),
    })),
    items: items.map(([kind, name, quantity], index) => ({
      id: id(200 + index),
      inquiry_id: inquiryId,
      kind,
      name,
      quantity,
      status: "done" as const,
      sort: index,
      created_at: day(-40),
    })),
    stems: stems.map(([name, color, quantity, item], index) => ({
      id: id(400 + index),
      inquiry_id: inquiryId,
      name,
      color,
      quantity,
      item_id: id(200 + item),
      done: true,
      sort: index,
      created_at: day(-40),
    })),
    tasks: tasks.map(([title, offset, hour, category, location, people], index) => ({
      id: id(300 + index),
      inquiry_id: inquiryId,
      title,
      starts_at: at(offset, hour),
      category,
      location,
      status: "done" as const,
      done_at: at(offset, hour + 2),
      done_by: people[0] ?? null,
      sort: index,
      created_at: day(-40),
      updated_at: day(-10),
      people,
    })),
    files: [],
  };
}

function seed(): PreviewState {
  return {
    productions: {
      [PREVIEW_IDS.inquiryProduction]: seedProduction(),
      [PREVIEW_IDS.inquiryWrapped]: seedWrapped(),
    },
    members: MEMBERS,
    rates: {
      [CARA]: { cents: 2800, per: "hour" },
      [NINA]: { cents: 2500, per: "hour" },
      [THEO]: { cents: 30000, per: "production" },
    },
    invites: [
      {
        id: "70000000-0000-4000-8000-0000000000a1",
        email: "lena.morales@example.com",
        role: "team",
        expires_at: day(5),
        accepted_at: null,
        created_at: day(-2),
      },
    ],
    notices: [
      {
        id: "70000000-0000-4000-8000-0000000000b1",
        profile_id: CARA,
        kind: "tasks_assigned",
        inquiry_id: PREVIEW_IDS.inquiryProduction,
        title: assignmentHeadline(4, "Lumen Studio: Live + Labs"),
        body: "build the installation pedestals · clean and prep buckets · process flowers, day 1 · design: florals for the entry pedestals (20)",
        href: "/production/lumen-studio-live-labs",
        read_at: null,
        created_at: now(),
      },
    ],
  };
}

/** everyone on a production keeps the rate they had in the gang, for that production */
function carryRates(state: PreviewState) {
  for (const item of Object.values(state.productions)) {
    if (item.rates) continue;
    const people = new Set([...(item.crew ?? []), ...(item.shifts ?? []).map((s) => s.profile_id)]);
    item.rates = Object.fromEntries(
      [...people].flatMap((id) => (state.rates?.[id] ? [[id, state.rates[id]]] : [])),
    );
  }
  return state;
}

let memory: PreviewState | null = null;

function read(): PreviewState {
  if (memory) return memory;
  try {
    const kept = localStorage.getItem(STATE_KEY);
    memory = carryRates(kept ? repair(JSON.parse(kept) as PreviewState) : seed());
  } catch {
    memory = carryRates(seed());
  }
  return memory;
}

/** bring a preview kept from before up to date, once, without losing what was done in it */
function repair(state: PreviewState): PreviewState {
  const done = new Set(state.repairs ?? []);
  // rates used to be a number of cents an hour
  state.rates = Object.fromEntries(
    Object.entries(state.rates ?? {}).map(([member, rate]) => [
      member,
      typeof rate === "number" ? { cents: rate, per: "hour" as const } : rate,
    ]),
  );
  // the sample's first production day, removed before removing asked first
  if (!done.has("restore-first-day")) {
    const lumen = state.productions[PREVIEW_IDS.inquiryProduction];
    const [first, second] = seedProduction().days;
    if (lumen && first && second && !lumen.days.some((row) => row.id === first.id)) {
      // the kept sample may have started on another day: put it back the day before the second
      const kept = lumen.days.find((row) => row.id === second.id);
      const date = new Date(`${kept?.day ?? second.day}T12:00:00`);
      date.setDate(date.getDate() - 1);
      const restored = { ...first, day: date.toISOString().slice(0, 10) };
      lumen.days = [...lumen.days, restored].sort((a, b) => a.day.localeCompare(b.day));
    }
    done.add("restore-first-day");
  }
  // sharing came later: what the team already had stays shared, and maya joins the sample
  if (!done.has("share-flow")) {
    for (const item of Object.values(state.productions)) {
      if (item.production.shared_at === undefined) {
        item.production.shared_at =
          item.production.inquiry_id === PREVIEW_IDS.inquiryProduction ||
          item.production.inquiry_id === PREVIEW_IDS.inquiryWrapped
            ? now()
            : null;
      }
      item.told = item.told ?? (item.production.shared_at ? [...(item.crew ?? [])] : []);
      item.pending = item.pending ?? [];
    }
    const maya = MEMBERS.find((member) => member.id === MAYA)!;
    if (!state.members.some((member) => member.id === MAYA)) state.members.push(maya);
    const lumen = state.productions[PREVIEW_IDS.inquiryProduction];
    if (lumen && !(lumen.shifts ?? []).some((shift) => shift.profile_id === MAYA)) {
      const days = [...lumen.days].sort((a, b) => a.day.localeCompare(b.day));
      lumen.shifts = [...(lumen.shifts ?? []), mayaShift(days[3]?.day ?? day(9))];
      lumen.crew = [...new Set([...(lumen.crew ?? []), MAYA])];
      lumen.pending = [...new Set([...(lumen.pending ?? []), MAYA])];
    }
    done.add("share-flow");
  }
  state.repairs = [...done];
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // kept for this visit
  }
  return state;
}

function write(state: PreviewState) {
  memory = state;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // a private window keeps the preview for this visit only
  }
}

function change(mutate: (state: PreviewState) => void) {
  const state = structuredClone(read());
  mutate(state);
  write(state);
}

/** start the preview over, as if nothing had been changed */
export function resetPreviewProduction() {
  memory = null;
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    // nothing kept
  }
}

/** who the preview is signed in as: the studio's admin, or one of the sample members */
export function previewViewer(): PreviewMember {
  const state = read();
  let id: string | null = null;
  try {
    id = localStorage.getItem(VIEWER_KEY);
  } catch {
    id = null;
  }
  return state.members.find((member) => member.id === id && member.active) ?? state.members[0]!;
}

export function setPreviewViewer(id: string | null) {
  try {
    if (id && id !== PREVIEW_ADMIN_ID) localStorage.setItem(VIEWER_KEY, id);
    else localStorage.removeItem(VIEWER_KEY);
  } catch {
    // stays as the admin
  }
}

/**
 * Who to show the studio as, for "see a member's today": an active member who's joined and is on
 * a production that's been shared, so there's something for them to see.
 */
export function memberToPreview() {
  const state = read();
  const shared = Object.values(state.productions).filter((item) => item.production.shared_at);
  const onOne = (id: string) =>
    shared.some(
      (item) =>
        (item.crew ?? []).includes(id) ||
        (item.shifts ?? []).some((shift) => shift.profile_id === id) ||
        item.tasks.some((task) => task.people.includes(id)),
    );
  return (
    state.members.find(
      (member) =>
        member.id !== PREVIEW_ADMIN_ID && member.active && !member.standing && onOne(member.id),
    ) ?? null
  );
}

/** the sample members a preview can sign in as, for the switch on the page */
export function previewMembers() {
  return read().members;
}

type ManualRecord = {
  inquiry: {
    id: string;
    status: "booked";
    archived: false;
    event_type: EventType;
    event_name: string;
    event_date: string | null;
    event_date_tbd: boolean;
    message: null;
    venue_text: null;
    venue_id: null;
    client_id: string;
  };
  client: { id: string; name: string; email: string; organization: null; type: "individual" };
};

function inquiryFacts(inquiryId: string) {
  const manual = read().manual?.[inquiryId];
  if (manual) return manual;
  const workspace = getDevPreviewInquiryWorkspace(inquiryId);
  return { inquiry: workspace.inquiry, client: workspace.client };
}

function ensure(inquiryId: string): PreviewProduction {
  const state = read();
  const found = state.productions[inquiryId];
  if (found) return found;
  const { inquiry, client } = inquiryFacts(inquiryId);
  if (inquiry.status !== "booked")
    throw new Error("a production opens once the inquiry is booked.");
  const name =
    ("event_name" in inquiry && inquiry.event_name?.trim()) || defaultProjectName(client ?? {});
  const slug = freeSlug(
    productionSlug(name),
    Object.values(state.productions).map((item) => item.production.slug),
  );
  const made: PreviewProduction = {
    production: {
      inquiry_id: inquiryId,
      slug,
      project_name: name,
      studio_address: STUDIO_ADDRESS,
      dress_code: DEFAULT_DRESS_CODE,
      vision_proposal_id: null,
      vision_pages: [],
      vision_path: null,
      vision_stamp: null,
      hours_sent_at: null,
      shared_at: null,
      reflection: "",
      created_at: now(),
      updated_at: now(),
    },
    days: [],
    // the order starts as the proposal had it
    items: (
      [
        ["installation", "ceremony arch", 1],
        ["arrangements", "low centerpieces", 18],
        ["arrangements", "bar arrangements", 3],
      ] as Array<[string, string, number]>
    ).map(([kind, name, quantity], index) => ({
      id: crypto.randomUUID(),
      inquiry_id: inquiryId,
      kind,
      name,
      quantity,
      status: "todo" as const,
      sort: index,
      created_at: now(),
    })),
    stems: [],
    tasks: [],
    files: [],
    crew: [],
    shifts: [],
  };
  change((next) => {
    next.productions[inquiryId] = made;
  });
  return made;
}

function view(inquiryId: string, viewer: { id: string; role: AppRole }): ProductionView {
  const kept = ensure(inquiryId);
  const state = read();
  const { inquiry, client } = inquiryFacts(inquiryId);
  const holds = inquiryHoldDates(inquiry);
  const lastDay = lastProductionDay(kept.days, holds);
  const schedule = productionSchedule(kept.days, holds);
  const status = productionPhase(schedule);
  const isAdmin = viewer.role === "admin";
  const assigned = new Set([
    ...(kept.crew ?? []),
    ...kept.tasks.flatMap((task) => task.people),
    ...(kept.shifts ?? []).map((shift) => shift.profile_id),
  ]);
  const people: ProductionPerson[] = state.members
    .filter((member) => isAdmin || assigned.has(member.id))
    .map((member) => ({
      id: member.id,
      name: member.full_name,
      email: isAdmin ? member.email : null,
      active: member.active,
      role: member.role,
      standing: member.standing ?? ("joined" as const),
    }));
  const venueText = inquiry.venue_text ?? "";
  const vision = kept.production;
  return {
    production: isAdmin ? kept.production : { ...kept.production, reflection: "" },
    title: productionTitle(kept.production.project_name),
    path: `/production/${kept.production.slug}`,
    event: {
      type: inquiry.event_type,
      first: firstProductionDay(kept.days, holds),
      last: lastDay,
      venueName: venueText.split(",")[0]?.trim() ?? "",
      venueAddress: venueText,
      loadIn: null,
      clientName: isAdmin ? (client?.name ?? "") : "",
    },
    days: [...kept.days].sort((a, b) => a.day.localeCompare(b.day)),
    items: [...kept.items].sort((a, b) => a.sort - b.sort),
    stems: [...kept.stems].sort((a, b) => a.sort - b.sort),
    tasks: [...kept.tasks].sort((a, b) => (a.starts_at ?? "9").localeCompare(b.starts_at ?? "9")),
    files: kept.files,
    people,
    crew: state.members.filter((member) => assigned.has(member.id)).map((member) => member.id),
    shifts: [...(kept.shifts ?? [])].sort((a, b) =>
      `${a.day}${a.starts}`.localeCompare(`${b.day}${b.starts}`),
    ),
    canPay: (() => {
      const member = state.members.find((item) => item.id === viewer.id);
      return (
        isAdmin &&
        hasAccess(
          {
            role: "admin",
            is_owner: viewer.id === PREVIEW_ADMIN_ID || Boolean(member?.is_owner),
            access: member?.access,
          },
          "pay",
        )
      );
    })(),
    // what people are paid shows only to those who handle pay
    rates: (() => {
      const member = state.members.find((item) => item.id === viewer.id);
      const canPay =
        isAdmin &&
        hasAccess(
          {
            role: "admin",
            is_owner: viewer.id === PREVIEW_ADMIN_ID || Boolean(member?.is_owner),
            access: member?.access,
          },
          "pay",
        );
      return canPay ? { ...(kept.rates ?? {}) } : {};
    })(),
    unshared: isAdmin ? [...(kept.pending ?? [])] : [],
    told: isAdmin ? [...(kept.told ?? [])] : [],
    stemSuggestions: isAdmin
      ? [
          ...new Set(
            Object.values(state.productions).flatMap((item) => item.stems.map((stem) => stem.name)),
          ),
        ]
      : [],
    // the preview has no server to copy pages out, so it shows the chosen pages of the proposal
    visionUrl:
      vision.vision_proposal_id && vision.vision_pages.length ? PREVIEW_PROPOSAL_PDF : null,
    proposals: isAdmin
      ? [{ id: PREVIEW_PROPOSAL_ID, number: "P-1031", href: PREVIEW_PROPOSAL_PDF }]
      : [],
    status,
    schedule,
    access: { open: teamCanOpen(status), lastDay },
    viewer,
  };
}

/** the proposal pages a preview vision shows, since its pdf is the whole proposal */
export function previewVisionPages(production: ProductionRow) {
  return production.vision_pages;
}

function mutateProduction(inquiryId: string, mutate: (item: PreviewProduction) => void) {
  ensure(inquiryId);
  change((state) => {
    const item = state.productions[inquiryId];
    if (item) mutate(item);
  });
}

function findByTask(state: PreviewState, taskId: string) {
  return Object.values(state.productions).find((item) =>
    item.tasks.some((task) => task.id === taskId),
  );
}

function memberCanOpen(memberId: string, inquiryId: string) {
  const kept = read().productions[inquiryId];
  if (!kept?.production.shared_at) return false;
  const onIt =
    (kept.crew ?? []).includes(memberId) ||
    kept.tasks.some((task) => task.people.includes(memberId));
  if (!onIt) return false;
  const { inquiry } = inquiryFacts(inquiryId);
  return teamCanOpen(productionPhase(productionSchedule(kept.days, inquiryHoldDates(inquiry))));
}

const uuid = () => crypto.randomUUID();

/** a member's own news, on their bell: in the preview there's no sweep, so it's right away */
function newsFor(
  item: PreviewProduction,
  profileId: string,
  title: string,
  body: string,
): MemberNoticeRow {
  return {
    id: uuid(),
    profile_id: profileId,
    kind: body ? "tasks_assigned" : "added_to_production",
    inquiry_id: item.production.inquiry_id,
    title,
    body: body || "open it for the event, the vision, and the order.",
    href: `/production/${item.production.slug}`,
    read_at: null,
    created_at: now(),
  };
}

/** these people have something new or changed here, for the next share */
function markPending(item: PreviewProduction, people: string[]) {
  item.pending = [
    ...new Set([...(item.pending ?? []), ...people.filter((id) => id !== PREVIEW_ADMIN_ID)]),
  ];
}

/** The preview's stand-in for each production server function. */
export const previewProduction = {
  get(inquiryId: string) {
    const viewer = previewViewer();
    return view(inquiryId, { id: viewer.id, role: "admin" });
  },
  page(slug: string): { view: ProductionView | null; reason: "closed" | null } {
    const viewer = previewViewer();
    const found = Object.values(read().productions).find(
      (item) => item.production.slug === slug.toLowerCase(),
    );
    if (!found) return { view: null, reason: "closed" };
    const inquiryId = found.production.inquiry_id;
    if (viewer.role !== "admin" && !memberCanOpen(viewer.id, inquiryId)) {
      return { view: null, reason: "closed" };
    }
    return { view: view(inquiryId, { id: viewer.id, role: viewer.role }), reason: null };
  },
  title(slug: string) {
    const found = Object.values(read().productions).find(
      (item) => item.production.slug === slug.toLowerCase(),
    );
    return found ? productionTitle(found.production.project_name) : null;
  },
  update(input: { inquiry_id: string } & Partial<ProductionRow>) {
    const { inquiry_id, ...patch } = input;
    let result = { slug: "", title: "" };
    mutateProduction(inquiry_id, (item) => {
      const next = { ...item.production, ...patch, updated_at: now() };
      if (patch.project_name) {
        const sent = read().notices.some((notice) => notice.inquiry_id === inquiry_id);
        if (!sent) {
          next.slug = freeSlug(
            productionSlug(patch.project_name),
            Object.values(read().productions)
              .filter((other) => other.production.inquiry_id !== inquiry_id)
              .map((other) => other.production.slug),
          );
        }
      }
      item.production = next;
      result = { slug: next.slug, title: productionTitle(next.project_name) };
    });
    return result;
  },
  saveDay(input: { inquiry_id: string; id?: string; day: string; hours: string }) {
    const dayId = input.id ?? uuid();
    mutateProduction(input.inquiry_id, (item) => {
      const row = {
        id: dayId,
        inquiry_id: input.inquiry_id,
        day: input.day,
        hours: input.hours,
        created_at: now(),
      };
      item.days = input.id
        ? item.days.map((existing) =>
            existing.id === input.id ? { ...existing, ...row } : existing,
          )
        : [...item.days, row];
    });
    return { id: dayId };
  },
  removeDay(dayId: string) {
    change((state) => {
      for (const item of Object.values(state.productions)) {
        const gone = item.days.find((row) => row.id === dayId);
        if (!gone) continue;
        item.days = item.days.filter((row) => row.id !== dayId);
        // the day's shifts go with it, and those people hear on the next share
        markPending(
          item,
          (item.shifts ?? [])
            .filter((shift) => shift.day === gone.day)
            .map((shift) => shift.profile_id),
        );
        item.shifts = (item.shifts ?? []).filter((shift) => shift.day !== gone.day);
      }
    });
  },
  setItemStatus(itemId: string, status: "todo" | "in_progress" | "done") {
    const viewer = previewViewer();
    change((state) => {
      for (const item of Object.values(state.productions)) {
        item.items = item.items.map((row) =>
          row.id === itemId ? { ...row, status, status_by: viewer.id, status_at: now() } : row,
        );
      }
    });
    return { id: itemId };
  },
  saveItem(
    input: Omit<ProductionItemRow, "id" | "created_at" | "sort"> & { id?: string; sort?: number },
  ) {
    const itemId = input.id ?? uuid();
    mutateProduction(input.inquiry_id, (item) => {
      const sort = input.sort ?? Math.max(0, ...item.items.map((row) => row.sort + 1));
      const row = { ...input, id: itemId, sort, created_at: now() };
      item.items = input.id
        ? item.items.map((existing) =>
            existing.id === input.id ? { ...existing, ...row, sort: existing.sort } : existing,
          )
        : [...item.items, row];
    });
    return { id: itemId };
  },
  removeItem(itemId: string) {
    change((state) => {
      for (const item of Object.values(state.productions)) {
        item.items = item.items.filter((row) => row.id !== itemId);
        // like the database: the stems stay, without a piece
        item.stems = (item.stems ?? []).map((stem) =>
          stem.item_id === itemId ? { ...stem, item_id: null } : stem,
        );
      }
    });
  },
  addStem(input: {
    inquiry_id: string;
    name: string;
    color: string;
    quantity: number | null;
    item_id: string | null;
  }) {
    const stemId = uuid();
    mutateProduction(input.inquiry_id, (item) => {
      const start = Math.max(0, ...item.stems.map((row) => row.sort + 1));
      item.stems.push({
        id: stemId,
        inquiry_id: input.inquiry_id,
        name: input.name.trim().toLowerCase(),
        color: input.color.trim().toLowerCase(),
        quantity: input.quantity,
        item_id: input.item_id,
        done: false,
        sort: start,
        created_at: now(),
      });
    });
    return { id: stemId };
  },
  updateStem(
    stemId: string,
    patch: {
      name?: string;
      color?: string;
      quantity?: number | null;
      item_id?: string | null;
      done?: boolean;
    },
  ) {
    const clean = {
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim().toLowerCase() } : {}),
      ...(patch.color !== undefined ? { color: patch.color.trim().toLowerCase() } : {}),
    };
    change((state) => {
      for (const item of Object.values(state.productions)) {
        item.stems = item.stems.map((row) => (row.id === stemId ? { ...row, ...clean } : row));
      }
    });
  },
  addPerson(inquiryId: string, profileId: string) {
    const member = read().members.find((item) => item.id === profileId);
    if (!member?.active) {
      throw new Error("only active members can be added. activate them in the gang.");
    }
    const news: MemberNoticeRow[] = [];
    mutateProduction(inquiryId, (item) => {
      item.crew = item.crew ?? [];
      if (item.crew.includes(profileId)) return;
      item.crew.push(profileId);
      // once it's shared, someone who's joined hears right away; anyone else waits for a share
      if (item.production.shared_at && !member.standing && profileId !== PREVIEW_ADMIN_ID) {
        item.told = [...new Set([...(item.told ?? []), profileId])];
        news.push(
          newsFor(item, profileId, `you're on the team for ${item.production.project_name}`, ""),
        );
      } else {
        markPending(item, [profileId]);
      }
    });
    if (news.length) change((next) => next.notices.unshift(...news));
  },
  removePerson(inquiryId: string, profileId: string) {
    let untasked = 0;
    mutateProduction(inquiryId, (item) => {
      item.crew = (item.crew ?? []).filter((id) => id !== profileId);
      item.tasks = item.tasks.map((task) => {
        if (!task.people.includes(profileId)) return task;
        untasked += 1;
        return { ...task, people: task.people.filter((id) => id !== profileId) };
      });
    });
    return { untasked };
  },
  removeStem(stemId: string) {
    change((state) => {
      for (const item of Object.values(state.productions)) {
        item.stems = item.stems.filter((row) => row.id !== stemId);
      }
    });
  },
  saveTask(input: {
    inquiry_id: string;
    id?: string;
    title: string;
    starts_at: string | null;
    category: string;
    location: string;
    people: string[];
  }) {
    const state = read();
    const before = input.id
      ? (state.productions[input.inquiry_id]?.tasks.find((task) => task.id === input.id)?.people ??
        [])
      : [];
    const inactive = input.people.filter(
      (person) =>
        !before.includes(person) && !state.members.find((member) => member.id === person)?.active,
    );
    if (inactive.length) {
      throw new Error("only active members can be assigned. activate them in the gang.");
    }
    const taskId = input.id ?? uuid();
    mutateProduction(input.inquiry_id, (item) => {
      const row: ProductionTaskView = {
        id: taskId,
        inquiry_id: input.inquiry_id,
        title: input.title,
        starts_at: input.starts_at,
        category: input.category,
        location: input.location,
        status: "open",
        done_at: null,
        done_by: null,
        sort: item.tasks.length,
        created_at: now(),
        updated_at: now(),
        people: input.people,
      };
      item.tasks = input.id
        ? item.tasks.map((task) =>
            task.id === input.id
              ? {
                  ...task,
                  ...row,
                  status: task.status,
                  done_at: task.done_at,
                  done_by: task.done_by,
                  sort: task.sort,
                }
              : task,
          )
        : [...item.tasks, row];
      item.crew = [...new Set([...(item.crew ?? []), ...input.people])];
    });
    // once it's shared, someone who's joined hears about a new task right away; anyone else waits
    const members = read().members;
    const news: MemberNoticeRow[] = [];
    mutateProduction(input.inquiry_id, (item) => {
      const newly = input.people.filter((person) => !before.includes(person));
      const hearNow = item.production.shared_at
        ? newly.filter((person) => {
            const member = members.find((row) => row.id === person);
            return member && !member.standing && person !== PREVIEW_ADMIN_ID;
          })
        : [];
      for (const person of hearNow) {
        news.push(
          newsFor(item, person, `a new task for ${item.production.project_name}`, input.title),
        );
      }
      markPending(
        item,
        (input.id ? [...input.people, ...before] : input.people).filter(
          (person) => !hearNow.includes(person),
        ),
      );
    });
    if (news.length) change((next) => next.notices.unshift(...news));
    return { id: taskId, notified: 0 };
  },
  removeTask(taskId: string) {
    change((state) => {
      for (const item of Object.values(state.productions)) {
        const gone = item.tasks.find((task) => task.id === taskId);
        if (!gone) continue;
        item.tasks = item.tasks.filter((task) => task.id !== taskId);
        markPending(item, gone.people);
      }
    });
  },
  setTaskDone(taskId: string, done: boolean) {
    const viewer = previewViewer();
    const state = read();
    const found = findByTask(state, taskId);
    const task = found?.tasks.find((row) => row.id === taskId);
    if (!found || !task) throw new Error("that task isn't here anymore.");
    if (viewer.role !== "admin") {
      if (!task.people.includes(viewer.id))
        throw new Error("only the people on a task can check it off.");
      if (!memberCanOpen(viewer.id, found.production.inquiry_id))
        throw new Error("this production has wrapped.");
    }
    change((next) => {
      const item = next.productions[found.production.inquiry_id];
      if (!item) return;
      item.tasks = item.tasks.map((row) =>
        row.id === taskId
          ? {
              ...row,
              status: done ? "done" : "open",
              done_at: done ? now() : null,
              done_by: done ? viewer.id : null,
            }
          : row,
      );
    });
  },
  addFile(inquiryId: string, file: File, kind: "logistics" | "vision") {
    mutateProduction(inquiryId, (item) => {
      item.files.push({
        id: uuid(),
        name: file.name,
        kind,
        // the file itself stays in this tab; after a reload the row opens a sample
        href: URL.createObjectURL(file),
        file_type: file.type || null,
        created_at: now(),
      });
    });
  },
  removeFile(fileId: string) {
    change((state) => {
      for (const item of Object.values(state.productions)) {
        item.files = item.files.filter((file) => file.id !== fileId);
      }
    });
  },
  all() {
    // every booked job has a production, made the first time the list is opened
    const booked = [
      ...getDevPreviewPipeline().filter((row) => row.status === "booked" && !row.archived),
      // and the ones added by hand
      ...Object.values(read().manual ?? {}).map((record) => ({
        ...record.inquiry,
        client: record.client,
      })),
    ];
    for (const row of booked) {
      try {
        ensure(row.id);
      } catch {
        // not booked after all
      }
    }
    const state = read();
    return {
      productions: booked
        .flatMap((row) => {
          const item = state.productions[row.id];
          if (!item) return [];
          const holds = inquiryHoldDates(row);
          const first = firstProductionDay(item.days, holds);
          const last = lastProductionDay(item.days, holds);
          const status = productionPhase(productionSchedule(item.days, holds));
          return [
            {
              inquiry_id: row.id,
              title: productionTitle(item.production.project_name),
              project_name: item.production.project_name,
              path: `/production/${item.production.slug}`,
              status,
              first,
              last,
              venue: row.venue_text?.split(",")[0]?.trim() ?? "",
              address: row.venue_text?.trim() ?? "",
              client: row.client?.name ?? "",
              open_tasks: item.tasks.filter((task) => task.status === "open").length,
              tasks: item.tasks.length,
              crew: (item.crew ?? []).length,
              people: state.members
                .filter((member) => (item.crew ?? []).includes(member.id))
                .map((member) => firstName(member.full_name)),
              team_open: teamCanOpen(status),
            },
          ];
        })
        .sort((a, b) => (a.first ?? "9").localeCompare(b.first ?? "9")),
    };
  },
  saveShift(input: {
    inquiry_id: string;
    id?: string;
    profile_id: string;
    day: string;
    starts: string;
    ends: string;
    role: string;
    location: string;
  }) {
    const member = read().members.find((item) => item.id === input.profile_id);
    if (!member?.active) {
      throw new Error("only active members can be scheduled. activate them in the gang.");
    }
    const shiftId = input.id ?? uuid();
    let fresh = false;
    mutateProduction(input.inquiry_id, (item) => {
      const row: ProductionShiftRow = {
        id: shiftId,
        inquiry_id: input.inquiry_id,
        profile_id: input.profile_id,
        day: input.day,
        starts: input.starts,
        ends: input.ends,
        role: input.role,
        location: input.location,
        notified_at: null,
        created_at: now(),
      };
      item.shifts = input.id
        ? (item.shifts ?? []).map((shift) => (shift.id === input.id ? row : shift))
        : [...(item.shifts ?? []), row];
      item.crew = item.crew ?? [];
      if (!item.crew.includes(input.profile_id)) item.crew.push(input.profile_id);
      fresh = true;
    });
    // they hear when the studio shares the production
    if (fresh) mutateProduction(input.inquiry_id, (item) => markPending(item, [input.profile_id]));
    return { id: shiftId };
  },
  removeShift(shiftId: string) {
    change((state) => {
      for (const item of Object.values(state.productions)) {
        const gone = (item.shifts ?? []).find((shift) => shift.id === shiftId);
        if (!gone) continue;
        item.shifts = (item.shifts ?? []).filter((shift) => shift.id !== shiftId);
        markPending(item, [gone.profile_id]);
      }
    });
  },
  /** share the production: everyone with news is sent it at once, and anyone added is invited */
  share(inquiryId: string) {
    let letters = 0;
    let invited = 0;
    change((state) => {
      const item = state.productions[inquiryId];
      if (!item) return;
      const { production } = item;
      for (const id of item.pending ?? []) {
        const member = state.members.find((person) => person.id === id);
        if (!member?.active) continue;
        const told = (item.told ?? []).includes(id);
        const shifts = (item.shifts ?? []).filter((shift) => shift.profile_id === id);
        const tasks = item.tasks.filter((task) => task.people.includes(id));
        letters += 1;
        if (member.standing) {
          member.standing = "invited";
          member.invited_at = now();
          invited += 1;
        } else {
          const hours = shifts.reduce(
            (sum, shift) => sum + shiftHours(shift.starts, shift.ends),
            0,
          );
          state.notices.unshift({
            id: uuid(),
            profile_id: id,
            kind: shifts.length || tasks.length ? "tasks_assigned" : "added_to_production",
            inquiry_id: inquiryId,
            title: told
              ? PRODUCTION_CHANGED
              : shifts.length
                ? `you're on for ${production.project_name}: ${hoursLabel(hours)}`
                : assignmentHeadline(tasks.length, production.project_name),
            body: told
              ? production.project_name
              : [
                  ...shifts.map(
                    (shift) =>
                      `${productionDayLabel(shift.day)} ${shiftSpan(shift.starts, shift.ends)}`,
                  ),
                  ...tasks.map((task) => task.title),
                ].join(" · ") || "open it for the event, the vision, and the order.",
            href: `/production/${production.slug}`,
            read_at: null,
            created_at: now(),
          });
        }
        item.told = [...new Set([...(item.told ?? []), id])];
        item.shifts = (item.shifts ?? []).map((shift) =>
          shift.profile_id === id ? { ...shift, notified_at: now() } : shift,
        );
      }
      item.pending = [];
      item.production = { ...production, shared_at: now() };
    });
    return { letters, invited, shared_at: now() };
  },
  /** add someone to the team without inviting them: they can be scheduled, and hear at a share */
  add(email: string, name: string, role: AppRole) {
    const state = read();
    if (state.members.some((member) => member.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("that email is already on the team.");
    }
    const id = uuid();
    change((next) => {
      next.members.push({
        id,
        full_name: name,
        email: email.toLowerCase(),
        role,
        active: true,
        created_at: now(),
        last_seen_at: null,
        standing: "added",
        invited_at: null,
      });
    });
    return { id };
  },
  /** clients to link a new production to: the sample book's, and any added here */
  clients() {
    const seen = new Map<
      string,
      { id: string; name: string; organization: string | null; email: string }
    >();
    for (const row of getDevPreviewPipeline()) {
      const client = row.client;
      if (client && !seen.has(client.id)) {
        seen.set(client.id, {
          id: client.id,
          name: client.name,
          organization: client.organization ?? null,
          email: client.email,
        });
      }
    }
    for (const record of Object.values(read().manual ?? {})) {
      seen.set(record.client.id, { ...record.client });
    }
    return { clients: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  },
  /** a production added by hand, as the server makes it */
  createManual(input: {
    project_name: string;
    event_type: EventType;
    client_id?: string;
    new_client?: { name: string; email: string };
    event_date: string | null;
    hours?: string;
    has_team: boolean;
  }) {
    const known = this.clients().clients.find((client) => client.id === input.client_id);
    const client = known
      ? {
          id: known.id,
          name: known.name,
          email: known.email,
          organization: null,
          type: "individual" as const,
        }
      : {
          id: uuid(),
          name: input.new_client?.name ?? "new client",
          email: input.new_client?.email ?? "",
          organization: null,
          type: "individual" as const,
        };
    const inquiryId = uuid();
    change((state) => {
      state.manual = {
        ...(state.manual ?? {}),
        [inquiryId]: {
          inquiry: {
            id: inquiryId,
            status: "booked",
            archived: false,
            event_type: input.event_type,
            event_name: input.project_name,
            event_date: input.event_date,
            event_date_tbd: !input.event_date,
            message: null,
            venue_text: null,
            venue_id: null,
            client_id: client.id,
          },
          client,
        },
      };
    });
    const made = ensure(inquiryId);
    if (input.event_date) {
      mutateProduction(inquiryId, (item) => {
        item.days = [
          ...item.days,
          {
            id: uuid(),
            inquiry_id: inquiryId,
            day: input.event_date!,
            hours: input.hours ?? "",
            created_at: now(),
          },
        ];
      });
    }
    if (!input.has_team) {
      mutateProduction(inquiryId, (item) => {
        item.production = { ...item.production, has_team: false };
      });
    }
    return { slug: made.production.slug, inquiry_id: inquiryId };
  },
  /** agree to how we flow, as the one signed in */
  agreeToFlow(version: string) {
    const viewer = previewViewer();
    const at = now();
    change((state) => {
      state.members = state.members.map((member) =>
        member.id === viewer.id ? { ...member, flow_version: version, flow_agreed_at: at } : member,
      );
    });
    return { version, agreed_at: at };
  },
  /** local only: forget how we flow for the one signed in, so the first visit can be walked again */
  forgetFlow() {
    const viewer = previewViewer();
    change((state) => {
      state.members = state.members.map((member) =>
        member.id === viewer.id
          ? { ...member, flow_version: null, flow_agreed_at: null, tour_seen_at: null }
          : member,
      );
    });
    return { id: viewer.id };
  },
  /** the tour of today is done for whoever's signed in, as the server keeps it */
  finishTour() {
    const viewer = previewViewer();
    change((state) => {
      state.members = state.members.map((member) =>
        member.id === viewer.id ? { ...member, tour_seen_at: now() } : member,
      );
    });
  },
  /** change someone on the team, as the server does */
  updateMember(input: {
    id: string;
    name: string;
    email?: string;
    role: AppRole;
    access?: string[];
  }) {
    const state = read();
    const member = state.members.find((item) => item.id === input.id);
    if (!member) throw new Error("they're not on the team anymore.");
    const viewer = previewViewer();
    const owner = viewer.id === PREVIEW_ADMIN_ID || Boolean(viewer.is_owner);
    const memberOwner = member.id === PREVIEW_ADMIN_ID || Boolean(member.is_owner);
    if (memberOwner && member.id !== viewer.id) throw new Error("only sukii can change sukii.");
    if (member.id === viewer.id && input.role !== member.role) {
      throw new Error("you can't change your own access.");
    }
    if (!owner && input.role !== member.role) {
      throw new Error("only sukii can change someone's role.");
    }
    if (!owner && input.access) throw new Error("only sukii can change what someone can open.");
    const email = input.email?.toLowerCase();
    if (email && email !== member.email.toLowerCase()) {
      if (member.standing !== "added") {
        throw new Error("their email can only change before they're invited.");
      }
      if (state.members.some((item) => item.email.toLowerCase() === email)) {
        throw new Error("that email is already on the team.");
      }
    }
    change((next) => {
      next.members = next.members.map((item) =>
        item.id === input.id
          ? {
              ...item,
              full_name: input.name,
              role: input.role,
              ...(email ? { email } : {}),
              ...(input.access && !memberOwner ? { access: cleanAccess(input.access) } : {}),
            }
          : item,
      );
    });
    return { id: input.id };
  },
  /** what someone is paid on this production */
  setRate(inquiryId: string, profileId: string, rate: MemberRate | null) {
    mutateProduction(inquiryId, (item) => {
      item.rates = { ...(item.rates ?? {}) };
      if (rate == null) delete item.rates[profileId];
      else item.rates[profileId] = rate;
    });
  },
  mine() {
    const viewer = previewViewer();
    const state = read();
    return {
      // their own rates, and only theirs: one for each production they're on
      rates: Object.fromEntries(
        Object.values(state.productions).flatMap((item) =>
          item.rates?.[viewer.id] ? [[item.production.inquiry_id, item.rates[viewer.id]!]] : [],
        ),
      ) as Record<string, MemberRate>,
      productions: Object.values(state.productions)
        .filter((item) => Boolean(item.production.shared_at))
        .filter(
          (item) =>
            (item.crew ?? []).includes(viewer.id) ||
            (item.shifts ?? []).some((shift) => shift.profile_id === viewer.id) ||
            item.tasks.some((task) => task.people.includes(viewer.id)),
        )
        .map((item) => {
          const { inquiry } = inquiryFacts(item.production.inquiry_id);
          const holds = inquiryHoldDates(inquiry);
          const first = firstProductionDay(item.days, holds);
          const last = lastProductionDay(item.days, holds);
          const status = productionPhase(productionSchedule(item.days, holds));
          return {
            inquiry_id: item.production.inquiry_id,
            title: productionTitle(item.production.project_name),
            project_name: item.production.project_name,
            path: `/production/${item.production.slug}`,
            status,
            first,
            last,
            venue: inquiry.venue_text?.split(",")[0]?.trim() ?? "",
            address: inquiry.venue_text?.trim() ?? "",
            open: teamCanOpen(status),
            days: item.days.map((row) => row.day).sort(),
            people: (item.crew ?? []).flatMap((id) => {
              const member = state.members.find((person) => person.id === id);
              return member ? [member.full_name.split(/\s+/)[0]!] : [];
            }),
            shifts: (item.shifts ?? [])
              .filter((shift) => shift.profile_id === viewer.id)
              .sort((a, b) => `${a.day}${a.starts}`.localeCompare(`${b.day}${b.starts}`)),
            tasks: item.tasks
              .filter((task) => task.people.includes(viewer.id))
              .sort((a, b) => (a.starts_at ?? "9").localeCompare(b.starts_at ?? "9")),
          };
        })
        .filter((item) => item.open)
        .sort((a, b) => (a.first ?? "9").localeCompare(b.first ?? "9")),
    };
  },
  notices() {
    const viewer = previewViewer();
    return { notices: read().notices.filter((notice) => notice.profile_id === viewer.id) };
  },
  readNotices(ids: string[]) {
    change((state) => {
      state.notices = state.notices.map((notice) =>
        ids.includes(notice.id) && !notice.read_at ? { ...notice, read_at: now() } : notice,
      );
    });
  },
  team() {
    const state = read();
    const viewer = previewViewer();
    const asViewer = {
      role: viewer.role,
      is_owner: viewer.id === PREVIEW_ADMIN_ID || viewer.is_owner,
      access: viewer.access,
    };
    const canPay = hasAccess(asViewer, "pay");
    return {
      me: viewer.id,
      owner: Boolean(asViewer.is_owner),
      canPay,
      members: state.members
        .filter((member) => !member.standing)
        .map((member) => ({
          id: member.id,
          full_name: member.full_name as string | null,
          added_name: null as string | null,
          invited_at: null as string | null,
          email: member.email,
          role: member.role,
          active: member.active,
          created_at: member.created_at,
          last_seen_at: member.last_seen_at,
          is_owner: member.id === PREVIEW_ADMIN_ID || Boolean(member.is_owner),
          access: member.access ?? [...DEFAULT_ADMIN_ACCESS],
          events: this.eventsFor(member.id),
        })),
      // added and not invited, or invited and not joined
      invites: [
        ...state.members
          .filter((member) => member.standing && member.active)
          .map((member) => ({
            id: member.id,
            email: member.email,
            name: member.full_name as string | null,
            role: member.role,
            expires_at: null as string | null,
            accepted_at: null,
            created_at: member.created_at,
            invited_at: member.invited_at ?? null,
            on: this.scheduledOn(member.id),
          })),
        ...state.invites.map((invite) => ({
          ...invite,
          name: null as string | null,
          invited_at: invite.created_at as string | null,
          on: [] as string[],
        })),
      ],
    };
  },
  /** the productions someone is on, shared or not, for the directory */
  scheduledOn(memberId: string) {
    return Object.values(read().productions)
      .filter(
        (item) =>
          (item.crew ?? []).includes(memberId) ||
          (item.shifts ?? []).some((shift) => shift.profile_id === memberId),
      )
      .map((item) => item.production.project_name);
  },
  eventsFor(memberId: string) {
    return Object.values(read().productions)
      .filter((item) => memberCanOpen(memberId, item.production.inquiry_id))
      .map((item) => ({
        project_name: item.production.project_name,
        path: `/production/${item.production.slug}`,
        first: firstProductionDay(
          item.days,
          inquiryHoldDates(inquiryFacts(item.production.inquiry_id).inquiry),
        ),
      }));
  },
  setActive(memberId: string, active: boolean) {
    if (memberId === previewViewer().id && !active)
      throw new Error("You cannot deactivate your own account.");
    change((state) => {
      state.members = state.members.map((member) =>
        member.id === memberId ? { ...member, active } : member,
      );
    });
  },
  invite(email: string, role: AppRole) {
    const state = read();
    const added = state.members.find(
      (member) => member.email.toLowerCase() === email.toLowerCase(),
    );
    // someone added and not joined is invited (or sent it again) right away
    if (added?.standing) {
      change((next) => {
        next.members = next.members.map((member) =>
          member.id === added.id
            ? { ...member, standing: "invited" as const, invited_at: now(), role }
            : member,
        );
      });
      return;
    }
    if (added) {
      throw new Error("That email already belongs to a studio member.");
    }
    change((next) => {
      next.invites = [
        {
          id: uuid(),
          email: email.toLowerCase(),
          role,
          expires_at: day(7),
          accepted_at: null,
          created_at: now(),
        },
        ...next.invites.filter((invite) => invite.email !== email.toLowerCase()),
      ];
    });
  },
  cancelInvite(inviteId: string) {
    change((state) => {
      state.invites = state.invites.filter((invite) => invite.id !== inviteId);
      // someone added and never joined comes off the team and every production they were on
      if (state.members.some((member) => member.id === inviteId && member.standing)) {
        state.members = state.members.filter((member) => member.id !== inviteId);
        for (const item of Object.values(state.productions)) {
          item.crew = (item.crew ?? []).filter((id) => id !== inviteId);
          item.shifts = (item.shifts ?? []).filter((shift) => shift.profile_id !== inviteId);
          item.tasks = item.tasks.map((task) => ({
            ...task,
            people: task.people.filter((id) => id !== inviteId),
          }));
          item.pending = (item.pending ?? []).filter((id) => id !== inviteId);
        }
      }
    });
  },
};

/**
 * Sign the preview in as someone else: "?as=cara" for a sample member, "?as=admin" for the studio.
 * Local only, for seeing what a member sees.
 */
export function applyPreviewAs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return;
  const wanted = value.trim().toLowerCase();
  if (wanted === "admin" || wanted === "sukii") {
    setPreviewViewer(null);
    return;
  }
  const member = read().members.find(
    (item) => item.full_name.toLowerCase().split(" ")[0] === wanted || item.id === value,
  );
  if (member) setPreviewViewer(member.id);
}

/** the preview's signed-in person, shaped like a real session */
export function previewSession(base: { user: User; profile: ProfileRow }) {
  const viewer = previewViewer();
  if (viewer.id === PREVIEW_ADMIN_ID) return base;
  return {
    user: {
      ...base.user,
      id: viewer.id,
      email: viewer.email,
      user_metadata: { full_name: viewer.full_name },
    },
    profile: {
      ...base.profile,
      id: viewer.id,
      full_name: viewer.full_name,
      email: viewer.email,
      role: viewer.role,
      active: viewer.active,
      is_owner: Boolean(viewer.is_owner),
      access: viewer.access ?? [...DEFAULT_ADMIN_ACCESS],
      flow_version: viewer.flow_version ?? null,
      flow_agreed_at: viewer.flow_agreed_at ?? null,
      tour_seen_at: viewer.tour_seen_at ?? null,
    },
  };
}
