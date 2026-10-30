import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FloridaAddressPicker } from "@/components/inquiry/FloridaAddressPicker";
import { DirectoryHome } from "@/components/portal/DirectoryHome";
import {
  ContactFields,
  DirectoryRecord,
  EditablePlace,
  RecordContacts,
  RecordFact,
  RecordNotes,
  RecordWebsite,
} from "@/components/portal/DirectoryRecord";
import { PersonName } from "@/components/studio/PersonName";
import { PlaceLink } from "@/components/studio/PlaceLink";
import type { DirectoryContact } from "@/integrations/supabase/types";
import { getDevPreviewDirectories, getDevPreviewPipeline } from "@/lib/dev-preview";
import { formatDate } from "@/lib/money";
import { archiveVenue, listDirectories, saveVenue } from "@/lib/os/clients.functions";
import { listInquiryPipeline } from "@/lib/os/inquiries.functions";
import { EVENT_LABEL, STATUS_LABEL } from "@/lib/os/inquiry-desk";
import { contactsForSave, recordContacts } from "@/lib/directory-contacts";
import { withoutCountry } from "@/lib/place-text";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/directories/venues/$id")({
  head: () => ({
    meta: [{ title: "Venue — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: VenuePage,
});

type Directories = Awaited<ReturnType<typeof getDevPreviewDirectories>>;

function VenuePage() {
  const { id } = Route.useParams();
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const router = useRouter();
  const queryClient = useQueryClient();
  const fetchDirectories = useServerFn(listDirectories);
  const fetchInquiries = useServerFn(listInquiryPipeline);
  const submitVenue = useServerFn(saveVenue);
  const removeVenues = useServerFn(archiveVenue);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    address: "",
    website: "",
    capacity: "",
    contacts: [] as DirectoryContact[],
    load_in_notes: "",
  });

  const queryKey = ["os", "directories", devPreview] as const;
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => (devPreview ? getDevPreviewDirectories() : fetchDirectories()),
    enabled: isAdmin,
  });
  const { data: inquiries = [] } = useQuery({
    queryKey: ["inquiry-pipeline", devPreview],
    queryFn: () => (devPreview ? getDevPreviewPipeline() : fetchInquiries()),
    enabled: isAdmin,
  });
  const venue = data?.venues.find((item) => item.id === id);

  // the form mirrors the saved venue while it's closed; once open, typing isn't overwritten
  useEffect(() => {
    if (!venue || editing) return;
    setForm({
      name: venue.name,
      category: venue.category ?? "",
      address: venue.address ?? "",
      website: venue.website ?? "",
      capacity: venue.capacity ?? "",
      contacts: recordContacts(venue),
      load_in_notes: venue.load_in_notes ?? "",
    });
  }, [venue, editing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("a venue needs a name.");
      const { contacts, ...fields } = form;
      const saved = { ...fields, ...contactsForSave(contacts) };
      if (devPreview) {
        // preview keeps the edit on screen so the page can be tried
        queryClient.setQueryData<Directories>(queryKey, (current) =>
          current
            ? {
                ...current,
                venues: current.venues.map((item) =>
                  item.id === id ? { ...item, ...saved } : item,
                ),
              }
            : current,
        );
        return false;
      }
      await submitVenue({ data: { id, ...saved } });
      return true;
    },
    onSuccess: (saved) => {
      setEditing(false);
      toast.success(saved ? "venue updated" : "preview mode — venue not saved");
      if (saved) void queryClient.invalidateQueries({ queryKey: ["os", "directories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const savedLocation = withoutCountry(venue?.address);
  const keepLocation = useMutation({
    mutationFn: async (address: string) => {
      if (!venue) throw new Error("this venue could not be found.");
      // an open edit form picks up the new location without losing anything else typed there
      setForm((current) => ({ ...current, address }));
      if (devPreview) {
        queryClient.setQueryData<Directories>(queryKey, (current) =>
          current
            ? {
                ...current,
                venues: current.venues.map((item) =>
                  item.id === id ? { ...item, address } : item,
                ),
              }
            : current,
        );
        return false;
      }
      // only the location changes; anything half-typed in the edit form stays where it is
      await submitVenue({
        data: {
          id,
          name: venue.name,
          address,
          category: venue.category ?? null,
          website: venue.website ?? null,
          capacity: venue.capacity ?? null,
          contact_name: venue.contact_name,
          contact_email: venue.contact_email ?? "",
          contact_phone: venue.contact_phone,
          load_in_notes: venue.load_in_notes,
        },
      });
      return true;
    },
    onSuccess: (saved) => {
      toast.success(saved ? "location saved" : "preview mode — location not saved");
      if (saved) void queryClient.invalidateQueries({ queryKey: ["os", "directories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (devPreview) {
        queryClient.setQueryData<Directories>(queryKey, (current) =>
          current
            ? { ...current, venues: current.venues.filter((item) => item.id !== id) }
            : current,
        );
        return;
      }
      await removeVenues({ data: { ids: [id] } });
    },
    onSuccess: async () => {
      toast.success("venue archived");
      if (!devPreview) await queryClient.invalidateQueries({ queryKey: ["os", "directories"] });
      await router.navigate({ to: "/directories/venues" });
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

  if (isPending) return null;

  if (!venue) {
    return (
      <DirectoryHome title="venue" back={{ to: "/directories/venues", label: "venues" }}>
        <p className="studio-pearl-note">this venue could not be found.</p>
      </DirectoryHome>
    );
  }

  const place = withoutCountry(venue.address);
  const named = venue.name.trim().toLowerCase();
  // the jobs held here: linked to the venue, or written in with its name
  const held = inquiries.filter(
    (inquiry) =>
      inquiry.venue_id === venue.id ||
      (named.length > 3 && (inquiry.venue_text ?? "").toLowerCase().includes(named)),
  );

  return (
    <DirectoryRecord
      crumb={{ to: "/directories/venues", label: "venues" }}
      name={venue.name}
      kind={venue.category}
      line={venue.capacity ? `up to ${venue.capacity} guests` : null}
      editor={
        editing ? (
          <form
            className="studio-client-edit"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <label className="studio-field">
              <span>name</span>
              <input
                className="studio-input"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>category</span>
              <input
                className="studio-input"
                value={form.category}
                placeholder="event space, hotel, gallery"
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              />
            </label>
            <div className="studio-field">
              <span>location</span>
              <FloridaAddressPicker
                label="location"
                value={form.address}
                placeholder="search a place"
                onChange={(address) => setForm((current) => ({ ...current, address }))}
              />
            </div>
            <label className="studio-field">
              <span>website</span>
              <input
                className="studio-input"
                value={form.website}
                onChange={(event) => setForm({ ...form, website: event.target.value })}
              />
            </label>
            <label className="studio-field">
              <span>capacity</span>
              <input
                className="studio-input"
                inputMode="numeric"
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
              />
            </label>
            <ContactFields
              contacts={form.contacts}
              onChange={(contacts) => setForm((current) => ({ ...current, contacts }))}
            />
            <label className="studio-field is-wide">
              <span>load-in notes</span>
              <textarea
                className="studio-textarea"
                value={form.load_in_notes}
                onChange={(event) => setForm({ ...form, load_in_notes: event.target.value })}
              />
            </label>
            <button type="submit" className="studio-today-go" disabled={save.isPending}>
              {save.isPending ? "saving…" : "save venue"}
            </button>
          </form>
        ) : null
      }
      rail={
        <>
          <RecordFact label="contact">
            <RecordContacts contacts={recordContacts(venue)} />
          </RecordFact>
          <p className="studio-home-label">location</p>
          <EditablePlace
            value={savedLocation}
            label="location"
            placeholder="add a location"
            onSave={(address) => keepLocation.mutate(address)}
          />
          {venue.website ? (
            <RecordFact label="website">
              <RecordWebsite url={venue.website} />
            </RecordFact>
          ) : null}
          {venue.capacity ? (
            <RecordFact label="capacity">
              <p>{venue.capacity} guests</p>
            </RecordFact>
          ) : null}
          <hr className="studio-ledger-split" />
          <div className="studio-ledger-actions">
            <button
              type="button"
              className="studio-ghost"
              onClick={() => setEditing((open) => !open)}
            >
              {editing ? "close" : "edit"}
            </button>
            <button
              type="button"
              className="studio-ghost is-quiet"
              disabled={archive.isPending}
              onClick={() => {
                if (window.confirm("archive this venue?")) archive.mutate();
              }}
            >
              archive
            </button>
          </div>
        </>
      }
    >
      <RecordNotes
        label="load-in notes"
        notes={venue.load_in_notes}
        empty="no load-in notes yet."
      />
      <p className="studio-home-label">held here</p>
      {held.length === 0 ? <p className="studio-empty">no inquiries here yet.</p> : null}
      {held.length > 0 ? (
        <div className="studio-book-review-rows">
          {held.map((inquiry) => (
            <Link
              key={inquiry.id}
              to="/pipeline/$id"
              params={{ id: inquiry.slug }}
              className={
                inquiry.status === "closed" ? "studio-book-row is-quiet" : "studio-book-row"
              }
            >
              <span>
                <b>
                  {inquiry.client?.name ? (
                    <PersonName name={inquiry.client.name} />
                  ) : (
                    EVENT_LABEL[inquiry.event_type]
                  )}
                </b>
                <em>
                  {[
                    EVENT_LABEL[inquiry.event_type],
                    inquiry.event_date_tbd ? "date tbd" : formatDate(inquiry.event_date),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </em>
              </span>
              <small>{STATUS_LABEL[inquiry.status]}</small>
            </Link>
          ))}
        </div>
      ) : null}
    </DirectoryRecord>
  );
}
