import { Link, useRouter, useRouteContext } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "./bits";

type NavItem = {
  to: string;
  label: string;
};

const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "today" },
  { to: "/pipeline", label: "inquiries" },
  { to: "/proposals", label: "proposals" },
  { to: "/clients", label: "clients" },
  { to: "/settings", label: "settings" },
];

const TEAM_NAV = ADMIN_NAV.filter(({ label }) => label === "today");

function PrimaryNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary" className="studio-pearl-nav">
      {items.map(({ to, label }) => (
        <Link
          key={to}
          to={to as "/dashboard"}
          onClick={onNavigate}
          activeOptions={{ exact: to === "/dashboard" }}
          activeProps={{ className: "is-on" }}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user, profile, devPreview } = useRouteContext({ from: "/_authenticated" });

  async function signOut() {
    if (devPreview) {
      await router.navigate({ to: "/auth" });
      return;
    }
    await supabase.auth.signOut();
    await router.navigate({ to: "/auth" });
  }

  const email = user?.email ?? "";
  const initial = email ? email.charAt(0).toLowerCase() : "s";
  const isAdmin = profile.role === "admin";
  const navItems = isAdmin ? ADMIN_NAV : TEAM_NAV;
  const displayName = profile.full_name?.trim() || email;

  return (
    <div className="studio-pearl">
      <div className="auth-grain" aria-hidden="true" />
      <div className="studio-pearl-aura-far" aria-hidden="true" />
      <div className="studio-pearl-aura-near" aria-hidden="true" />

      <header className="studio-pearl-bar md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="studio-pearl-menu"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <Link to="/dashboard" className="studio-pearl-brand" aria-label="Say Sukii home">
            <Wordmark tone="ink" className="w-24" />
          </Link>
        </div>
        <AccountMenu
          displayName={displayName}
          email={email}
          initial={initial}
          isAdmin={isAdmin}
          onSignOut={signOut}
          compact
        />
      </header>

      {open ? (
        <div className="studio-pearl-drawer md:hidden">
          <PrimaryNav items={navItems} onNavigate={() => setOpen(false)} />
        </div>
      ) : null}

      <div className="studio-pearl-frame">
        <aside className="studio-pearl-rail">
          <Link to="/dashboard" className="studio-pearl-brand" aria-label="Say Sukii home">
            <Wordmark tone="ink" />
          </Link>
          <PrimaryNav items={navItems} />
          <AccountMenu
            displayName={displayName}
            email={email}
            initial={initial}
            isAdmin={isAdmin}
            onSignOut={signOut}
          />
        </aside>

        <main className="studio-pearl-main">{children}</main>
      </div>
    </div>
  );
}

function AccountMenu({
  displayName,
  email,
  initial,
  isAdmin,
  onSignOut,
  compact = false,
}: {
  displayName: string;
  email: string;
  initial: string;
  isAdmin: boolean;
  onSignOut: () => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("studio-pearl-account", compact && "w-auto")}>
        <span className="studio-pearl-initial">{initial}</span>
        {!compact ? (
          <span className="min-w-0 flex-1">
            <b className="truncate">{displayName}</b>
            <span className="studio-pearl-role">{isAdmin ? "administrator" : "team member"}</span>
          </span>
        ) : null}
        <ChevronDown className="size-3.5 shrink-0 opacity-45" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-60 rounded-3xl border-0 bg-[#f7f4ef] p-2 shadow-none"
      >
        <DropdownMenuLabel className="px-3 py-3">
          <p className="truncate text-sm font-light lowercase">{displayName}</p>
          <p className="mt-1 truncate text-xs font-light lowercase opacity-60">{email}</p>
          <p className="mt-2 text-[0.65rem] font-light tracking-[0.06em] lowercase opacity-60">
            {isAdmin ? "administrator" : "team member"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-2 bg-black/5" />
        <DropdownMenuItem
          onClick={onSignOut}
          className="cursor-pointer gap-2 rounded-2xl px-3 py-3 text-sm font-light lowercase focus:bg-[#f6f5f2]"
        >
          <LogOut className="size-4" />
          sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
