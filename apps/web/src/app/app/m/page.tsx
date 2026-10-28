import type { Metadata } from "next";
import { Explore } from "@/platform/shell/Explore";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return <Explore />;
}
