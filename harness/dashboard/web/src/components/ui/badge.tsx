import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// The board's tag (Chomp chips): 24px, 4px radius, 14px medium, a tinted fill per tone.
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm px-2 text-sm font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:stroke-2",
  {
    variants: {
      variant: {
        default: "bg-surface-inset text-ink-muted",
        brand: "bg-[color-mix(in_srgb,var(--indigo-500)_24%,transparent)] text-[var(--indigo-100)]",
        success: "bg-[color-mix(in_srgb,var(--green-500)_16%,transparent)] text-[var(--green-200)]",
        warning: "bg-[color-mix(in_srgb,var(--orange-500)_16%,transparent)] text-[var(--orange-200)]",
        destructive: "bg-[color-mix(in_srgb,var(--red-500)_16%,transparent)] text-[var(--red-200)]",
        purple: "bg-model-bg text-model-ink",
        outline: "bg-transparent text-ink-muted shadow-[inset_0_0_0_1px_var(--semantic-border-strong)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
