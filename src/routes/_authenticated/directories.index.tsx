import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/directories/")({
  beforeLoad: () => {
    throw redirect({ to: "/shelf" });
  },
});
