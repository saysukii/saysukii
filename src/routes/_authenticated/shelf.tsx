import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/shelf")({
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
});
