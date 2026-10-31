import { ChevronDown, X } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { savedDiscountText, type DiscountMode } from "@/lib/discount";
import { formatMoneyExact } from "@/lib/money";
import { useStudioDiscounts } from "@/lib/os/use-studio-discounts";
import { formatDollarInput } from "@/lib/proposal-link";

export type DiscountValue = { name: string; text: string; mode: DiscountMode };

/**
 * A discount: dollars or a percentage, with a name ("returning client"). A named discount is kept
 * for the studio, and any kept one can be picked again for another client.
 */
export function DiscountField({
  value,
  onChange,
}: {
  value: DiscountValue;
  onChange: (next: Partial<DiscountValue>) => void;
}) {
  const { discounts, keep, letGo } = useStudioDiscounts();
  const [open, setOpen] = useState(false);
  const percent = value.mode === "percent";
  // the sign is the switch: $ before the number, or % after it
  const sign = (
    <button
      type="button"
      className="studio-money-mode"
      title={percent ? "switch to a dollar amount" : "switch to a percentage"}
      onClick={(event) => {
        event.preventDefault();
        onChange({ text: "", mode: percent ? "amount" : "percent" });
      }}
    >
      {percent ? "%" : "$"}
    </button>
  );

  // once it has a name and an amount, it's kept to use again
  function keepIt() {
    const name = value.name.trim();
    const amount = Number(value.text.replace(/[^\d.]/g, ""));
    if (!name || !(amount > 0)) return;
    keep({ name, kind: value.mode, value: percent ? Math.min(amount, 100) : amount });
  }

  return (
    <div className="studio-ask-field studio-discount-field">
      <span className="studio-ask-label studio-discount-head">
        discount
        {discounts.length ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="studio-discount-saved">
                saved
                <ChevronDown aria-hidden="true" strokeWidth={1.5} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="studio-discount-menu">
              {discounts.map((discount) => (
                <div key={discount.id} className="studio-discount-option">
                  <button
                    type="button"
                    onClick={() => {
                      onChange({
                        name: discount.name,
                        mode: discount.kind,
                        text:
                          discount.kind === "percent"
                            ? savedDiscountText(discount)
                            : formatDollarInput(savedDiscountText(discount)),
                      });
                      setOpen(false);
                    }}
                  >
                    <b>{discount.name}</b>
                    <small>
                      {discount.kind === "percent"
                        ? `${Number(discount.value)}%`
                        : formatMoneyExact(Math.round(discount.value * 100))}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="studio-discount-forget"
                    aria-label={`remove ${discount.name}`}
                    onClick={() => letGo(discount.id)}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
      </span>
      {/* one field: its name first, then the amount with its sign beside it */}
      <span className="studio-money studio-discount-box">
        <input
          className="studio-textarea studio-discount-name"
          value={value.name}
          aria-label="discount name"
          placeholder="name"
          onChange={(event) => onChange({ name: event.target.value.slice(0, 80) })}
          onBlur={keepIt}
        />
        <span className="studio-discount-amount">
          {percent ? null : sign}
          <input
            className="studio-textarea"
            value={value.text}
            aria-label={percent ? "discount percentage" : "discount amount"}
            onChange={(event) =>
              onChange({
                text: percent
                  ? event.target.value.replace(/[^\d.]/g, "").slice(0, 5)
                  : formatDollarInput(event.target.value),
              })
            }
            onBlur={keepIt}
            placeholder={percent ? "10" : "0"}
            inputMode="decimal"
          />
          {percent ? sign : null}
        </span>
      </span>
    </div>
  );
}
