"use client";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { Button } from "@/components/common/Button";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#screens", label: "Screens" },
  { href: "#ai", label: "Your AI" },
  { href: "/help", label: "Help" },
  { href: "#contact", label: "Contact" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-colors", scrolled || open ? "bg-white/80 shadow-xs backdrop-blur-md" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <WonderLogo />
        <nav aria-label="Marketing" className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button href="/sign-in" variant="ghost" size="sm">
            Sign in
          </Button>
          <Button href="/sign-up" variant="dark" size="sm" className="rounded-full px-4">
            Get Started
          </Button>
        </div>
        <button type="button" className="flex size-10 items-center justify-center rounded-full text-ink md:hidden" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)}>
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-white/95 px-4 pb-5 pt-2 md:hidden">
          <nav aria-label="Marketing" className="flex flex-col">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-3 text-[15px] font-medium text-ink-2">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex gap-2">
            <Button href="/sign-in" variant="outline" full>
              Sign in
            </Button>
            <Button href="/sign-up" variant="dark" full>
              Get Started
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
