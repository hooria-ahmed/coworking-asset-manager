import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/components/theme-provider';

// Toast messages. Show one from any screen with:  import { toast } from 'sonner';  toast.success('Saved');
function Toaster(props) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      richColors
      style={{ '--normal-bg': 'var(--popover)', '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)' }}
      {...props}
    />
  );
}

export { Toaster };
