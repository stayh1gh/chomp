"use client"

import * as React from "react"
import { cn } from "cn"
import { Label as LabelPrimitive } from "radix-ui"

// The board's field label (Chomp): 14px, ink-subtle. Checkbox and radio labels set their own.
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-5 text-ink-subtle select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
