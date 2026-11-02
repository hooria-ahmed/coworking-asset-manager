// Frame for Login and Register: a dark stage with a glowing orb and headline on the left (large
// screens) and a glass form card on the right. Owner: integrator.
import { Bot, CalendarCheck2, ShieldCheck } from 'lucide-react';
import { BrandMark, ThemeToggle } from '../components/Layout';

const FEATURES = [
  { icon: Bot, text: 'AI assistant' },
  { icon: CalendarCheck2, text: 'One-click approvals' },
  { icon: ShieldCheck, text: 'Full asset history' },
];

export default function AuthLayout({ title, description, children, footer }) {
  return (
    <div className="relative min-h-svh overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_70%)]" />
      <div className="pointer-events-none absolute top-1/2 left-[22%] size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,oklch(0.75_0.2_293/0.9),oklch(0.45_0.24_290/0.55)_45%,transparent_70%)] blur-2xl" />
      <div className="pointer-events-none absolute top-[30%] left-[36%] size-48 rounded-full bg-[oklch(0.9_0.21_125/0.35)] blur-3xl" />

      <div className="relative mx-auto grid min-h-svh max-w-[1400px] items-center gap-12 px-6 py-10 lg:grid-cols-[1.15fr_1fr] lg:px-12">
        <div className="hidden flex-col gap-10 lg:flex">
          <div className="flex items-center gap-3">
            <BrandMark className="size-10" />
            <div className="leading-tight">
              <p className="font-display text-lg font-semibold">Asset Manager</p>
              <p className="text-muted-foreground text-xs">AI-Powered Co-Working Space</p>
            </div>
          </div>
          <div className="space-y-6">
            <span className="border-border bg-secondary/70 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs backdrop-blur">
              <span className="bg-highlight size-1.5 rounded-full shadow-[0_0_10px] shadow-highlight" /> Live asset tracking
            </span>
            <h2 className="font-display max-w-xl text-6xl leading-[0.98] font-medium tracking-tight">
              Every desk, device and room, <span className="text-aurora">one smart space.</span>
            </h2>
            <p className="text-muted-foreground max-w-md text-base">Book shared equipment, see who has what, and let AI pick the right asset for the job.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, text }) => (
              <span key={text} className="border-border bg-secondary/60 flex items-center gap-2 rounded-full border px-4 py-2 text-sm backdrop-blur">
                <Icon className="text-primary size-4 dark:text-[oklch(0.8_0.13_293)]" /> {text}
              </span>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">Software Engineering project · NED University</p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <div className="border-border bg-card/70 relative w-full max-w-md rounded-[2rem] border p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
            <ThemeToggle className="absolute top-5 right-5" />
            <div className="mb-8 space-y-2">
              <BrandMark className="mb-6 lg:hidden" />
              <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
              <p className="text-muted-foreground text-sm">{description}</p>
            </div>
            {children}
            {footer && <p className="text-muted-foreground mt-6 text-center text-sm">{footer}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
