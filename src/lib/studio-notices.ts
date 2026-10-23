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
const EVENT = "say-sukii-notice";

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
  localStorage.setItem(KEY, JSON.stringify(notices.slice(0, 40)));
  window.dispatchEvent(new Event(EVENT));
}

export function readNotices() {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function pushNotice(input: { id?: string; title: string; body: string; href?: string }) {
  const current = read();
  if (input.id && current.some((notice) => notice.id === input.id)) {
    return current.find((notice) => notice.id === input.id) ?? current[0];
  }
  const notice: StudioNotice = {
    id: input.id ?? crypto.randomUUID(),
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
    read: false,
    toasted: false,
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
