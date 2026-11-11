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
  /** With `href`: a plain link to another site or a `tel:`/`mailto:` address, not a client-side route. An http(s) one opens in a new tab. */
  external?: boolean;
  full?: boolean;
}

const base = "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,box-shadow,transform,filter] duration-200 ease-out-soft disabled:opacity-50 disabled:pointer-events-none wj-press";
const variants: Record<Variant, string> = {
  primary: "wj-gradient-bg text-white shadow-brand hover:brightness-105 hover:shadow-brand-hover hover:-translate-y-px active:translate-y-0",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  ghost: "bg-transparent text-ink-2 hover:bg-bg-soft",
  outline: "bg-surface border border-line text-ink shadow-xs hover:border-line-strong hover:bg-surface-2",
  danger: "bg-danger-100 text-danger-600 hover:brightness-95",
  dark: "bg-ink text-white shadow-sm hover:bg-ink-2",
  glass: "wj-glass text-ink hover:bg-white/90",
};
const sizes: Record<Size, string> = {
  sm: "h-10 px-3.5 text-[13px] rounded-[10px]",
  md: "h-11 px-4 text-sm rounded-[12px]",
  lg: "h-12 px-5 text-[15px] rounded-[14px]",
  xl: "h-14 px-7 text-base rounded-[16px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", loading, icon, iconRight, className, children, href, external, full, ...rest }, ref) {
  const disabled = !!rest.disabled;
  const cls = cn(base, variants[variant], sizes[size], full && "w-full", disabled && "opacity-50 pointer-events-none", className);
  const content = (
    <>
      {loading ? <Loader2 className="size-4 wj-animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </>
  );
  if (href && external) {
    const web = /^https?:\/\//i.test(href);
    return (
      <a
        href={disabled ? undefined : href}
        {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={cls}
        aria-label={rest["aria-label"]}
        aria-disabled={disabled || undefined}
        onClick={rest.onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}
      >
        {content}
      </a>
    );
  }
  if (href) {
    return (
      <Link
        href={href}
        className={cls}
        aria-label={rest["aria-label"]}
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
