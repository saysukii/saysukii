/** how long after a call starts its summary is still expected, before saying none came */
export const SUMMARY_EXPECTED_MS = 12 * 60 * 60 * 1000;

export type SummaryState = "none" | "ready" | "waiting" | "missing" | "unconnected";

/** What a meeting on the schedule shows about its granola summary. */
export function summaryState(meeting: {
  startsAt: string;
  allDay?: boolean | undefined;
  summary: string | null;
  granolaConnected: boolean | null;
  now: number;
}): SummaryState {
  if (meeting.summary?.trim()) return "ready";
  const starts = Date.parse(meeting.startsAt);
  if (meeting.allDay || Number.isNaN(starts) || starts > meeting.now) return "none";
  if (meeting.granolaConnected === null) return "none";
  if (!meeting.granolaConnected) return "unconnected";
  return meeting.now - starts < SUMMARY_EXPECTED_MS ? "waiting" : "missing";
}
