"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Slider as SliderPrimitive } from "radix-ui"

/** shadcn/ui Slider on Radix: keyboard steps with the arrow keys, Page Up/Down for tens, Home/End for the limits. */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  trackClassName,
  rangeStyle,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { trackClassName?: string; rangeStyle?: React.CSSProperties }) {
  const values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]),
    [value, defaultValue, min]
  )
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn("relative h-1.5 w-full grow overflow-hidden rounded-full bg-(--muted)", trackClassName)}
      >
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-(--primary)" style={rangeStyle} />
      </SliderPrimitive.Track>
      {values.map((_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={ariaLabel}
          className="block size-4 shrink-0 rounded-full border-2 border-(--primary) bg-(--surface) shadow-card transition-[box-shadow,transform] duration-150 hover:scale-110 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-(--primary)/25 disabled:pointer-events-none"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
