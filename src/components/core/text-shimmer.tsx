import { useMemo, type CSSProperties, type ElementType, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type TextShimmerProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
};

export function TextShimmer({
  children,
  as: Component = "span",
  className,
  duration = 1.2,
  spread = 2,
}: TextShimmerProps) {
  const dynamicSpread = useMemo(() => {
    const label = typeof children === "string" ? children : "";
    return `${label.length * spread}px`;
  }, [children, spread]);

  return (
    <Component
      className={cn("text-shimmer", className)}
      style={
        {
          "--spread": dynamicSpread,
          "--shimmer-duration": `${duration}s`,
        } as CSSProperties
      }
    >
      {children}
    </Component>
  );
}
