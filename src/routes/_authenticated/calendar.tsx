import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ScheduleDesk } from "@/components/portal/ScheduleDesk";
import { getDevPreviewAppointments, getDevPreviewPipeline } from "@/lib/dev-preview";
import { listAppointments, listStudioCalendarEvents, getGranolaStatus, getGranolaStatusDev } from "@/lib/os/bookings.functions";
import { EVENT_LABEL } from "@/lib/os/inquiry-desk";
import { listInquiryPipeline } from "@/lib/os/inquiries.functions";
import { readBookings, type MeetingBrief, type StudioBooking } from "@/lib/studio-bookings";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Schedule — Say Sukii OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const fetchAppointments = useServerFn(listAppointments);
  const fetchGoogleEvents = useServerFn(listStudioCalendarEvents);
  const fetchGranola = useServerFn(getGranolaStatus);
  const fetchGranolaDev = useServerFn(getGranolaStatusDev);
  const fetchInquiries = useServerFn(listInquiryPipeline);

  const { data: bookings = [], isPending } = useQuery({
    queryKey: ["os", "appointments", devPreview],
    enabled: isAdmin,
    queryFn: async () => {
      const local = readBookings();
      if (devPreview) {
        const google = await googleBookings(fetchGoogleEvents);
        const preview = getDevPreviewAppointments();
        const seen = new Set(preview.map((row) => `${row.startsAt}|${row.email.toLowerCase()}`));
        const googleFresh = google.filter((row) => !seen.has(`${row.startsAt}|${row.email.toLowerCase()}`));
        return [...preview, ...googleFresh, ...local.filter((row) => !seen.has(`${row.startsAt}|${row.email.toLowerCase()}`))].sort(
          byStart,
        );
      }
      try {
        const remote = await fetchAppointments();
        const seen = new Set(remote.map((row) => row.starts_at));
        const extra = local.filter((row) => !seen.has(row.startsAt));
        return [
          ...remote.map((row) => ({
            id: row.id,
            startsAt: row.starts_at,
            name: row.guest_name,
            email: row.guest_email,
            note: row.note ?? "",
            allDay: row.all_day,
            ...(row.join_url ? { joinUrl: row.join_url } : {}),
          })),
          ...extra,
        ].sort(byStart);
      } catch {
        const google = await googleBookings(fetchGoogleEvents);
        const seen = new Set(google.map((row) => row.startsAt));
        return [...google, ...local.filter((row) => !seen.has(row.startsAt))].sort(byStart);
      }
    },
  });

  const { data: briefs = [] } = useQuery({
    queryKey: ["os", "meeting-briefs", devPreview],
    enabled: isAdmin,
    queryFn: async () => meetingBriefs(devPreview ? getDevPreviewPipeline() : await fetchInquiries()),
  });

  const granola = useQuery({
    queryKey: ["os", "granola", devPreview],
    enabled: isAdmin,
    queryFn: async () => {
      const status = await (devPreview ? fetchGranolaDev() : fetchGranola());
      return status.connected;
    },
  });
  const granolaConnected = granola.isFetched ? (granola.data ?? false) : null;

  if (!isAdmin) {
    return (
      <div className="studio-home is-book">
        <p className="studio-pearl-note">the schedule is for studio admins.</p>
      </div>
    );
  }

  return <ScheduleDesk bookings={bookings} briefs={briefs} pending={isPending} granolaConnected={granolaConnected} />;
}

function meetingBriefs(
  rows: Array<{
    status: string;
    received_at: string;
    slug: string;
    event_type: keyof typeof EVENT_LABEL;
    event_date: string | null;
    event_date_tbd: boolean;
    venue_text: string | null;
    message: string | null;
    summary_text: string | null;
    client: { email: string | null } | null;
  }>,
): MeetingBrief[] {
  const ranked = rows
    .filter((row) => row.status !== "closed" && row.client?.email)
    .sort((left, right) => right.received_at.localeCompare(left.received_at));
  const seen = new Set<string>();
  const briefs: MeetingBrief[] = [];
  for (const row of ranked) {
    const email = row.client?.email?.toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const when = row.event_date_tbd
      ? ""
      : row.event_date
        ? new Date(`${row.event_date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" }).toLowerCase()
        : "";
    briefs.push({
      email,
      slug: row.slug,
      line: [EVENT_LABEL[row.event_type], row.venue_text?.split(",")[0]?.trim().toLowerCase(), when]
        .filter(Boolean)
        .join(" · "),
      words: inquiryWords(row.summary_text || row.message),
    });
  }
  return briefs;
}

function inquiryWords(value: string | null) {
  if (!value) return "";
  const words = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(size|time|recipient):/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (words.length <= 160) return words;
  const cut = words.slice(0, 160);
  const stop = cut.lastIndexOf(" ");
  return `${(stop > 80 ? cut.slice(0, stop) : cut).trim()}…`;
}

function byStart(left: StudioBooking, right: StudioBooking) {
  return left.startsAt.localeCompare(right.startsAt);
}

async function googleBookings(
  fetchGoogleEvents: () => Promise<Array<{ id: string; startsAt: string; name: string; allDay: boolean; joinUrl: string | null }>>,
) {
  return fetchGoogleEvents()
    .then((events) =>
      events.map((event) => ({
        id: event.id,
        startsAt: event.startsAt,
        name: event.name,
        email: "",
        note: "google calendar",
        allDay: event.allDay,
        ...(event.joinUrl ? { joinUrl: event.joinUrl } : {}),
      })),
    )
    .catch(() => []);
}
