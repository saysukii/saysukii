import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin, requireStudioAuth } from "@/integrations/supabase/studio-auth-middleware";
import type {
  ArrangementRow,
  ArrangementType,
  RecipeRow,
  RecipeStemRow,
  StemRow,
  StemUnit,
  VendorRow,
} from "@/integrations/supabase/types";

export type LibraryRecipeStem = RecipeStemRow & {
  stem: StemRow | null;
};

export type LibraryRecipe = RecipeRow & {
  recipe_stems: LibraryRecipeStem[];
};

export type LibraryArrangement = ArrangementRow & {
  default_recipe: LibraryRecipe | null;
};

export type LibraryStem = StemRow & {
  vendor: VendorRow | null;
};

export type LibraryData = {
  arrangements: LibraryArrangement[];
  stems: LibraryStem[];
  vendors: VendorRow[];
  projects: Array<{
    id: string;
    event_name: string;
    event_date: string;
    status: string;
  }>;
  role: "admin" | "team";
};

export type ShoppingListLine = {
  key: string;
  stem_id: string | null;
  label: string;
  color: string;
  quantity: number;
  unit: StemUnit | null;
  received: boolean;
  unit_cost_cents: number | null;
  total_cost_cents: number | null;
};

export type ShoppingListVendorGroup = {
  vendor_id: string | null;
  vendor_name: string;
  ordering_method: string | null;
  items: ShoppingListLine[];
};

const arrangementType = z.enum([
  "installation",
  "arrangement",
  "reception",
  "bridal",
  "delivery",
  "other",
]);
const stemUnit = z.enum(["stem", "bunch", "plant"]);
const idInput = z.object({ id: z.string().uuid() });

const arrangementInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  type: arrangementType,
  description: z.string().trim().max(1200).nullable().optional(),
  price_cents: z.number().int().min(0).max(100_000_000),
  image_path: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
});

const stemInput = z.object({
  id: z.string().uuid().optional(),
  common_name: z.string().trim().min(1).max(160),
  variety: z.string().trim().max(160).nullable().optional(),
  color: z.string().trim().min(1).max(120),
  unit: stemUnit,
  vendor_id: z.string().uuid().nullable().optional(),
  last_known_cost_cents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  active: z.boolean().default(true),
});

const recipeInput = z.object({
  arrangement_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  lines: z
    .array(
      z.object({
        stem_id: z.string().uuid(),
        color: z.string().trim().min(1).max(120),
        quantity: z.number().positive().max(100_000),
      }),
    )
    .min(1)
    .max(100)
    .superRefine((lines, context) => {
      const keys = new Set<string>();
      lines.forEach((line, index) => {
        const key = `${line.stem_id}:${line.color.toLocaleLowerCase()}`;
        if (keys.has(key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Each stem and color combination may only appear once",
            path: [index],
          });
        }
        keys.add(key);
      });
    }),
});

async function studioClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listLibrary = createServerFn({ method: "GET" })
  .middleware([requireStudioAuth])
  .handler(async ({ context }): Promise<LibraryData> => {
    const supabase = await studioClient();
    const [
      arrangementsResult,
      stemsResult,
      recipesResult,
      recipeStemsResult,
      vendorsResult,
      projectsResult,
    ] = await Promise.all([
      supabase.from("arrangements").select("*").order("active", { ascending: false }).order("name"),
      supabase.from("stems").select("*").order("active", { ascending: false }).order("common_name"),
      supabase
        .from("recipes")
        .select("*")
        .eq("is_default", true)
        .is("project_id", null)
        .order("name"),
      supabase.from("recipe_stems").select("*").order("created_at"),
      supabase.from("vendors").select("*").eq("archived", false).order("name"),
      supabase
        .from("projects")
        .select("id, event_name, event_date, status")
        .eq("archived", false)
        .order("event_date"),
    ]);

    for (const result of [
      arrangementsResult,
      stemsResult,
      recipesResult,
      recipeStemsResult,
      vendorsResult,
      projectsResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const stems = (stemsResult.data ?? []) as StemRow[];
    const vendors = (vendorsResult.data ?? []) as VendorRow[];
    const recipes = (recipesResult.data ?? []) as RecipeRow[];
    const recipeStems = (recipeStemsResult.data ?? []) as RecipeStemRow[];
    const stemById = new Map(stems.map((stem) => [stem.id, stem]));
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const recipeById = new Map<string, LibraryRecipe>();

    for (const recipe of recipes) {
      recipeById.set(recipe.id, {
        ...recipe,
        recipe_stems: recipeStems
          .filter((line) => line.recipe_id === recipe.id)
          .map((line) => ({ ...line, stem: stemById.get(line.stem_id) ?? null })),
      });
    }

    return {
      role: context.profile.role,
      vendors,
      projects: projectsResult.data ?? [],
      stems: stems.map((stem) => ({
        ...stem,
        vendor: stem.vendor_id ? (vendorById.get(stem.vendor_id) ?? null) : null,
      })),
      arrangements: ((arrangementsResult.data ?? []) as ArrangementRow[]).map((arrangement) => ({
        ...arrangement,
        default_recipe: arrangement.default_recipe_id
          ? (recipeById.get(arrangement.default_recipe_id) ?? null)
          : (recipes
              .filter((recipe) => recipe.arrangement_id === arrangement.id)
              .map((recipe) => recipeById.get(recipe.id) ?? null)
              .find((recipe): recipe is LibraryRecipe => recipe !== null) ?? null),
      })),
    };
  });

export const saveArrangement = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => arrangementInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      type: data.type as ArrangementType,
      description: data.description || null,
      price_cents: data.price_cents,
      image_path: data.image_path || null,
      active: data.active,
    };
    const query = data.id
      ? context.supabase.from("arrangements").update(payload).eq("id", data.id).select("*").single()
      : context.supabase.from("arrangements").insert(payload).select("*").single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return row;
  });

export const setArrangementActive = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => idInput.extend({ active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("arrangements")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveStem = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => stemInput.parse(input))
  .handler(async ({ data, context }) => {
    if (data.vendor_id) {
      const { data: vendor, error: vendorError } = await context.supabase
        .from("vendors")
        .select("id")
        .eq("id", data.vendor_id)
        .eq("archived", false)
        .maybeSingle();
      if (vendorError) throw new Error(vendorError.message);
      if (!vendor) throw new Error("The selected vendor is unavailable");
    }

    const payload = {
      common_name: data.common_name,
      variety: data.variety || null,
      color: data.color,
      unit: data.unit,
      vendor_id: data.vendor_id || null,
      last_known_cost_cents: data.last_known_cost_cents ?? null,
      active: data.active,
    };
    const query = data.id
      ? context.supabase.from("stems").update(payload).eq("id", data.id).select("*").single()
      : context.supabase.from("stems").insert(payload).select("*").single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return row;
  });

export const setStemActive = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => idInput.extend({ active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("stems")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveDefaultRecipe = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => recipeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: arrangement, error: arrangementError } = await context.supabase
      .from("arrangements")
      .select("id, default_recipe_id")
      .eq("id", data.arrangement_id)
      .maybeSingle();
    if (arrangementError) throw new Error(arrangementError.message);
    if (!arrangement) throw new Error("Arrangement not found");

    const stemIds = [...new Set(data.lines.map((line) => line.stem_id))];
    const { data: validStems, error: stemsError } = await context.supabase
      .from("stems")
      .select("id")
      .in("id", stemIds);
    if (stemsError) throw new Error(stemsError.message);
    if ((validStems ?? []).length !== stemIds.length) {
      throw new Error("One or more selected stems are unavailable");
    }

    let recipeId = arrangement.default_recipe_id;
    if (recipeId) {
      const { data: linkedRecipe, error: linkedRecipeError } = await context.supabase
        .from("recipes")
        .select("id")
        .eq("id", recipeId)
        .eq("arrangement_id", arrangement.id)
        .is("project_id", null)
        .maybeSingle();
      if (linkedRecipeError) throw new Error(linkedRecipeError.message);
      if (!linkedRecipe) {
        throw new Error("The arrangement's default recipe linkage is invalid");
      }
    }
    if (!recipeId) {
      const { data: existing, error: existingError } = await context.supabase
        .from("recipes")
        .select("id")
        .eq("arrangement_id", arrangement.id)
        .eq("is_default", true)
        .is("project_id", null)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      recipeId = existing?.id ?? null;
    }

    let created = false;
    if (recipeId) {
      const { error } = await context.supabase
        .from("recipes")
        .update({ name: data.name, is_default: true })
        .eq("id", recipeId)
        .eq("arrangement_id", arrangement.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: recipe, error } = await context.supabase
        .from("recipes")
        .insert({
          arrangement_id: arrangement.id,
          project_id: null,
          name: data.name,
          is_default: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      recipeId = recipe.id;
      created = true;
    }

    const { data: previousLines, error: previousError } = await context.supabase
      .from("recipe_stems")
      .select("stem_id, color, quantity")
      .eq("recipe_id", recipeId);
    if (previousError) throw new Error(previousError.message);

    const { error: deleteError } = await context.supabase
      .from("recipe_stems")
      .delete()
      .eq("recipe_id", recipeId);
    if (deleteError) throw new Error(deleteError.message);

    const { error: linesError } = await context.supabase.from("recipe_stems").insert(
      data.lines.map((line) => ({
        recipe_id: recipeId!,
        stem_id: line.stem_id,
        color: line.color,
        quantity: line.quantity,
      })),
    );
    if (linesError) {
      if (created) {
        await context.supabase.from("recipes").delete().eq("id", recipeId);
      } else if ((previousLines ?? []).length > 0) {
        await context.supabase.from("recipe_stems").insert(
          previousLines!.map((line) => ({
            recipe_id: recipeId!,
            stem_id: line.stem_id,
            color: line.color,
            quantity: line.quantity,
          })),
        );
      }
      throw new Error(linesError.message);
    }

    const { error: linkError } = await context.supabase
      .from("arrangements")
      .update({ default_recipe_id: recipeId })
      .eq("id", arrangement.id);
    if (linkError) throw new Error(linkError.message);
    return { id: recipeId };
  });

export const clearDefaultRecipe = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ arrangement_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: arrangement, error: arrangementError } = await context.supabase
      .from("arrangements")
      .select("default_recipe_id")
      .eq("id", data.arrangement_id)
      .maybeSingle();
    if (arrangementError) throw new Error(arrangementError.message);
    if (!arrangement) throw new Error("Arrangement not found");

    let recipeId = arrangement.default_recipe_id;
    if (!recipeId) {
      const { data: recipe, error: recipeError } = await context.supabase
        .from("recipes")
        .select("id")
        .eq("arrangement_id", data.arrangement_id)
        .eq("is_default", true)
        .is("project_id", null)
        .maybeSingle();
      if (recipeError) throw new Error(recipeError.message);
      recipeId = recipe?.id ?? null;
    }

    const { error: unlinkError } = await context.supabase
      .from("arrangements")
      .update({ default_recipe_id: null })
      .eq("id", data.arrangement_id);
    if (unlinkError) throw new Error(unlinkError.message);

    if (recipeId) {
      const { error } = await context.supabase
        .from("recipes")
        .delete()
        .eq("id", recipeId)
        .eq("arrangement_id", data.arrangement_id)
        .is("project_id", null);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getProjectShoppingList = createServerFn({ method: "GET" })
  .middleware([requireStudioAuth])
  .validator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = await studioClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, client_id, event_name, event_date, venue_id, venue_text, status")
      .eq("id", data.project_id)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found");

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, updated_at")
      .eq("project_id", project.id)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);

    const [clientResult, venueResult, itemsResult, stemsResult, vendorsResult] = await Promise.all([
      supabase.from("clients").select("name").eq("id", project.client_id).maybeSingle(),
      project.venue_id
        ? supabase.from("venues").select("name").eq("id", project.venue_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      order
        ? supabase.from("order_items").select("*").eq("order_id", order.id).order("created_at")
        : Promise.resolve({ data: [], error: null }),
      supabase.from("stems").select("*"),
      supabase.from("vendors").select("*"),
    ]);
    for (const result of [clientResult, venueResult, itemsResult, stemsResult, vendorsResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const stems = (stemsResult.data ?? []) as StemRow[];
    const vendors = (vendorsResult.data ?? []) as VendorRow[];
    const stemById = new Map(stems.map((stem) => [stem.id, stem]));
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const lines = new Map<
      string,
      ShoppingListLine & { vendor_id: string | null; vendor_name: string }
    >();

    for (const item of itemsResult.data ?? []) {
      const stem = item.stem_id ? (stemById.get(item.stem_id) ?? null) : null;
      const color = item.color || stem?.color || "Unspecified";
      const label = stem
        ? `${stem.common_name}${stem.variety ? ` · ${stem.variety}` : ""}`
        : item.manual_label || "Manual item";
      const vendorId = item.vendor_id || stem?.vendor_id || null;
      const vendor = vendorId ? (vendorById.get(vendorId) ?? null) : null;
      const key = [
        vendorId || "unassigned",
        item.stem_id || `manual:${label.toLocaleLowerCase()}`,
        color.toLocaleLowerCase(),
        item.unit || stem?.unit || "unit",
      ].join(":");
      const existing = lines.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.received = existing.received && item.received;
        existing.total_cost_cents =
          existing.unit_cost_cents === null
            ? null
            : Math.round(existing.quantity * existing.unit_cost_cents);
      } else {
        const unitCost = stem?.last_known_cost_cents ?? null;
        lines.set(key, {
          key,
          stem_id: item.stem_id,
          label,
          color,
          quantity: item.quantity,
          unit: item.unit || stem?.unit || null,
          received: item.received,
          unit_cost_cents: unitCost,
          total_cost_cents: unitCost === null ? null : Math.round(item.quantity * unitCost),
          vendor_id: vendorId,
          vendor_name: vendor?.name ?? "Vendor unassigned",
        });
      }
    }

    const groups = new Map<string, ShoppingListVendorGroup>();
    for (const line of lines.values()) {
      const groupKey = line.vendor_id ?? "unassigned";
      const vendor = line.vendor_id ? (vendorById.get(line.vendor_id) ?? null) : null;
      const group = groups.get(groupKey) ?? {
        vendor_id: line.vendor_id,
        vendor_name: line.vendor_name,
        ordering_method: vendor?.ordering_method ?? null,
        items: [],
      };
      const { vendor_id: _vendorId, vendor_name: _vendorName, ...publicLine } = line;
      group.items.push(publicLine);
      groups.set(groupKey, group);
    }

    const vendorGroups = [...groups.values()]
      .map((group) => ({
        ...group,
        items: group.items.sort(
          (a, b) => a.label.localeCompare(b.label) || a.color.localeCompare(b.color),
        ),
      }))
      .sort((a, b) => {
        if (a.vendor_id === null) return 1;
        if (b.vendor_id === null) return -1;
        return a.vendor_name.localeCompare(b.vendor_name);
      });
    const allLines = vendorGroups.flatMap((group) => group.items);
    const allCostsKnown =
      allLines.length > 0 && allLines.every((line) => line.total_cost_cents !== null);

    return {
      project: {
        ...project,
        client_name: clientResult.data?.name ?? "Client",
        venue_name: venueResult.data?.name ?? project.venue_text ?? null,
      },
      order: order ?? null,
      groups: vendorGroups,
      grand_total_cents: allCostsKnown
        ? allLines.reduce((sum, line) => sum + (line.total_cost_cents ?? 0), 0)
        : null,
    };
  });
