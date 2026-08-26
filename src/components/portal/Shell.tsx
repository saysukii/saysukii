import { Link, useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Ground, Wordmark } from "./bits";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/studio", label: "Proposal Studio" },
  { to: "/proposals", label: "Documents" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/accounts", label: "Accounts" },
  { to: "/rate-card", label: "Rate Card" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    await router.navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen">
      <Ground />
      <div className="mx-auto flex max-w-[100rem] gap-8 px-4 py-6 sm:px-8">
        <aside
          className={cn(
            "glass fixed inset-y-4 left-4 z-40 flex w-64 flex-col rounded-3xl p-6 transition-transform duration-300 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-[110%]",
          )}
        >
          <Link to="/dashboard" className="block px-2" onClick={() => setOpen(false)}>
            <Wordmark className="max-w-[9.5rem]" />
          </Link>
          <p className="mt-3 px-2 text-[0.6rem] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
            Studio OS
          </p>

          <nav className="mt-8 flex flex-1 flex-col gap-1">
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

          <button
            onClick={signOut}
            className="mt-6 rounded-2xl px-4 py-3 text-left text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </aside>

        <main className="min-w-0 flex-1 pb-16">
          <button
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            className="neu mb-6 inline-flex size-11 items-center justify-center rounded-2xl lg:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          {children}
        </main>
      </div>
    </div>
  );
}
