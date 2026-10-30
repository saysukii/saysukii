export type StudioNotice = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  toasted: boolean;
  href?: string;
};

export function changeRequestedLine(contactName: string | null | undefined) {
  const first = contactName?.trim().split(/\s+/)[0];
  return first ? `${first} requested a change` : "a change was requested";
}

const KEY = "say-sukii-studio-notices";
// every notice this browser has had, even one cleared from the bell, so it never comes back
const SEEN_KEY = "say-sukii-studio-notices-seen";
const EVENT = "say-sukii-notice";

function readSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function remember(ids: string[]) {
  const seen = readSeen();
  const fresh = ids.filter((id) => !seen.includes(id));
  if (!fresh.length) return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...fresh, ...seen].slice(0, 400)));
  } catch {
    // nothing to remember it in
  }
}

function read(): StudioNotice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StudioNotice[]) : [];
  } catch {
    return [];
  }
}

function write(notices: StudioNotice[]) {
  remember(notices.map((notice) => notice.id));
  localStorage.setItem(KEY, JSON.stringify(notices.slice(0, 40)));
  window.dispatchEvent(new Event(EVENT));
}

export function readNotices() {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** whether this browser has had the notice, so a moment isn't celebrated twice */
export function hasNotice(id: string) {
  return read().some((notice) => notice.id === id) || readSeen().includes(id);
}

export function pushNotice(input: {
  id?: string;
  title: string;
  body: string;
  href?: string;
  /** already shown some other way, like the booking's glitter, so it doesn't toast again */
  toasted?: boolean;
}) {
  const current = read();
  // one already here, or one cleared from the bell, isn't shown again
  if (input.id && hasNotice(input.id)) return;
  const notice: StudioNotice = {
    id: input.id ?? crypto.randomUUID(),
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
    read: false,
    toasted: input.toasted ?? false,
    ...(input.href ? { href: input.href } : {}),
  };
  write([notice, ...current]);
  return notice;
}

export function markNoticeToasted(id: string) {
  write(read().map((notice) => (notice.id === id ? { ...notice, toasted: true } : notice)));
}

export function dismissNotice(id: string) {
  write(read().filter((notice) => notice.id !== id));
}

export function markNoticesRead() {
  write(read().map((notice) => ({ ...notice, read: true, toasted: true })));
}

export const STUDIO_NOTICE_EVENT = EVENT;
