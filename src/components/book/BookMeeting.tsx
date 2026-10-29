import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { ChevronLeft, ChevronRight, Globe, Instagram, X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SIGNATURE_LINKS } from "@/lib/os/mail-signature";

import {
  DEFAULT_CALENDAR,
  hasLocalCalendar,
  meetingLabel,
  readLocalCalendar,
  type CalendarSettings,
} from "@/lib/calendar-settings";
import { getCalendarSettings } from "@/lib/os/calendar-settings.functions";
import { listMeetingBusy } from "@/lib/os/bookings.functions";
import {
  bookingWindow,
  daySlots,
  isBookableDay,
  isStudioToday,
  monthCells,
  readBookings,
  rememberBooking,
  type StudioBooking,
} from "@/lib/studio-bookings";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["s", "m", "t", "w", "t", "f", "s"];

export function BookMeeting({
  onBooked,
}: {
  onBooked?: (booking: StudioBooking) => void | Promise<void>;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [booked, setBooked] = useState<StudioBooking | null>(null);
  const [localSettings, setLocalSettings] = useState<CalendarSettings | null>(null);

  const fetchBusy = useServerFn(listMeetingBusy);
  const fetchSettings = useServerFn(getCalendarSettings);
  const { data: availability } = useQuery({
    queryKey: ["meeting-busy"],
    queryFn: () => fetchBusy(),
  });
  const { data: remoteSettings } = useQuery({
    queryKey: ["calendar-settings"],
    queryFn: () => fetchSettings().catch(() => null),
  });
  useEffect(() => {
    setLocalSettings(hasLocalCalendar() ? readLocalCalendar() : null);
  }, []);
  const settings = localSettings ?? remoteSettings ?? DEFAULT_CALENDAR;
  const windows = useMemo(() => {
    const local = readBookings().map((row) => ({
      start: row.startsAt,
      end: new Date(
        new Date(row.startsAt).getTime() + settings.durationMinutes * 60 * 1000,
      ).toISOString(),
    }));
    return [...(availability?.busy ?? []), ...local];
    // a new booking lands in this browser's store, so it re-reads the store when one is made
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability?.busy, booked, settings.durationMinutes]);
  const cells = monthCells(cursor);
  const slots = day ? daySlots(day, new Set(), windows, settings) : [];
  const month = cursor
    .toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toLowerCase();

  const timesRef = useRef<HTMLDivElement>(null);

  function chooseDay(next: Date) {
    setDay(next);
    setSlot(null);
    // on a phone the times sit below the month; bring them up once a day is picked
    window.requestAnimationFrame(() => {
      const list = timesRef.current;
      if (!list) return;
      const box = list.getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= window.innerHeight) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      list.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    });
  }

  const times = <Times listRef={timesRef} day={day} slots={slots} slot={slot} onSlot={setSlot} />;

  return (
    <div className="book-stage">
      <section className="book-meet is-fill" aria-label="schedule a meeting">
        <div className="book-meet-intro">
          <p className="studio-kicker">say sukii</p>
          <h1>let’s talk</h1>
          <p className="book-meet-length">
            {settings.durationMinutes} minutes · {meetingLabel(settings.meeting)}
          </p>
          <MeetingCopy />
          <div className="book-meet-social">
            <a href={SIGNATURE_LINKS.site} aria-label="website" target="_blank" rel="noreferrer">
              <Globe aria-hidden="true" strokeWidth={1.5} />
            </a>
            <a
              href={SIGNATURE_LINKS.instagram}
              aria-label="instagram"
              target="_blank"
              rel="noreferrer"
            >
              <Instagram aria-hidden="true" strokeWidth={1.5} />
            </a>
          </div>
        </div>

        <Month
          month={month}
          cells={cells}
          day={day}
          settings={settings}
          onCursor={(amount) => setCursor(shiftMonth(cursor, amount))}
          onDay={chooseDay}
        />
        {times}
      </section>
      <Dialog
        open={slot !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSlot(null);
            setBooked(null);
            setName("");
            setEmail("");
            setNote("");
          }
        }}
      >
        <DialogContent
          overlayClassName="studio-task-veil"
          className={cn("studio-task-modal is-ask is-soft book-meet-dialog", booked && "is-booked")}
          hideClose
        >
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">
            {booked ? "you're booked" : "book this time"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {booked
              ? "booked with sukii."
              : `${settings.durationMinutes} minute ${meetingLabel(settings.meeting)}. name and email are required.`}
          </DialogDescription>
          {booked ? (
            <BookedNote
              booking={booked}
              minutes={settings.durationMinutes}
              meeting={settings.meeting}
            />
          ) : null}
          {slot && !booked ? (
            <form
              className="studio-task-form"
              onSubmit={(event) => {
                event.preventDefault();
                const guest = name.trim();
                const address = email.trim();
                if (!guest || !address) return;
                const booking = rememberBooking({
                  startsAt: slot,
                  name: guest,
                  email: address,
                  note: note.trim(),
                });
                setBooked(booking);
                void onBooked?.(booking);
              }}
            >
              <div className="book-ask-time">
                <p className="studio-ask-hint is-when">
                  {bookingWindow(slot, settings.durationMinutes)}
                </p>
                <p className="studio-ask-hint">
                  {settings.durationMinutes} minutes · {meetingLabel(settings.meeting)}
                </p>
              </div>
              <label className="studio-ask-field">
                <span className="studio-ask-label">
                  name
                  <span className="studio-ask-required" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  required
                  autoFocus
                  value={name}
                  autoComplete="name"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="studio-ask-field">
                <span className="studio-ask-label">
                  email
                  <span className="studio-ask-required" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  required
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="studio-ask-field">
                <span className="studio-ask-label is-prompt">
                  Please share anything that will help prepare for our meeting.
                </span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <div className="studio-ask-foot">
                <button type="submit" className="studio-today-go">
                  book this time
                </button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Month({
  month,
  cells,
  day,
  settings,
  onCursor,
  onDay,
}: {
  month: string;
  cells: Array<Date | null>;
  day: Date | null;
  settings: CalendarSettings;
  onCursor: (amount: number) => void;
  onDay: (day: Date) => void;
}) {
  return (
    <div className="book-meet-month">
      <div className="book-meet-nav">
        <button type="button" aria-label="previous month" onClick={() => onCursor(-1)}>
          <ChevronLeft aria-hidden="true" strokeWidth={1.5} />
        </button>
        <b>{month}</b>
        <button type="button" aria-label="next month" onClick={() => onCursor(1)}>
          <ChevronRight aria-hidden="true" strokeWidth={1.5} />
        </button>
      </div>
      <div className="book-meet-week" aria-hidden="true">
        {WEEKDAYS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="book-meet-days">
        {cells.map((cell, index) => {
          if (!cell) return <span key={`empty-${index}`} />;
          const open = isBookableDay(cell, settings);
          const selected = day ? sameDay(cell, day) : false;
          const today = isStudioToday(cell);
          return (
            <button
              key={cell.toISOString()}
              type="button"
              disabled={!open}
              aria-current={today ? "date" : undefined}
              className={cn(selected && "is-on", today && "is-today")}
              onClick={() => onDay(cell)}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Times({
  day,
  slots,
  slot,
  onSlot,
  listRef,
}: {
  day: Date | null;
  slots: Array<{ startsAt: string; label: string }>;
  slot: string | null;
  onSlot: (value: string) => void;
  listRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={listRef} className="book-meet-times">
      {!day ? <p>pick a day</p> : null}
      {day && slots.length === 0 ? <p>nothing open that day</p> : null}
      {slots.map((item) => (
        <button
          key={item.startsAt}
          type="button"
          className={cn(slot === item.startsAt && "is-on")}
          onClick={() => onSlot(item.startsAt)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function BookedNote({
  booking,
  minutes,
  meeting,
}: {
  booking: StudioBooking;
  minutes: number;
  meeting: CalendarSettings["meeting"];
}) {
  return (
    <div className="book-booked" role="status" tabIndex={-1}>
      <svg className="book-booked-mark" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="23" />
        <path d="M16 27.2 23 34 36.5 19.5" />
      </svg>
      <h2>you’re booked</h2>
      <p className="book-booked-with">with sukii</p>
      <p className="book-meet-when">{bookingWindow(booking.startsAt, minutes)}</p>
      <p className="book-meet-sent">
        {minutes} minutes · {meetingLabel(meeting)}
      </p>
      <p className="book-meet-sent">a note is on its way to {booking.email}</p>
    </div>
  );
}

function MeetingCopy() {
  return (
    <div className="book-meet-copy">
      <p>thank you for making time. looking forward to connecting with you soon! {"<3"}</p>
      <p>
        if this is an event or wedding -- in our initial consultation, we will discuss your overall
        vision and needs to follow up with an accurate proposal quote.
      </p>
      <p>
        please have any inspiration images you have readily available for our meeting. you may also
        email them to <a href="mailto:info@saysukii.com">info@saysukii.com</a>.
      </p>
    </div>
  );
}

function shiftMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
