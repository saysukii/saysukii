import { useState, type ReactElement, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Anything that removes something saved asks first: the button opens a small question beside it,
 * "remove anthurium?", with remove and keep. Nothing goes until remove is tapped.
 */
export function ConfirmRemove({
  question,
  detail,
  action = "remove",
  disabled = false,
  align = "end",
  onConfirm,
  children,
}: {
  /** "remove anthurium?" */
  question: ReactNode;
  /** a line under it for what else goes, or what it means */
  detail?: ReactNode;
  /** the word on the button that removes: remove, delete, cancel it… */
  action?: string;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  onConfirm: () => unknown;
  /** the button that asks */
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className="studio-confirm-pop"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="studio-confirm-ask">{question}</p>
        {detail ? <p className="studio-confirm-detail">{detail}</p> : null}
        <span className="studio-confirm-go">
          <button type="button" className="studio-ghost" onClick={() => setOpen(false)}>
            keep
          </button>
          <button
            type="button"
            className="studio-ghost is-danger"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              void onConfirm();
            }}
          >
            {action}
          </button>
        </span>
      </PopoverContent>
    </Popover>
  );
}
