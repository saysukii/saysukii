import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { inputClass } from "@/components/portal/bits";
import { cn } from "@/lib/utils";

export type DrawerSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export function StudioDrawerSelect<T extends string>({
  label,
  value,
  placeholder = "Select",
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: T | "";
  placeholder?: string;
  options: Array<DrawerSelectOption<T>>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <>
      <button
        type="button"
        className={cn(
          inputClass,
          "flex items-center justify-between gap-4 pr-8 text-left font-light",
          !selected && "text-muted-foreground",
        )}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="size-4 shrink-0 opacity-45" aria-hidden="true" />
      </button>
      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerContent
          className="mx-auto w-full max-w-lg gap-0 rounded-t-[28px] border-0 bg-[#f3f0ea] text-[#24221f] shadow-[0_-18px_48px_rgba(73,68,61,0.14)] sm:mb-3 sm:rounded-[28px]"
          overlayClassName="bg-[rgba(36,34,31,0.28)]"
        >
          <DrawerHeader className="px-5 pb-1.5 pt-1 text-left">
            <DrawerTitle className="text-[11px] font-light lowercase tracking-[0.08em] text-[rgba(36,34,31,0.52)]">
              {label}
            </DrawerTitle>
          </DrawerHeader>
          <div
            className="grid max-h-[min(70vh,28rem)] gap-1.5 overflow-y-auto px-3.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-1"
            role="listbox"
            aria-label={label}
          >
            {options.map((option) => {
              const on = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={cn(
                    "flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border-0 bg-[#f6f5f2] px-4 text-left text-sm font-light text-[#24221f]",
                    on && "bg-[#f7e4e7]",
                  )}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {on ? <Check className="size-4 shrink-0 opacity-70" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
