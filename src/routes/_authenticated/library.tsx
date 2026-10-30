import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { BloomWait } from "@/components/portal/StudioLoader";
import { PersonName } from "@/components/studio/PersonName";
import { getDevPreviewClients, getDevPreviewDirectories, PREVIEW_IDS } from "@/lib/dev-preview";
import { listClients, listDirectories } from "@/lib/os/clients.functions";
import {
  addLibraryFile,
  fileCategory,
  listStudioFiles,
  type FileCategory,
  type FileRelation,
  type StudioFile,
} from "@/lib/os/files.functions";
import { fentyDemoProposal } from "@/lib/preview-proposals";
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

/** the library's views: everything, a kind of document, or the studio's own files */
type FileView = "all" | "proposal" | "agreement" | "money" | "image" | "other" | "studio";

const VIEWS: Array<[FileView, string]> = [
  ["all", "all"],
  ["proposal", "proposals"],
  ["agreement", "agreements"],
  ["money", "invoices + receipts"],
  ["image", "images"],
  ["other", "other"],
  ["studio", "studio"],
];

// within a client, the paper trail reads in the order it happened
const CATEGORY_ORDER: FileCategory[] = [
  "proposal",
  "agreement",
  "invoice",
  "receipt",
  "image",
  "other",
];

function inView(file: StudioFile, view: FileView) {
  if (view === "all") return true;
  if (view === "studio") return file.relation.scope === "studio";
  if (file.relation.scope === "studio") return false;
  if (view === "money") return file.category === "invoice" || file.category === "receipt";
  return file.category === view;
}

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
  const file = (
    id: string,
    name: string,
    href: string,
    relation: FileRelation,
    addedAt: string,
  ): StudioFile => {
    const kind = fileKind(name);
    return { id, name, kind, href, relation, category: fileCategory(name, kind), addedAt };
  };
  // the fenty demo's paper trail grows as it's accepted, signed, and paid
  const demo = fentyDemoProposal();
  const fenty = client(PREVIEW_IDS.clientFenty, "Fenty Beauty", false);
  const signedAt = demo.signedAt ?? "2026-10-29T21:20:00.000Z";
  return [
    file(
      "fenty-proposal",
      `say-sukii-proposal-${demo.number}.pdf`,
      "/attachments/fenty-beauty-proposal.pdf",
      fenty,
      demo.sentAt ?? "2026-10-27T15:00:00.000Z",
    ),
    ...(demo.signedName
      ? [
          file(
            "fenty-agreement",
            `floral-service-agreement-${demo.number}.pdf`,
            "/dev-file/agreement",
            fenty,
            signedAt,
          ),
        ]
      : []),
    ...(demo.paid
      ? [
          file(
            "fenty-receipt",
            `say-sukii-receipt-${demo.number}.pdf`,
            "/dev-file/receipt",
            fenty,
            demo.paidAt ?? signedAt,
          ),
        ]
      : []),
    file(
      "ceremony-layout",
      "ceremony-layout.pdf",
      "/attachments/ceremony-layout.pdf",
      client(PREVIEW_IDS.clientAmelia, "Amelia Chen", true),
      "2026-10-24T16:00:00.000Z",
    ),
    file(
      "reference-photos",
      "reference-photos.zip",
      "/attachments/reference-photos.zip",
      { scope: "studio" },
      "2026-10-20T16:00:00.000Z",
    ),
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
  const [view, setView] = useState<FileView>("all");
  const [search, setSearch] = useState("");
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

  const studioDrop = view === "all" || view === "studio";

  async function keep(list: File[]) {
    if (!studioDrop) return;
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
    // the library scrolls as one page, like today, not inside a fixed frame
    <div className="studio-home is-book is-library">
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
          onDragOver={studioDrop ? allowDrop : undefined}
          onDragLeave={studioDrop ? () => setOver(false) : undefined}
          onDrop={
            studioDrop
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
            <input
              className="studio-library-search"
              type="search"
              value={search}
              placeholder="find a file or client"
              aria-label="find a file or client"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <FileShelf
            files={fileRows}
            view={view}
            search={search}
            pending={files.isPending}
            onView={setView}
            drop={
              studioDrop ? (
                <div className={cn("studio-library-drop", over && "is-over")}>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={keeping}
                  >
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
              ) : null
            }
          />
        </section>
      </div>
    </div>
  );
}

/**
 * The files, sorted for finding: a view per kind of document, a search across names and clients,
 * and client files grouped by client, the most recently active client first.
 */
function FileShelf({
  files,
  view,
  search,
  pending,
  onView,
  drop,
}: {
  files: StudioFile[];
  view: FileView;
  search: string;
  pending: boolean;
  onView: (next: FileView) => void;
  drop: ReactNode;
}) {
  const query = search.trim().toLowerCase();
  const found = useMemo(
    () =>
      files.filter(
        (file) =>
          !query ||
          file.name.toLowerCase().includes(query) ||
          (file.relation.scope !== "studio" && file.relation.name.toLowerCase().includes(query)),
      ),
    [files, query],
  );
  const counts = new Map(
    VIEWS.map(([id]) => [id, found.filter((file) => inView(file, id)).length]),
  );
  const shown = found.filter((file) => inView(file, view));
  const groups = useMemo(() => groupByOwner(shown), [shown]);

  return (
    <>
      <div className="studio-file-views" role="tablist" aria-label="file categories">
        {VIEWS.filter(([id]) => id === "all" || id === view || (counts.get(id) ?? 0) > 0).map(
          ([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={view === id ? "is-on" : undefined}
              onClick={() => onView(id)}
            >
              {label}
              <span>{counts.get(id) ?? 0}</span>
            </button>
          ),
        )}
      </div>
      {drop}
      {pending ? <p className="studio-empty">gathering…</p> : null}
      {!pending && shown.length === 0 ? (
        <p className="studio-empty">{query ? "nothing matches." : "nothing filed yet."}</p>
      ) : null}
      {groups.map((group) => (
        <div key={group.key} className="studio-file-group">
          <p className="studio-file-group-head">
            {group.relation.scope === "client" ? (
              <Link to="/clients/$id" params={{ id: group.relation.id }}>
                <PersonName name={group.relation.name} />
              </Link>
            ) : (
              <span>
                {group.relation.scope === "venue" ? (
                  <PersonName name={group.relation.name} />
                ) : (
                  "say sukii"
                )}
              </span>
            )}
            <small>{group.files.length}</small>
          </p>
          <div className="studio-directory">
            {group.files.map((file) => (
              <FileRow key={file.id} file={file} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** client files by client, the most recently active first; the studio's own files last */
function groupByOwner(files: StudioFile[]) {
  const groups = new Map<string, { key: string; relation: FileRelation; files: StudioFile[] }>();
  for (const file of files) {
    const key =
      file.relation.scope === "studio" ? "studio" : `${file.relation.scope}:${file.relation.id}`;
    const group = groups.get(key) ?? { key, relation: file.relation, files: [] };
    group.files.push(file);
    groups.set(key, group);
  }
  const latest = (group: { files: StudioFile[] }) =>
    group.files.reduce((max, file) => (file.addedAt > max ? file.addedAt : max), "");
  return [...groups.values()]
    .map((group) => ({
      ...group,
      // within a client: proposal, agreement, invoice, receipt, then the rest, newest first
      files:
        group.relation.scope === "studio"
          ? [...group.files].sort((a, b) => b.addedAt.localeCompare(a.addedAt))
          : [...group.files].sort(
              (a, b) =>
                CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
                b.addedAt.localeCompare(a.addedAt),
            ),
    }))
    .sort((a, b) => {
      if (a.key === "studio") return 1;
      if (b.key === "studio") return -1;
      return latest(b).localeCompare(latest(a));
    });
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

/** who the file belongs to, in pink at the end of its row */
function relationMark(relation: FileRelation): ReactNode {
  return relation.scope === "studio" ? "say sukii" : <PersonName name={relation.name} />;
}

function previewKept(file: File): StudioFile {
  const kind = fileKind(file.name);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    kind,
    href: URL.createObjectURL(file),
    relation: { scope: "studio" },
    category: fileCategory(file.name, kind),
    addedAt: new Date().toISOString(),
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
