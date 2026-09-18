import fs from "node:fs";
import path from "node:path";

/**
 * The butterfly mark as a data URI, for the generated icon routes (`next/og` can't read from
 * `public/` by path). Read once per server instance — the file never changes at runtime.
 */
let cached: string | null = null;

export function brandMarkDataUri(): string {
  if (cached) return cached;
  const file = path.join(process.cwd(), "public", "brand", "wonder-mark-square.png");
  cached = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  return cached;
}
