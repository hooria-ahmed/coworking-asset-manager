import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn/ui badge, plus soft status variants (success, warning, info, danger, neutral) for this app.
const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive: 'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        success: 'border-transparent bg-success/12 text-success',
        warning: 'border-transparent bg-warning/14 text-warning',
        info: 'border-transparent bg-info/12 text-info',
        danger: 'border-transparent bg-danger/14 text-danger',
        brand: 'border-transparent bg-primary/16 text-primary dark:text-[oklch(0.8_0.13_293)]',
        neutral: 'border-transparent bg-secondary text-muted-foreground',
        lime: 'border-transparent bg-highlight text-highlight-foreground',
        // dark pill with a coloured dot, like the reference's "Multimedia" tags (StatusBadge uses it)
        pill: 'border-transparent bg-secondary text-secondary-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
