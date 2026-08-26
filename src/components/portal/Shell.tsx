import { Link, useRouter, useRouteContext } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "./bits";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/accounts", label: "Accounts" },
  { to: "/studio", label: "Proposal Studio" },
  { to: "/rate-card", label: "Rate Card" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user } = useRouteContext({ from: "/_authenticated" });

  async function signOut() {
    await supabase.auth.signOut();
    await router.navigate({ to: "/auth" });
  }

  const email = user?.email ?? "";
  const initial = email ? email.charAt(0).toUpperCase() : "S";

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="flex h-16 items-center justify-between gap-4 border-b border-border px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-foreground md:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <Link to="/dashboard" className="block">
            <Wordmark className="w-24" />
          </Link>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-full border border-border py-1 pl-1 pr-3 outline-none">
            <span className="flex size-8 items-center justify-center rounded-full border border-border text-xs font-semibold text-foreground">
              {initial}
            </span>
            <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:block">
              {email}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 rounded-lg border border-border bg-background p-1 shadow-none"
          >
            <DropdownMenuLabel className="px-3 py-2">
              <p className="truncate text-sm font-medium text-foreground">{email}</p>
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Studio admin
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={signOut}
              className="cursor-pointer gap-2 rounded-md px-3 py-2.5 text-sm"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Folder tabs (desktop) */}
      <nav
        aria-label="Primary"
        className="hidden items-end gap-1 border-b border-border px-4 sm:px-8 md:flex"
      >
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="-mb-px rounded-t-md border border-b-0 border-transparent bg-muted px-4 pb-2.5 pt-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{
              className:
                "-mb-px rounded-t-md border border-b-0 border-border !bg-background px-4 pb-[0.6875rem] pt-2.5 text-sm !text-foreground font-medium relative z-10",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Mobile menu */}
      {open ? (
        <nav
          aria-label="Primary mobile"
          className="flex flex-col border-b border-border md:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="border-b border-border px-4 py-3 text-sm text-muted-foreground last:border-b-0"
              activeProps={{ className: "!text-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <main className="min-w-0 px-4 py-8 pb-16 sm:px-8">{children}</main>
    </div>
  );
}
