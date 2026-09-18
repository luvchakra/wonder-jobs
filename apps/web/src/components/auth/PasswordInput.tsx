"use client";
import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/common/Input";

/** Password field with a reveal toggle so people can check what they typed. */
export function PasswordInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...rest} type={shown ? "text" : "password"} className={`pr-11 ${className ?? ""}`} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand-300"
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
