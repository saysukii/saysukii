import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/inquire")({
  head: () => ({
    meta: [{ title: "Let's Connect – Say Sukii" }],
  }),
  component: () => <Outlet />,
});
