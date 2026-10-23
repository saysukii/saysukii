import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/directories")({
  beforeLoad: () => {
    throw redirect({ to: "/shelf" });
  },
});
