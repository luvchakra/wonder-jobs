import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
}

const pads = { none: "", sm: "p-4", md: "p-5", lg: "p-6 md:p-7" };

/** Surface card; `glass` renders the translucent variant used over imagery. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card({ glass, padding = "md", hover, className, ...rest }, ref) {
  return <div ref={ref} className={cn(glass ? "wj-glass rounded-[20px] shadow-sm" : "wj-card", pads[padding], hover && "wj-elevate", className)} {...rest} />;
});

export const GlassCard = forwardRef<HTMLDivElement, Omit<CardProps, "glass">>(function GlassCard(props, ref) {
  return <Card ref={ref} glass {...props} />;
});
