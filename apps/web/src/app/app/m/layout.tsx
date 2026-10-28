import { poppins } from "@/platform/brand/font";
import { cn } from "@/lib/cn";

/** Every WonderStar surface (Explore and the module shells) wears the WonderStar brand; the jobs portal keeps its own look. */
export default function WonderStarLayout({ children }: { children: React.ReactNode }) {
  return <div className={cn(poppins.variable, "font-ws text-ws-navy")}>{children}</div>;
}
