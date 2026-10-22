import * as React from "react"
import { cn } from "cn"

// The board's textarea (Chomp): 1px border + 7px padding + 24px lines keeps any height on the
// 4pt grid. Sizes by `rows`; add field-sizing-content where it should grow with its text.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex w-full rounded-lg border border-input bg-input-bg px-3 text-base text-ink-strong hover:border-border-hover py-[7px] transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
