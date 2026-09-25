import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  BookOpen,
  Flower2,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sprout,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import type { ArrangementType, StemUnit } from "@/integrations/supabase/types";
import {
  clearDefaultRecipe,
  listLibrary,
  saveArrangement,
  saveDefaultRecipe,
  saveStem,
  setArrangementActive,
  setStemActive,
  type LibraryArrangement,
  type LibraryStem,
} from "@/lib/os/library.functions";
import { formatMoneyExact, parseDollarsToCents } from "@/lib/money";
import { getDevPreviewLibrary } from "@/lib/dev-preview";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Arrangement & Stem Library — Say Sukii OS" },
      {
        name: "description",
        content: "Studio arrangements, default recipes, stems, and sourcing.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LibraryPage,
});

const ARRANGEMENT_TYPES: Array<{ value: ArrangementType; label: string }> = [
  { value: "installation", label: "Installation" },
  { value: "arrangement", label: "Arrangement" },
  { value: "reception", label: "Reception" },
  { value: "bridal", label: "Bridal" },
  { value: "delivery", label: "Delivery" },
  { value: "other", label: "Other" },
];

const STEM_UNITS: StemUnit[] = ["stem", "bunch", "plant"];

type ArrangementDraft = {
  id?: string;
  name: string;
  type: ArrangementType;
  description: string;
  price: string;
  image_path: string;
  active: boolean;
};

type StemDraft = {
  id?: string;
  common_name: string;
  variety: string;
  color: string;
  unit: StemUnit;
  vendor_id: string;
  cost: string;
  active: boolean;
};

type RecipeDraft = {
  name: string;
  lines: Array<{ key: string; stem_id: string; color: string; quantity: string }>;
};

const emptyArrangement = (): ArrangementDraft => ({
  name: "",
  type: "arrangement",
  description: "",
  price: "",
  image_path: "",
  active: true,
});

const emptyStem = (): StemDraft => ({
  common_name: "",
  variety: "",
  color: "",
  unit: "stem",
  vendor_id: "",
  cost: "",
  active: true,
});

function LibraryPage() {
  const devPreview = useDevPreview();
  const queryClient = useQueryClient();
  const fetchLibrary = useServerFn(listLibrary);
  const persistArrangement = useServerFn(saveArrangement);
  const changeArrangementActive = useServerFn(setArrangementActive);
  const persistStem = useServerFn(saveStem);
  const changeStemActive = useServerFn(setStemActive);
  const persistRecipe = useServerFn(saveDefaultRecipe);
  const removeRecipe = useServerFn(clearDefaultRecipe);

  const [tab, setTab] = useState<"arrangements" | "stems">("arrangements");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [arrangementDraft, setArrangementDraft] = useState<ArrangementDraft | null>(null);
  const [stemDraft, setStemDraft] = useState<StemDraft | null>(null);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>({ name: "", lines: [] });
  const [shoppingProjectId, setShoppingProjectId] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["os-library", devPreview],
    queryFn: () => (devPreview ? getDevPreviewLibrary() : fetchLibrary()),
  });
  const isAdmin = data?.role === "admin";
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["os-library"] });

  const arrangements = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (data?.arrangements ?? []).filter(
      (item) =>
        (item.active || (isAdmin && showInactive)) &&
        (!query ||
          item.name.toLocaleLowerCase().includes(query) ||
          item.type.toLocaleLowerCase().includes(query) ||
          item.description?.toLocaleLowerCase().includes(query)),
    );
  }, [data?.arrangements, isAdmin, search, showInactive]);

  const stems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (data?.stems ?? []).filter(
      (item) =>
        (item.active || (isAdmin && showInactive)) &&
        (!query ||
          item.common_name.toLocaleLowerCase().includes(query) ||
          item.variety?.toLocaleLowerCase().includes(query) ||
          item.color.toLocaleLowerCase().includes(query) ||
          item.vendor?.name.toLocaleLowerCase().includes(query)),
    );
  }, [data?.stems, isAdmin, search, showInactive]);

  function editArrangement(item?: LibraryArrangement) {
    if (!item) {
      setArrangementDraft(emptyArrangement());
      setRecipeDraft({ name: "", lines: [] });
      return;
    }
    setArrangementDraft({
      id: item.id,
      name: item.name,
      type: item.type,
      description: item.description ?? "",
      price: (item.price_cents / 100).toString(),
      image_path: item.image_path ?? "",
      active: item.active,
    });
    setRecipeDraft({
      name: item.default_recipe?.name ?? `${item.name} · House recipe`,
      lines:
        item.default_recipe?.recipe_stems.map((line) => ({
          key: line.id,
          stem_id: line.stem_id,
          color: line.color,
          quantity: String(line.quantity),
        })) ?? [],
    });
  }

  function editStem(item?: LibraryStem) {
    if (!item) {
      setStemDraft(emptyStem());
      return;
    }
    setStemDraft({
      id: item.id,
      common_name: item.common_name,
      variety: item.variety ?? "",
      color: item.color,
      unit: item.unit,
      vendor_id: item.vendor_id ?? "",
      cost:
        item.last_known_cost_cents === null ? "" : (item.last_known_cost_cents / 100).toString(),
      active: item.active,
    });
  }

  const arrangementSave = useMutation({
    mutationFn: (draft: ArrangementDraft) => {
      if (devPreview) {
        toast.message("Preview mode — arrangement not saved");
        return Promise.resolve({ id: draft.id ?? "preview-arrangement" });
      }
      return persistArrangement({
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          type: draft.type,
          description: draft.description || null,
          price_cents: parseDollarsToCents(draft.price),
          image_path: draft.image_path || null,
          active: draft.active,
        },
      });
    },
    onSuccess: (saved) => {
      toast.success(
        saved.id === arrangementDraft?.id ? "Arrangement updated" : "Arrangement added",
      );
      setArrangementDraft((current) => (current ? { ...current, id: saved.id } : null));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const arrangementActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => {
      if (devPreview) {
        toast.message("Preview mode — arrangement not updated");
        return Promise.resolve({ ok: true as const });
      }
      return changeArrangementActive({ data: { id, active } });
    },
    onSuccess: (_result, variables) => {
      toast.success(variables.active ? "Arrangement restored" : "Arrangement made inactive");
      if (arrangementDraft?.id === variables.id) setArrangementDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stemSave = useMutation({
    mutationFn: (draft: StemDraft) => {
      if (devPreview) {
        toast.message("Preview mode — stem not saved");
        return Promise.resolve({ id: draft.id ?? "preview-stem" });
      }
      return persistStem({
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          common_name: draft.common_name,
          variety: draft.variety || null,
          color: draft.color,
          unit: draft.unit,
          vendor_id: draft.vendor_id || null,
          last_known_cost_cents: draft.cost ? parseDollarsToCents(draft.cost) : null,
          active: draft.active,
        },
      });
    },
    onSuccess: (saved) => {
      toast.success(saved.id === stemDraft?.id ? "Stem updated" : "Stem added");
      setStemDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stemActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => {
      if (devPreview) {
        toast.message("Preview mode — stem not updated");
        return Promise.resolve({ ok: true as const });
      }
      return changeStemActive({ data: { id, active } });
    },
    onSuccess: (_result, variables) => {
      toast.success(variables.active ? "Stem restored" : "Stem made inactive");
      if (stemDraft?.id === variables.id) setStemDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recipeSave = useMutation({
    mutationFn: (arrangementId: string) => {
      if (devPreview) {
        toast.message("Preview mode — recipe not saved");
        return Promise.resolve({ id: "preview-recipe" });
      }
      return persistRecipe({
        data: {
          arrangement_id: arrangementId,
          name: recipeDraft.name,
          lines: recipeDraft.lines.map((line) => ({
            stem_id: line.stem_id,
            color: line.color,
            quantity: Number(line.quantity),
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Default recipe saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recipeClear = useMutation({
    mutationFn: (arrangementId: string) => {
      if (devPreview) {
        toast.message("Preview mode — recipe not removed");
        return Promise.resolve({ ok: true as const });
      }
      return removeRecipe({ data: { arrangement_id: arrangementId } });
    },
    onSuccess: () => {
      toast.success("Default recipe removed");
      setRecipeDraft({ name: "", lines: [] });
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedArrangement = data?.arrangements.find((item) => item.id === arrangementDraft?.id);

  return (
    <div>
      <PageHeader
        eyebrow="Studio library"
        title="Arrangements & stems"
        description="Reusable design recipes and the stem catalogue behind every production order."
        actions={
          data && data.projects.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Project shopping list"
                className={`${inputClass} min-w-52 py-2.5`}
                value={shoppingProjectId}
                onChange={(event) => setShoppingProjectId(event.target.value)}
              >
                <option value="">Project shopping list…</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.event_name} · {project.event_date}
                  </option>
                ))}
              </select>
              <a
                href={shoppingProjectId ? `/library/${shoppingProjectId}/shopping-list` : undefined}
                aria-disabled={!shoppingProjectId}
                className={`bloom-glow inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold tracking-[0.12em] text-primary-foreground uppercase transition-all ${
                  shoppingProjectId ? "" : "pointer-events-none opacity-50"
                }`}
              >
                <ListChecks className="size-3.5" />
                Open
              </a>
            </div>
          ) : null
        }
      />

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2">
          <TabButton
            active={tab === "arrangements"}
            onClick={() => {
              setTab("arrangements");
              setSearch("");
            }}
            icon={<Flower2 className="size-3.5" />}
          >
            Arrangements
          </TabButton>
          <TabButton
            active={tab === "stems"}
            onClick={() => {
              setTab("stems");
              setSearch("");
            }}
            icon={<Sprout className="size-3.5" />}
          >
            Stems
          </TabButton>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {isAdmin ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Show inactive
            </label>
          ) : null}
          <label className="flex min-w-0 items-center gap-2 border-b border-border px-1 py-2 sm:w-64">
            <Search className="size-3.5 text-muted-foreground" />
            <span className="sr-only">Search library</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${tab}`}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          {isAdmin ? (
            <SoftButton
              variant="primary"
              onClick={() => (tab === "arrangements" ? editArrangement() : editStem())}
            >
              <Plus className="size-3.5" />
              Add {tab === "arrangements" ? "arrangement" : "stem"}
            </SoftButton>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Gathering the studio library…
        </p>
      ) : null}

      {tab === "arrangements" && data ? (
        <div
          className={
            arrangementDraft && isAdmin
              ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)]"
              : ""
          }
        >
          <div>
            {arrangements.length === 0 ? (
              <EmptyState
                title="No arrangements in this view"
                body={
                  isAdmin
                    ? "Add an arrangement or include inactive records."
                    : "An admin can add arrangements to the studio library."
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {arrangements.map((item) => (
                  <ArrangementCard
                    key={item.id}
                    item={item}
                    isAdmin={isAdmin}
                    selected={arrangementDraft?.id === item.id}
                    onEdit={() => editArrangement(item)}
                    onActiveChange={(active) => arrangementActive.mutate({ id: item.id, active })}
                  />
                ))}
              </div>
            )}
          </div>

          {arrangementDraft && isAdmin ? (
            <ArrangementEditor
              draft={arrangementDraft}
              setDraft={setArrangementDraft}
              recipe={recipeDraft}
              setRecipe={setRecipeDraft}
              stems={data.stems}
              hadRecipe={Boolean(selectedArrangement?.default_recipe)}
              savingArrangement={arrangementSave.isPending}
              savingRecipe={recipeSave.isPending}
              onSaveArrangement={() => arrangementSave.mutate(arrangementDraft)}
              onSaveRecipe={() => arrangementDraft.id && recipeSave.mutate(arrangementDraft.id)}
              onClearRecipe={() => arrangementDraft.id && recipeClear.mutate(arrangementDraft.id)}
              onClose={() => setArrangementDraft(null)}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "stems" && data ? (
        <div
          className={
            stemDraft && isAdmin
              ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)]"
              : ""
          }
        >
          <div>
            {stems.length === 0 ? (
              <EmptyState
                title="No stems in this view"
                body={
                  isAdmin
                    ? "Add a stem or include inactive records."
                    : "An admin can add stems to the studio library."
                }
              />
            ) : (
              <div className="overflow-hidden rounded-3xl border border-border/60 bg-background/45">
                <div className="hidden grid-cols-[minmax(12rem,1.2fr)_1fr_0.7fr_0.8fr_auto] gap-4 border-b border-border/60 px-5 py-3 text-[0.6rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase md:grid">
                  <span>Stem</span>
                  <span>Color</span>
                  <span>Unit</span>
                  <span>Vendor</span>
                  <span>Cost</span>
                </div>
                <div className="divide-y divide-border/50">
                  {stems.map((item) => (
                    <StemRow
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      onEdit={() => editStem(item)}
                      onActiveChange={(active) => stemActive.mutate({ id: item.id, active })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {stemDraft && isAdmin ? (
            <StemEditor
              draft={stemDraft}
              setDraft={setStemDraft}
              vendors={data.vendors}
              saving={stemSave.isPending}
              onSave={() => stemSave.mutate(stemDraft)}
              onClose={() => setStemDraft(null)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[0.65rem] font-semibold tracking-[0.12em] text-primary-foreground uppercase"
          : "inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-foreground"
      }
    >
      {icon}
      {children}
    </button>
  );
}

function ArrangementCard({
  item,
  isAdmin,
  selected,
  onEdit,
  onActiveChange,
}: {
  item: LibraryArrangement;
  isAdmin: boolean;
  selected: boolean;
  onEdit: () => void;
  onActiveChange: (active: boolean) => void;
}) {
  return (
    <GlassCard
      className={`flex min-h-64 flex-col p-5 ${selected ? "ring-2 ring-ring/50" : ""} ${
        item.active ? "" : "opacity-65"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <Pill tone={item.active ? "neutral" : "ink"}>{item.active ? item.type : "Inactive"}</Pill>
        <p className="display-number text-lg">{formatMoneyExact(item.price_cents)}</p>
      </div>
      <h2 className="mt-6 text-2xl font-light leading-tight">{item.name}</h2>
      {item.description ? (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      ) : null}
      <div className="mt-auto border-t border-border/60 pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BookOpen className="size-3.5" />
          {item.default_recipe ? (
            <span>
              {item.default_recipe.name} · {item.default_recipe.recipe_stems.length} stem
              {item.default_recipe.recipe_stems.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span>No default recipe</span>
          )}
        </div>
        {isAdmin ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <SoftButton onClick={onEdit}>
              <Pencil className="size-3.5" />
              Edit
            </SoftButton>
            <SoftButton variant="ghost" onClick={() => onActiveChange(!item.active)}>
              {item.active ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />}
              {item.active ? "Make inactive" : "Restore"}
            </SoftButton>
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}

function ArrangementEditor({
  draft,
  setDraft,
  recipe,
  setRecipe,
  stems,
  hadRecipe,
  savingArrangement,
  savingRecipe,
  onSaveArrangement,
  onSaveRecipe,
  onClearRecipe,
  onClose,
}: {
  draft: ArrangementDraft;
  setDraft: React.Dispatch<React.SetStateAction<ArrangementDraft | null>>;
  recipe: RecipeDraft;
  setRecipe: React.Dispatch<React.SetStateAction<RecipeDraft>>;
  stems: LibraryStem[];
  hadRecipe: boolean;
  savingArrangement: boolean;
  savingRecipe: boolean;
  onSaveArrangement: () => void;
  onSaveRecipe: () => void;
  onClearRecipe: () => void;
  onClose: () => void;
}) {
  const selectableStems = stems.filter(
    (stem) => stem.active || recipe.lines.some((line) => line.stem_id === stem.id),
  );
  const recipeValid =
    recipe.name.trim().length > 0 &&
    recipe.lines.length > 0 &&
    recipe.lines.every(
      (line) =>
        line.stem_id &&
        line.color.trim() &&
        Number.isFinite(Number(line.quantity)) &&
        Number(line.quantity) > 0,
    );

  return (
    <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
      <GlassCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{draft.id ? "Edit arrangement" : "New arrangement"}</p>
            <h2 className="mt-2 text-2xl font-light">{draft.name || "Untitled arrangement"}</h2>
          </div>
          <SoftButton variant="ghost" onClick={onClose}>
            Close
          </SoftButton>
        </div>
        <form
          className="mt-6 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveArrangement();
          }}
        >
          <Field label="Name" className="sm:col-span-2">
            <input
              required
              className={inputClass}
              value={draft.name}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
              placeholder="Low garden meadow"
            />
          </Field>
          <Field label="Type">
            <select
              className={inputClass}
              value={draft.type}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        type: event.target.value as ArrangementType,
                      }
                    : current,
                )
              }
            >
              {ARRANGEMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price (USD)">
            <input
              required
              inputMode="decimal"
              className={inputClass}
              value={draft.price}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, price: event.target.value } : current,
                )
              }
              placeholder="275"
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea
              className={`${inputClass} min-h-24 resize-y`}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, description: event.target.value } : current,
                )
              }
              placeholder="Shape, scale, mechanics, and intended use"
            />
          </Field>
          <Field
            label="Image path"
            hint="Optional stored image path or URL"
            className="sm:col-span-2"
          >
            <input
              className={inputClass}
              value={draft.image_path}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, image_path: event.target.value } : current,
                )
              }
              placeholder="arrangements/low-meadow.webp"
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, active: event.target.checked } : current,
                )
              }
            />
            Active in library
          </label>
          <div className="flex justify-end">
            <SoftButton
              type="submit"
              variant="primary"
              disabled={!draft.name.trim() || savingArrangement}
            >
              {savingArrangement ? "Saving…" : "Save arrangement"}
            </SoftButton>
          </div>
        </form>
      </GlassCard>

      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Optional default recipe</p>
            <h3 className="mt-2 text-xl font-light">Stem formula</h3>
          </div>
          <SoftButton
            disabled={!draft.id || selectableStems.length === 0}
            onClick={() => {
              const first = selectableStems[0];
              if (!first) return;
              setRecipe((current) => ({
                ...current,
                name: current.name || `${draft.name || "Arrangement"} · House recipe`,
                lines: [
                  ...current.lines,
                  {
                    key: crypto.randomUUID(),
                    stem_id: first.id,
                    color: first.color,
                    quantity: "1",
                  },
                ],
              }));
            }}
          >
            <Plus className="size-3.5" />
            Add stem
          </SoftButton>
        </div>
        {!draft.id ? (
          <p className="mt-5 text-sm text-muted-foreground">
            Save the arrangement before creating its default recipe.
          </p>
        ) : (
          <>
            <Field label="Recipe name" className="mt-5">
              <input
                className={inputClass}
                value={recipe.name}
                onChange={(event) =>
                  setRecipe((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder={`${draft.name} · House recipe`}
              />
            </Field>
            {recipe.lines.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
                No default formula. Project recipes can still be built independently.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {recipe.lines.map((line) => (
                  <div
                    key={line.key}
                    className="grid gap-3 rounded-2xl border border-border/60 p-3 sm:grid-cols-[1.3fr_1fr_5rem_auto]"
                  >
                    <select
                      aria-label="Stem"
                      className={inputClass}
                      value={line.stem_id}
                      onChange={(event) => {
                        const selected = stems.find((stem) => stem.id === event.target.value);
                        setRecipe((current) => ({
                          ...current,
                          lines: current.lines.map((entry) =>
                            entry.key === line.key
                              ? {
                                  ...entry,
                                  stem_id: event.target.value,
                                  color: selected?.color ?? entry.color,
                                }
                              : entry,
                          ),
                        }));
                      }}
                    >
                      {selectableStems.map((stem) => (
                        <option key={stem.id} value={stem.id}>
                          {stem.common_name}
                          {stem.variety ? ` · ${stem.variety}` : ""}
                          {stem.active ? "" : " (inactive)"}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Recipe color"
                      className={inputClass}
                      value={line.color}
                      onChange={(event) =>
                        setRecipe((current) => ({
                          ...current,
                          lines: current.lines.map((entry) =>
                            entry.key === line.key
                              ? { ...entry, color: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                      placeholder="Color"
                    />
                    <input
                      aria-label="Quantity"
                      inputMode="decimal"
                      className={inputClass}
                      value={line.quantity}
                      onChange={(event) =>
                        setRecipe((current) => ({
                          ...current,
                          lines: current.lines.map((entry) =>
                            entry.key === line.key
                              ? { ...entry, quantity: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                      placeholder="Qty"
                    />
                    <button
                      type="button"
                      aria-label="Remove stem"
                      className="justify-self-center text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setRecipe((current) => ({
                          ...current,
                          lines: current.lines.filter((entry) => entry.key !== line.key),
                        }))
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {hadRecipe ? (
                <SoftButton variant="ghost" onClick={onClearRecipe}>
                  Remove recipe
                </SoftButton>
              ) : null}
              <SoftButton
                variant="primary"
                disabled={!recipeValid || savingRecipe}
                onClick={onSaveRecipe}
              >
                {savingRecipe ? "Saving…" : "Save recipe"}
              </SoftButton>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}

function StemRow({
  item,
  isAdmin,
  onEdit,
  onActiveChange,
}: {
  item: LibraryStem;
  isAdmin: boolean;
  onEdit: () => void;
  onActiveChange: (active: boolean) => void;
}) {
  return (
    <div
      className={`grid gap-3 px-5 py-4 md:grid-cols-[minmax(12rem,1.2fr)_1fr_0.7fr_0.8fr_auto] md:items-center md:gap-4 ${
        item.active ? "" : "opacity-60"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium">{item.common_name}</p>
          {!item.active ? <Pill tone="ink">Inactive</Pill> : null}
        </div>
        {item.variety ? <p className="mt-1 text-xs text-muted-foreground">{item.variety}</p> : null}
      </div>
      <p className="text-sm">
        <span className="mr-2 text-[0.6rem] tracking-[0.12em] text-muted-foreground uppercase md:hidden">
          Color
        </span>
        {item.color}
      </p>
      <p className="text-sm text-muted-foreground">{item.unit}</p>
      <p className="truncate text-sm text-muted-foreground">{item.vendor?.name ?? "Unassigned"}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
        <span className="display-number text-sm">
          {item.last_known_cost_cents === null ? "—" : formatMoneyExact(item.last_known_cost_cents)}
        </span>
        {isAdmin ? (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={`Edit ${item.common_name}`}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onActiveChange(!item.active)}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={
                item.active ? `Make ${item.common_name} inactive` : `Restore ${item.common_name}`
              }
            >
              {item.active ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StemEditor({
  draft,
  setDraft,
  vendors,
  saving,
  onSave,
  onClose,
}: {
  draft: StemDraft;
  setDraft: React.Dispatch<React.SetStateAction<StemDraft | null>>;
  vendors: Array<{ id: string; name: string; type: string }>;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const change = <K extends keyof StemDraft>(key: K, value: StemDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <GlassCard className="xl:sticky xl:top-6 xl:self-start">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{draft.id ? "Edit stem" : "New stem"}</p>
          <h2 className="mt-2 text-2xl font-light">{draft.common_name || "Untitled stem"}</h2>
        </div>
        <SoftButton variant="ghost" onClick={onClose}>
          Close
        </SoftButton>
      </div>
      <form
        className="mt-6 grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <Field label="Common name">
          <input
            required
            className={inputClass}
            value={draft.common_name}
            onChange={(event) => change("common_name", event.target.value)}
            placeholder="Garden rose"
          />
        </Field>
        <Field label="Variety">
          <input
            className={inputClass}
            value={draft.variety}
            onChange={(event) => change("variety", event.target.value)}
            placeholder="Koko Loko"
          />
        </Field>
        <Field label="Color">
          <input
            required
            className={inputClass}
            value={draft.color}
            onChange={(event) => change("color", event.target.value)}
            placeholder="Mauve"
          />
        </Field>
        <Field label="Unit">
          <select
            className={inputClass}
            value={draft.unit}
            onChange={(event) => change("unit", event.target.value as StemUnit)}
          >
            {STEM_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor" className="sm:col-span-2">
          <select
            className={inputClass}
            value={draft.vendor_id}
            onChange={(event) => change("vendor_id", event.target.value)}
          >
            <option value="">Unassigned</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name} · {vendor.type}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Last known cost (USD)"
          hint="Optional; omitted from shopping lists when unknown"
          className="sm:col-span-2"
        >
          <input
            inputMode="decimal"
            className={inputClass}
            value={draft.cost}
            onChange={(event) => change("cost", event.target.value)}
            placeholder="3.75"
          />
        </Field>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => change("active", event.target.checked)}
          />
          Active in library
        </label>
        <div className="flex justify-end">
          <SoftButton
            type="submit"
            variant="primary"
            disabled={!draft.common_name.trim() || !draft.color.trim() || saving}
          >
            {saving ? "Saving…" : "Save stem"}
          </SoftButton>
        </div>
      </form>
    </GlassCard>
  );
}
