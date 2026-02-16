import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/15 text-primary",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-red-500/15 text-red-500",
        outline:
          "border border-input text-foreground",
        success:
          "border-transparent bg-green-500/15 text-green-500",
        warning:
          "border-transparent bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
        info:
          "border-transparent bg-blue-500/15 text-blue-500",
        purple:
          "border-transparent bg-purple-500/15 text-purple-500",
        orange:
          "border-transparent bg-orange-500/15 text-orange-500",
        gray:
          "border-transparent bg-zinc-500/15 text-zinc-500",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        default: "px-2.5 py-0.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
