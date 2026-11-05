import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CalendarHours } from "@/components/portal/CalendarHours";
import { BloomWait } from "@/components/portal/StudioLoader";
import { PersonName } from "@/components/studio/PersonName";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { readLocalCalendar } from "@/lib/calendar-settings";
import { getDevPreviewMeetingSummaries } from "@/lib/dev-preview-data";
import { summaryState } from "@/lib/meeting-summary";
import { checkMeetingSummary, listMeetingSummaries } from "@/lib/os/bookings.functions";
import {
  bookingWindow,
  scheduleMeetingUrl,
  studioClock,
  studioDay,
  type MeetingBrief,
  type StudioBooking,
} from "@/lib/studio-bookings";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";

export function ScheduleDesk({
  bookings,
  briefs,
  pending,
  granolaConnected,
}: {
  bookings: StudioBooking[];
  briefs: MeetingBrief[];
  pending: boolean;
  granolaConnected: boolean | null;
}) {
  const todayKey = studioDay(new Date().toISOString());
  const [cursor, setCursor] = useState(() => new Date());
  const [dayKey, setDayKey] = useState(todayKey);
  const [openId, setOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const devPreview = useDevPreview();
  const fetchSummaries = useServerFn(listMeetingSummaries);
  // granola's summaries come in on the server every five minutes, so the page keeps up with them
  const summaries = useQuery({
    queryKey: ["os", "meeting-summaries", devPreview],
    queryFn: () => (devPreview ? getDevPreviewMeetingSummaries() : fetchSummaries()),
    refetchInterval: 60_000,
  });
  const summaryByEvent = useMemo(
    () => new Map((summaries.data ?? []).map((row) => [row.eventId, row.summary])),
    [summaries.data],
  );

  useEffect(() => {
    setMinutes(readLocalCalendar().durationMinutes);
  }, []);

  const byDay = useMemo(() => {
    const groups = new Map<string, StudioBooking[]>();
    for (const booking of bookings) {
      const key = studioDay(booking.startsAt);
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(booking);
      groups.set(key, list);
    }
    for (const list of groups.values())
      list.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    return groups;
  }, [bookings]);

  const cells = useMemo(() => monthCells(cursor), [cursor]);
  const monthLabel = cursor
    .toLocaleString("en-US", { month: "long", year: "numeric" })
    .toLowerCase();
  const open = bookings.find((booking) => booking.id === openId) ?? null;
  const briefsByEmail = useMemo(() => {
    const map = new Map<string, MeetingBrief>();
    for (const brief of briefs) map.set(brief.email.toLowerCase(), brief);
    return map;
  }, [briefs]);
  const dayBookings = byDay.get(dayKey) ?? [];
  const dayLabel = labelDay(dayKey, todayKey);

  function chooseDay(key: string) {
    setDayKey(key);
    setOpenId(null);
  }

  function openMeeting(booking: StudioBooking) {
    const key = studioDay(booking.startsAt);
    if (key) {
      setDayKey(key);
      const date = new Date(`${key}T12:00:00`);
      setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    setOpenId(booking.id);
  }

  return (
    <div className="studio-home is-book">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">the book</p>
          <h1>schedule</h1>
          <p>the month, and the settings the letter offers.</p>
        </div>
        <div className="studio-home-hello-go">
          <button
            type="button"
            className="studio-today-go is-pearl"
            onClick={() => setSettingsOpen(true)}
          >
            settings
          </button>
          <button
            type="button"
            className="studio-today-go"
            onClick={async () => {
              await navigator.clipboard.writeText(scheduleMeetingUrl());
              setCopied(true);
              toast.success("link copied");
            }}
          >
            {copied ? "copied" : "copy link"}
          </button>
        </div>
      </header>

      <div className="studio-book-body studio-schedule-scroll">
        {pending ? <p className="studio-empty">gathering…</p> : null}
        <div className="studio-schedule">
          <section className="studio-agenda" aria-label="month">
            <div className="studio-cal-head">
              <button
                type="button"
                className="studio-cal-nav"
                aria-label="previous month"
                onClick={() =>
                  setCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                }
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <h2>{monthLabel}</h2>
              <button
                type="button"
                className="studio-cal-nav"
                aria-label="next month"
                onClick={() =>
                  setCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                }
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <div className="studio-agenda-week" aria-hidden="true">
              {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="studio-agenda-grid">
              {cells.map((date, index) => {
                if (!date) return <span key={`pad-${index}`} />;
                const key = cellKey(date);
                const items = byDay.get(key) ?? [];
                const shown = items.slice(0, 2);
                return (
                  <div
                    key={key}
                    className={cn(
                      "studio-agenda-day",
                      key === todayKey && "is-today",
                      key === dayKey && "is-on",
                    )}
                  >
                    <button
                      type="button"
                      className="studio-agenda-hit"
                      aria-pressed={key === dayKey}
                      aria-current={key === todayKey ? "date" : undefined}
                      onClick={() => chooseDay(key)}
                    >
                      <span className="studio-agenda-num">{date.getDate()}</span>
                    </button>
                    {shown.map((booking) =>
                      booking.inquirySlug ? (
                        <Link
                          key={booking.id}
                          to="/pipeline/$id"
                          params={{ id: booking.inquirySlug }}
                          className="studio-agenda-mark"
                        >
                          <em>accepted</em>
                          <span>
                            <PersonName name={booking.name} asTyped={!booking.email} />
                          </span>
                        </Link>
                      ) : (
                        <button
                          key={booking.id}
                          type="button"
                          className={cn("studio-agenda-mark", booking.id === openId && "is-on")}
                          onClick={() => openMeeting(booking)}
                        >
                          <em>{booking.allDay ? "all day" : studioClock(booking.startsAt)}</em>
                          <span>
                            <PersonName name={booking.name} asTyped={!booking.email} />
                          </span>
                        </button>
                      ),
                    )}
                    {items.length > shown.length ? (
                      <button
                        type="button"
                        className="studio-agenda-more"
                        onClick={() => chooseDay(key)}
                      >
                        +{items.length - shown.length}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="studio-schedule-side">
            {open ? (
              <MeetingRecord
                booking={open}
                minutes={minutes}
                brief={briefsByEmail.get(open.email.toLowerCase()) ?? null}
                summary={summaryByEvent.get(open.id) ?? null}
                summariesLoaded={summaries.isFetched}
                granolaConnected={granolaConnected}
                onBack={() => setOpenId(null)}
              />
            ) : (
              <DayList label={dayLabel} bookings={dayBookings} onOpen={openMeeting} />
            )}
          </aside>
        </div>
      </div>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          overlayClassName="studio-task-veil"
          className="studio-task-modal is-ask is-soft is-split is-settings"
          hideClose
        >
          <div className="studio-task-head is-ask">
            <DialogTitle>settings</DialogTitle>
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            weekly hours, meeting length, notice, buffer, and how many meetings a day.
          </DialogDescription>
          {settingsOpen ? (
            <CalendarHours
              onSaved={() => {
                setMinutes(readLocalCalendar().durationMinutes);
                setSettingsOpen(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DayList({
  label,
  bookings,
  onOpen,
}: {
  label: string;
  bookings: StudioBooking[];
  onOpen: (booking: StudioBooking) => void;
}) {
  return (
    <section className="studio-schedule-day">
      <p className="studio-home-label">{label}</p>
      {bookings.length === 0 ? <p className="studio-empty">nothing booked.</p> : null}
      <div className="studio-directory">
        {bookings.map((booking) =>
          booking.inquirySlug ? (
            <Link
              key={booking.id}
              to="/pipeline/$id"
              params={{ id: booking.inquirySlug }}
              className="studio-book-row"
            >
              <span>
                <b>
                  <PersonName name={booking.name} asTyped={!booking.email} />
                </b>
                <em>accepted inquiry</em>
              </span>
              <small>all day</small>
            </Link>
          ) : (
            <button
              key={booking.id}
              type="button"
              className="studio-book-row"
              onClick={() => onOpen(booking)}
            >
              <span>
                <b>
                  <PersonName name={booking.name} asTyped={!booking.email} />
                </b>
                <em>{booking.note || booking.email}</em>
              </span>
              <small>{booking.allDay ? "all day" : studioClock(booking.startsAt)}</small>
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function MeetingRecord({
  booking,
  minutes,
  brief,
  summary,
  summariesLoaded,
  granolaConnected,
  onBack,
}: {
  booking: StudioBooking;
  minutes: number;
  brief: MeetingBrief | null;
  summary: string | null;
  summariesLoaded: boolean;
  granolaConnected: boolean | null;
  onBack: () => void;
}) {
  const devPreview = useDevPreview();
  const queryClient = useQueryClient();
  const lookNow = useServerFn(checkMeetingSummary);
  const [looking, setLooking] = useState(false);
  const state = summaryState({
    startsAt: booking.startsAt,
    allDay: booking.allDay,
    summary,
    granolaConnected,
    now: Date.now(),
  });

  async function look() {
    if (devPreview) return;
    setLooking(true);
    try {
      await lookNow({ data: { eventId: booking.id } });
      await queryClient.invalidateQueries({ queryKey: ["os", "meeting-summaries"] });
    } catch {
      // the sync tries again every five minutes
    } finally {
      setLooking(false);
    }
  }

  // an older call, or one the sync hasn't reached yet, is looked for as soon as it's opened
  useEffect(() => {
    if (!summariesLoaded || (state !== "waiting" && state !== "missing")) return;
    void look();
    // once for each meeting opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id, summariesLoaded]);

  const joinUrl = meetingJoinUrl(booking.joinUrl);

  return (
    <section className="studio-meet">
      <button type="button" className="studio-ghost" onClick={onBack}>
        back
      </button>
      <h2>
        <PersonName name={booking.name} asTyped={!booking.email} />
      </h2>
      <p className="studio-meet-when">{meetingWhen(booking, minutes)}</p>
      {brief ? (
        <Link to="/pipeline/$id" params={{ id: brief.slug }} className="studio-meet-brief">
          <b>{brief.line}</b>
          {brief.words ? <span>{brief.words}</span> : null}
        </Link>
      ) : booking.email ? (
        <p className="studio-meet-meta">{booking.email}</p>
      ) : null}
      {joinUrl ? (
        <div className="studio-meet-go">
          <a className="studio-today-go" href={joinUrl} target="_blank" rel="noreferrer">
            join
          </a>
        </div>
      ) : null}
      {state === "none" ? null : (
        <div className="studio-meet-notes">
          <p className="studio-home-label">summary</p>
          {state === "ready" ? (
            <p className="studio-meet-summary">{summary}</p>
          ) : (
            <p className="studio-meet-summary is-creating" role="status">
              {looking ? "looking in granola…" : SUMMARY_WORDS[state]}
            </p>
          )}
          {state === "missing" && !looking ? (
            <button type="button" className="studio-ghost" onClick={() => void look()}>
              check again
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

const SUMMARY_WORDS = {
  waiting: "granola's summary shows here a few minutes after the call ends.",
  missing:
    "no summary from granola for this call. check that granola recorded it, and that the key in settings is the admin's.",
  unconnected: "connect granola in settings to bring in this call's summary.",
} as const;

function meetingJoinUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function meetingWhen(booking: StudioBooking, minutes: number) {
  if (!booking.allDay) return bookingWindow(booking.startsAt, minutes);
  const day = new Date(booking.startsAt)
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
    })
    .toLowerCase();
  return `${day} · all day`;
}

function monthCells(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startPad = first.getDay();
  const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: startPad }, () => null);
  for (let day = 1; day <= days; day += 1)
    cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), day));
  while (cells.length % 7) cells.push(null);
  return cells;
}

function cellKey(date: Date) {
  return studioDay(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString());
}

function labelDay(key: string, todayKey: string) {
  if (!key) return "day";
  if (key === todayKey) return "today";
  const date = new Date(`${key}T12:00:00`);
  return date
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toLowerCase();
}
