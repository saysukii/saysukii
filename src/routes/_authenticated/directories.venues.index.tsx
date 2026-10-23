import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DirectoryHome, DirectoryImport, DirectorySearch } from "@/components/portal/DirectoryHome";
import { PersonName } from "@/components/studio/PersonName";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { VenueRow } from "@/integrations/supabase/types";
import { getDevPreviewDirectories } from "@/lib/dev-preview";
import { importVenues, listDirectories, saveVenue } from "@/lib/os/clients.functions";
import { csvImportNote, readVenueCsv } from "@/lib/os/directory-csv";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/directories/venues/")({
  head: () => ({
    meta: [{ title: "Venues — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: VenueDirectoryPage,
});

const emptyForm = {
  name: "",
  address: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  load_in_notes: "",
};

function VenueDirectoryPage() {
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const queryClient = useQueryClient();
  const fetchDirectories = useServerFn(listDirectories);
  const submitVenue = useServerFn(saveVenue);
  const bringIn = useServerFn(importVenues);
  const [search, setSearch] = useState("");
  const [broughtIn, setBroughtIn] = useState<VenueRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isPending } = useQuery({
    queryKey: ["os", "directories", devPreview],
    queryFn: () => (devPreview ? getDevPreviewDirectories() : fetchDirectories()),
    enabled: isAdmin,
  });

  const saved = data?.venues ?? [];
  const venues = useMemo(() => {
    const seen = new Set(saved.map((venue) => venue.name.trim().toLowerCase()));
    return [...broughtIn.filter((venue) => !seen.has(venue.name.trim().toLowerCase())), ...saved];
  }, [broughtIn, saved]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? venues.filter((venue) =>
          [venue.name, venue.address, venue.contact_name, venue.contact_email]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
        )
      : venues;
    return [...rows].sort((left, right) => left.name.localeCompare(right.name));
  }, [venues, search]);

  async function onImport(text: string) {
    const parsed = readVenueCsv(text);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    const seen = new Set(venues.map((venue) => venue.name.trim().toLowerCase()));
    const fresh = parsed.rows.filter((row) => {
      const name = row.name.trim().toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
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
        await queryClient.invalidateQueries({ queryKey: ["os", "directories"] });
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

  const createVenue = useMutation({
    mutationFn: async () => {
      if (devPreview) return null;
      return submitVenue({ data: form });
    },
    onSuccess: async (row) => {
      if (!row) {
        toast.message("preview — not saved");
        return;
      }
      toast.success("added");
      setAdding(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["os", "directories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    createVenue.mutate();
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
      title="venues"
      back={{ to: "/shelf", label: "shelf" }}
      lede={isPending ? "gathering…" : `${venues.length} ${venues.length === 1 ? "venue" : "venues"}`}
      action={
        <>
          <DirectoryImport
            hint="columns: name, address, contact name, contact email, contact phone, load in notes"
            onText={onImport}
          />
          <button type="button" className="studio-today-go" onClick={() => setAdding(true)}>
            add
          </button>
        </>
      }
    >
      <DirectorySearch label="find a venue" value={search} placeholder="find a venue" onChange={setSearch} />
      {isPending ? <p className="studio-empty">gathering…</p> : null}
      {!isPending && visible.length === 0 ? <p className="studio-empty">no venues yet.</p> : null}
      {visible.length > 0 ? (
        <div className="studio-directory">
          {visible.map((venue) => (
            <Link key={venue.id} to="/directories/venues/$id" params={{ id: venue.id }} className="studio-book-row">
              <span>
                <b>{venue.name}</b>
                <em>{venue.address}</em>
              </span>
              {venue.contact_name ? (
                <small>
                  <PersonName name={venue.contact_name} />
                </small>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}

      <Dialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          if (!open) setForm(emptyForm);
        }}
      >
        <DialogContent overlayClassName="studio-task-veil" className="studio-task-modal is-ask is-soft" hideClose>
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">add a venue</DialogTitle>
          <DialogDescription className="sr-only">name, address, and how to load in.</DialogDescription>
          <form className="studio-task-form" onSubmit={submit}>
            <p className="studio-ask-hint">a room or a garden, added by hand.</p>
            <label className="studio-field">
              <span>name</span>
              <input
                required
                className="studio-input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>address</span>
              <input
                required
                className="studio-input"
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>contact</span>
              <input
                className="studio-input"
                value={form.contact_name}
                onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>email</span>
              <input
                type="email"
                className="studio-input"
                value={form.contact_email}
                onChange={(event) => setForm({ ...form, contact_email: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>load-in</span>
              <textarea
                className="studio-textarea"
                rows={3}
                value={form.load_in_notes}
                onChange={(event) => setForm({ ...form, load_in_notes: event.target.value })}
              />
            </label>
            <div className="studio-ask-foot">
              <button type="submit" className="studio-today-go" disabled={createVenue.isPending}>
                {createVenue.isPending ? "adding…" : "add"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DirectoryHome>
  );
}
