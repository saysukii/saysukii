export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "team";
export type InquiryStatus =
  "new" | "contacted" | "in_conversation" | "proposal_sent" | "booked" | "closed";
export type EventType =
  | "wedding"
  | "brand_activation"
  | "corporate"
  | "private"
  | "photoshoot"
  | "subscription"
  | "other";
export type ClientType = "individual" | "brand" | "corporate" | "venue_partner";
export type ArrangementType =
  "installation" | "arrangement" | "reception" | "bridal" | "delivery" | "other";
export type StemUnit = "stem" | "bunch" | "plant";
export type ProposalStatus = "draft" | "sent" | "shared" | "viewed" | "accepted" | "declined";
export type StudioIntegrationStatus = "connected" | "disconnected" | "error";
export type MeetingMatchStatus = "matched" | "needs_confirm" | "unmatched";
export type InspirationImageSource = "form" | "thread";
export const SAY_SUKII_STUDIO_ID = "00000000-0000-4000-8000-000000000010";
export type ProposalItemKind =
  "arrangement" | "labor" | "delivery" | "install" | "breakdown" | "custom";
export type ProjectStatus = "pre_production" | "production" | "post_production" | "archived";
export type OrderStatus = "draft" | "ordered" | "received";
export type InvoiceStatus = "unpaid" | "paid" | "void";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";
export type TaskLinkedType = "inquiry" | "project" | "none";
export type TaskSource = "auto" | "manual";
export type TaskStatus = "open" | "done";
export type InquiryOrigin = "form" | "manual" | "detected";
export type DetectionStatus = "candidate" | "confirmed" | "dismissed" | "na";
export type InboundRoutingResult = "attached" | "candidate" | "ignored";
export type InquiryMessageDirection = "inbound" | "outbound" | "note";
export type EmailIntegrationStatus = "connected" | "disconnected" | "error";
export type RoutingLabelKind = "ignored" | "dismissed";
export type RoutingLabelSource = "model" | "human";

type Table<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: AppRole;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
};

export type TeamInviteRow = {
  id: string;
  email: string;
  role: AppRole;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type ClientRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organization: string | null;
  type: ClientType;
  source: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type VenueRow = {
  id: string;
  name: string;
  address: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  load_in_notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type VendorRow = {
  id: string;
  name: string;
  type: "warehouse" | "wholesaler" | "rental" | "other";
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  ordering_method: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type InquiryRow = {
  id: string;
  client_id: string;
  event_date: string | null;
  event_date_tbd: boolean;
  event_type: EventType;
  venue_id: string | null;
  venue_text: string | null;
  guest_count: number | null;
  budget_range: string | null;
  source: string | null;
  message: string | null;
  status: InquiryStatus;
  closed_reason: string | null;
  received_at: string;
  contacted_at: string | null;
  proposal_sent_at: string | null;
  booked_at: string | null;
  closed_at: string | null;
  archived: boolean;
  created_by: string | null;
  updated_at: string;
  origin: InquiryOrigin;
  detection_status: DetectionStatus;
  detection_confidence: number | null;
  detection_reason: string | null;
  source_message_id: string | null;
  summary_text: string | null;
  summary_generated_at: string | null;
};

export type ArrangementRow = {
  id: string;
  name: string;
  type: ArrangementType;
  description: string | null;
  price_cents: number;
  image_path: string | null;
  default_recipe_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type StemRow = {
  id: string;
  common_name: string;
  variety: string | null;
  color: string;
  unit: StemUnit;
  vendor_id: string | null;
  last_known_cost_cents: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeRow = {
  id: string;
  arrangement_id: string;
  project_id: string | null;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeStemRow = {
  id: string;
  recipe_id: string;
  stem_id: string;
  color: string;
  quantity: number;
  created_at: string;
};

export type ProposalRow = {
  id: string;
  number: string;
  client_id: string;
  inquiry_id: string;
  event_date: string | null;
  venue_id: string | null;
  venue_text: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_percent: number | null;
  deposit_amount_cents: number;
  vision_board_url: string | null;
  vision_image_paths: string[];
  notes: string | null;
  valid_until: string | null;
  status: ProposalStatus;
  access_token_hash: string | null;
  access_token_prefix: string | null;
  pdf_path: string | null;
  canva_design_id: string | null;
  export_pdf_ref: string | null;
  sent_at: string | null;
  shared_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  created_by: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ProposalLineItemRow = {
  id: string;
  proposal_id: string;
  arrangement_id: string | null;
  kind: ProposalItemKind;
  label: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  snapshot: Json;
  sort_order: number;
  created_at: string;
};

export type AgreementRow = {
  id: string;
  proposal_id: string;
  content: string;
  version: number;
  pdf_path: string | null;
  created_at: string;
};

export type InvoiceRow = {
  id: string;
  proposal_id: string;
  number: string;
  amount_cents: number;
  status: InvoiceStatus;
  due_date: string | null;
  square_payment_link: string | null;
  square_order_id: string | null;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  proposal_id: string;
  invoice_id: string | null;
  square_payment_id: string;
  square_order_id: string | null;
  amount_cents: number;
  status: PaymentStatus;
  paid_at: string | null;
  raw_payload: Json;
  created_at: string;
  updated_at: string;
};

export type ProjectRow = {
  id: string;
  client_id: string;
  proposal_id: string;
  event_name: string;
  event_date: string;
  venue_id: string | null;
  venue_text: string | null;
  status: ProjectStatus;
  notes: string | null;
  google_event_id: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectArrangementRow = {
  id: string;
  project_id: string;
  arrangement_id: string | null;
  proposal_line_item_id: string | null;
  label: string;
  quantity: number;
  recipe_id: string | null;
  created_at: string;
};

export type OrderRow = {
  id: string;
  project_id: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  stem_id: string | null;
  color: string | null;
  quantity: number;
  unit: StemUnit | null;
  vendor_id: string | null;
  received: boolean;
  manual_label: string | null;
  created_at: string;
  updated_at: string;
};

export type FileRow = {
  id: string;
  owner_type: "client" | "proposal" | "project" | "venue" | "inquiry";
  owner_id: string;
  file_path: string;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type InquiryMessageRow = {
  id: string;
  inquiry_id: string;
  direction: InquiryMessageDirection;
  channel: "form" | "email" | "note";
  subject: string | null;
  body: string;
  from_address: string | null;
  to_address: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  author: string | null;
  sent_at: string;
  status: "draft" | "queued" | "sent" | "received" | "failed";
  created_by: string | null;
  created_at: string;
};

export type EmailIntegrationRow = {
  id: string;
  provider: "gmail";
  account_email: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  status: EmailIntegrationStatus;
  connected_at: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InboundMessageRow = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  from_addr: string | null;
  to_addr: string | null;
  subject: string | null;
  body: string | null;
  received_at: string;
  processed_at: string | null;
  routing_result: InboundRoutingResult | null;
  matched_inquiry_id: string | null;
  created_at: string;
};

export type StudioRow = {
  id: string;
  name: string;
  created_at: string;
};

export type InternalNoteRow = {
  id: string;
  inquiry_id: string;
  author: string;
  body: string;
  created_at: string;
};

export type CanvaIntegrationRow = {
  id: string;
  studio_id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  account: string | null;
  status: StudioIntegrationStatus;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GranolaIntegrationRow = {
  id: string;
  studio_id: string;
  encrypted_api_key: string | null;
  status: StudioIntegrationStatus;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MeetingRow = {
  id: string;
  inquiry_id: string | null;
  granola_note_id: string;
  title: string;
  occurred_at: string;
  summary: string | null;
  attendees: Json;
  match_status: MeetingMatchStatus;
  created_at: string;
};

export type InspirationImageRow = {
  id: string;
  inquiry_id: string;
  source: InspirationImageSource;
  storage_ref: string;
  added_at: string;
};

export type InquiryRoutingLabelRow = {
  id: string;
  inbound_message_id: string | null;
  inquiry_id: string | null;
  gmail_message_id: string | null;
  label: RoutingLabelKind;
  source: RoutingLabelSource;
  reason: string | null;
  payload: Json;
  created_at: string;
};

export type IntegrationConnectionRow = {
  id: string;
  provider: "square" | "google" | "resend" | "gmail";
  status: "connected" | "disconnected" | "error";
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  expires_at: string | null;
  metadata: Json;
  connected_by: string | null;
  updated_at: string;
};

export type IntegrationEventRow = {
  id: string;
  provider: string;
  event_type: string;
  status: "pending" | "succeeded" | "failed";
  reference_type: string | null;
  reference_id: string | null;
  error_message: string | null;
  attempts: number;
  payload: Json;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  title: string;
  linked_type: TaskLinkedType;
  linked_id: string | null;
  source: TaskSource;
  trigger_stage: InquiryStatus | null;
  due_at: string | null;
  created_at: string;
  status: TaskStatus;
};

export type WebhookEventRow = {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  status: "received" | "processed" | "failed";
  payload: Json;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      team_invites: Table<TeamInviteRow>;
      clients: Table<ClientRow>;
      venues: Table<VenueRow>;
      vendors: Table<VendorRow>;
      studios: Table<StudioRow>;
      inquiries: Table<InquiryRow>;
      inquiry_messages: Table<InquiryMessageRow>;
      internal_notes: Table<InternalNoteRow>;
      canva_integration: Table<CanvaIntegrationRow>;
      granola_integration: Table<GranolaIntegrationRow>;
      meetings: Table<MeetingRow>;
      inspiration_images: Table<InspirationImageRow>;
      email_integration: Table<EmailIntegrationRow>;
      inbound_messages: Table<InboundMessageRow>;
      inquiry_routing_labels: Table<InquiryRoutingLabelRow>;
      arrangements: Table<ArrangementRow>;
      stems: Table<StemRow>;
      recipes: Table<RecipeRow>;
      recipe_stems: Table<RecipeStemRow>;
      proposals: Table<ProposalRow>;
      proposal_line_items: Table<ProposalLineItemRow>;
      agreements: Table<AgreementRow>;
      invoices: Table<InvoiceRow>;
      payments: Table<PaymentRow>;
      projects: Table<ProjectRow>;
      project_arrangements: Table<ProjectArrangementRow>;
      orders: Table<OrderRow>;
      order_items: Table<OrderItemRow>;
      files: Table<FileRow>;
      integration_connections: Table<IntegrationConnectionRow>;
      integration_events: Table<IntegrationEventRow>;
      webhook_events: Table<WebhookEventRow>;
      tasks: Table<TaskRow>;
    };
    Views: Record<string, never>;
    Functions: {
      next_proposal_number: { Args: Record<string, never>; Returns: string };
      next_invoice_number: { Args: Record<string, never>; Returns: string };
      current_user_role: { Args: Record<string, never>; Returns: AppRole | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_studio_member: { Args: Record<string, never>; Returns: boolean };
      set_order_item_received: {
        Args: { p_order_item_id: string; p_received: boolean };
        Returns: undefined;
      };
      complete_own_profile: {
        Args: { p_full_name: string };
        Returns: undefined;
      };
      create_project_from_paid_deposit: {
        Args: { p_payment_id: string };
        Returns: string;
      };
    };
    Enums: {
      app_role: AppRole;
      inquiry_status: InquiryStatus;
      event_type: EventType;
      client_type: ClientType;
      arrangement_type: ArrangementType;
      stem_unit: StemUnit;
      proposal_status: ProposalStatus;
      proposal_item_kind: ProposalItemKind;
      project_status: ProjectStatus;
      order_status: OrderStatus;
      invoice_status: InvoiceStatus;
      payment_status: PaymentStatus;
      task_linked_type: TaskLinkedType;
      task_source: TaskSource;
      task_status: TaskStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
