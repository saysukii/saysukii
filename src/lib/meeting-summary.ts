import type { MeetingCapture } from "@/lib/studio-bookings";

/**
 * The call is recorded in the granola app. Granola only shares a note once its summary is written,
 * so the studio simply keeps looking until it appears.
 */
export const SUMMARY_CHECK_MS = 30_000;
/** long enough for a long call and its summary, even if granola was opened well ahead */
export const SUMMARY_GIVE_UP_MS = 4 * 60 * 60 * 1000;

export type SummaryStatus = "none" | "creating" | "ready" | "not_found";

export type MeetingDetails = { name: string; email: string; startsAt: string };

export function summaryStatus(capture: MeetingCapture | undefined): SummaryStatus {
  if (!capture?.done) return "none";
  if (capture.status) return capture.status;
  // a meeting saved before summaries were looked up
  return capture.summary ? "ready" : "not_found";
}

/** Granola has been opened for this meeting, so the studio starts waiting for its summary. */
export function startWaiting(meeting: MeetingDetails, now: number): MeetingCapture {
  const at = new Date(now).toISOString();
  return {
    ...meeting,
    done: true,
    status: "creating",
    summary: "",
    startedAt: at,
    waitingSince: at,
  };
}

/** A call recorded straight in granola, found when its meeting is opened here. */
export function foundSummary(meeting: MeetingDetails, summary: string): MeetingCapture {
  return { ...meeting, done: true, status: "ready", summary, startedAt: meeting.startsAt };
}

/** What a meeting becomes after a look at granola. */
export function afterCheck(
  capture: MeetingCapture,
  summary: string | null,
  now: number,
): MeetingCapture {
  if (summary) return { ...capture, status: "ready", summary };
  const since = capture.waitingSince ? Date.parse(capture.waitingSince) : 0;
  if (now - since >= SUMMARY_GIVE_UP_MS) return { ...capture, status: "not_found" };
  return capture;
}

export function checkAgain(capture: MeetingCapture, now: number): MeetingCapture {
  return { ...capture, status: "creating", waitingSince: new Date(now).toISOString() };
}

/** Whether to look for a summary when a meeting is opened, in case it was recorded straight in granola. */
export function shouldLookOnOpen(
  capture: MeetingCapture | undefined,
  meeting: { startsAt: string; allDay?: boolean | undefined },
  now: number,
) {
  if (meeting.allDay || summaryStatus(capture) !== "none") return false;
  const starts = Date.parse(meeting.startsAt);
  return !Number.isNaN(starts) && starts <= now;
}
