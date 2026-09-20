"use client";
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const field = "w-full rounded-[12px] border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-4 outline-none transition-[border-color,box-shadow] focus:border-brand-400 focus:ring-4 focus:ring-brand-100 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field, "min-h-28 py-2.5 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(field, "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b6d8a%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[position:right_12px_center] bg-no-repeat pr-9", className)} {...rest}>
      {children}
    </select>
  );
});

/** `required` renders a visible `*` next to the label for sighted users — pass it whenever the wrapped
 *  input actually blocks submission when empty, so a user can tell before they try rather than only
 *  discovering it from a stuck submit button. The asterisk is a sibling of the `<label>`, not a child of
 *  it: the wrapped input's own native `required` attribute is what screen readers already announce, and
 *  keeping the mark out of the label element itself means both its accessible name (aria-hidden already
 *  excludes it there) and its raw text content stay exactly the label text — `getByLabel`-style exact
 *  matches key off that raw text, not just the accessible name, so a child asterisk broke them even
 *  though it was already `aria-hidden`. `error`, when set, replaces `hint` with a validation message in
 *  the same slot. */
export function Field({ label, hint, htmlFor, children, className, required, error }: { label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode; className?: string; required?: boolean; error?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="inline-flex items-center">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
        {required && (
          <span aria-hidden className="ml-0.5 text-[13px] font-medium text-danger-600">
            *
          </span>
        )}
      </span>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger-600">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-3">{hint}</p>
      )}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50", checked ? "border-brand-500 bg-brand-500" : "border-line-strong bg-bg-soft")}
    >
      <span className={cn("absolute size-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex items-center gap-1 rounded-full bg-bg-soft p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-full font-medium transition-colors", size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-[13px]", value === o.value ? "bg-brand-500 text-white shadow-sm" : "text-ink-2 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors", active ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong", className)}>
      {children}
    </button>
  );
}
