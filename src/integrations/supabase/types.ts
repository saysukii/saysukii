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
export type ProposalStatus = "draft" | "sent" | "shared" | "viewed" | "accepted" | "declined";
export type StudioIntegrationStatus = "connected" | "disconnected" | "error";
export type MeetingMatchStatus = "matched" | "needs_confirm" | "unmatched";
export type InspirationImageSource = "form" | "thread";
export const SAY_SUKII_STUDIO_ID = "00000000-0000-4000-8000-000000000010";
export type ProposalItemKind =
  "arrangement" | "labor" | "delivery" | "install" | "breakdown" | "custom";
export type ProjectStatus = "pre_production" | "production" | "post_production" | "archived";
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
  /** the owner's drawn signature (a png data url), for countersigning agreements */
  signature?: string | null;
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
  address?: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

/** one more person to reach at a venue or vendor */
export type DirectoryContact = { name: string; email: string; phone: string };

export type VenueRow = {
  id: string;
  name: string;
  address: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  /** everyone to reach after the first contact */
  more_contacts?: DirectoryContact[] | null;
  load_in_notes: string | null;
  category?: string | null;
  website?: string | null;
  capacity?: string | null;
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
  /** everyone to reach after the first contact */
  more_contacts?: DirectoryContact[] | null;
  ordering_method: string | null;
  address?: string | null;
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
  access_token: string | null;
  slug?: string | null;
  pdf_path: string | null;
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

export type EmailTemplateRow = {
  id: string;
  subject: string;
  headline: string;
  body: string;
  updated_by: string | null;
  updated_at: string;
};

export type InquiryInvoiceStatus = "sent" | "deposit_paid" | "paid" | "canceled";

export type InquiryInvoicePayment = {
  square_payment_id: string;
  amount_cents: number;
  paid_at: string;
  method: string | null;
};

export type InquiryInvoiceRow = {
  id: string;
  inquiry_id: string;
  number: string;
  items: Json;
  subtotal_cents: number;
  courtesy_cents: number;
  total_cents: number;
  due_now_cents: number;
  pay_in_full: boolean;
  square_invoice_id: string | null;
  square_order_id: string | null;
  public_url: string | null;
  status: InquiryInvoiceStatus;
  paid_cents: number;
  sent_at: string;
  paid_at: string | null;
  /** opens the invoice's own page: inside.saysukii.com/invoice/<token> */
  access_token?: string | null;
  /** every payment toward it, oldest first, for its receipts */
  payments?: InquiryInvoicePayment[] | null;
  /** "Booking for … per approved proposal." */
  booking?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposalLineItemRow = {
  id: string;
  proposal_id: string;
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
  signed_name: string | null;
  signed_at: string | null;
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

export type FileRow = {
  id: string;
  owner_type: "client" | "proposal" | "project" | "venue" | "inquiry" | "studio";
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
  send_payload?: Json | null;
  /** an email's html as it arrived, added when the inquiry loads; never stored here */
  body_html?: string | null;
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
  from_name: string | null;
  to_addr: string | null;
  subject: string | null;
  body: string | null;
  /** the letter as their mail app drew it, when it came with html */
  body_html?: string | null;
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
  calendar_settings: Json | null;
  inquiry_forms: Json | null;
};

export type InternalNoteRow = {
  id: string;
  inquiry_id: string;
  author: string;
  body: string;
  created_at: string;
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

export type AppointmentRow = {
  id: string;
  starts_at: string;
  guest_name: string;
  guest_email: string;
  note: string | null;
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
      granola_integration: Table<GranolaIntegrationRow>;
      meetings: Table<MeetingRow>;
      appointments: Table<AppointmentRow>;
      inspiration_images: Table<InspirationImageRow>;
      email_integration: Table<EmailIntegrationRow>;
      inbound_messages: Table<InboundMessageRow>;
      inquiry_invoices: Table<InquiryInvoiceRow>;
      email_templates: Table<EmailTemplateRow>;
      inquiry_routing_labels: Table<InquiryRoutingLabelRow>;
      proposals: Table<ProposalRow>;
      proposal_line_items: Table<ProposalLineItemRow>;
      agreements: Table<AgreementRow>;
      invoices: Table<InvoiceRow>;
      payments: Table<PaymentRow>;
      projects: Table<ProjectRow>;
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
      claim_invoice_number: { Args: { after_number: number }; Returns: string };
      current_user_role: { Args: Record<string, never>; Returns: AppRole | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_studio_member: { Args: Record<string, never>; Returns: boolean };
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
      proposal_status: ProposalStatus;
      proposal_item_kind: ProposalItemKind;
      project_status: ProjectStatus;
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
