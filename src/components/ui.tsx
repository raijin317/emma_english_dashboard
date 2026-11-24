"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Parent-area UI: same palette as the kids' side, denser layout. */

const V = {
  primary: "bg-orange text-ink border-ink [--shadow:#d9480f]",
  sun: "bg-sun text-ink border-ink [--shadow:#e09b00]",
  grape: "bg-grape text-white border-ink [--shadow:#6a3fb5]",
  grass: "bg-grass text-ink border-ink [--shadow:#2e7d32]",
  ghost: "bg-paper text-ink border-line [--shadow:#efe2c6]",
  danger: "bg-berry-soft text-berry-deep border-berry-deep [--shadow:#f3b3c8]",
} as const;

export function Button({ variant = "ghost", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof V }) {
  return (
    <button
      {...rest}
      className={`btn-3d inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 px-4 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50 ${V[variant]} ${className}`}
    />
  );
}

export function LinkButton({ href, variant = "ghost", className = "", children, target }: { href: string; variant?: keyof typeof V; className?: string; children: ReactNode; target?: string }) {
  return (
    <Link href={href} target={target} className={`btn-3d inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 px-4 py-2 font-bold ${V[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Panel({ children, className = "", title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-3xl border-2 border-line bg-paper p-5 shadow-[0_4px_0_0_#efe2c6] ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-xl font-bold">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, emoji, actions }: { title: string; subtitle?: ReactNode; emoji?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold md:text-4xl">
          {emoji && <span className="mr-2">{emoji}</span>}
          {title}
        </h1>
        {subtitle && <div className="mt-1 text-ink-soft">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Badge({ children, tone = "sun" }: { children: ReactNode; tone?: "sun" | "sky" | "grass" | "berry" | "grape" | "orange" | "gray" }) {
  const t = {
    sun: "bg-sun-soft text-sun-deep",
    sky: "bg-sky-soft text-sky-deep",
    grass: "bg-grass-soft text-grass-deep",
    berry: "bg-berry-soft text-berry-deep",
    grape: "bg-grape-soft text-grape-deep",
    orange: "bg-orange-soft text-orange-deep",
    gray: "bg-cream text-ink-soft",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-sm font-bold ${t}`}>{children}</span>;
}

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-line bg-paper/60 p-10 text-center">
      <span className="text-5xl">{emoji}</span>
      <h3 className="text-xl font-bold">{title}</h3>
      {children && <div className="max-w-xl text-ink-soft">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-bold">{label}</span>
      {children}
      {hint && <span className="text-sm text-ink-soft">{hint}</span>}
    </label>
  );
}

export const inputCls = "min-h-11 rounded-xl border-2 border-line bg-paper px-3 py-2 focus:border-sky-deep";

export function ProgressBar({ value, tone = "bg-grass" }: { value: number; tone?: string }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${tone} transition-all`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
