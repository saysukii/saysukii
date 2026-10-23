import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { getDevPreviewClients, getDevPreviewDirectories } from "@/lib/dev-preview";
import { listClients, listDirectories } from "@/lib/os/clients.functions";
import { listStudioFiles, type StudioFile } from "@/lib/os/files.functions";
import { mergePreviewClients } from "@/lib/preview-clients";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/shelf")({
  head: () => ({
    meta: [{ title: "Shelf — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: ShelfPage,
});

const previewFiles: StudioFile[] = [
  {
    id: "ceremony-layout",
    name: "ceremony-layout.pdf",
    kind: "pdf",
    href: "/attachments/ceremony-layout.pdf",
  },
  {
    id: "fenty-beauty-proposal",
    name: "fenty-beauty-proposal.pdf",
    kind: "pdf",
    href: "/attachments/fenty-beauty-proposal.pdf",
  },
  {
    id: "reference-photos",
    name: "reference-photos.zip",
    kind: "zip",
    href: "/attachments/reference-photos.zip",
  },
];

function ShelfPage() {
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const fetchFiles = useServerFn(listStudioFiles);
  const fetchClients = useServerFn(listClients);
  const fetchDirectories = useServerFn(listDirectories);
  const [view, setView] = useState<"grid" | "list">("grid");

  const files = useQuery({
    queryKey: ["os", "files", devPreview],
    queryFn: () => (devPreview ? previewFiles : fetchFiles()),
    enabled: isAdmin,
  });
  const clients = useQuery({
    queryKey: ["os", "clients", devPreview],
    queryFn: async () => {
      const rows = devPreview ? getDevPreviewClients() : await fetchClients();
      return devPreview ? mergePreviewClients(rows) : rows;
    },
    enabled: isAdmin,
  });
  const books = useQuery({
    queryKey: ["os", "directories", devPreview],
    queryFn: () => (devPreview ? getDevPreviewDirectories() : fetchDirectories()),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="studio-home is-book">
        <p className="studio-pearl-note">the shelf is for studio admins.</p>
      </div>
    );
  }

  const fileRows = files.data ?? [];
  const pendingBooks = clients.isPending || books.isPending;
  const directories = [
    {
      to: "/directories/clients" as const,
      name: "clients",
      blurb: "people the studio works with.",
      count: clients.data?.length,
    },
    {
      to: "/directories/vendors" as const,
      name: "vendors",
      blurb: "markets, wholesalers, and rentals.",
      count: books.data?.vendors.length,
    },
    {
      to: "/directories/venues" as const,
      name: "venues",
      blurb: "rooms, gardens, and load-in notes.",
      count: books.data?.venues.length,
    },
  ];

  return (
    <div className="studio-home is-book">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">studio</p>
          <h1>shelf</h1>
          <p>files beside the books of people and places.</p>
        </div>
      </header>
      <div className="studio-book-body studio-shelf">
        <section className="studio-shelf-pane" aria-label="files">
          <div className="studio-shelf-head">
            <p className="studio-home-label">
              {files.isPending ? "files" : `${fileRows.length} ${fileRows.length === 1 ? "file" : "files"}`}
            </p>
            <div className="studio-file-views" role="group" aria-label="layout">
              {(["grid", "list"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={view === item ? "is-on" : undefined}
                  aria-pressed={view === item}
                  onClick={() => setView(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          {files.isPending ? <p className="studio-empty">gathering…</p> : null}
          {!files.isPending && fileRows.length === 0 ? <p className="studio-empty">nothing filed yet.</p> : null}
          {fileRows.length > 0 && view === "grid" ? (
            <div className="studio-file-grid">
              {fileRows.map((file) => (
                <FileCard key={file.id} file={file} />
              ))}
            </div>
          ) : null}
          {fileRows.length > 0 && view === "list" ? (
            <div className="studio-directory">
              {fileRows.map((file) => (
                <FileRow key={file.id} file={file} />
              ))}
            </div>
          ) : null}
        </section>

        <section className="studio-shelf-pane" aria-label="directories">
          <div className="studio-shelf-head">
            <p className="studio-home-label">directories</p>
          </div>
          <div className="studio-directory">
            {directories.map((row) => (
              <Link key={row.to} to={row.to} className="studio-book-row">
                <span>
                  <b>{row.name}</b>
                  <em>{row.blurb}</em>
                </span>
                <small>{pendingBooks ? "…" : row.count}</small>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function FileCard({ file }: { file: StudioFile }) {
  const body = (
    <>
      <span className="studio-file-sheet">
        <small>{file.kind}</small>
      </span>
      <b>{file.name}</b>
    </>
  );
  if (!file.href) return <article className="studio-file-card">{body}</article>;
  return (
    <a className="studio-file-card" href={file.href} target="_blank" rel="noreferrer">
      {body}
    </a>
  );
}

function FileRow({ file }: { file: StudioFile }) {
  const body = (
    <>
      <span>
        <b>{file.name}</b>
      </span>
      <small>{file.kind}</small>
    </>
  );
  if (!file.href) return <article className="studio-book-row">{body}</article>;
  return (
    <a className="studio-book-row" href={file.href} target="_blank" rel="noreferrer">
      {body}
    </a>
  );
}
