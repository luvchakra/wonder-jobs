import { redirect } from "next/navigation";
import { HomeScreen } from "@/components/home/HomeScreen";

/** Home. Old job links (/app?search=…, ?role=, ?refresh=, ?fit=, ?q=) belong to Find and go there. */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") params.set(k, v);
  if (params.size) redirect(`/app/jobs?${params}`);
  return <HomeScreen />;
}
