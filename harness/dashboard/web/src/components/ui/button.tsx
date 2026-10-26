import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// The board's button (Chomp): 40px controls on the 4pt grid, 16px semibold labels, 8px radius.
// `outline` is the classic default button (a filled secondary with a border); `default` is primary.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-base font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-110",
        // The board header's New task: light on the dark panel, so the brand stays for the Column select.
        inverse: "bg-ink-strong text-surface hover:brightness-110",
        outline:
          "border-border bg-secondary text-ink-strong hover:border-border-hover hover:bg-[var(--semantic-bg-secondary-default-hovered)] aria-expanded:bg-[var(--semantic-bg-secondary-default-hovered)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[var(--semantic-bg-secondary-default-hovered)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "text-ink-muted hover:bg-accent hover:text-ink-strong aria-expanded:bg-accent aria-expanded:text-ink-strong",
        destructive:
          "border-danger-border bg-transparent text-danger-ink hover:border-danger hover:bg-accent focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "h-auto rounded-sm border-0 p-0 text-ink-strong underline underline-offset-3 hover:decoration-2",
      },
      size: {
        default:
          "h-9 gap-2 px-3 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        toolbar: "h-9 gap-2 px-3 text-sm",
        lg: "h-12 gap-2 px-5",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
