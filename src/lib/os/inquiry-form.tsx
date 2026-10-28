import { useState, type FormEvent } from "react";

import { InquiryDatePicker } from "@/components/inquiry/InquiryDatePicker";
import { Field, SoftButton, inputClass } from "@/components/portal/bits";
import { StudioDrawerSelect } from "@/components/portal/StudioDrawerSelect";
import type { ClientType, EventType } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

export const DIRECT_OUTREACH_SOURCE = "direct outreach";

export type InquiryFormValues = {
  name: string;
  email: string;
  phone: string;
  organization: string;
  client_type: ClientType;
  event_date: string | null;
  event_date_tbd: boolean;
  event_dates?: string[];
  event_time?: string;
  event_type: EventType;
  venue_text: string;
  venue_tbd?: boolean;
  guest_count: number | null;
  budget_range: string;
  source: string;
  message: string;
  website?: string;
  interest?: "weddings" | "events" | "deliveries" | "subscriptions" | "set_design" | "";
  event_setting?: "private" | "corporate" | "";
  arrangement_size?: string;
  recipient?: string;
  sources?: string[];
  space?: string;
  space_other?: string;
  cadence?: string;
  cadence_other?: string;
};

export const EVENT_TYPES: Array<{ value: EventType; label: string }> = [
  { value: "wedding", label: "Wedding" },
  { value: "brand_activation", label: "Brand activation" },
  { value: "corporate", label: "Corporate" },
  { value: "private", label: "Private event" },
  { value: "photoshoot", label: "Photoshoot" },
  { value: "subscription", label: "Floral subscription" },
  { value: "other", label: "Other" },
];

export const CLIENT_TYPES: Array<{ value: ClientType; label: string }> = [
  { value: "individual", label: "Individual" },
  { value: "brand", label: "Brand" },
  { value: "corporate", label: "Corporate" },
  { value: "venue_partner", label: "Venue partner" },
];

export const BUDGET_RANGES = [
  { value: "Under $5,000", label: "Under $5,000" },
  { value: "$5,000–$10,000", label: "$5,000–$10,000" },
  { value: "$10,000–$20,000", label: "$10,000–$20,000" },
  { value: "$20,000–$40,000", label: "$20,000–$40,000" },
  { value: "$40,000+", label: "$40,000+" },
  { value: "Not sure yet", label: "Not sure yet" },
];

export function InquiryForm({
  onSubmit,
  submitLabel = "Send inquiry",
  showHoneypot = false,
  disabled = false,
}: {
  onSubmit: (values: InquiryFormValues) => Promise<void>;
  submitLabel?: string;
  showHoneypot?: boolean;
  disabled?: boolean;
}) {
  const [eventDate, setEventDate] = useState<string | null>(null);
  const [dateTbd, setDateTbd] = useState(false);
  const [dateError, setDateError] = useState("");
  const [clientType, setClientType] = useState<ClientType>("individual");
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [budgetRange, setBudgetRange] = useState("");
  const [budgetError, setBudgetError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (!eventDate && !dateTbd) {
      setDateError("Choose a date or mark it as TBD.");
      return;
    }
    if (!budgetRange) {
      setBudgetError("Choose a budget range.");
      return;
    }

    setDateError("");
    setBudgetError("");
    const guestCount = String(formData.get("guest_count") ?? "");
    try {
      await onSubmit({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        organization: String(formData.get("organization") ?? ""),
        client_type: clientType,
        event_date: dateTbd ? null : eventDate,
        event_date_tbd: dateTbd,
        event_type: eventType,
        venue_text: String(formData.get("venue_text") ?? ""),
        guest_count: guestCount ? Number(guestCount) : null,
        budget_range: budgetRange,
        source: DIRECT_OUTREACH_SOURCE,
        message: String(formData.get("message") ?? ""),
        ...(showHoneypot ? { website: String(formData.get("website") ?? "") } : {}),
      });
      form.reset();
      setEventDate(null);
      setDateTbd(false);
      setDateError("");
      setClientType("individual");
      setEventType("wedding");
      setBudgetRange("");
      setBudgetError("");
    } catch {
      // The parent mutation owns error presentation.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      {showHoneypot ? (
        <label className="absolute -left-[10000px]" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name">
          <input className={inputClass} name="name" autoComplete="name" maxLength={160} required />
        </Field>
        <Field label="Email">
          <input
            className={inputClass}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={320}
            required
          />
        </Field>
        <Field label="Phone">
          <input
            className={inputClass}
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            required
          />
        </Field>
        <div>
          <span className="eyebrow">Inquiry for</span>
          <div className="mt-2">
            <StudioDrawerSelect
              label="Inquiry for"
              value={clientType}
              options={CLIENT_TYPES}
              disabled={disabled}
              onChange={setClientType}
            />
          </div>
        </div>
        <Field label="Organization" hint="Optional">
          <input
            className={inputClass}
            name="organization"
            autoComplete="organization"
            maxLength={160}
          />
        </Field>
        <div>
          <span className="eyebrow">Event type</span>
          <div className="mt-2">
            <StudioDrawerSelect
              label="Event type"
              value={eventType}
              options={EVENT_TYPES}
              disabled={disabled}
              onChange={setEventType}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <span className="eyebrow">Event date</span>
          <div className="studio-date-field mt-2">
            <InquiryDatePicker
              compact
              withTime={false}
              value={eventDate}
              disabled={disabled || dateTbd}
              placeholder="Select a date"
              onChange={(next) => {
                setEventDate(next);
                setDateTbd(false);
                setDateError("");
              }}
            />
            <button
              type="button"
              className={cn("studio-date-tbd", dateTbd && "is-on")}
              disabled={disabled}
              onClick={() => {
                setDateTbd((current) => {
                  const next = !current;
                  if (next) setEventDate(null);
                  return next;
                });
                setDateError("");
              }}
            >
              date is still tbd
            </button>
          </div>
          {dateError ? <span className="mt-1.5 block text-xs text-muted-foreground">{dateError}</span> : null}
        </div>
        <Field label="Venue or neighborhood" hint="Optional if undecided">
          <input className={inputClass} name="venue_text" maxLength={240} />
        </Field>
        <Field label="Estimated guest count" hint="Optional">
          <input className={inputClass} name="guest_count" type="number" min={0} max={100000} />
        </Field>
        <div>
          <span className="eyebrow">Budget range</span>
          <div className="mt-2">
            <StudioDrawerSelect
              label="Budget range"
              value={budgetRange}
              placeholder="Select a range"
              options={BUDGET_RANGES}
              disabled={disabled}
              onChange={(next) => {
                setBudgetRange(next);
                setBudgetError("");
              }}
            />
          </div>
          {budgetError ? <span className="mt-1.5 block text-xs text-muted-foreground">{budgetError}</span> : null}
        </div>
      </div>

      <Field label="Tell us about the vision">
        <textarea
          className={`${inputClass} min-h-36 resize-y`}
          name="message"
          maxLength={6000}
          required
        />
      </Field>

      <div className="pt-1">
        <SoftButton
          type="submit"
          variant="primary"
          disabled={disabled}
          className="w-full sm:w-auto"
        >
          {disabled ? "Saving…" : submitLabel}
        </SoftButton>
      </div>
    </form>
  );
}
