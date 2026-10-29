import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AskChips, AskField } from "@/components/portal/ask-form";
import {
  DirectoryHome,
  DirectoryImport,
  DirectoryPick,
  DirectorySearch,
  DirectorySelectBar,
  DirectorySelectToggle,
} from "@/components/portal/DirectoryHome";
import { PersonName } from "@/components/studio/PersonName";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VendorRow } from "@/integrations/supabase/types";
import { getDevPreviewDirectories } from "@/lib/dev-preview";
import {
  archiveVendor,
  importVendors,
  listDirectories,
  saveVendor,
} from "@/lib/os/clients.functions";
import { csvImportNote, readVendorCsv } from "@/lib/os/directory-csv";
import { useDevPreview } from "@/lib/use-dev-preview";
import { useDirectorySelection } from "@/lib/use-directory-selection";

export const Route = createFileRoute("/_authenticated/directories/vendors/")({
  head: () => ({
    meta: [{ title: "Vendors — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: VendorDirectoryPage,
});

const VENDOR_KINDS: Array<{ value: VendorRow["type"]; label: string }> = [
  { value: "warehouse", label: "warehouse" },
  { value: "wholesaler", label: "wholesaler" },
  { value: "rental", label: "rental" },
  { value: "other", label: "other" },
];

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
  const removeVendors = useServerFn(archiveVendor);
  const [search, setSearch] = useState("");
  const [broughtIn, setBroughtIn] = useState<VendorRow[]>([]);
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const selection = useDirectorySelection();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isPending } = useQuery({
    queryKey: ["os", "directories", devPreview],
    queryFn: () => (devPreview ? getDevPreviewDirectories() : fetchDirectories()),
    enabled: isAdmin,
  });

  const saved = useMemo(() => data?.vendors ?? [], [data]);
  const vendors = useMemo(() => {
    const seen = new Set(saved.map((vendor) => vendor.name.trim().toLowerCase()));
    return [
      ...broughtIn.filter((vendor) => !seen.has(vendor.name.trim().toLowerCase())),
      ...saved,
    ].filter((vendor) => !gone.has(vendor.id));
  }, [broughtIn, gone, saved]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? vendors.filter((vendor) =>
          [
            vendor.name,
            vendor.contact_name,
            vendor.contact_email,
            vendor.ordering_method,
            vendor.type,
          ]
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

  const createVendor = useMutation({
    mutationFn: async () => {
      if (devPreview) {
        const now = new Date().toISOString();
        return {
          id: crypto.randomUUID(),
          name: form.name.trim(),
          type: form.type,
          contact_name: form.contact_name.trim() || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          ordering_method: form.ordering_method.trim() || null,
          archived: false,
          created_at: now,
          updated_at: now,
        } satisfies VendorRow;
      }
      return submitVendor({ data: form });
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
    createVendor.mutate();
  }

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!devPreview) await removeVendors({ data: { ids } });
      return ids;
    },
    onSuccess: async (ids) => {
      setGone((current) => new Set([...current, ...ids]));
      selection.stop();
      toast.success(ids.length === 1 ? "vendor deleted" : `${ids.length} vendors deleted`);
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
      title="vendors"
      back={{ to: "/library", label: "library" }}
      lede={
        isPending ? undefined : `${vendors.length} ${vendors.length === 1 ? "vendor" : "vendors"}`
      }
      action={
        <>
          <DirectoryImport
            hint="columns: name, type, contact name, contact email, contact phone, ordering method"
            onText={onImport}
          />
          <button type="button" className="studio-today-go" onClick={() => setAdding(true)}>
            add
          </button>
          {vendors.length > 0 ? <DirectorySelectToggle selection={selection} /> : null}
        </>
      }
    >
      <DirectorySearch
        label="find a vendor"
        value={search}
        placeholder="find a vendor"
        onChange={setSearch}
      />
      {!isPending && visible.length === 0 ? <p className="studio-empty">no vendors yet.</p> : null}
      {visible.length > 0 ? (
        <div className="studio-directory">
          <DirectorySelectBar
            selection={selection}
            visibleIds={visible.map((vendor) => vendor.id)}
            noun={["vendor", "vendors"]}
            busy={remove.isPending}
            onDelete={(ids) => remove.mutate(ids)}
          />
          {visible.map((vendor) => {
            const row = (
              <>
                <span>
                  <b>{vendor.name}</b>
                  <em>
                    {vendor.ordering_method ||
                      vendor.contact_email ||
                      (vendor.contact_name ? (
                        <PersonName name={vendor.contact_name} />
                      ) : (
                        "no ordering notes"
                      ))}
                  </em>
                </span>
                <small>{vendor.type}</small>
              </>
            );
            return selection.on ? (
              <DirectoryPick key={vendor.id} selection={selection} id={vendor.id}>
                {row}
              </DirectoryPick>
            ) : (
              <Link
                key={vendor.id}
                to="/directories/vendors/$id"
                params={{ id: vendor.id }}
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
          <DialogTitle className="sr-only">add a vendor</DialogTitle>
          <DialogDescription className="sr-only">
            a market, a wholesaler, or a rental.
          </DialogDescription>
          <form className="studio-task-form" onSubmit={submit}>
            <label className="studio-task-composer-title">
              <span className="sr-only">who is this</span>
              <input
                autoFocus
                value={form.name}
                maxLength={200}
                placeholder="who is this…"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <AskChips
              label="kind"
              options={VENDOR_KINDS}
              value={form.type}
              onPick={(type) => setForm({ ...form, type })}
            />
            <div className="studio-ask-grid is-two studio-ask-stack-form">
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
                  onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                />
              </AskField>
              <AskField label="how to order" className="studio-ask-span">
                <textarea
                  value={form.ordering_method}
                  maxLength={5000}
                  placeholder="how to order…"
                  onChange={(event) => setForm({ ...form, ordering_method: event.target.value })}
                />
              </AskField>
            </div>
            <div className="studio-ask-foot">
              <button
                type="submit"
                className="studio-today-go"
                disabled={!form.name.trim() || createVendor.isPending}
              >
                {createVendor.isPending ? "saving…" : "create"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DirectoryHome>
  );
}
