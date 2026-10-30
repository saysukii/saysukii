import { createFileRoute } from "@tanstack/react-router";

import { APP_FILE_BUCKETS } from "@/lib/app-file-link";

// a studio file, opened on the studio's own address; storage still checks the link's token
export const Route = createFileRoute("/file/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.pathname.replace(/^\/file\//, "");
        const bucket = path.split("/")[0] ?? "";
        const token = url.searchParams.get("token");
        const storage = process.env["SUPABASE_URL"];
        if (!token || !storage || !(APP_FILE_BUCKETS as readonly string[]).includes(bucket)) {
          return new Response("Not found", { status: 404 });
        }
        const upstream = await fetch(
          `${storage.replace(/\/$/, "")}/storage/v1/object/sign/${path}?token=${encodeURIComponent(token)}`,
          { headers: request.headers.get("range") ? { range: request.headers.get("range")! } : {} },
        );
        if (!upstream.ok || !upstream.body) {
          // an expired link says so plainly rather than showing storage's error
          return new Response("This link has expired. Open the file again from the studio.", {
            status: upstream.status === 400 || upstream.status === 403 ? 410 : upstream.status,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        const name = decodeURIComponent(path.split("/").pop() ?? "file");
        const headers = new Headers({
          "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
          "content-disposition": `inline; filename="${name.replace(/"/g, "")}"`,
          "cache-control": "private, max-age=300",
        });
        for (const header of ["content-length", "content-range", "accept-ranges", "etag"]) {
          const value = upstream.headers.get(header);
          if (value) headers.set(header, value);
        }
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});
