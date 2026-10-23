import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/files")({
  beforeLoad: () => {
    throw redirect({ to: "/shelf" });
  },
});
