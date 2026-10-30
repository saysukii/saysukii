import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FloridaAddressPicker } from "@/components/inquiry/FloridaAddressPicker";
import { DirectoryHome } from "@/components/portal/DirectoryHome";
import {
  ContactFields,
  DirectoryRecord,
  RecordContacts,
  RecordFact,
  RecordNotes,
  RecordPlace,
} from "@/components/portal/DirectoryRecord";
import type { DirectoryContact, VendorRow } from "@/integrations/supabase/types";
import { getDevPreviewDirectories } from "@/lib/dev-preview";
import { archiveVendor, listDirectories, saveVendor } from "@/lib/os/clients.functions";
import { contactsForSave, recordContacts } from "@/lib/directory-contacts";
import { withoutCountry } from "@/lib/place-text";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/directories/vendors/$id")({
  head: () => ({
    meta: [{ title: "Vendor — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: VendorPage,
});

const VENDOR_KINDS: VendorRow["type"][] = ["wholesaler", "warehouse", "rental", "other"];

type Directories = Awaited<ReturnType<typeof getDevPreviewDirectories>>;

function VendorPage() {
  const { id } = Route.useParams();
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const router = useRouter();
  const queryClient = useQueryClient();
  const fetchDirectories = useServerFn(listDirectories);
  const submitVendor = useServerFn(saveVendor);
  const removeVendors = useServerFn(archiveVendor);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "wholesaler" as VendorRow["type"],
    contacts: [] as DirectoryContact[],
    address: "",
    ordering_method: "",
  });

  const queryKey = ["os", "directories", devPreview] as const;
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => (devPreview ? getDevPreviewDirectories() : fetchDirectories()),
    enabled: isAdmin,
  });
  const vendor = data?.vendors.find((item) => item.id === id);

  useEffect(() => {
    if (!vendor) return;
    setForm({
      name: vendor.name,
      type: vendor.type,
      contacts: recordContacts(vendor),
      address: vendor.address ?? "",
      ordering_method: vendor.ordering_method ?? "",
    });
  }, [vendor]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("a vendor needs a name.");
      const { contacts, ...fields } = form;
      const saved = { ...fields, ...contactsForSave(contacts) };
      if (devPreview) {
        // preview keeps the edit on screen so the page can be tried
        queryClient.setQueryData<Directories>(queryKey, (current) =>
          current
            ? {
                ...current,
                vendors: current.vendors.map((item) =>
                  item.id === id ? { ...item, ...saved } : item,
                ),
              }
            : current,
        );
        return false;
      }
      await submitVendor({ data: { id, ...saved } });
      return true;
    },
    onSuccess: (saved) => {
      setEditing(false);
      toast.success(saved ? "vendor updated" : "preview mode — vendor not saved");
      if (saved) void queryClient.invalidateQueries({ queryKey: ["os", "directories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (devPreview) {
        queryClient.setQueryData<Directories>(queryKey, (current) =>
          current
            ? { ...current, vendors: current.vendors.filter((item) => item.id !== id) }
            : current,
        );
        return;
      }
      await removeVendors({ data: { ids: [id] } });
    },
    onSuccess: async () => {
      toast.success("vendor archived");
      if (!devPreview) await queryClient.invalidateQueries({ queryKey: ["os", "directories"] });
      await router.navigate({ to: "/directories/vendors" });
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

  if (!vendor) {
    return (
      <DirectoryHome title="vendor" back={{ to: "/directories/vendors", label: "vendors" }}>
        <p className="studio-pearl-note">this vendor could not be found.</p>
      </DirectoryHome>
    );
  }

  const place = withoutCountry(vendor.address);
  return (
    <DirectoryRecord
      crumb={{ to: "/directories/vendors", label: "vendors" }}
      name={vendor.name}
      kind={vendor.type}
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
              <span>kind</span>
              <select
                className="studio-select"
                value={form.type}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value as VendorRow["type"] })
                }
              >
                {VENDOR_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <ContactFields
              contacts={form.contacts}
              onChange={(contacts) => setForm((current) => ({ ...current, contacts }))}
            />
            <div className="studio-field">
              <span>location</span>
              <FloridaAddressPicker
                label="location"
                value={form.address}
                placeholder="search a place"
                onChange={(address) => setForm((current) => ({ ...current, address }))}
              />
            </div>
            <label className="studio-field is-wide">
              <span>ordering notes</span>
              <textarea
                className="studio-textarea"
                value={form.ordering_method}
                onChange={(event) => setForm({ ...form, ordering_method: event.target.value })}
              />
            </label>
            <button type="submit" className="studio-today-go" disabled={save.isPending}>
              {save.isPending ? "saving…" : "save vendor"}
            </button>
          </form>
        ) : null
      }
      rail={
        <>
          <RecordFact label="contact">
            <RecordContacts contacts={recordContacts(vendor)} />
          </RecordFact>
          {place ? (
            <RecordFact label="location">
              <RecordPlace address={place} />
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
                if (window.confirm("archive this vendor?")) archive.mutate();
              }}
            >
              archive
            </button>
          </div>
        </>
      }
    >
      <RecordNotes
        label="ordering notes"
        notes={vendor.ordering_method}
        empty="no ordering notes yet."
      />
    </DirectoryRecord>
  );
}
