import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AskField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <label className={cn("studio-ask-field", className)}>
      <span className="studio-ask-label">{label}</span>
      {children}
    </label>
  );
}

export function AskChips<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="studio-task-kinds studio-ask-offerings" role="listbox" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={value === option.value}
          className={cn(value === option.value && "is-on")}
          onClick={() => onPick(option.value)}
        >
          {option.label.toLowerCase()}
        </button>
      ))}
    </div>
  );
}
