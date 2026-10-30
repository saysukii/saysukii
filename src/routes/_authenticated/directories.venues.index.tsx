import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AskField } from "@/components/portal/ask-form";
import {
  DirectoryHome,
  DirectoryImport,
  DirectoryPick,
  DirectorySearch,
  DirectorySelectBar,
  DirectorySelectToggle,
} from "@/components/portal/DirectoryHome";
import { BloomWait } from "@/components/portal/StudioLoader";
import { PersonName } from "@/components/studio/PersonName";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VenueRow } from "@/integrations/supabase/types";
import { getDevPreviewDirectories } from "@/lib/dev-preview";
import { archiveVenue, importVenues, listDirectories, saveVenue } from "@/lib/os/clients.functions";
import { csvImportNote, readVenueCsv } from "@/lib/os/directory-csv";
import { withoutCountry } from "@/lib/place-text";
import { useDevPreview } from "@/lib/use-dev-preview";
import { typePhone } from "@/lib/phone";
import { useDirectorySelection } from "@/lib/use-directory-selection";

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
  const removeVenues = useServerFn(archiveVenue);
  const [search, setSearch] = useState("");
  const [broughtIn, setBroughtIn] = useState<VenueRow[]>([]);
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const selection = useDirectorySelection();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isPending } = useQuery({
    queryKey: ["os", "directories", devPreview],
    queryFn: () => (devPreview ? getDevPreviewDirectories() : fetchDirectories()),
    enabled: isAdmin,
  });

  const saved = useMemo(() => data?.venues ?? [], [data]);
  const venues = useMemo(() => {
    const seen = new Set(saved.map((venue) => venue.name.trim().toLowerCase()));
    return [
      ...broughtIn.filter((venue) => !seen.has(venue.name.trim().toLowerCase())),
      ...saved,
    ].filter((venue) => !gone.has(venue.id));
  }, [broughtIn, gone, saved]);
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
        csvImportNote(
          fresh.length,
          parsed.rows.length - fresh.length,
          parsed.rejected.length,
          devPreview,
        ),
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
      if (devPreview) {
        const now = new Date().toISOString();
        return {
          id: crypto.randomUUID(),
          name: form.name.trim(),
          address: form.address.trim(),
          contact_name: form.contact_name.trim() || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          load_in_notes: form.load_in_notes.trim() || null,
          archived: false,
          created_at: now,
          updated_at: now,
        } satisfies VenueRow;
      }
      return submitVenue({ data: form });
    },
    onSuccess: async (row) => {
      if (devPreview) setBroughtIn((current) => [row, ...current]);
      toast.success("added");
      setAdding(false);
      setForm(emptyForm);
      if (!devPreview) await queryClient.invalidateQueries({ queryKey: ["os", "directories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    createVenue.mutate();
  }

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!devPreview) await removeVenues({ data: { ids } });
      return ids;
    },
    onSuccess: async (ids) => {
      setGone((current) => new Set([...current, ...ids]));
      selection.stop();
      toast.success(ids.length === 1 ? "venue deleted" : `${ids.length} venues deleted`);
      if (!devPreview) await queryClient.invalidateQueries({ queryKey: ["os", "directories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

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
      back={{ to: "/library", label: "library" }}
      lede={isPending ? undefined : `${venues.length} ${venues.length === 1 ? "venue" : "venues"}`}
      action={
        <>
          <DirectoryImport
            hint="a csv exported from notion, or columns: name, address, contact name, contact email, contact phone, load in notes, website, capacity"
            onText={onImport}
          />
          <button type="button" className="studio-today-go" onClick={() => setAdding(true)}>
            add
          </button>
          {venues.length > 0 ? <DirectorySelectToggle selection={selection} /> : null}
        </>
      }
    >
      <DirectorySearch
        label="find a venue"
        value={search}
        placeholder="find a venue"
        onChange={setSearch}
      />
      {isPending ? <p className="studio-empty">gathering…</p> : null}
      {!isPending && visible.length === 0 ? <p className="studio-empty">no venues yet.</p> : null}
      {visible.length > 0 ? (
        <div className="studio-directory">
          <DirectorySelectBar
            selection={selection}
            visibleIds={visible.map((venue) => venue.id)}
            noun={["venue", "venues"]}
            busy={remove.isPending}
            onDelete={(ids) => remove.mutate(ids)}
          />
          {visible.map((venue) => {
            const row = (
              <>
                <span>
                  <b>{venue.name}</b>
                  <em>{withoutCountry(venue.address) || venue.category || "no location yet"}</em>
                </span>
                {venue.contact_name ? (
                  <small>
                    <PersonName name={venue.contact_name} />
                  </small>
                ) : null}
              </>
            );
            return selection.on ? (
              <DirectoryPick key={venue.id} selection={selection} id={venue.id}>
                {row}
              </DirectoryPick>
            ) : (
              <Link
                key={venue.id}
                to="/directories/venues/$id"
                params={{ id: venue.id }}
                className="studio-book-row"
              >
                {row}
              </Link>
            );
          })}
        </div>
      ) : null}

      <Dialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          if (!open) setForm(emptyForm);
        }}
      >
        <DialogContent
          overlayClassName="studio-task-veil"
          className="studio-task-modal is-ask"
          hideClose
        >
          <div className="studio-task-head">
            <DialogClose className="studio-task-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogTitle className="sr-only">add a venue</DialogTitle>
          <DialogDescription className="sr-only">a room or a garden.</DialogDescription>
          <form className="studio-task-form" onSubmit={submit}>
            <label className="studio-task-composer-title">
              <span className="sr-only">the place</span>
              <input
                autoFocus
                value={form.name}
                maxLength={200}
                placeholder="the place…"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <div className="studio-ask-grid is-two studio-ask-stack-form">
              <AskField label="address" className="studio-ask-span">
                <input
                  required
                  value={form.address}
                  maxLength={500}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </AskField>
              <AskField label="contact">
                <input
                  value={form.contact_name}
                  maxLength={160}
                  autoComplete="name"
                  onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                />
              </AskField>
              <AskField label="email">
                <input
                  type="email"
                  value={form.contact_email}
                  maxLength={320}
                  autoComplete="email"
                  onChange={(event) => setForm({ ...form, contact_email: event.target.value })}
                />
              </AskField>
              <AskField label="phone">
                <input
                  type="tel"
                  value={form.contact_phone}
                  maxLength={50}
                  autoComplete="tel"
                  onChange={(event) =>
                    setForm({ ...form, contact_phone: typePhone(event.target.value) })
                  }
                />
              </AskField>
              <AskField label="load-in" className="studio-ask-span">
                <textarea
                  value={form.load_in_notes}
                  maxLength={5000}
                  placeholder="how to arrive…"
                  onChange={(event) => setForm({ ...form, load_in_notes: event.target.value })}
                />
              </AskField>
            </div>
            <div className="studio-ask-foot">
              <button
                type="submit"
                className="studio-today-go"
                disabled={!form.name.trim() || !form.address.trim() || createVenue.isPending}
              >
                {createVenue.isPending ? "saving…" : "create"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DirectoryHome>
  );
}
