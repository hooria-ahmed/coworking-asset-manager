import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// shadcn/ui native select: a styled <select>, so value/onChange work exactly like a normal form field.
function NativeSelect({ className, children, ...props }) {
  return (
    <div className="group/native-select relative w-full has-[select:disabled]:opacity-50" data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(
          'border-input bg-secondary/60 dark:bg-secondary/70 h-10 w-full min-w-0 appearance-none rounded-xl border py-1 pr-9 pl-3.5 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 select-none" aria-hidden="true" />
    </div>
  );
}

function NativeSelectOption(props) {
  return <option data-slot="native-select-option" className="bg-popover text-popover-foreground" {...props} />;
}

export { NativeSelect, NativeSelectOption };
