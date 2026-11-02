import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Joins class names and lets later Tailwind classes win (shadcn/ui helper).
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
