import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DirectoryHome, DirectoryImport, DirectorySearch } from "@/components/portal/DirectoryHome";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { VendorRow } from "@/integrations/supabase/types";
import { getDevPreviewDirectories } from "@/lib/dev-preview";
import { importVendors, listDirectories, saveVendor } from "@/lib/os/clients.functions";
import { csvImportNote, readVendorCsv } from "@/lib/os/directory-csv";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/directories/vendors/")({
  head: () => ({
    meta: [{ title: "Vendors — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: VendorDirectoryPage,
});

const emptyForm = {
  name: "",
  type: "wholesaler" as VendorRow["type"],
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  ordering_method: "",
};

function VendorDirectoryPage() {
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const queryClient = useQueryClient();
  const fetchDirectories = useServerFn(listDirectories);
  const submitVendor = useServerFn(saveVendor);
  const bringIn = useServerFn(importVendors);
  const [search, setSearch] = useState("");
  const [broughtIn, setBroughtIn] = useState<VendorRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isPending } = useQuery({
    queryKey: ["os", "directories", devPreview],
    queryFn: () => (devPreview ? getDevPreviewDirectories() : fetchDirectories()),
    enabled: isAdmin,
  });

  const saved = data?.vendors ?? [];
  const vendors = useMemo(() => {
    const seen = new Set(saved.map((vendor) => vendor.name.trim().toLowerCase()));
    return [...broughtIn.filter((vendor) => !seen.has(vendor.name.trim().toLowerCase())), ...saved];
  }, [broughtIn, saved]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? vendors.filter((vendor) =>
          [vendor.name, vendor.contact_name, vendor.contact_email, vendor.ordering_method, vendor.type]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
        )
      : vendors;
    return [...rows].sort((left, right) => left.name.localeCompare(right.name));
  }, [vendors, search]);

  async function onImport(text: string) {
    const parsed = readVendorCsv(text);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    const seen = new Set(vendors.map((vendor) => vendor.name.trim().toLowerCase()));
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

  const createVendor = useMutation({
    mutationFn: async () => {
      if (devPreview) return null;
      return submitVendor({ data: form });
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
    createVendor.mutate();
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
      title="vendors"
      back={{ to: "/shelf", label: "shelf" }}
      lede={isPending ? "gathering…" : `${vendors.length} ${vendors.length === 1 ? "vendor" : "vendors"}`}
      action={
        <>
          <DirectoryImport
            hint="columns: name, type, contact name, contact email, contact phone, ordering method"
            onText={onImport}
          />
          <button type="button" className="studio-today-go" onClick={() => setAdding(true)}>
            add
          </button>
        </>
      }
    >
      <DirectorySearch label="find a vendor" value={search} placeholder="find a vendor" onChange={setSearch} />
      {isPending ? <p className="studio-empty">gathering…</p> : null}
      {!isPending && visible.length === 0 ? <p className="studio-empty">no vendors yet.</p> : null}
      {visible.length > 0 ? (
        <div className="studio-directory">
          {visible.map((vendor) => (
            <Link key={vendor.id} to="/directories/vendors/$id" params={{ id: vendor.id }} className="studio-book-row">
              <span>
                <b>{vendor.name}</b>
                <em>{vendor.ordering_method || vendor.contact_email || vendor.contact_name || "no ordering notes"}</em>
              </span>
              <small>{vendor.type}</small>
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
          <DialogTitle className="sr-only">add a vendor</DialogTitle>
          <DialogDescription className="sr-only">name, how to order, and who to call.</DialogDescription>
          <form className="studio-task-form" onSubmit={submit}>
            <p className="studio-ask-hint">a supplier, added by hand.</p>
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
              <span>type</span>
              <select
                className="studio-select"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as VendorRow["type"] })}
              >
                <option value="warehouse">warehouse</option>
                <option value="wholesaler">wholesaler</option>
                <option value="rental">rental</option>
                <option value="other">other</option>
              </select>
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
              <span>how to order</span>
              <textarea
                className="studio-textarea"
                rows={3}
                value={form.ordering_method}
                onChange={(event) => setForm({ ...form, ordering_method: event.target.value })}
              />
            </label>
            <div className="studio-ask-foot">
              <button type="submit" className="studio-today-go" disabled={createVendor.isPending}>
                {createVendor.isPending ? "adding…" : "add"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DirectoryHome>
  );
}
