import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import * as TogglePrimitive from "@radix-ui/react-toggle";

import { cn } from "@/lib/utils";
import { toggleVariants } from "@/components/ui/toggle-variants";

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle };
