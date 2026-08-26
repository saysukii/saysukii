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
import { cn } from "@/lib/utils";
import { Ground, Wordmark } from "./bits";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/accounts", label: "Accounts" },
  { to: "/studio", label: "Proposal Studio" },
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
    <div className="min-h-screen">
      <Ground />

      {/* Top bar */}
      <header className="glass sticky top-4 z-50 mx-auto mt-4 flex h-16 max-w-[100rem] items-center justify-between gap-4 rounded-3xl px-5 sm:px-7">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            className="neu inline-flex size-10 items-center justify-center rounded-2xl lg:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <Link to="/dashboard" className="block">
            <Wordmark className="w-28" />
          </Link>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="bloom-glow flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3 outline-none transition-all duration-300">
            <span className="neu flex size-9 items-center justify-center rounded-full text-xs font-semibold text-foreground">
              {initial}
            </span>
            <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:block">
              {email}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass w-56 rounded-2xl border-white/60 p-1.5">
            <DropdownMenuLabel className="px-3 py-2">
              <p className="truncate text-sm font-medium text-foreground">{email}</p>
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Studio admin
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border/70" />
            <DropdownMenuItem
              onClick={signOut}
              className="cursor-pointer gap-2 rounded-xl px-3 py-2.5 text-sm"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mx-auto flex max-w-[100rem] gap-8 px-4 py-6 sm:px-8">
        {/* Sidebar */}
        <aside
          className={cn(
            "glass fixed inset-y-24 left-4 z-40 flex w-60 flex-col rounded-3xl p-5 transition-transform duration-300 lg:sticky lg:top-28 lg:h-[calc(100vh-9.5rem)] lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-[110%]",
          )}
        >
          <p className="px-3 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Studio OS
          </p>

          <nav className="mt-5 flex flex-1 flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="bloom-glow rounded-2xl px-4 py-3 text-sm text-muted-foreground transition-all duration-300 hover:text-foreground"
                activeProps={{ className: "neu !text-foreground font-medium" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <p className="px-3 text-[0.6rem] leading-relaxed tracking-[0.08em] text-muted-foreground/70">
            Say Sukii Portal — internal
          </p>
        </aside>

        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
