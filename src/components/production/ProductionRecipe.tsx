import { Check, Flower2, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { QtyStepper } from "@/components/production/fields";
import { ProdSection, type BoardProps } from "@/components/production/parts";
import { useChange } from "@/components/production/use-change";
import { ConfirmRemove } from "@/components/studio/ConfirmRemove";
import type { ProductionStemRow } from "@/integrations/supabase/types";
import { FLOWER_COLORS, flowerMatches } from "@/lib/os/production";
import { cn } from "@/lib/utils";

const ANY = "";

function swatchFor(color: string) {
  return FLOWER_COLORS.find((item) => item.name === color.trim().toLowerCase())?.swatch ?? null;
}

function Swatch({ color }: { color: string }) {
  const swatch = swatchFor(color);
  if (!color) return null;
  return (
    <i
      className="studio-recipe-swatch"
      aria-hidden="true"
      style={swatch ? { background: swatch } : undefined}
    />
  );
}

/**
 * The floral recipe: each flower, its color, how many, and the piece of the order it's for.
 * Grouped by that piece, so the grand entrance's stems sit together.
 */
export function ProductionRecipe({ view, mode, api, onChanged }: BoardProps) {
  const studio = mode === "studio";
  const change = useChange(onChanged);
  const items = view.items;
  const itemName = new Map(items.map((item) => [item.id, item.name]));
  const done = view.stems.filter((stem) => stem.done).length;
  const total = view.stems.reduce((sum, stem) => sum + (Number(stem.quantity) || 0), 0);

  const groups = useMemo(() => {
    const byItem = new Map<string, ProductionStemRow[]>();
    for (const stem of view.stems) {
      const key = stem.item_id && itemName.has(stem.item_id) ? stem.item_id : ANY;
      byItem.set(key, [...(byItem.get(key) ?? []), stem]);
    }
    const ordered = items
      .filter((item) => byItem.has(item.id))
      .map((item) => ({ key: item.id, label: item.name, stems: byItem.get(item.id)! }));
    const loose = byItem.get(ANY);
    return loose?.length
      ? [...ordered, { key: ANY, label: "for anything", stems: loose }]
      : ordered;
    // the names only change with the items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.stems, items]);

  return (
    <ProdSection
      icon={<Flower2 aria-hidden="true" strokeWidth={1.5} />}
      title="floral recipe"
      id="recipe"
      className="is-recipe"
      action={
        view.stems.length ? (
          <span className="studio-prod-count">
            {total ? `${total} stems · ` : ""}
            {done} of {view.stems.length} in hand
          </span>
        ) : null
      }
    >
      {studio ? (
        <RecipeComposer
          view={view}
          busy={change.busy}
          onAdd={(stem) =>
            change.run(() => api.addStem({ inquiry_id: view.production.inquiry_id, ...stem }))
          }
        />
      ) : null}

      {groups.length ? (
        // the same height as the order; the rest scroll inside
        <div className="studio-recipe-groups studio-prod-scroll">
          {groups.map((group) => (
            <div key={group.key || "any"} className="studio-recipe-group">
              <p className="studio-recipe-for">{group.label}</p>
              <ul>
                {group.stems.map((stem) => (
                  <li key={stem.id} className={cn(stem.done && "is-done")}>
                    <label>
                      <input
                        type="checkbox"
                        checked={stem.done}
                        disabled={!studio}
                        aria-label={`${stem.name} in hand`}
                        onChange={(event) =>
                          void change.run(() =>
                            api.updateStem(stem.id, { done: event.target.checked }),
                          )
                        }
                      />
                      <span className="studio-recipe-name">{stem.name}</span>
                    </label>
                    <span className="studio-recipe-color">
                      <Swatch color={stem.color} />
                      {stem.color}
                    </span>
                    <span className="studio-recipe-qty">
                      {studio ? (
                        <QtyStepper
                          label={`${stem.name} stems`}
                          value={stem.quantity}
                          placeholder="qty"
                          onCommit={(quantity) =>
                            void change.run(() => api.updateStem(stem.id, { quantity }))
                          }
                        />
                      ) : stem.quantity != null ? (
                        Number(stem.quantity)
                      ) : (
                        ""
                      )}
                    </span>
                    {studio ? (
                      <ConfirmRemove
                        question={`remove ${stem.name}?`}
                        disabled={change.busy}
                        onConfirm={() => change.run(() => api.removeStem(stem.id))}
                      >
                        <button
                          type="button"
                          className="studio-prod-x"
                          aria-label={`remove ${stem.name}`}
                        >
                          <X aria-hidden="true" strokeWidth={1.5} />
                        </button>
                      </ConfirmRemove>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="studio-prod-muted">
          {studio ? "type a flower above to start the recipe." : "the recipe is on its way."}
        </p>
      )}
    </ProdSection>
  );
}

type StemDraft = { name: string; color: string; quantity: number | null; item_id: string | null };

/** type a flower, pick it, pick its color, say how many and what it's for, add */
function RecipeComposer({
  view,
  busy,
  onAdd,
}: {
  view: BoardProps["view"];
  busy: boolean;
  onAdd: (stem: StemDraft) => Promise<unknown>;
}) {
  const [typed, setTyped] = useState("");
  const [flower, setFlower] = useState("");
  const [color, setColor] = useState("");
  const [otherColor, setOtherColor] = useState(false);
  const [qty, setQty] = useState("");
  // the piece stays chosen between stems, since a recipe is written one arrangement at a time
  const [itemId, setItemId] = useState<string>(ANY);
  const [lit, setLit] = useState(0);
  const flowerRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const suggestions = flower ? [] : flowerMatches(typed, view.stemSuggestions);

  function pickFlower(name: string) {
    const clean = name.trim().toLowerCase();
    if (!clean) return;
    setFlower(clean);
    setTyped(clean);
    setLit(0);
    // straight on to its color
    requestAnimationFrame(() => colorRef.current?.querySelector("button")?.focus());
  }

  function pickColor(name: string) {
    setColor(name);
    setOtherColor(false);
    requestAnimationFrame(() => qtyRef.current?.focus());
  }

  async function add() {
    const name = (flower || typed).trim().toLowerCase();
    if (!name) return;
    const saved = await onAdd({
      name,
      color: color.trim().toLowerCase(),
      quantity: qty.trim() ? Number(qty) : null,
      item_id: itemId || null,
    });
    if (saved === undefined) return;
    setTyped("");
    setFlower("");
    setColor("");
    setQty("");
    setOtherColor(false);
    requestAnimationFrame(() => flowerRef.current?.focus());
  }

  function onFlowerKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setLit((value) => Math.min(value + 1, suggestions.length - 1));
    }
    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setLit((value) => Math.max(value - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (flower) return void add();
      pickFlower(suggestions[lit] ?? typed);
    }
    if (event.key === "Escape") {
      setTyped("");
      setFlower("");
    }
  }

  return (
    <div className="studio-recipe-composer">
      <div className="studio-recipe-flower">
        <input
          ref={flowerRef}
          className="studio-prod-input"
          value={typed}
          placeholder="type a flower… anthurium, garden rose, palm"
          aria-label="flower"
          autoComplete="off"
          onChange={(event) => {
            setTyped(event.target.value.toLowerCase());
            setFlower("");
            setLit(0);
          }}
          onKeyDown={onFlowerKey}
        />
        {suggestions.length ? (
          <div className="studio-recipe-suggest" role="listbox" aria-label="flowers">
            {suggestions.map((name, index) => (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={index === lit}
                className={cn(index === lit && "is-lit")}
                onMouseEnter={() => setLit(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickFlower(name)}
              >
                {name}
              </button>
            ))}
            {typed.trim() && !suggestions.includes(typed.trim()) ? (
              <button
                type="button"
                className="is-new"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickFlower(typed)}
              >
                + {typed.trim()}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {flower ? (
        <>
          <div className="studio-recipe-step">
            <span className="studio-prod-label">color</span>
            <div
              ref={colorRef}
              className="studio-recipe-colors"
              role="radiogroup"
              aria-label="color"
            >
              {FLOWER_COLORS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  role="radio"
                  aria-checked={color === item.name}
                  className={cn(color === item.name && "is-on")}
                  onClick={() => pickColor(item.name)}
                >
                  <i style={{ background: item.swatch }} aria-hidden="true" />
                  {item.name}
                </button>
              ))}
              {otherColor ? (
                <input
                  autoFocus
                  className="studio-prod-input studio-recipe-other"
                  value={color}
                  placeholder="mandalay, dusty mauve…"
                  aria-label="another color"
                  onChange={(event) => setColor(event.target.value.toLowerCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      qtyRef.current?.focus();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={cn(color && !swatchFor(color) && "is-on")}
                  onClick={() => {
                    setColor("");
                    setOtherColor(true);
                  }}
                >
                  other…
                </button>
              )}
            </div>
          </div>

          <div className="studio-recipe-step is-row">
            <label className="studio-recipe-howmany">
              <span className="studio-prod-label">how many</span>
              <QtyStepper
                inputRef={qtyRef}
                live
                label="how many stems"
                placeholder="stems"
                value={qty.trim() ? Number(qty) : null}
                onCommit={(next) => setQty(next == null ? "" : String(next))}
                onEnter={() => void add()}
              />
            </label>
            <div className="studio-recipe-forpick">
              <span className="studio-prod-label">for</span>
              <div role="radiogroup" aria-label="what it's for">
                {view.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={itemId === item.id}
                    className={cn(itemId === item.id && "is-on")}
                    onClick={() => setItemId(item.id)}
                  >
                    {itemId === item.id ? <Check aria-hidden="true" strokeWidth={2} /> : null}
                    {item.name}
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={itemId === ANY}
                  className={cn(itemId === ANY && "is-on")}
                  onClick={() => setItemId(ANY)}
                >
                  {itemId === ANY ? <Check aria-hidden="true" strokeWidth={2} /> : null}
                  anything
                </button>
              </div>
            </div>
          </div>

          <div className="studio-prod-row-go">
            <button
              type="button"
              className="studio-today-go"
              disabled={busy}
              onClick={() => void add()}
            >
              add {[flower, color].filter(Boolean).join(" · ")}
              {qty ? ` · ${qty}` : ""}
            </button>
            <button
              type="button"
              className="studio-ghost"
              onClick={() => {
                setTyped("");
                setFlower("");
                setColor("");
                setQty("");
                flowerRef.current?.focus();
              }}
            >
              start over
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
