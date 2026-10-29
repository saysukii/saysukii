import type { LibraryData } from "@/lib/os/library.functions";
import type {
  ArrangementRow,
  ClientRow,
  InquiryMessageRow,
  InquiryRow,
  InquiryStatus,
  ProfileRow,
  ProposalLineItemRow,
  ProposalRow,
  RecipeRow,
  RecipeStemRow,
  StemRow,
  TaskRow,
  VendorRow,
  VenueRow,
} from "@/integrations/supabase/types";
import { assembleStudioToday } from "@/lib/os/studio-today";
import { readPreviewArrivals } from "@/lib/preview-arrivals";
import { clientSlugs, inquirySlugs } from "@/lib/os/inquiry-desk";
import { isBookInquiry } from "@/lib/os/inquiry-detection";
import { desiredInquiryAutoTask } from "@/lib/os/inquiry-tasks";
import { buildInquirySummaryFacts, resolveInquirySummaryText } from "@/lib/os/inquiry-summary";

const now = Date.now();
const iso = (days: number) => new Date(now + days * 86_400_000).toISOString();
const dateOnly = (days: number) => iso(days).slice(0, 10);

export const PREVIEW_IDS = {
  clientAmelia: "10000000-0000-4000-8000-000000000011",
  clientHarbor: "10000000-0000-4000-8000-000000000012",
  clientLumen: "10000000-0000-4000-8000-000000000013",
  clientMaya: "10000000-0000-4000-8000-000000000014",
  clientElena: "10000000-0000-4000-8000-000000000015",
  clientCamila: "10000000-0000-4000-8000-000000000016",
  clientNoor: "10000000-0000-4000-8000-000000000017",
  clientJules: "10000000-0000-4000-8000-000000000018",
  inquiryWedding: "20000000-0000-4000-8000-000000000021",
  inquiryBrand: "20000000-0000-4000-8000-000000000022",
  inquiryCorporate: "20000000-0000-4000-8000-000000000023",
  inquiryFresh: "20000000-0000-4000-8000-000000000027",
  inquiryCandidate: "20000000-0000-4000-8000-000000000028",
  inquiryReviewMaya: "20000000-0000-4000-8000-00000000002a",
  inquiryReviewLumen: "20000000-0000-4000-8000-00000000002b",
  inquiryReviewAmelia: "20000000-0000-4000-8000-00000000002c",
  inquiryReviewHarbor: "20000000-0000-4000-8000-00000000002d",
  inquiryReviewCamila: "20000000-0000-4000-8000-00000000002e",
  inquiryReviewNoor: "20000000-0000-4000-8000-00000000002f",
  inquiryReviewJules: "20000000-0000-4000-8000-000000000030",
  inquiryArrived: "20000000-0000-4000-8000-000000000029",
  proposalDraft: "40000000-0000-4000-8000-000000000041",
  proposalSent: "40000000-0000-4000-8000-000000000042",
  proposalAccepted: "40000000-0000-4000-8000-000000000043",
  projectEditorial: "30000000-0000-4000-8000-000000000031",
  projectWedding: "30000000-0000-4000-8000-000000000032",
  projectPopup: "30000000-0000-4000-8000-000000000033",
  inquiryProposalOut: "20000000-0000-4000-8000-000000000024",
  taskEditorialLoadIn: "b0000000-0000-4000-8000-0000000000b6",
  taskOasisOrder: "b0000000-0000-4000-8000-0000000000b7",
  taskWeddingDone: "b0000000-0000-4000-8000-0000000000b8",
  venueVizcaya: "50000000-0000-4000-8000-000000000051",
  venueHarbor: "50000000-0000-4000-8000-000000000052",
  vendorMiami: "60000000-0000-4000-8000-000000000061",
  vendorWholesale: "60000000-0000-4000-8000-000000000062",
  stemGardenRose: "70000000-0000-4000-8000-000000000071",
  stemOrchid: "70000000-0000-4000-8000-000000000072",
  stemRuscus: "70000000-0000-4000-8000-000000000073",
  arrangementArch: "80000000-0000-4000-8000-000000000081",
  arrangementCenterpiece: "80000000-0000-4000-8000-000000000082",
  recipeArch: "90000000-0000-4000-8000-000000000091",
  orderWedding: "a0000000-0000-4000-8000-0000000000a1",
} as const;

const clients: Record<string, ClientRow> = {
  [PREVIEW_IDS.clientAmelia]: {
    id: PREVIEW_IDS.clientAmelia,
    name: "Amelia Chen",
    email: "amelia@example.com",
    phone: "(305) 555-0112",
    organization: null,
    type: "individual",
    source: "Instagram",
    notes: "Prefers blush and ivory palette.",
    archived: false,
    created_at: iso(-12),
    updated_at: iso(-12),
  },
  [PREVIEW_IDS.clientHarbor]: {
    id: PREVIEW_IDS.clientHarbor,
    name: "Harbor House Events",
    email: "events@harborhouse.com",
    phone: "(786) 555-0198",
    organization: "Harbor House",
    type: "venue_partner",
    source: "Referral",
    notes: null,
    archived: false,
    created_at: iso(-6),
    updated_at: iso(-6),
  },
  [PREVIEW_IDS.clientLumen]: {
    id: PREVIEW_IDS.clientLumen,
    name: "Lumen Studio",
    email: "hello@lumenstudio.co",
    phone: null,
    organization: "Lumen Studio",
    type: "brand",
    source: "Website",
    notes: null,
    archived: false,
    created_at: iso(-2),
    updated_at: iso(-2),
  },
  [PREVIEW_IDS.clientMaya]: {
    id: PREVIEW_IDS.clientMaya,
    name: "Maya Santos",
    email: "maya@example.com",
    phone: "(305) 555-0176",
    organization: null,
    type: "individual",
    source: "instagram",
    notes: null,
    archived: false,
    created_at: iso(0),
    updated_at: iso(0),
  },
  [PREVIEW_IDS.clientElena]: {
    id: PREVIEW_IDS.clientElena,
    name: "Elena Ruiz",
    email: "elena@example.com",
    phone: null,
    organization: null,
    type: "individual",
    source: "gmail",
    notes: null,
    archived: false,
    created_at: iso(-2),
    updated_at: iso(-2),
  },
  [PREVIEW_IDS.clientCamila]: {
    id: PREVIEW_IDS.clientCamila,
    name: "Camila Reyes",
    email: "camila.reyes@gmail.com",
    phone: "(954) 555-0194",
    organization: null,
    type: "individual",
    source: "instagram",
    notes: null,
    archived: false,
    created_at: iso(0),
    updated_at: iso(0),
  },
  [PREVIEW_IDS.clientNoor]: {
    id: PREVIEW_IDS.clientNoor,
    name: "Noor Hale",
    email: "noor@example.com",
    phone: null,
    organization: null,
    type: "individual",
    source: "gmail",
    notes: null,
    archived: false,
    created_at: iso(-3),
    updated_at: iso(-3),
  },
  [PREVIEW_IDS.clientJules]: {
    id: PREVIEW_IDS.clientJules,
    name: "Jules Park",
    email: "jules@example.com",
    phone: null,
    organization: null,
    type: "brand",
    source: "gmail",
    notes: null,
    archived: false,
    created_at: iso(-4),
    updated_at: iso(-4),
  },
};

const venues: VenueRow[] = [
  {
    id: PREVIEW_IDS.venueVizcaya,
    name: "Vizcaya Museum & Gardens",
    address: "3251 S Miami Ave, Miami, FL 33129",
    contact_name: "Events desk",
    contact_email: "events@vizcaya.org",
    contact_phone: "(305) 250-9133",
    load_in_notes: "Service entrance on south side after 2 PM.",
    archived: false,
    created_at: iso(-90),
    updated_at: iso(-10),
  },
  {
    id: PREVIEW_IDS.venueHarbor,
    name: "Harbor House",
    address: "Key Biscayne, FL",
    contact_name: "Morgan Lee",
    contact_email: "morgan@harborhouse.com",
    contact_phone: "(786) 555-0100",
    load_in_notes: "Freight elevator to terrace level.",
    archived: false,
    created_at: iso(-60),
    updated_at: iso(-8),
  },
];

const vendors: VendorRow[] = [
  {
    id: PREVIEW_IDS.vendorMiami,
    name: "Miami Flower Market",
    type: "warehouse",
    contact_name: "Carlos",
    contact_email: "orders@miamiflower.example",
    contact_phone: "(305) 555-0200",
    ordering_method: "Text by 10 AM",
    archived: false,
    created_at: iso(-120),
    updated_at: iso(-5),
  },
  {
    id: PREVIEW_IDS.vendorWholesale,
    name: "South Florida Wholesale",
    type: "wholesaler",
    contact_name: "Team desk",
    contact_email: "buyers@sfwholesale.example",
    contact_phone: "(954) 555-0300",
    ordering_method: "Online portal",
    archived: false,
    created_at: iso(-120),
    updated_at: iso(-5),
  },
];

const stems: StemRow[] = [
  {
    id: PREVIEW_IDS.stemGardenRose,
    common_name: "Garden rose",
    variety: "Miyabi",
    color: "Blush",
    unit: "stem",
    vendor_id: PREVIEW_IDS.vendorMiami,
    last_known_cost_cents: 650,
    active: true,
    created_at: iso(-40),
    updated_at: iso(-3),
  },
  {
    id: PREVIEW_IDS.stemOrchid,
    common_name: "Phalaenopsis orchid",
    variety: null,
    color: "White",
    unit: "stem",
    vendor_id: PREVIEW_IDS.vendorWholesale,
    last_known_cost_cents: 1800,
    active: true,
    created_at: iso(-40),
    updated_at: iso(-3),
  },
  {
    id: PREVIEW_IDS.stemRuscus,
    common_name: "Italian ruscus",
    variety: null,
    color: "Green",
    unit: "bunch",
    vendor_id: PREVIEW_IDS.vendorMiami,
    last_known_cost_cents: 2400,
    active: true,
    created_at: iso(-40),
    updated_at: iso(-3),
  },
];

const arrangements: ArrangementRow[] = [
  {
    id: PREVIEW_IDS.arrangementArch,
    name: "Ceremony arch",
    type: "installation",
    description: "Structural arch with layered garden roses and trailing ruscus.",
    price_cents: 850000,
    image_path: null,
    default_recipe_id: PREVIEW_IDS.recipeArch,
    active: true,
    created_at: iso(-30),
    updated_at: iso(-4),
  },
  {
    id: PREVIEW_IDS.arrangementCenterpiece,
    name: "Low reception centerpiece",
    type: "reception",
    description: "Wide low bowl with garden roses and orchid accents.",
    price_cents: 18500,
    image_path: null,
    default_recipe_id: null,
    active: true,
    created_at: iso(-30),
    updated_at: iso(-4),
  },
];

const recipeStems: RecipeStemRow[] = [
  {
    id: "91000000-0000-4000-8000-000000000091",
    recipe_id: PREVIEW_IDS.recipeArch,
    stem_id: PREVIEW_IDS.stemGardenRose,
    color: "Blush",
    quantity: 120,
    created_at: iso(-20),
  },
  {
    id: "91000000-0000-4000-8000-000000000092",
    recipe_id: PREVIEW_IDS.recipeArch,
    stem_id: PREVIEW_IDS.stemRuscus,
    color: "Green",
    quantity: 18,
    created_at: iso(-20),
  },
];

const recipes: RecipeRow[] = [
  {
    id: PREVIEW_IDS.recipeArch,
    arrangement_id: PREVIEW_IDS.arrangementArch,
    project_id: null,
    name: "Default ceremony arch",
    is_default: true,
    created_at: iso(-20),
    updated_at: iso(-4),
  },
];

function inquiry(
  id: string,
  clientId: string,
  status: InquiryStatus,
  overrides: Partial<InquiryRow> = {},
): InquiryRow {
  return {
    id,
    client_id: clientId,
    event_date: dateOnly(120),
    event_date_tbd: false,
    event_type: "wedding",
    venue_id: null,
    venue_text: "Vizcaya Museum & Gardens, Miami, FL",
    guest_count: 140,
    budget_range: "$20,000–$40,000",
    source: "Instagram",
    message: "Soft garden romance with orchids and trailing greenery.",
    status,
    closed_reason: status === "closed" ? "Timeline changed" : null,
    received_at: iso(status === "new" ? -5 : -14),
    contacted_at: ["contacted", "in_conversation", "proposal_sent", "booked", "closed"].includes(
      status,
    )
      ? iso(-10)
      : null,
    proposal_sent_at: ["proposal_sent", "booked"].includes(status) ? iso(-6) : null,
    booked_at: status === "booked" ? iso(-2) : null,
    closed_at: status === "closed" ? iso(-1) : null,
    archived: false,
    created_by: null,
    updated_at: iso(-1),
    origin: "form",
    detection_status: "na",
    detection_confidence: null,
    detection_reason: null,
    source_message_id: null,
    summary_text: null,
    summary_generated_at: null,
    ...overrides,
  };
}

const inquiries: InquiryRow[] = [
  inquiry(PREVIEW_IDS.inquiryWedding, PREVIEW_IDS.clientAmelia, "in_conversation", {
    received_at: iso(-5),
  }),
  inquiry(PREVIEW_IDS.inquiryBrand, PREVIEW_IDS.clientLumen, "new", {
    event_date: null,
    event_date_tbd: true,
    event_type: "brand_activation",
    venue_text: "Wynwood, Miami, FL",
    budget_range: "$10,000–$20,000",
    message: "Immersive floral moment for a product launch.",
    received_at: iso(-1),
  }),
  inquiry(PREVIEW_IDS.inquiryFresh, PREVIEW_IDS.clientMaya, "new", {
    event_date: "2026-10-01",
    event_type: "wedding",
    venue_text: "Seminole Hard Rock Hotel and Casino, 1 Seminole Way, Hollywood, FL",
    guest_count: null,
    budget_range: "$20,000+",
    source: "instagram",
    message: "Time: 7:00 pm\nwarm candlelight, garden roses, a long table that feels like dusk.",
    received_at: iso(0),
    updated_at: iso(0),
  }),
  inquiry(PREVIEW_IDS.inquiryCorporate, PREVIEW_IDS.clientHarbor, "in_conversation", {
    event_type: "corporate",
    venue_text: "Key Biscayne, FL",
    status: "in_conversation",
    received_at: iso(-8),
    message:
      "Corporate send for a spring editorial at the house. The arrival should feel like a garden room — orchard branches, pale citrus, and a long table that can hold conversation without shouting. Keep the palette quiet: oat, blush, a little sage. The team will walk the terrace at golden hour, then move inside for dinner. If the notes run long, they should still live on this card without stretching the desk.",
  }),
  inquiry(PREVIEW_IDS.inquiryProposalOut, PREVIEW_IDS.clientAmelia, "proposal_sent", {
    received_at: iso(-12),
  }),
  inquiry("20000000-0000-4000-8000-000000000025", PREVIEW_IDS.clientHarbor, "booked", {
    status: "booked",
    received_at: iso(-20),
  }),
  inquiry("20000000-0000-4000-8000-000000000026", PREVIEW_IDS.clientLumen, "closed", {
    status: "closed",
    closed_reason: "Budget shifted",
    received_at: iso(-30),
  }),
  inquiry(PREVIEW_IDS.inquiryArrived, PREVIEW_IDS.clientCamila, "new", {
    event_date: "2027-03-14",
    event_date_tbd: false,
    event_type: "wedding",
    venue_text: "The W Hotel, 401 N Fort Lauderdale Beach Blvd, Fort Lauderdale, FL",
    guest_count: null,
    budget_range: "$10,000 - $15,000",
    source: "instagram",
    message:
      "A garden ceremony at dusk. Garden roses, candlelight, and a long table that feels quiet rather than formal.",
    received_at: iso(0),
    updated_at: iso(0),
    contacted_at: null,
  }),
  inquiry(PREVIEW_IDS.inquiryCandidate, PREVIEW_IDS.clientElena, "new", {
    origin: "detected",
    detection_status: "candidate",
    detection_confidence: 0.86,
    detection_reason: "new wedding inquiry from gmail, no existing match",
    source: "gmail",
    event_type: "wedding",
    event_date: "2027-03-14",
    event_date_tbd: false,
    venue_text: "Pérez Art Museum Miami",
    budget_range: "$10,000–$20,000",
    message:
      "Hi Say Sukii — we're getting married at PAMM on March 14 and would love you for ceremony and reception. Garden, sculptural, a little wild. Budget around 10–20k.",
    received_at: iso(-2),
    source_message_id: "c0000000-0000-4000-8000-0000000000c1",
  }),
  inquiry(PREVIEW_IDS.inquiryReviewMaya, PREVIEW_IDS.clientMaya, "new", {
    origin: "detected",
    detection_status: "candidate",
    detection_confidence: 0.74,
    detection_reason: "ceremony flowers for a hotel wedding",
    source: "gmail",
    event_type: "wedding",
    venue_text: "Seminole Hard Rock Hotel",
    message: "Could you do ceremony flowers at the Hard Rock? Soft pinks, nothing too tall.",
    received_at: iso(-6),
  }),
  inquiry(PREVIEW_IDS.inquiryReviewLumen, PREVIEW_IDS.clientLumen, "new", {
    origin: "detected",
    detection_status: "candidate",
    detection_confidence: 0.81,
    detection_reason: "brand install for a wynwood pop-up",
    source: "gmail",
    event_type: "brand_activation",
    venue_text: "Wynwood",
    message: "We need a floral install for a two-day pop-up in Wynwood. Sculptural, mostly white.",
    received_at: iso(-5),
  }),
  inquiry(PREVIEW_IDS.inquiryReviewAmelia, PREVIEW_IDS.clientAmelia, "new", {
    origin: "detected",
    detection_status: "candidate",
    detection_confidence: 0.91,
    detection_reason: "reception flowers at vizcaya",
    source: "gmail",
    event_type: "wedding",
    venue_text: "Vizcaya Museum & Gardens",
    message: "Reception flowers at Vizcaya. Garden roses, low centerpieces, a quiet palette.",
    received_at: iso(-4),
  }),
  inquiry(PREVIEW_IDS.inquiryReviewHarbor, PREVIEW_IDS.clientHarbor, "new", {
    origin: "detected",
    detection_status: "candidate",
    detection_confidence: 0.68,
    detection_reason: "dinner arrangements on key biscayne",
    source: "gmail",
    event_type: "corporate",
    venue_text: "Key Biscayne",
    message: "Dinner for 40 on Key Biscayne. Arrangements for a long table, tropical but not loud.",
    received_at: iso(-3),
  }),
  inquiry(PREVIEW_IDS.inquiryReviewCamila, PREVIEW_IDS.clientCamila, "new", {
    origin: "detected",
    detection_status: "candidate",
    detection_confidence: 0.77,
    detection_reason: "garden ceremony at the w",
    source: "gmail",
    event_type: "wedding",
    venue_text: "The W Hotel",
    message: "A garden ceremony at the W. Candlelight, garden roses, and something a little wild.",
    received_at: iso(-2),
  }),
  inquiry(PREVIEW_IDS.inquiryReviewNoor, PREVIEW_IDS.clientNoor, "new", {
    origin: "detected",
    detection_status: "candidate",
    detection_confidence: 0.83,
    detection_reason: "standing weekly flowers",
    source: "gmail",
    event_type: "subscription",
    event_date_tbd: true,
    event_date: null,
    message: "I'd love weekly flowers for the house. Quiet colors, something I can live with.",
    received_at: iso(-1),
  }),
  inquiry(PREVIEW_IDS.inquiryReviewJules, PREVIEW_IDS.clientJules, "new", {
    origin: "detected",
    detection_status: "candidate",
    detection_confidence: 0.72,
    detection_reason: "brand dinner in the design district",
    source: "gmail",
    event_type: "brand_activation",
    venue_text: "Design District",
    message: "Brand dinner in the Design District next month. Flowers for the table and the entry.",
    received_at: iso(0),
  }),
];

const proposals: ProposalRow[] = [
  {
    id: PREVIEW_IDS.proposalDraft,
    number: "SS-2026-014",
    client_id: PREVIEW_IDS.clientAmelia,
    inquiry_id: PREVIEW_IDS.inquiryWedding,
    event_date: dateOnly(120),
    venue_id: PREVIEW_IDS.venueVizcaya,
    venue_text: "Vizcaya Museum & Gardens, Miami, FL",
    subtotal_cents: 2840000,
    tax_cents: 0,
    total_cents: 2840000,
    deposit_percent: 50,
    deposit_amount_cents: 1420000,
    vision_board_url: null,
    vision_image_paths: [],
    notes: "Includes ceremony arch, aisle markers, and reception centerpieces.",
    valid_until: dateOnly(45),
    status: "draft",
    access_token_hash: null,
    access_token_prefix: null,
    access_token: null,
    pdf_path: null,
    canva_design_id: null,
    export_pdf_ref: null,
    sent_at: null,
    shared_at: null,
    viewed_at: null,
    accepted_at: null,
    declined_at: null,
    declined_reason: null,
    created_by: "00000000-0000-4000-8000-000000000001",
    archived: false,
    created_at: iso(-3),
    updated_at: iso(-1),
  },
  {
    id: PREVIEW_IDS.proposalSent,
    number: "SS-2026-011",
    client_id: PREVIEW_IDS.clientHarbor,
    inquiry_id: PREVIEW_IDS.inquiryCorporate,
    event_date: dateOnly(9),
    venue_id: PREVIEW_IDS.venueHarbor,
    venue_text: "Key Biscayne, FL",
    subtotal_cents: 1260000,
    tax_cents: 0,
    total_cents: 1260000,
    deposit_percent: 50,
    deposit_amount_cents: 630000,
    vision_board_url: null,
    vision_image_paths: [],
    notes: null,
    valid_until: dateOnly(20),
    status: "sent",
    access_token_hash: "preview",
    access_token_prefix: "ss11",
    access_token: null,
    pdf_path: null,
    canva_design_id: null,
    export_pdf_ref: null,
    sent_at: iso(-2),
    shared_at: null,
    viewed_at: null,
    accepted_at: null,
    declined_at: null,
    declined_reason: null,
    created_by: "00000000-0000-4000-8000-000000000001",
    archived: false,
    created_at: iso(-10),
    updated_at: iso(-2),
  },
  {
    id: PREVIEW_IDS.proposalAccepted,
    number: "SS-2026-008",
    client_id: PREVIEW_IDS.clientAmelia,
    inquiry_id: PREVIEW_IDS.inquiryProposalOut,
    event_date: dateOnly(10),
    venue_id: null,
    venue_text: "Coral Gables, FL",
    subtotal_cents: 3420000,
    tax_cents: 0,
    total_cents: 3420000,
    deposit_percent: 50,
    deposit_amount_cents: 1710000,
    vision_board_url: null,
    vision_image_paths: [],
    notes: null,
    valid_until: null,
    status: "accepted",
    access_token_hash: "preview",
    access_token_prefix: "ss08",
    access_token: "preview_amelia8f3c1a9b2d4e6f708192a3b4c5d6e7",
    pdf_path: null,
    canva_design_id: null,
    export_pdf_ref: null,
    sent_at: iso(-14),
    shared_at: null,
    viewed_at: iso(-2),
    accepted_at: iso(-10),
    declined_at: null,
    declined_reason: null,
    created_by: "00000000-0000-4000-8000-000000000001",
    archived: false,
    created_at: iso(-18),
    updated_at: iso(-10),
  },
];

const lineItems: ProposalLineItemRow[] = [
  {
    id: "b1000000-0000-4000-8000-0000000000b1",
    proposal_id: PREVIEW_IDS.proposalDraft,
    arrangement_id: PREVIEW_IDS.arrangementArch,
    kind: "arrangement",
    label: "Ceremony arch",
    description: "Structural arch with layered garden roses and trailing ruscus.",
    quantity: 1,
    unit_price_cents: 850000,
    line_total_cents: 850000,
    snapshot: {},
    sort_order: 0,
    created_at: iso(-3),
  },
  {
    id: "b1000000-0000-4000-8000-0000000000b2",
    proposal_id: PREVIEW_IDS.proposalDraft,
    arrangement_id: PREVIEW_IDS.arrangementCenterpiece,
    kind: "arrangement",
    label: "Low reception centerpiece",
    description: "Wide low bowl with garden roses and orchid accents.",
    quantity: 18,
    unit_price_cents: 18500,
    line_total_cents: 333000,
    snapshot: {},
    sort_order: 1,
    created_at: iso(-3),
  },
];

const projects = [
  {
    id: PREVIEW_IDS.projectEditorial,
    client_id: PREVIEW_IDS.clientHarbor,
    proposal_id: PREVIEW_IDS.proposalSent,
    event_name: "Harbor House Spring Editorial",
    event_date: dateOnly(9),
    venue_id: PREVIEW_IDS.venueHarbor,
    venue_text: "Key Biscayne, FL",
    status: "pre_production" as const,
    notes: "Editorial shoot — minimal palette, early load-in.",
    google_event_id: null,
    archived: false,
    created_at: iso(-30),
    updated_at: iso(-4),
  },
  {
    id: PREVIEW_IDS.projectWedding,
    client_id: PREVIEW_IDS.clientAmelia,
    proposal_id: PREVIEW_IDS.proposalAccepted,
    event_name: "Chen Wedding Ceremony",
    event_date: dateOnly(10),
    venue_id: null,
    venue_text: "Coral Gables, FL",
    status: "production" as const,
    notes: null,
    google_event_id: null,
    archived: false,
    created_at: iso(-45),
    updated_at: iso(-2),
  },
  {
    id: PREVIEW_IDS.projectPopup,
    client_id: PREVIEW_IDS.clientLumen,
    proposal_id: PREVIEW_IDS.proposalAccepted,
    event_name: "Lumen Pop-Up Installation",
    event_date: dateOnly(22),
    venue_id: null,
    venue_text: "Design District, Miami, FL",
    status: "pre_production" as const,
    notes: "Freestanding floral moment for launch week.",
    google_event_id: null,
    archived: false,
    created_at: iso(-8),
    updated_at: iso(-1),
  },
];

const extraTasks: TaskRow[] = [
  {
    id: PREVIEW_IDS.taskEditorialLoadIn,
    title: "confirm load-in window",
    linked_type: "project",
    linked_id: PREVIEW_IDS.projectEditorial,
    source: "auto",
    trigger_stage: "booked",
    due_at: iso(2),
    created_at: iso(-4),
    status: "open",
  },
  {
    id: PREVIEW_IDS.taskOasisOrder,
    title: "order oasis and chicken wire",
    linked_type: "none",
    linked_id: null,
    source: "manual",
    trigger_stage: null,
    due_at: iso(4),
    created_at: iso(-2),
    status: "open",
  },
  {
    id: PREVIEW_IDS.taskWeddingDone,
    title: "the date is held",
    linked_type: "project",
    linked_id: PREVIEW_IDS.projectWedding,
    source: "auto",
    trigger_stage: "booked",
    due_at: iso(-2),
    created_at: iso(-20),
    status: "done",
  },
];

function previewAutoTaskId(inquiryId: string, kind: string) {
  const suffix = inquiryId.replaceAll("-", "").slice(-10);
  const code =
    kind === "reply" ? "01" : kind === "follow_up" ? "02" : kind === "write_proposal" ? "03" : "05";
  return `b0000000-0000-4000-8000-${suffix}${code}`;
}

const reviewDecisions = new Map<
  string,
  { detection_status: InquiryRow["detection_status"]; status: InquiryStatus }
>();
const archivedInquiryIds = new Set<string>();
const PREVIEW_STATUS_KEY = "say-sukii-preview-inquiry-status";

function storedPreviewStatuses(): Array<[string, InquiryStatus]> {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PREVIEW_STATUS_KEY) || "{}") as Record<
      string,
      InquiryStatus
    >;
    return Object.entries(parsed);
  } catch {
    return [];
  }
}

const previewStatuses = new Map<string, InquiryStatus>(storedPreviewStatuses());

export function previewSetInquiryStatus(id: string, status: InquiryStatus) {
  previewStatuses.set(id, status);
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    PREVIEW_STATUS_KEY,
    JSON.stringify(Object.fromEntries(previewStatuses)),
  );
}

export function previewArchiveInquiry(id: string) {
  archivedInquiryIds.add(id);
}

export function previewReviewDecision(id: string, decision: "approve" | "dismiss") {
  if (decision === "approve") {
    reviewDecisions.set(id, { detection_status: "confirmed", status: "new" });
    return;
  }
  reviewDecisions.set(id, { detection_status: "dismissed", status: "new" });
}

function withReview(inquiry: InquiryRow): InquiryRow {
  const patch = reviewDecisions.get(inquiry.id);
  const status = previewStatuses.get(inquiry.id);
  const next = patch ? { ...inquiry, ...patch } : inquiry;
  if (!status) return next;
  return {
    ...next,
    status,
    booked_at: status === "booked" ? (next.booked_at ?? new Date().toISOString()) : next.booked_at,
  };
}

const CANDIDATE_SOURCE = {
  subject: "wedding flowers at PAMM",
  body: "Hi Say Sukii — we're getting married at PAMM on March 14 and would love you for ceremony and reception. Garden, sculptural, a little wild. Budget around 10–20k.",
  from_addr: "elena@example.com",
};

const PREVIEW_REVIEW_MAIL: Record<string, { subject: string; body: string; from_addr: string }> = {
  [PREVIEW_IDS.inquiryCandidate]: CANDIDATE_SOURCE,
  [PREVIEW_IDS.inquiryReviewMaya]: {
    subject: "ceremony flowers for the hard rock",
    body: "Could you do ceremony flowers at the Hard Rock? Soft pinks, nothing too tall.",
    from_addr: "maya@example.com",
  },
  [PREVIEW_IDS.inquiryReviewLumen]: {
    subject: "wynwood pop-up install",
    body: "We need a floral install for a two-day pop-up in Wynwood. Sculptural, mostly white.",
    from_addr: "studio@lumen.example",
  },
  [PREVIEW_IDS.inquiryReviewAmelia]: {
    subject: "vizcaya reception flowers",
    body: "Reception flowers at Vizcaya. Garden roses, low centerpieces, a quiet palette.",
    from_addr: "amelia@example.com",
  },
  [PREVIEW_IDS.inquiryReviewHarbor]: {
    subject: "key biscayne dinner arrangements",
    body: "Dinner for 40 on Key Biscayne. Arrangements for a long table, tropical but not loud.",
    from_addr: "events@harbor.example",
  },
  [PREVIEW_IDS.inquiryReviewCamila]: {
    subject: "garden ceremony at the w",
    body: "A garden ceremony at the W. Candlelight, garden roses, and something a little wild.",
    from_addr: "camila.reyes@gmail.com",
  },
  [PREVIEW_IDS.inquiryReviewNoor]: {
    subject: "weekly flowers for the house",
    body: "I'd love weekly flowers for the house. Quiet colors, something I can live with.",
    from_addr: "noor@example.com",
  },
  [PREVIEW_IDS.inquiryReviewJules]: {
    subject: "brand dinner in the design district",
    body: "Brand dinner in the Design District next month. Flowers for the table and the entry.",
    from_addr: "jules@example.com",
  },
};

function previewReviewMail(id: string) {
  return PREVIEW_REVIEW_MAIL[id] ?? null;
}

function autoInquiryTasks(): TaskRow[] {
  return inquiries
    .map(withReview)
    .filter((inquiry) => !archivedInquiryIds.has(inquiry.id))
    .filter(isBookInquiry)
    .flatMap((inquiry) => {
      const draft = desiredInquiryAutoTask({
        inquiry,
        clientName: clients[inquiry.client_id]?.name ?? null,
        lastInboundAt: inquiry.received_at,
      });
      if (!draft) return [];
      return [
        {
          id: previewAutoTaskId(inquiry.id, draft.kind),
          title: draft.title,
          linked_type: draft.linked_type,
          linked_id: draft.linked_id,
          source: draft.source,
          trigger_stage: draft.trigger_stage,
          due_at: draft.due_at,
          created_at: inquiry.received_at,
          status: "open" as const,
        },
      ];
    });
}

function withClient<T extends { client_id: string }>(row: T) {
  return { ...row, client: clients[row.client_id] ?? null };
}

function hydratePreviewArrivals() {
  if (typeof window === "undefined") return;
  for (const arrival of readPreviewArrivals()) {
    if (inquiries.some((item) => item.id === arrival.id)) continue;
    const clientId = `preview-client-${arrival.id}`;
    clients[clientId] = {
      id: clientId,
      name: arrival.name,
      email: arrival.email,
      phone: arrival.phone || null,
      organization: null,
      type: "individual",
      source: "Website",
      notes: null,
      archived: false,
      created_at: arrival.receivedAt,
      updated_at: arrival.receivedAt,
    };
    inquiries.unshift(
      inquiry(arrival.id, clientId, "new", {
        event_date: arrival.eventDateTbd ? null : arrival.eventDate,
        event_date_tbd: arrival.eventDateTbd,
        event_type: arrival.eventType,
        venue_text: arrival.venue || null,
        guest_count: null,
        budget_range: arrival.budget || null,
        source: "Website",
        message: arrival.message || null,
        received_at: arrival.receivedAt,
        updated_at: arrival.receivedAt,
        contacted_at: null,
        proposal_sent_at: null,
        booked_at: null,
        closed_at: null,
        closed_reason: null,
      }),
    );
  }
}

function previewStudioWrote(id: string) {
  return (
    id === PREVIEW_IDS.inquiryFresh ||
    id === PREVIEW_IDS.inquiryWedding ||
    id === PREVIEW_IDS.inquiryArrived ||
    id === PREVIEW_IDS.inquiryProposalOut
  );
}

export function getDevPreviewPipeline() {
  hydratePreviewArrivals();
  const rows = inquiries
    .map(withReview)
    .filter((inquiry) => !archivedInquiryIds.has(inquiry.id))
    .filter((inquiry) => inquiry.detection_status !== "dismissed")
    .map((inquiry) => withClient(inquiry));
  const slugs = inquirySlugs(rows);
  return rows.map((inquiry) => ({
    ...inquiry,
    studio_wrote: previewStudioWrote(inquiry.id),
    slug: slugs.get(inquiry.id) ?? inquiry.id,
    source_peek: previewReviewMail(inquiry.id),
  }));
}

const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();

function spokenDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function openingLetter(inquiry: InquiryRow) {
  const client = clients[inquiry.client_id]!;
  const first = client?.name?.split(/\s+/)[0] ?? "there";
  const time = inquiry.message?.match(/^Time:\s*(.+)$/m)?.[1]?.trim();
  const vision = (inquiry.message ?? "")
    .split("\n")
    .filter((line) => !/^(Size|Time|Recipient):/i.test(line.trim()))
    .join(" ")
    .trim();
  const place = inquiry.venue_text?.split(",")[0]?.trim();
  const when = inquiry.event_date_tbd
    ? "The date is still open."
    : inquiry.event_date
      ? `We're hoping for ${spokenDate(inquiry.event_date)}${time ? `, around ${time}` : ""}.`
      : time
        ? `Around ${time}.`
        : "";
  const figure = inquiry.budget_range ? `We can spend ${inquiry.budget_range}.` : "";
  const feeling = vision
    ? `${vision.charAt(0).toUpperCase()}${vision.slice(1).replace(/\.$/, "")}.`
    : "I'd love your help with the flowers.";
  const where = place ? `It would be at ${place}.` : "";
  const body = [
    `Hi Say Sukii —`,
    "",
    [feeling, where, when, figure].filter(Boolean).join(" "),
    "",
    first,
  ].join("\n");
  const subject = place ? `flowers for ${place}` : "a note about flowers";
  return { subject, body };
}

function formMessage(inquiry: InquiryRow): InquiryMessageRow {
  const letter = openingLetter(inquiry);
  const body = letter.body;

  return {
    id: `msg-form-${inquiry.id}`,
    inquiry_id: inquiry.id,
    direction: "inbound",
    channel: "email",
    subject: letter.subject,
    body,
    from_address: clients[inquiry.client_id]?.email ?? null,
    to_address: "info@saysukii.com",
    gmail_message_id: null,
    gmail_thread_id: null,
    author: clients[inquiry.client_id]?.name ?? null,
    sent_at: inquiry.received_at,
    status: "received",
    created_by: null,
    created_at: inquiry.received_at,
  };
}

export function getDevPreviewInquiryWorkspace(id: string) {
  hydratePreviewArrivals();
  const slugs = inquirySlugs(
    inquiries.map((item) => ({ ...item, client: clients[item.client_id] ?? null })),
  );
  const found =
    inquiries.find((item) => item.id === id) ??
    inquiries.find((item) => slugs.get(item.id) === id) ??
    inquiries[0];
  if (!found) throw new Error("inquiry not found");
  const inquiry = withReview(found);
  const client = clients[inquiry.client_id] ?? null;
  const messages: InquiryMessageRow[] =
    inquiry.origin === "detected"
      ? [
          {
            id: `msg-mail-${inquiry.id}`,
            inquiry_id: inquiry.id,
            direction: "inbound",
            channel: "email",
            subject: previewReviewMail(inquiry.id)?.subject ?? CANDIDATE_SOURCE.subject,
            body: previewReviewMail(inquiry.id)?.body ?? inquiry.message ?? CANDIDATE_SOURCE.body,
            from_address:
              client?.email ??
              previewReviewMail(inquiry.id)?.from_addr ??
              CANDIDATE_SOURCE.from_addr,
            to_address: "info@saysukii.com",
            gmail_message_id: "gmail-preview-candidate",
            gmail_thread_id: "thread-preview-candidate",
            author: client?.name ?? null,
            sent_at: inquiry.received_at,
            status: "received",
            created_by: null,
            created_at: inquiry.received_at,
          },
        ]
      : [formMessage(inquiry)];

  if (inquiry.id === PREVIEW_IDS.inquiryFresh) {
    const opening = messages[0];
    if (opening) {
      opening.sent_at = hoursAgo(8);
      opening.created_at = opening.sent_at;
      opening.subject = "october 1 at the hard rock";
      opening.body = [
        "Hi Say Sukii —",
        "",
        "We're getting married on October 1 at the Seminole Hard Rock. I'm hoping for warm candlelight, garden roses, and a long table that feels like dusk. The ceremony would be around 7pm. We can spend $20,000 or more.",
        "",
        "Maya",
      ].join("\n");
    }
    messages.push(
      {
        id: "msg-out-maya",
        inquiry_id: inquiry.id,
        direction: "outbound",
        channel: "email",
        subject: "re: october 1 at the hard rock",
        body: "Maya — thank you for writing. October 1 at seven is held in my book, and the dusk table is a beautiful place to start. I'll send a first look at scale and palette this week.",
        from_address: "info@saysukii.com",
        to_address: client?.email ?? null,
        gmail_message_id: "gmail-out-maya",
        gmail_thread_id: "thread-maya",
        author: "say sukii",
        sent_at: hoursAgo(5),
        status: "sent",
        created_by: null,
        created_at: hoursAgo(5),
      },
      {
        id: "msg-in-maya",
        inquiry_id: inquiry.id,
        direction: "inbound",
        channel: "email",
        subject: "re: october 1 at the hard rock",
        body: "Wonderful. If the weather holds we'd like the ceremony outside, then dinner inside. Garden roses can lead — nothing too precious.\n\nMaya\n\nAttached: ceremony-layout.pdf, reference-photos.zip",
        from_address: client?.email ?? null,
        to_address: "info@saysukii.com",
        gmail_message_id: "gmail-in-maya",
        gmail_thread_id: "thread-maya",
        author: client?.name ?? null,
        sent_at: hoursAgo(2),
        status: "received",
        created_by: null,
        created_at: hoursAgo(2),
      },
      {
        id: "msg-note-maya",
        inquiry_id: inquiry.id,
        direction: "note",
        channel: "note",
        subject: null,
        body: "Hold October 1. Ask whether the arch stays at the ceremony or moves inside for dinner.",
        from_address: null,
        to_address: null,
        gmail_message_id: null,
        gmail_thread_id: null,
        author: "Sukii",
        sent_at: hoursAgo(2),
        status: "sent",
        created_by: null,
        created_at: hoursAgo(2),
      },
    );
  }

  if (inquiry.id === PREVIEW_IDS.inquiryWedding) {
    messages.push(
      {
        id: "msg-out-amelia",
        inquiry_id: inquiry.id,
        direction: "outbound",
        channel: "email",
        subject: "your wedding flowers",
        body: "amelia — thank you for writing. i’ve read through the vision and i’ll send a first proposal this week so we can sit with scale and palette together.",
        from_address: "info@saysukii.com",
        to_address: client?.email ?? null,
        gmail_message_id: "gmail-out-amelia",
        gmail_thread_id: "thread-amelia",
        author: "say sukii",
        sent_at: iso(-4),
        status: "sent",
        created_by: null,
        created_at: iso(-4),
      },
      {
        id: "msg-in-amelia",
        inquiry_id: inquiry.id,
        direction: "inbound",
        channel: "email",
        subject: "re: your wedding flowers",
        body: "that would be lovely. we’re hoping for a ceremony arch if the budget can hold it — vizcaya at dusk is the feeling.",
        from_address: client?.email ?? null,
        to_address: "info@saysukii.com",
        gmail_message_id: "gmail-in-amelia",
        gmail_thread_id: "thread-amelia",
        author: client?.name ?? null,
        sent_at: iso(-3),
        status: "received",
        created_by: null,
        created_at: iso(-3),
      },
      {
        id: "msg-note-amelia",
        inquiry_id: inquiry.id,
        direction: "note",
        channel: "note",
        subject: null,
        body: "ask about aisle petals vs a grounded meadow at the altar. she mentioned orchids.",
        from_address: null,
        to_address: null,
        gmail_message_id: null,
        gmail_thread_id: null,
        author: "Sukii",
        sent_at: iso(-3),
        status: "sent",
        created_by: null,
        created_at: iso(-3),
      },
    );
  }

  if (inquiry.id === PREVIEW_IDS.inquiryProposalOut) {
    messages.push({
      id: "msg-out-amelia-proposal",
      inquiry_id: inquiry.id,
      direction: "outbound",
      channel: "email",
      subject: "re: flowers for vizcaya museum & gardens",
      body: [
        "amelia — the proposal is here whenever you want to sit with it.",
        "",
        "[your proposal](https://saysukii.com/proposal/preview_amelia8f3c1a9b2d4e6f708192a3b4c5d6e7)",
      ].join("\n"),
      from_address: "info@saysukii.com",
      to_address: client?.email ?? null,
      gmail_message_id: "gmail-out-amelia-proposal",
      gmail_thread_id: "thread-amelia-proposal",
      author: "say sukii",
      sent_at: iso(-6),
      status: "sent",
      created_by: null,
      created_at: iso(-6),
    });
    messages.push({
      id: "msg-in-amelia-reply",
      inquiry_id: inquiry.id,
      direction: "inbound",
      channel: "email",
      subject: "Re: flowers for vizcaya museum & gardens",
      body: [
        "Thank you!",
        "",
        "Warmly,",
        "",
        "Amelia",
        "",
        "On Mon, Oct 26, 2026 at 4:09 PM Say Sukii <info@saysukii.com> wrote:",
        "",
        "amelia — the proposal is here whenever you want to sit with it.",
        "",
        "your proposal",
        "https://saysukii.com/proposal/preview_amelia8f3c1a9b2d4e6f708192a3b4c5d6e7",
      ].join("\n"),
      from_address: client?.email ?? null,
      to_address: "info@saysukii.com",
      gmail_message_id: "gmail-in-amelia-reply",
      gmail_thread_id: "thread-amelia-proposal",
      author: client?.name ?? null,
      sent_at: iso(-1),
      status: "received",
      created_by: null,
      created_at: iso(-1),
    });
  }

  const proposalRows = proposals
    .filter((item) => item.inquiry_id === inquiry.id)
    .map((item) => ({
      id: item.id,
      number: item.number,
      status: item.status,
      total_cents: item.total_cents,
      event_date: item.event_date,
      created_at: item.created_at,
      access_token: item.access_token,
      viewed_at: item.viewed_at,
      deposit_amount_cents: item.deposit_amount_cents,
      pdf_path: item.pdf_path,
      notes: item.notes,
      pdf_url: null,
      file_name: "",
      invoice_number: null,
    }));
  const summary = resolveInquirySummaryText(
    buildInquirySummaryFacts({
      status: inquiry.status,
      contacted_at: inquiry.contacted_at,
      messages,
      proposals: proposals.filter((item) => item.inquiry_id === inquiry.id),
      meetings: [],
      details: {
        clientName: client?.name ?? null,
        clientEmail: client?.email ?? null,
        eventType: inquiry.event_type,
        eventDate: inquiry.event_date,
        eventDateTbd: inquiry.event_date_tbd,
        venue: inquiry.venue_text,
        guestCount: inquiry.guest_count,
        budget: inquiry.budget_range,
        receivedAt: inquiry.received_at,
        closedAt: inquiry.closed_at,
        closedReason: inquiry.closed_reason,
        detectionStatus: inquiry.detection_status,
      },
    }),
  );

  return {
    inquiry: { ...inquiry, summary_text: summary, summary_generated_at: inquiry.received_at },
    slug: slugs.get(inquiry.id) ?? inquiry.id,
    client,
    messages,
    proposals: proposalRows,
    files:
      inquiry.id === PREVIEW_IDS.inquiryWedding
        ? [
            {
              id: "file-amelia-1",
              owner_type: "inquiry" as const,
              owner_id: inquiry.id,
              file_path: "inquiries/amelia-moodboard.pdf",
              file_type: "application/pdf",
              uploaded_by: null,
              created_at: iso(-4),
              name: "amelia-moodboard.pdf",
              signed_url: null,
            },
          ]
        : [],
    gmailConnected: false,
    invoices: [] as Array<{
      id: string;
      number: string;
      total_cents: number;
      due_now_cents: number;
      pay_in_full: boolean;
      status: "sent" | "deposit_paid" | "paid" | "canceled";
      public_url: string | null;
      sent_at: string;
      paid_cents: number;
    }>,
    source_message:
      inquiry.origin === "detected"
        ? {
            ...(previewReviewMail(inquiry.id) ?? CANDIDATE_SOURCE),
            received_at: inquiry.received_at,
          }
        : null,
  };
}

function studioAt(dayOffset: number, hour: number, minute = 0) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const day = new Date(Date.UTC(read("year"), read("month") - 1, read("day") + dayOffset));
  const guess = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);
  const shown = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const num = (type: string) => Number(shown.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(num("year"), num("month") - 1, num("day"), num("hour"), num("minute"));
  return new Date(guess - (asUtc - guess)).toISOString();
}

export function getDevPreviewAppointments() {
  return [
    {
      id: "preview-talk-maya",
      startsAt: studioAt(-1, 16),
      name: "Maya Santos",
      email: "maya@example.com",
      note: "hard rock follow-up",
    },
    {
      id: "preview-talk-camila",
      startsAt: studioAt(0, 15),
      name: "Camila Reyes",
      email: "camila.reyes@gmail.com",
      note: "wedding at the w hotel",
    },
    {
      id: "preview-talk-amelia",
      startsAt: studioAt(1, 10, 30),
      name: "Amelia Chen",
      email: "amelia@example.com",
      note: "vizcaya palette",
    },
    {
      id: "preview-talk-lumen",
      startsAt: studioAt(2, 13),
      name: "Lumen Studio",
      email: "hello@lumenstudio.co",
      note: "wynwood walk-through",
    },
    {
      id: "preview-talk-elena",
      startsAt: studioAt(4, 11),
      name: "Elena Ruiz",
      email: "elena@example.com",
      note: "pamm ceremony",
    },
  ];
}

export function getDevPreviewDashboard() {
  return assembleStudioToday({
    inquiries: getDevPreviewPipeline().filter(isBookInquiry),
    projects: projects.map((project) => ({
      ...project,
      client: clients[project.client_id] ?? null,
    })),
    tasks: getDevPreviewTasks(),
    appointments: getDevPreviewAppointments(),
  });
}

export function getDevPreviewTasks() {
  return [...autoInquiryTasks(), ...extraTasks];
}

export function getDevPreviewProposals() {
  return proposals.map((proposal) => ({
    ...proposal,
    clients: { name: clients[proposal.client_id]!.name, email: clients[proposal.client_id]!.email },
    inquiries: {
      event_type:
        inquiries.find((item) => item.id === proposal.inquiry_id)?.event_type ?? "wedding",
    },
  }));
}

export function getDevPreviewProposal(id: string) {
  const proposal = proposals.find((item) => item.id === id) ?? proposals[0]!;
  const client = clients[proposal.client_id]!;
  const inquiryRow = inquiries.find((item) => item.id === proposal.inquiry_id) ?? inquiries[0]!;
  const venue = venues.find((item) => item.id === proposal.venue_id) ?? null;
  return {
    ...proposal,
    clients: client,
    inquiries: inquiryRow,
    venues: venue,
    proposal_line_items: lineItems.filter((item) => item.proposal_id === proposal.id),
    agreements: [],
    invoices:
      proposal.status === "accepted"
        ? [
            {
              id: "c1000000-0000-4000-8000-0000000000c1",
              proposal_id: proposal.id,
              number: "INV-2026-008-DEP",
              amount_cents: proposal.deposit_amount_cents,
              status: "paid" as const,
              due_date: dateOnly(-5),
              square_payment_link: null,
              square_order_id: null,
              pdf_path: null,
              created_at: iso(-10),
              updated_at: iso(-9),
            },
          ]
        : [],
  };
}

const LOCAL_REVIEW_CLIENTS = new Set<string>([PREVIEW_IDS.clientNoor, PREVIEW_IDS.clientJules]);

function studioClients() {
  return Object.values(clients).filter((client) => !LOCAL_REVIEW_CLIENTS.has(client.id));
}

export function getDevPreviewProposalBuilderData() {
  return {
    clients: studioClients(),
    inquiries: inquiries
      .filter(
        (item) =>
          item.detection_status !== "candidate" &&
          ["new", "contacted", "in_conversation"].includes(item.status),
      )
      .map((item) => ({ ...item, clients: clients[item.client_id] })),
    arrangements,
    venues,
  };
}

export function getDevPreviewProjects() {
  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  return {
    role: "admin" as const,
    projects: projects.map((project) => ({
      id: project.id,
      event_name: project.event_name,
      event_date: project.event_date,
      venue_id: project.venue_id,
      venue_text: project.venue_text,
      status: project.status,
      notes: project.notes,
      archived: project.archived,
      created_at: project.created_at,
      updated_at: project.updated_at,
      venue: project.venue_id ? (venueById.get(project.venue_id) ?? null) : null,
      client: clients[project.client_id]
        ? {
            id: clients[project.client_id]!.id,
            name: clients[project.client_id]!.name,
            email: clients[project.client_id]!.email,
            organization: clients[project.client_id]!.organization,
            phone: clients[project.client_id]!.phone,
          }
        : null,
      proposal: proposals.find((item) => item.id === project.proposal_id)
        ? {
            id: project.proposal_id,
            number: proposals.find((item) => item.id === project.proposal_id)!.number,
            status: proposals.find((item) => item.id === project.proposal_id)!.status,
            total_cents: proposals.find((item) => item.id === project.proposal_id)!.total_cents,
            deposit_amount_cents: proposals.find((item) => item.id === project.proposal_id)!
              .deposit_amount_cents,
          }
        : null,
    })),
  };
}

export function getDevPreviewProject(id: string) {
  const project = projects.find((item) => item.id === id) ?? projects[0]!;
  const client = clients[project.client_id]!;
  const proposal = proposals.find((item) => item.id === project.proposal_id)!;
  const venue = venues.find((item) => item.id === project.venue_id) ?? null;
  return {
    role: "admin" as const,
    project: {
      id: project.id,
      event_name: project.event_name,
      event_date: project.event_date,
      venue_id: project.venue_id,
      venue_text: project.venue_text,
      status: project.status,
      notes: project.notes,
      google_event_id: project.google_event_id,
      archived: project.archived,
      created_at: project.created_at,
      updated_at: project.updated_at,
    },
    venue,
    arrangements: [
      {
        id: "d1000000-0000-4000-8000-0000000000d1",
        project_id: project.id,
        arrangement_id: PREVIEW_IDS.arrangementArch,
        proposal_line_item_id: lineItems[0]?.id ?? null,
        label: "Ceremony arch",
        quantity: 1,
        recipe_id: PREVIEW_IDS.recipeArch,
        created_at: iso(-5),
      },
    ],
    files: [],
    order: {
      id: PREVIEW_IDS.orderWedding,
      project_id: project.id,
      status: "ordered" as const,
      notes: null,
      created_at: iso(-4),
      updated_at: iso(-1),
    },
    order_items: [
      {
        id: "e1000000-0000-4000-8000-0000000000e1",
        order_id: PREVIEW_IDS.orderWedding,
        stem_id: PREVIEW_IDS.stemGardenRose,
        vendor_id: PREVIEW_IDS.vendorMiami,
        manual_label: null,
        color: "Blush",
        quantity: 120,
        unit: "stem" as const,
        received: false,
        created_at: iso(-4),
        stem: stems[0],
        vendor: vendors[0],
      },
      {
        id: "e1000000-0000-4000-8000-0000000000e2",
        order_id: PREVIEW_IDS.orderWedding,
        stem_id: PREVIEW_IDS.stemRuscus,
        vendor_id: PREVIEW_IDS.vendorMiami,
        manual_label: null,
        color: "Green",
        quantity: 18,
        unit: "bunch" as const,
        received: true,
        created_at: iso(-4),
        stem: stems[2],
        vendor: vendors[0],
      },
    ],
    admin: {
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        organization: client.organization,
        notes: client.notes,
      },
      proposal: {
        id: proposal.id,
        number: proposal.number,
        status: proposal.status,
        subtotal_cents: proposal.subtotal_cents,
        tax_cents: proposal.tax_cents,
        total_cents: proposal.total_cents,
        deposit_amount_cents: proposal.deposit_amount_cents,
        accepted_at: proposal.accepted_at,
        pdf_path: proposal.pdf_path,
      },
      invoices: [],
      payments: [],
    },
  };
}

export function getDevPreviewClients() {
  return studioClients();
}

export function getDevPreviewClient(id: string) {
  const slugs = clientSlugs(Object.values(clients));
  const client =
    clients[id] ??
    Object.values(clients).find((item) => slugs.get(item.id) === id) ??
    Object.values(clients)[0]!;
  return {
    client,
    slug: slugs.get(client.id) ?? client.id,
    inquiries: inquiries
      .map(withReview)
      .filter((item) => item.client_id === client.id)
      .map((item) => ({
        ...item,
        slug:
          inquirySlugs(
            inquiries.map((row) => ({ ...row, client: clients[row.client_id] ?? null })),
          ).get(item.id) ?? item.id,
      })),
    proposals: proposals
      .filter((item) => item.client_id === client.id)
      .map((proposal) => ({
        id: proposal.id,
        number: proposal.number,
        inquiry_id: proposal.inquiry_id,
        event_date: proposal.event_date,
        venue_id: proposal.venue_id,
        venue_text: proposal.venue_text,
        total_cents: proposal.total_cents,
        deposit_amount_cents: proposal.deposit_amount_cents,
        status: proposal.status,
        pdf_path: proposal.pdf_path,
        sent_at: proposal.sent_at,
        accepted_at: proposal.accepted_at,
        created_at: proposal.created_at,
      })),
    projects: projects.filter((item) => item.client_id === client.id),
    files: [],
  };
}

export function getDevPreviewLibrary(): LibraryData {
  const stemById = new Map(stems.map((stem) => [stem.id, stem]));
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const recipe = recipes[0]!;
  const libraryRecipe = {
    ...recipe,
    recipe_stems: recipeStems.map((line) => ({
      ...line,
      stem: stemById.get(line.stem_id) ?? null,
    })),
  };

  return {
    role: "admin",
    vendors,
    projects: projects.map((project) => ({
      id: project.id,
      event_name: project.event_name,
      event_date: project.event_date,
      status: project.status,
    })),
    stems: stems.map((stem) => ({
      ...stem,
      vendor: stem.vendor_id ? (vendorById.get(stem.vendor_id) ?? null) : null,
    })),
    arrangements: arrangements.map((arrangement) => ({
      ...arrangement,
      default_recipe: arrangement.default_recipe_id === recipe.id ? libraryRecipe : null,
    })),
  };
}

export function getDevPreviewSettings() {
  const members: ProfileRow[] = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      full_name: "Sukii",
      email: "info@saysukii.com",
      role: "admin",
      active: true,
      created_at: iso(-200),
      updated_at: iso(-1),
      last_seen_at: iso(0),
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      full_name: "Production Lead",
      email: "production@saysukii.com",
      role: "team",
      active: true,
      created_at: iso(-120),
      updated_at: iso(-2),
      last_seen_at: iso(-1),
    },
  ];

  return {
    connections: [
      {
        id: "f1000000-0000-4000-8000-0000000000f1",
        provider: "square",
        status: "disconnected",
        expires_at: null,
        metadata: {},
        connected_by: null,
        updated_at: iso(-2),
      },
      {
        id: "f1000000-0000-4000-8000-0000000000f2",
        provider: "google",
        status: "connected",
        expires_at: iso(30),
        metadata: {},
        connected_by: "00000000-0000-4000-8000-000000000001",
        updated_at: iso(-1),
      },
      {
        id: "f1000000-0000-4000-8000-0000000000f3",
        provider: "gmail",
        status: "connected",
        expires_at: iso(30),
        metadata: {},
        connected_by: "00000000-0000-4000-8000-000000000001",
        updated_at: iso(0),
        account_email: "info@saysukii.com",
      },
    ],
    failedEvents: [
      {
        id: "f3000000-0000-4000-8000-0000000000f1",
        provider: "square",
        event_type: "payment_link_create",
        status: "failed" as const,
        reference_type: "proposal",
        reference_id: null,
        error_message: "Square did not create the deposit link for SS101.",
        attempts: 1,
        payload: {},
        created_at: iso(-1),
        updated_at: iso(-1),
      },
      {
        id: "f3000000-0000-4000-8000-0000000000f2",
        provider: "gmail",
        event_type: "send",
        status: "failed" as const,
        reference_type: "inquiry",
        reference_id: null,
        error_message: "Gmail could not send the invoice letter. It stayed in the studio.",
        attempts: 2,
        payload: {},
        created_at: iso(0),
        updated_at: iso(0),
      },
      {
        id: "f3000000-0000-4000-8000-0000000000f3",
        provider: "resend",
        event_type: "team_invite",
        status: "failed" as const,
        reference_type: "team_invite",
        reference_id: null,
        error_message: "The invitation email did not send.",
        attempts: 1,
        payload: {},
        created_at: iso(-2),
        updated_at: iso(-2),
      },
    ],
    members,
    invites: [
      {
        id: "f2000000-0000-4000-8000-0000000000f1",
        email: "newmember@saysukii.com",
        role: "team" as const,
        expires_at: iso(5),
        accepted_at: null,
        created_at: iso(-2),
      },
    ],
  };
}

export function getDevPreviewDirectories() {
  return { venues, vendors };
}

export function getDevPreviewShoppingList(projectId: string) {
  const project = projects.find((item) => item.id === projectId) ?? projects[0]!;
  const client = clients[project.client_id]!;
  const lines = [
    {
      key: "preview-1",
      stem_id: PREVIEW_IDS.stemGardenRose,
      label: "Garden rose · Miyabi",
      color: "Blush",
      quantity: 120,
      unit: "stem" as const,
      received: false,
      unit_cost_cents: 650,
      total_cost_cents: 78000,
    },
    {
      key: "preview-2",
      stem_id: PREVIEW_IDS.stemRuscus,
      label: "Italian ruscus",
      color: "Green",
      quantity: 18,
      unit: "bunch" as const,
      received: true,
      unit_cost_cents: 2400,
      total_cost_cents: 43200,
    },
  ];

  return {
    project: {
      id: project.id,
      client_id: project.client_id,
      event_name: project.event_name,
      event_date: project.event_date,
      venue_id: project.venue_id,
      venue_text: project.venue_text,
      status: project.status,
      client_name: client.name,
      venue_name: venues.find((venue) => venue.id === project.venue_id)?.name ?? project.venue_text,
    },
    order: {
      id: PREVIEW_IDS.orderWedding,
      status: "ordered" as const,
      updated_at: iso(-1),
    },
    groups: [
      {
        vendor_id: PREVIEW_IDS.vendorMiami,
        vendor_name: "Miami Flower Market",
        ordering_method: "Text by 10 AM",
        items: lines,
      },
    ],
    grand_total_cents: 121200,
  };
}
