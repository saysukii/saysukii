import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DirectoryHome, DirectoryImport, DirectorySearch } from "@/components/portal/DirectoryHome";
import { shownName, isPersonType } from "@/components/studio/PersonName";
import type { ClientRow } from "@/integrations/supabase/types";
import { getDevPreviewClients } from "@/lib/dev-preview";
import { importClients, listClients } from "@/lib/os/clients.functions";
import { csvImportNote, readClientCsv } from "@/lib/os/directory-csv";
import { clientSlugs } from "@/lib/os/inquiry-desk";
import { mergePreviewClients } from "@/lib/preview-clients";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/directories/clients")({
  head: () => ({
    meta: [{ title: "Clients — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: ClientDirectoryPage,
});

function ClientDirectoryPage() {
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const fetchClients = useServerFn(listClients);
  const bringIn = useServerFn(importClients);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [broughtIn, setBroughtIn] = useState<ClientRow[]>([]);

  const { data: clients = [], isPending } = useQuery({
    queryKey: ["os", "clients", devPreview],
    queryFn: async () => {
      const rows = devPreview ? getDevPreviewClients() : await fetchClients();
      return devPreview ? mergePreviewClients(rows) : rows;
    },
    enabled: isAdmin,
  });

  const people = useMemo(() => {
    const seen = new Set(clients.map((client) => client.email.toLowerCase()));
    return [...broughtIn.filter((client) => !seen.has(client.email.toLowerCase())), ...clients];
  }, [broughtIn, clients]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? people.filter((client) =>
          [client.name, client.email, client.organization, client.phone]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
        )
      : people;
    return [...rows].sort((left, right) => left.name.localeCompare(right.name));
  }, [people, search]);

  const slugs = useMemo(() => clientSlugs(people), [people]);

  async function onImport(text: string) {
    const parsed = readClientCsv(text);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    const seen = new Set(people.map((client) => client.email.toLowerCase()));
    const fresh = parsed.rows.filter((row) => {
      const email = row.email.toLowerCase();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
    try {
      if (devPreview) {
        const now = new Date().toISOString();
        setBroughtIn((current) => [
          ...fresh.map((row) => ({
            id: crypto.randomUUID(),
            ...row,
            archived: false,
            created_at: now,
            updated_at: now,
          })),
          ...current,
        ]);
      } else if (fresh.length > 0) {
        await bringIn({ data: fresh });
        await queryClient.invalidateQueries({ queryKey: ["os", "clients"] });
      }
      const note = [
        csvImportNote(fresh.length, parsed.rows.length - fresh.length, parsed.rejected.length, devPreview),
        parsed.rejected[0]?.reason,
      ]
        .filter(Boolean)
        .join(". ");
      if (fresh.length > 0) toast.success(note);
      else toast.message(note);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "import failed");
    }
  }

  if (!isAdmin) {
    return (
      <div className="studio-home is-book">
        <p className="studio-pearl-note">directories are available to admin users only.</p>
      </div>
    );
  }

  return (
    <DirectoryHome
      title="clients"
      back={{ to: "/shelf", label: "shelf" }}
      lede={isPending ? "gathering…" : `${people.length} ${people.length === 1 ? "person" : "people"}`}
      action={
        <DirectoryImport
          hint="columns: name, email, phone, organization, type, source, notes"
          onText={onImport}
        />
      }
    >
      <DirectorySearch label="find a client" value={search} placeholder="find a person" onChange={setSearch} />
      {isPending ? <p className="studio-empty">gathering…</p> : null}
      {!isPending && visible.length === 0 ? <p className="studio-empty">nobody in the book yet.</p> : null}
      {visible.length > 0 ? (
        <div className="studio-directory">
          {visible.map((client) => (
            <Link
              key={client.id}
              to="/clients/$id"
              params={{ id: slugs.get(client.id) ?? client.id }}
              className="studio-book-row"
            >
              <span>
                <b>{shownName(client.name, isPersonType(client.type))}</b>
                <em>{client.organization || client.email}</em>
              </span>
              <small>{client.type.replaceAll("_", " ")}</small>
            </Link>
          ))}
        </div>
      ) : null}
    </DirectoryHome>
  );
}
