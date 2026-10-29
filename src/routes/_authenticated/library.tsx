import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { BloomWait } from "@/components/portal/StudioLoader";
import { getDevPreviewClients, getDevPreviewDirectories, PREVIEW_IDS } from "@/lib/dev-preview";
import { listClients, listDirectories } from "@/lib/os/clients.functions";
import {
  addLibraryFile,
  listStudioFiles,
  type FileRelation,
  type StudioFile,
} from "@/lib/os/files.functions";
import { fileContentType } from "@/lib/os/inquiry-holds";
import { clientSlugs } from "@/lib/os/inquiry-desk";
import { mergePreviewClients } from "@/lib/preview-clients";
import { useDevPreview } from "@/lib/use-dev-preview";
import { cn } from "@/lib/utils";

type DirectoryLink = {
  to: "/directories/clients" | "/directories/vendors" | "/directories/venues";
  name: string;
  blurb: string;
  count: number | undefined;
};

type FileTab = "studio" | "client";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [{ title: "Library — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: LibraryPage,
});

function previewFiles(): StudioFile[] {
  const slugs = clientSlugs(getDevPreviewClients());
  const client = (id: string, name: string, person: boolean): FileRelation => ({
    scope: "client",
    name,
    id: slugs.get(id) ?? id,
    person,
  });
  return [
    {
      id: "ceremony-layout",
      name: "ceremony-layout.pdf",
      kind: "pdf",
      href: "/attachments/ceremony-layout.pdf",
      relation: client(PREVIEW_IDS.clientAmelia, "Amelia Chen", true),
    },
    {
      id: "fenty-beauty-proposal",
      name: "fenty-beauty-proposal.pdf",
      kind: "pdf",
      href: "/attachments/fenty-beauty-proposal.pdf",
      relation: client(PREVIEW_IDS.clientLumen, "Lumen Studio", false),
    },
    {
      id: "reference-photos",
      name: "reference-photos.zip",
      kind: "zip",
      href: "/attachments/reference-photos.zip",
      relation: { scope: "studio" },
    },
  ];
}

function LibraryPage() {
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const queryClient = useQueryClient();
  const fetchFiles = useServerFn(listStudioFiles);
  const fetchClients = useServerFn(listClients);
  const fetchDirectories = useServerFn(listDirectories);
  const saveFile = useServerFn(addLibraryFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<FileTab>("studio");
  const [over, setOver] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [kept, setKept] = useState<StudioFile[]>([]);

  const files = useQuery({
    queryKey: ["os", "files", devPreview],
    queryFn: () => (devPreview ? previewFiles() : fetchFiles()),
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
        <p className="studio-pearl-note">the library is for studio admins.</p>
      </div>
    );
  }

  const fileRows = [...kept, ...(files.data ?? [])];
  const visible = fileRows.filter((file) =>
    tab === "studio" ? file.relation.scope === "studio" : file.relation.scope !== "studio",
  );
  const pendingBooks = clients.isPending || books.isPending;
  const directories: DirectoryLink[] = [
    {
      to: "/directories/clients",
      name: "clients",
      blurb: "people the studio works with.",
      count: clients.data?.length,
    },
    {
      to: "/directories/vendors",
      name: "vendors",
      blurb: "markets, wholesalers, and rentals.",
      count: books.data?.vendors.length,
    },
    {
      to: "/directories/venues",
      name: "venues",
      blurb: "rooms, gardens, and load-in notes.",
      count: books.data?.venues.length,
    },
  ];

  async function keep(list: File[]) {
    if (tab !== "studio") return;
    const incoming = list.filter((file) => file.size > 0);
    if (incoming.length === 0 || keeping) return;
    setKeeping(true);
    try {
      for (const file of incoming) {
        if (devPreview) {
          setKept((current) => [previewKept(file), ...current]);
          continue;
        }
        const path = libraryPath(file.name);
        const upload = await supabase.storage.from("project-files").upload(path, file, {
          contentType: fileContentType(file),
          upsert: false,
        });
        if (upload.error) throw new Error(upload.error.message);
        await saveFile({
          data: { file_path: path, file_type: fileContentType(file) },
        });
      }
      if (!devPreview) {
        await queryClient.invalidateQueries({ queryKey: ["os", "files", devPreview] });
      }
      toast.success(incoming.length === 1 ? "file added" : `${incoming.length} files added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "could not keep this file");
    } finally {
      setKeeping(false);
    }
  }

  function allowDrop(event: DragEvent) {
    event.preventDefault();
    setOver(true);
  }

  return (
    <div className="studio-home is-book">
      <header className="studio-home-hello">
        <div>
          <p className="studio-kicker">studio</p>
          <h1>library</h1>
          <p>directories first. files gathered by where they belong.</p>
        </div>
      </header>
      <div className="studio-library-index">
        <section>
          <p className="studio-home-label">directories</p>
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
        <section
          className="studio-library-files"
          aria-label="files"
          onDragOver={tab === "studio" ? allowDrop : undefined}
          onDragLeave={tab === "studio" ? () => setOver(false) : undefined}
          onDrop={
            tab === "studio"
              ? (event) => {
                  event.preventDefault();
                  setOver(false);
                  void keep([...event.dataTransfer.files]);
                }
              : undefined
          }
        >
          <div className="studio-shelf-head">
            <p className="studio-home-label">files</p>
            <div className="studio-file-views" role="tablist" aria-label="file categories">
              {(
                [
                  ["studio", "studio"],
                  ["client", "client-related"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? "is-on" : undefined}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {tab === "studio" ? (
            <div className={cn("studio-library-drop", over && "is-over")}>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={keeping}>
                {dropHint(over, keeping)}
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  void keep([...(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
            </div>
          ) : null}
          {files.isPending ? <p className="studio-empty">gathering…</p> : null}
          {!files.isPending && visible.length === 0 ? (
            <p className="studio-empty">nothing filed yet.</p>
          ) : null}
          {visible.length > 0 ? (
            <div className="studio-directory">
              {visible.map((file) => (
                <FileRow key={file.id} file={file} />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function FileRow({ file }: { file: StudioFile }) {
  const body = (
    <>
      <span>
        <b>{file.name}</b>
      </span>
      <small>{relationMark(file.relation)}</small>
    </>
  );
  if (!file.href) return <article className="studio-book-row">{body}</article>;
  return (
    <a className="studio-book-row" href={file.href} target="_blank" rel="noreferrer">
      {body}
    </a>
  );
}

function relationMark(relation: FileRelation) {
  return relation.scope === "studio" ? "studio" : relation.name;
}

function previewKept(file: File): StudioFile {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    kind: fileKind(file.name),
    href: URL.createObjectURL(file),
    relation: { scope: "studio" },
  };
}

function fileKind(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "zip") return "zip";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  return ext || "file";
}

function libraryPath(name: string) {
  const cleaned =
    name
      .replace(/[^\w.\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "file";
  return `library/studio/${Date.now()}-${cleaned}`;
}

function dropHint(over: boolean, keeping: boolean) {
  if (keeping) return "keeping…";
  if (over) return "drop to keep";
  return "drop a studio file, or choose one";
}
