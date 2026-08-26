import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Say Sukii Portal — Floral Studio Operating System" },
      {
        name: "description",
        content:
          "The internal operating system for Say Sukii: pipeline, proposals, agreements, and invoices for every floral installation.",
      },
      { property: "og:title", content: "Say Sukii Portal" },
      {
        property: "og:description",
        content: "Pipeline, proposals, agreements, and invoices for the Say Sukii floral studio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
