import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/book")({
  beforeLoad: () => {
    throw redirect({ to: "/schedule" });
  },
});
