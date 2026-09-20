"use client";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "dark" | "glass";
type Size = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  href?: string;
  full?: boolean;
}

const base = "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-[background-color,color,box-shadow,transform] duration-150 disabled:opacity-50 disabled:pointer-events-none wj-press";
const variants: Record<Variant, string> = {
  primary: "wj-gradient-bg text-white shadow-brand hover:brightness-105",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  ghost: "bg-transparent text-ink-2 hover:bg-bg-soft",
  outline: "bg-surface border border-line text-ink hover:border-line-strong hover:bg-surface-2",
  danger: "bg-danger-100 text-danger-600 hover:brightness-95",
  dark: "bg-ink text-white hover:bg-ink-2",
  glass: "wj-glass text-ink hover:bg-white/90",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] rounded-[10px]",
  md: "h-11 px-4 text-sm rounded-[12px]",
  lg: "h-12 px-5 text-[15px] rounded-[14px]",
  xl: "h-14 px-7 text-base rounded-[16px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", loading, icon, iconRight, className, children, href, full, ...rest }, ref) {
  const disabled = !!rest.disabled;
  const cls = cn(base, variants[variant], sizes[size], full && "w-full", disabled && "opacity-50 pointer-events-none", className);
  const content = (
    <>
      {loading ? <Loader2 className="size-4 wj-animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cls}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={disabled ? (e) => e.preventDefault() : undefined}
      >
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} className={cls} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

/** Icon-only button with an accessible label. */
export function IconButton({ label, className, size = "md", variant = "ghost", ...rest }: ButtonProps & { label: string }) {
  const dims = { sm: "size-9", md: "size-10", lg: "size-11", xl: "size-12" }[size];
  return <Button aria-label={label} title={label} variant={variant} size={size} className={cn("px-0", dims, className)} {...rest} />;
}
