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
import {
  bookingWindow,
  MEETING_CAPTURES_CHANGED,
  readMeetingCaptures,
  scheduleMeetingUrl,
  writeMeetingCapture,
  studioClock,
  studioDay,
  type MeetingBrief,
  type MeetingCapture,
  type StudioBooking,
} from "@/lib/studio-bookings";
import {
  checkAgain,
  foundSummary,
  shouldLookOnOpen,
  startWaiting,
  summaryStatus,
} from "@/lib/meeting-summary";
import { checkMeetingSummary } from "@/lib/os/bookings.functions";
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
  const [captures, setCaptures] = useState<Record<string, MeetingCapture>>({});

  useEffect(() => {
    setMinutes(readLocalCalendar().durationMinutes);
    setCaptures(readMeetingCaptures());
    const sync = () => setCaptures(readMeetingCaptures());
    window.addEventListener(MEETING_CAPTURES_CHANGED, sync);
    return () => window.removeEventListener(MEETING_CAPTURES_CHANGED, sync);
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
                capture={captures[open.id]}
                granolaConnected={granolaConnected}
                onBack={() => setOpenId(null)}
                onCapture={(capture) => writeMeetingCapture(open.id, capture)}
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

/**
 * Opens a new note in the granola app on this computer, and asks it to start transcribing. The
 * link comes from the app itself rather than granola's docs, so a granola update could change it;
 * the summary still comes back either way if the call is recorded there.
 */
const GRANOLA_NEW_NOTE = "granola://new-document?creation_source=say_sukii_os&auto_transcribe=1";

function openInGranola() {
  const link = document.createElement("a");
  link.href = GRANOLA_NEW_NOTE;
  link.click();
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
  capture,
  granolaConnected,
  onBack,
  onCapture,
}: {
  booking: StudioBooking;
  minutes: number;
  brief: MeetingBrief | null;
  capture?: MeetingCapture | undefined;
  granolaConnected: boolean | null;
  onBack: () => void;
  onCapture: (capture: MeetingCapture) => void;
}) {
  const status = summaryStatus(capture);
  const lookForSummary = useServerFn(checkMeetingSummary);
  const meeting = { name: booking.name, email: booking.email, startsAt: booking.startsAt };

  // a call recorded straight in granola arrives too, without pressing anything here
  useEffect(() => {
    if (!granolaConnected || !shouldLookOnOpen(capture, booking, Date.now())) return;
    let stop = false;
    lookForSummary({ data: { ...meeting, startedAt: booking.startsAt } })
      .then(({ summary }) => {
        if (!stop && summary) onCapture(foundSummary(meeting, summary));
      })
      .catch(() => {
        // nothing to show yet; it can be opened in granola as usual
      });
    return () => {
      stop = true;
    };
    // once for each meeting opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id, granolaConnected]);

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
      <div className="studio-meet-go">
        {joinUrl ? (
          <a className="studio-today-go" href={joinUrl} target="_blank" rel="noreferrer">
            join
          </a>
        ) : null}
        {status === "none" || status === "not_found" ? (
          <button
            type="button"
            className="studio-today-go is-pearl"
            title="studio intelligence"
            onClick={() => {
              if (granolaConnected == null) return;
              if (!granolaConnected) {
                toast(
                  "granola isn't connected, so summaries can't come back. connect it in settings.",
                );
                return;
              }
              openInGranola();
              onCapture(startWaiting(meeting, Date.now()));
            }}
          >
            <span className="studio-summary-mark" aria-hidden="true" />
            open in granola
          </button>
        ) : null}
      </div>
      {status === "creating" ? (
        <div className="studio-meet-notes">
          <p className="studio-home-label">summary</p>
          <p className="studio-meet-summary is-creating" role="status">
            <span className="studio-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            recording happens in granola. your summary will appear here once it's done.
          </p>
        </div>
      ) : null}
      {status === "ready" ? (
        <div className="studio-meet-notes">
          <p className="studio-home-label">summary</p>
          <p className="studio-meet-summary">{capture?.summary}</p>
        </div>
      ) : null}
      {status === "not_found" ? (
        <div className="studio-meet-notes">
          <p className="studio-home-label">summary</p>
          <p className="studio-meet-summary">
            no summary from granola yet. check that it recorded this call, and that the key in
            settings can see its notes.
          </p>
          {capture?.startedAt ? (
            <button
              type="button"
              className="studio-ghost"
              onClick={() => onCapture(checkAgain(capture, Date.now()))}
            >
              check again
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

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
