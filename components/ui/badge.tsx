import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-tight",
  {
    variants: {
      tone: {
        neutral:
          "bg-[color:var(--color-muted)] text-[color:var(--color-muted-foreground)]",
        running:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        stopped:
          "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
        failed:
          "bg-red-500/15 text-red-700 dark:text-red-400",
        pending:
          "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        primary:
          "bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}
