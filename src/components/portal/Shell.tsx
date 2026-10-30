import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouteContext, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, ChevronDown, Menu, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "./bits";
import { celebrateBooking } from "@/components/portal/BookingCelebration";
import { BloomPass, loginBloomArmed } from "@/components/portal/StudioLoader";
import { PersonName } from "@/components/studio/PersonName";
import { firstName } from "@/lib/os/connect-letter";
import { recordSlug } from "@/lib/os/inquiry-desk";
import { listFreshArrivals, syncStudioInbox } from "@/lib/os/inquiries.functions";
import { listFreshBookings } from "@/lib/os/bookings.functions";
import { listFreshPayments } from "@/lib/os/proposals.functions";
import { listRecentIssues } from "@/lib/os/settings.functions";
import { getDevPreviewSettings } from "@/lib/dev-preview";
import { formatDateNumeric, formatMoneyExact } from "@/lib/money";
import { PREVIEW_ARRIVALS_KEY } from "@/lib/preview-arrivals";
import { fentyDemoProposal, onPreviewProposalsChange } from "@/lib/preview-proposals";
import {
  dismissNotice,
  hasNotice,
  markNoticeToasted,
  markNoticesRead,
  pushNotice,
  readNotices,
  STUDIO_NOTICE_EVENT,
  type StudioNotice,
} from "@/lib/studio-notices";

type NavItem = {
  to: string;
  label: string;
};

const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "today" },
  { to: "/pipeline", label: "inquiries" },
  { to: "/calendar", label: "schedule" },
  { to: "/library", label: "library" },
];

const TEAM_NAV = ADMIN_NAV.filter(({ label }) => label === "today");

function PrimaryNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav aria-label="Primary" className="studio-pearl-nav">
      {items.map(({ to, label }) => {
        const onLibrary =
          to === "/library" &&
          (pathname === "/library" ||
            pathname.startsWith("/directories") ||
            pathname.startsWith("/files"));
        return (
          <Link
            key={to}
            to={to as "/dashboard"}
            onClick={onNavigate}
            activeOptions={{ exact: to === "/dashboard" || to === "/library" }}
            activeProps={{ className: "is-on" }}
            className={onLibrary ? "is-on" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// the inquiry desk keeps one page while a lead is picked, so its leads share a key
function risePageKey(pathname: string) {
  return pathname.startsWith("/pipeline") ? "/pipeline" : pathname;
}

function usePageRise() {
  const mainRef = useRef<HTMLElement>(null);
  const pageKey = useRouterState({
    select: (state) => risePageKey((state.resolvedLocation ?? state.location).pathname),
  });

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rise = main.animate(
      [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 500, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    return () => rise.cancel();
  }, [pageKey]);

  return mainRef;
}

function bookedWhen(startsAt: string) {
  return new Date(startsAt)
    .toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    })
    .toLowerCase();
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const mainRef = usePageRise();
  const notices = useStudioNotices();
  const noticeModal = useNoticeModal(notices);
  const router = useRouter();
  const { user, profile, devPreview } = useRouteContext({ from: "/_authenticated" });
  const arrivals = useServerFn(listFreshArrivals);
  const bookings = useServerFn(listFreshBookings);
  const payments = useServerFn(listFreshPayments);
  const syncInbox = useServerFn(syncStudioInbox);
  const recentIssues = useServerFn(listRecentIssues);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!devPreview) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== PREVIEW_ARRIVALS_KEY) return;
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace"] });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [devPreview, queryClient]);

  useEffect(() => {
    if (!devPreview) return;
    pushNotice({
      id: "inquiry-arrived-camila",
      title: "Camila wrote in",
      body: "a new wedding inquiry is in the book.",
      href: "/pipeline/camilareyes",
    });
  }, [devPreview]);

  useEffect(() => {
    if (profile.role !== "admin") return;
    let stop = false;
    async function readInbox() {
      try {
        const result = await syncInbox();
        if (stop) return;
        if (result.inserted > 0 || result.candidates > 0 || result.attached > 0) {
          void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
          void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
          void queryClient.invalidateQueries({ queryKey: ["os", "inquiry-workspace"] });
        }
      } catch {
        // gmail can be quiet until it is connected
      }
    }
    void readInbox();
    // replies show within half a minute while the studio is open, and right away on coming back
    const timer = window.setInterval(() => void readInbox(), 30_000);
    const onReturn = () => {
      if (document.visibilityState === "visible") void readInbox();
    };
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [devPreview, profile.role, queryClient, syncInbox]);

  useEffect(() => {
    if (devPreview || profile.role !== "admin") return;
    let stop = false;
    async function look() {
      try {
        const rows = await arrivals();
        if (stop) return;
        for (const row of rows) {
          const who = firstName(row.name);
          pushNotice({
            id: `inquiry-${row.id}`,
            title: `${who} wrote in`,
            body: "a new inquiry is in the book.",
            href: `/pipeline/${recordSlug(row.name)}`,
          });
        }
        const paid = await payments();
        if (stop) return;
        for (const row of paid) {
          const id = `payment-${row.id}`;
          // a new booking gets the glitter; the bell keeps the note
          const celebrate = row.first && !hasNotice(id);
          pushNotice({
            id,
            title: row.first
              ? `${firstName(row.name)} paid · the project is booked`
              : `${firstName(row.name)} paid the balance`,
            body: row.inFull ? "paid in full." : "the deposit is in.",
            href: row.inquiryId ? `/pipeline/${row.inquiryId}` : "/pipeline",
            toasted: celebrate,
          });
          if (celebrate) {
            celebrateBooking("rain", {
              name: row.name,
              paid: `${formatMoneyExact(row.amountCents)} ${row.inFull ? "paid in full" : "deposit"}`,
              eventDate: row.eventDate ? formatDateNumeric(row.eventDate) : null,
              onOpen: () =>
                void router.navigate(
                  row.inquiryId
                    ? { to: "/pipeline/$id", params: { id: row.inquiryId } }
                    : { to: "/pipeline" },
                ),
            });
          }
        }
        const booked = await bookings();
        if (stop) return;
        for (const row of booked) {
          pushNotice({
            id: `booking-${row.id}`,
            title: `${firstName(row.guest_name)} booked a call`,
            body: bookedWhen(row.starts_at),
            href: "/calendar",
          });
        }
      } catch {
        // the book can be quiet if the studio cannot reach it
      }
    }
    void look();
    const timer = window.setInterval(() => void look(), 20_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [arrivals, bookings, devPreview, payments, profile.role, router]);

  // locally, paying the fenty demo is a new booking too
  useEffect(() => {
    if (!devPreview) return;
    const check = () => {
      const demo = fentyDemoProposal();
      if (!demo.paid || !demo.paidAt) return;
      const id = `payment-fenty-demo-${demo.paidAt}`;
      if (hasNotice(id)) return;
      pushNotice({
        id,
        title: `${firstName(demo.clientName)} paid · the project is booked`,
        body: "paid in full.",
        href: "/pipeline/fentybeauty",
        toasted: true,
      });
      celebrateBooking("rain", {
        name: demo.clientName,
        paid: `${formatMoneyExact(demo.depositCents)} ${demo.depositCents >= demo.totalCents ? "paid in full" : "deposit"}`,
        eventDate: demo.eventDate ? formatDateNumeric(demo.eventDate) : null,
        onOpen: () => void router.navigate({ to: "/pipeline/$id", params: { id: "fentybeauty" } }),
      });
    };
    // on opening the app (paid in this tab) and whenever another tab pays it
    check();
    return onPreviewProposalsChange(check);
  }, [devPreview, router]);

  useEffect(() => {
    if (profile.role !== "admin") return;
    const seen = new Set<string>();
    let ready = false;
    let stop = false;
    async function look() {
      try {
        const rows = devPreview ? getDevPreviewSettings().failedEvents : await recentIssues();
        if (stop) return;
        if (!ready) {
          for (const row of rows) seen.add(row.id);
          ready = true;
          return;
        }
        for (const row of rows) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          pushNotice({
            id: `issue-${row.id}`,
            title: `${row.provider} · ${row.event_type.replaceAll("_", " ")}`,
            body: row.error_message || "a studio issue was recorded.",
            href: "/settings",
          });
        }
      } catch {
        // issues stay in settings if the studio cannot reach them
      }
    }
    void look();
    const timer = window.setInterval(() => void look(), 20_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [devPreview, profile.role, recentIssues]);

  async function signOut() {
    if (devPreview) {
      await router.navigate({ to: "/auth" });
      return;
    }
    await supabase.auth.signOut();
    await router.navigate({ to: "/auth" });
  }

  const email = user?.email ?? "";
  const isAdmin = profile.role === "admin";
  const navItems = isAdmin ? ADMIN_NAV : TEAM_NAV;
  const givenName = profile.full_name?.trim() || "";
  const displayName = givenName || email;
  const initial = (displayName || email || "s").charAt(0).toLowerCase();
  const [bloom, setBloom] = useState(() => (loginBloomArmed() ? 1 : 0));
  useLayoutEffect(() => {
    if (loginBloomArmed()) setBloom(1);
  }, []);

  return (
    <div className="studio-pearl">
      <div className="auth-grain" aria-hidden="true" />
      <div className="studio-pearl-aura-far" aria-hidden="true" />
      <div className="studio-pearl-aura-near" aria-hidden="true" />

      <header className="studio-pearl-bar">
        <Link to="/dashboard" className="studio-pearl-brand" aria-label="Say Sukii home">
          <Wordmark tone="ink" className="w-24" />
        </Link>
        <div className="studio-pearl-bar-end">
          <NoticeBell unread={noticeModal.unread} onOpen={noticeModal.show} />
          <button
            type="button"
            className="studio-pearl-menu"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </header>

      {open ? (
        <div className="studio-pearl-drawer">
          <PrimaryNav items={navItems} onNavigate={() => setOpen(false)} />
          <footer className="studio-pearl-drawer-foot">
            <span className="studio-pearl-initial" aria-hidden="true">
              {initial}
            </span>
            <span className="min-w-0 flex-1">
              <b>{givenName ? <PersonName name={givenName} /> : email}</b>
              <span>{email}</span>
            </span>
            <div className="studio-pearl-drawer-actions">
              {isAdmin ? (
                <Link to="/settings" onClick={() => setOpen(false)}>
                  settings
                </Link>
              ) : null}
              <button type="button" onClick={signOut}>
                sign out
              </button>
            </div>
          </footer>
        </div>
      ) : null}

      <BloomPass play={bloom} />
      <div className="studio-pearl-frame">
        <aside className="studio-pearl-rail">
          <Link to="/dashboard" className="studio-pearl-brand" aria-label="Say Sukii home">
            <Wordmark tone="ink" />
          </Link>
          <PrimaryNav items={navItems} />
          <div className="studio-pearl-foot">
            <NoticeBell unread={noticeModal.unread} onOpen={noticeModal.show} />
            <AccountMenu
              displayName={displayName}
              givenName={givenName}
              email={email}
              initial={initial}
              isAdmin={isAdmin}
              onSignOut={signOut}
            />
          </div>
        </aside>

        <main ref={mainRef} className="studio-pearl-main">
          {children}
        </main>
      </div>
      <NoticeModal
        open={noticeModal.open}
        notices={noticeModal.notices}
        onOpenChange={noticeModal.onOpenChange}
        onClear={noticeModal.clear}
      />
    </div>
  );
}

function noticeWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return `today at ${time}`;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
  return `${day} at ${time}`;
}

function noticeLine(title: string) {
  const trimmed = title.trim();
  if (/^a change was requested$/i.test(trimmed)) return "a change was requested";
  const named = trimmed.match(/^(.*)\s+requested a change$/i);
  const legacy = trimmed.match(/^changes requested —\s+(.+)$/i);
  const who = (named?.[1] ?? legacy?.[1] ?? "").trim();
  if (!who) return trimmed;
  const first = who.split(/\s+/)[0];
  return first ? `${first} requested a change` : "a change was requested";
}

function useStudioNotices() {
  const [notices, setNotices] = useState<StudioNotice[]>([]);

  useEffect(() => {
    const sync = () => setNotices(readNotices());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(STUDIO_NOTICE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(STUDIO_NOTICE_EVENT, sync);
    };
  }, []);

  return notices;
}

function useNoticeModal(notices: StudioNotice[]) {
  const [open, setOpen] = useState(false);
  const surfaced = useRef(new Set<string>());
  const opened = useRef(false);
  const router = useRouter();
  const unread = notices.some((notice) => !notice.read);

  useEffect(() => {
    const fresh = notices.filter((notice) => !notice.read && !surfaced.current.has(notice.id));
    if (fresh.length === 0) return;
    let openBook = false;
    for (const notice of fresh) {
      surfaced.current.add(notice.id);
      if (!notice.toasted) {
        const href = notice.href;
        toast(notice.title, {
          description: notice.body,
          ...(href
            ? {
                action: {
                  label: "open",
                  onClick: () => {
                    if (href === "/settings") {
                      void router.navigate({ to: "/settings" });
                      return;
                    }
                    const slug = href.split("/").filter(Boolean).pop();
                    if (!slug) return;
                    void router.navigate({ to: "/pipeline/$id", params: { id: slug } });
                  },
                },
              }
            : {}),
        });
        markNoticeToasted(notice.id);
      }
      if (!notice.href) openBook = true;
    }
    if (openBook) setOpen(true);
  }, [notices, router]);

  function show() {
    setOpen(true);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) opened.current = true;
    if (!next && opened.current && unread) markNoticesRead();
  }

  function clear(id: string) {
    const remaining = notices.filter((notice) => notice.id !== id);
    dismissNotice(id);
    if (remaining.length === 0) setOpen(false);
  }

  return { open, notices, unread, show, onOpenChange, clear };
}

function NoticeModal({
  open,
  notices,
  onOpenChange,
  onClear,
}: {
  open: boolean;
  notices: StudioNotice[];
  onOpenChange: (open: boolean) => void;
  onClear: (id: string) => void;
}) {
  const summary = notices.map((notice) => noticeLine(notice.title)).join(". ") || "nothing new";
  const listRef = useRef<HTMLUListElement>(null);
  const [cap, setCap] = useState<number | null>(null);
  const noticesRef = useRef(notices);
  noticesRef.current = notices;

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list || noticesRef.current.length < 3) {
      setCap((current) => (current === null ? current : null));
      return;
    }
    const [first, second] = Array.from(list.querySelectorAll<HTMLElement>(":scope > li"));
    if (!first || !second) return;
    const gap = parseFloat(getComputedStyle(second).marginTop) || 0;
    const height = first.offsetHeight + second.offsetHeight + gap;
    if (height < 1) return;
    setCap((current) => (current === height ? current : height));
  }, []);

  const setList = useCallback(
    (node: HTMLUListElement | null) => {
      listRef.current = node;
      measure();
    },
    [measure],
  );

  useEffect(() => {
    measure();
    const timer = window.setTimeout(measure, 240);
    return () => window.clearTimeout(timer);
  }, [notices, open, measure]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="studio-task-veil" className="studio-notice-modal" hideClose>
        <div className="studio-notice-top">
          <span className="studio-notice-mark" aria-hidden="true">
            <Bell strokeWidth={1.5} />
          </span>
          <DialogClose className="studio-task-close" aria-label="Close">
            <X aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogTitle className="sr-only">notifications</DialogTitle>
        {notices.length === 0 ? (
          <p className="studio-notice-line">nothing new</p>
        ) : (
          <ul
            ref={setList}
            className="studio-notice-list"
            style={cap ? { maxHeight: cap } : undefined}
          >
            {notices.map((notice) => (
              <li key={notice.id}>
                <div className="studio-notice-head">
                  <p className="studio-notice-line">{noticeLine(notice.title)}</p>
                  <time dateTime={notice.createdAt}>{noticeWhen(notice.createdAt)}</time>
                </div>
                {notice.body ? <p className="studio-notice-message">{notice.body}</p> : null}
                <span className="studio-notice-actions">
                  {notice.href ? (
                    <a className="studio-notice-clear" href={notice.href}>
                      open
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="studio-notice-clear"
                    onClick={() => onClear(notice.id)}
                  >
                    clear
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogDescription className="sr-only">{summary}</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

function NoticeBell({ unread, onOpen }: { unread: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="studio-pearl-bell"
      aria-label={unread ? "unread notifications" : "notifications"}
      onClick={onOpen}
    >
      <Bell aria-hidden="true" strokeWidth={1.5} />
      {unread ? <i /> : null}
    </button>
  );
}

function AccountMenu({
  displayName,
  givenName = "",
  email,
  initial,
  isAdmin,
  onSignOut,
  compact = false,
}: {
  displayName: string;
  givenName?: string;
  email: string;
  initial: string;
  isAdmin: boolean;
  onSignOut: () => void;
  compact?: boolean;
}) {
  const who = givenName ? <PersonName name={givenName} /> : displayName;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("studio-pearl-account", compact && "w-auto")}>
        <span className="studio-pearl-initial">{initial}</span>
        {!compact ? (
          <span className="min-w-0 flex-1">
            <b className="truncate">{who}</b>
            <span className="studio-pearl-role">{isAdmin ? "administrator" : "team member"}</span>
          </span>
        ) : null}
        <ChevronDown className="size-3.5 shrink-0 opacity-45" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="studio-account-menu">
        <div className="studio-account-who">
          <b>{who}</b>
          <span>{email}</span>
        </div>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link to="/settings">settings</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onSignOut}>sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
