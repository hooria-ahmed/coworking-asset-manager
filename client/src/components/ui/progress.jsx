import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function Progress({ className, indicatorClassName, value, ...props }) {
  return (
    <ProgressPrimitive.Root data-slot="progress" className={cn('bg-secondary relative h-2 w-full overflow-hidden rounded-full', className)} {...props}>
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn('h-full w-full flex-1 rounded-full bg-gradient-to-r from-primary to-[oklch(0.78_0.15_293)] transition-all', indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
