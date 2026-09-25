import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  Field,
  GlassCard,
  PageHeader,
  Pill,
  SoftButton,
  inputClass,
} from "@/components/portal/bits";
import type { VendorRow, VenueRow } from "@/integrations/supabase/types";
import {
  archiveVendor,
  archiveVenue,
  listDirectories,
  saveVendor,
  saveVenue,
} from "@/lib/os/clients.functions";
import { getDevPreviewDirectories } from "@/lib/dev-preview";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/settings/directories")({
  head: () => ({
    meta: [{ title: "Directories — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: DirectoriesPage,
});

type VenueForm = Pick<
  VenueRow,
  "name" | "address" | "contact_name" | "contact_email" | "contact_phone" | "load_in_notes"
> & { id?: string };
type VendorForm = Pick<
  VendorRow,
  "name" | "type" | "contact_name" | "contact_email" | "contact_phone" | "ordering_method"
> & { id?: string };

const emptyVenue: VenueForm = {
  name: "",
  address: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  load_in_notes: "",
};
const emptyVendor: VendorForm = {
  name: "",
  type: "wholesaler",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  ordering_method: "",
};

function DirectoriesPage() {
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const queryClient = useQueryClient();
  const fetchDirectories = useServerFn(listDirectories);
  const submitVenue = useServerFn(saveVenue);
  const submitVendor = useServerFn(saveVendor);
  const removeVenue = useServerFn(archiveVenue);
  const removeVendor = useServerFn(archiveVendor);
  const [tab, setTab] = useState<"venues" | "vendors">("venues");
  const [venueForm, setVenueForm] = useState<VenueForm | null>(null);
  const [vendorForm, setVendorForm] = useState<VendorForm | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["os", "directories", devPreview],
    queryFn: () => (devPreview ? getDevPreviewDirectories() : fetchDirectories()),
    enabled: isAdmin,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["os", "directories"] });

  const venueSave = useMutation({
    mutationFn: (values: VenueForm) => {
      if (devPreview) {
        toast.message("Preview mode — venue not saved");
        return Promise.resolve({ id: values.id ?? "preview-venue" });
      }
      return submitVenue({ data: values });
    },
    onSuccess: () => {
      toast.success(venueForm?.id ? "Venue updated" : "Venue created");
      setVenueForm(null);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const vendorSave = useMutation({
    mutationFn: (values: VendorForm) => {
      if (devPreview) {
        toast.message("Preview mode — vendor not saved");
        return Promise.resolve({ id: values.id ?? "preview-vendor" });
      }
      return submitVendor({ data: values });
    },
    onSuccess: () => {
      toast.success(vendorForm?.id ? "Vendor updated" : "Vendor created");
      setVendorForm(null);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const venueArchive = useMutation({
    mutationFn: (id: string) => {
      if (devPreview) {
        toast.message("Preview mode — venue not archived");
        return Promise.resolve({ ok: true as const });
      }
      return removeVenue({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Venue archived");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const vendorArchive = useMutation({
    mutationFn: (id: string) => {
      if (devPreview) {
        toast.message("Preview mode — vendor not archived");
        return Promise.resolve({ ok: true as const });
      }
      return removeVendor({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Vendor archived");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <EmptyState
        title="Admin access required"
        body="Studio directories are managed by Admin users."
      />
    );
  }

  const venues = data?.venues ?? [];
  const vendors = data?.vendors ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Directories"
        description="Venue access instructions and vendor ordering context for production."
        actions={
          <SoftButton
            variant="primary"
            onClick={() =>
              tab === "venues" ? setVenueForm({ ...emptyVenue }) : setVendorForm({ ...emptyVendor })
            }
          >
            New {tab === "venues" ? "venue" : "vendor"}
          </SoftButton>
        }
      />

      <div className="mb-6 flex gap-2">
        {(["venues", "vendors"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={
              tab === item
                ? "rounded-full bg-primary px-4 py-2 text-xs font-semibold tracking-[0.12em] text-primary-foreground uppercase"
                : "rounded-full border border-border px-4 py-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
            }
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "venues" && venueForm ? (
        <GlassCard className="mb-6">
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              venueSave.mutate(venueForm);
            }}
          >
            <Field label="Venue name">
              <input
                required
                className={inputClass}
                value={venueForm.name}
                onChange={(event) => setVenueForm({ ...venueForm, name: event.target.value })}
              />
            </Field>
            <Field label="Address">
              <input
                required
                className={inputClass}
                value={venueForm.address}
                onChange={(event) => setVenueForm({ ...venueForm, address: event.target.value })}
              />
            </Field>
            <Field label="Contact name">
              <input
                className={inputClass}
                value={venueForm.contact_name ?? ""}
                onChange={(event) =>
                  setVenueForm({ ...venueForm, contact_name: event.target.value })
                }
              />
            </Field>
            <Field label="Contact email">
              <input
                type="email"
                className={inputClass}
                value={venueForm.contact_email ?? ""}
                onChange={(event) =>
                  setVenueForm({ ...venueForm, contact_email: event.target.value })
                }
              />
            </Field>
            <Field label="Contact phone">
              <input
                className={inputClass}
                value={venueForm.contact_phone ?? ""}
                onChange={(event) =>
                  setVenueForm({ ...venueForm, contact_phone: event.target.value })
                }
              />
            </Field>
            <Field label="Load-in & access" className="md:col-span-2">
              <textarea
                rows={5}
                className={inputClass}
                value={venueForm.load_in_notes ?? ""}
                onChange={(event) =>
                  setVenueForm({ ...venueForm, load_in_notes: event.target.value })
                }
                placeholder="Loading dock, elevator, parking, COI, arrival window…"
              />
            </Field>
            <div className="flex gap-2 md:col-span-2">
              <SoftButton type="submit" variant="primary" disabled={venueSave.isPending}>
                Save venue
              </SoftButton>
              <SoftButton type="button" variant="ghost" onClick={() => setVenueForm(null)}>
                Cancel
              </SoftButton>
            </div>
          </form>
        </GlassCard>
      ) : null}

      {tab === "vendors" && vendorForm ? (
        <GlassCard className="mb-6">
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              vendorSave.mutate(vendorForm);
            }}
          >
            <Field label="Vendor name">
              <input
                required
                className={inputClass}
                value={vendorForm.name}
                onChange={(event) => setVendorForm({ ...vendorForm, name: event.target.value })}
              />
            </Field>
            <Field label="Type">
              <select
                className={inputClass}
                value={vendorForm.type}
                onChange={(event) =>
                  setVendorForm({ ...vendorForm, type: event.target.value as VendorRow["type"] })
                }
              >
                <option value="warehouse">Warehouse</option>
                <option value="wholesaler">Wholesaler</option>
                <option value="rental">Rental</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Contact name">
              <input
                className={inputClass}
                value={vendorForm.contact_name ?? ""}
                onChange={(event) =>
                  setVendorForm({ ...vendorForm, contact_name: event.target.value })
                }
              />
            </Field>
            <Field label="Contact email">
              <input
                type="email"
                className={inputClass}
                value={vendorForm.contact_email ?? ""}
                onChange={(event) =>
                  setVendorForm({ ...vendorForm, contact_email: event.target.value })
                }
              />
            </Field>
            <Field label="Contact phone">
              <input
                className={inputClass}
                value={vendorForm.contact_phone ?? ""}
                onChange={(event) =>
                  setVendorForm({ ...vendorForm, contact_phone: event.target.value })
                }
              />
            </Field>
            <Field label="Ordering method" className="md:col-span-2">
              <textarea
                rows={5}
                className={inputClass}
                value={vendorForm.ordering_method ?? ""}
                onChange={(event) =>
                  setVendorForm({ ...vendorForm, ordering_method: event.target.value })
                }
                placeholder="Order cutoff, preferred channel, pickup window, account reference…"
              />
            </Field>
            <div className="flex gap-2 md:col-span-2">
              <SoftButton type="submit" variant="primary" disabled={vendorSave.isPending}>
                Save vendor
              </SoftButton>
              <SoftButton type="button" variant="ghost" onClick={() => setVendorForm(null)}>
                Cancel
              </SoftButton>
            </div>
          </form>
        </GlassCard>
      ) : null}

      {isPending ? <p className="text-sm text-muted-foreground">Loading directories…</p> : null}

      {tab === "venues" ? (
        venues.length === 0 && !isPending ? (
          <EmptyState
            title="No venues yet"
            body="Add venue details and keep load-in instructions close to every project."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {venues.map((venue) => (
              <GlassCard key={venue.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-light">{venue.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{venue.address}</p>
                  </div>
                  <div className="flex gap-2">
                    <SoftButton
                      onClick={() =>
                        setVenueForm({
                          id: venue.id,
                          name: venue.name,
                          address: venue.address,
                          contact_name: venue.contact_name,
                          contact_email: venue.contact_email,
                          contact_phone: venue.contact_phone,
                          load_in_notes: venue.load_in_notes,
                        })
                      }
                    >
                      Edit
                    </SoftButton>
                    <SoftButton variant="ghost" onClick={() => venueArchive.mutate(venue.id)}>
                      Archive
                    </SoftButton>
                  </div>
                </div>
                <p className="mt-5 text-xs text-muted-foreground">
                  {[venue.contact_name, venue.contact_email, venue.contact_phone]
                    .filter(Boolean)
                    .join(" · ") || "No venue contact"}
                </p>
                <div className="mt-5 rounded-2xl bg-secondary p-4">
                  <p className="eyebrow">Load-in & access</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {venue.load_in_notes || "No load-in notes yet."}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        )
      ) : vendors.length === 0 && !isPending ? (
        <EmptyState
          title="No vendors yet"
          body="Add suppliers and document how the studio places each order."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {vendors.map((vendor) => (
            <GlassCard key={vendor.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-light">{vendor.name}</h2>
                  <div className="mt-2">
                    <Pill>{vendor.type}</Pill>
                  </div>
                </div>
                <div className="flex gap-2">
                  <SoftButton
                    onClick={() =>
                      setVendorForm({
                        id: vendor.id,
                        name: vendor.name,
                        type: vendor.type,
                        contact_name: vendor.contact_name,
                        contact_email: vendor.contact_email,
                        contact_phone: vendor.contact_phone,
                        ordering_method: vendor.ordering_method,
                      })
                    }
                  >
                    Edit
                  </SoftButton>
                  <SoftButton variant="ghost" onClick={() => vendorArchive.mutate(vendor.id)}>
                    Archive
                  </SoftButton>
                </div>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                {[vendor.contact_name, vendor.contact_email, vendor.contact_phone]
                  .filter(Boolean)
                  .join(" · ") || "No vendor contact"}
              </p>
              <div className="mt-5 rounded-2xl bg-secondary p-4">
                <p className="eyebrow">Ordering method</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {vendor.ordering_method || "No ordering instructions yet."}
                </p>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
