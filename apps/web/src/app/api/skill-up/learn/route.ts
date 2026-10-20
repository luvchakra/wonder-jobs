import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { certificationNamed, forSkill, loadCatalog, type LearnItem } from "@/server/skillup/mslearn";

export const runtime = "nodejs";

const MAX_TERMS = 12;
const list = (v: string | null) =>
  (v ?? "")
    .split("|")
    .map((s) => s.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, MAX_TERMS);

/**
 * GET ?skills=a|b&certs=x|y — what Microsoft Learn's public catalog has for those skills and credentials.
 * `available: false` when the catalog can't be read right now. Public catalog data only; nothing about the
 * caller is read or returned beyond requiring a signed-in session.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const url = new URL(req.url);
  const skills = list(url.searchParams.get("skills"));
  const certs = list(url.searchParams.get("certs"));
  if (!skills.length && !certs.length) return NextResponse.json({ available: true, skills: {}, certs: {} });
  const catalog = await loadCatalog();
  if (!catalog) return NextResponse.json({ available: false, skills: {}, certs: {} }, { headers: { "cache-control": "no-store" } });
  const found: { skills: Record<string, LearnItem[]>; certs: Record<string, LearnItem | null> } = { skills: {}, certs: {} };
  for (const s of skills) found.skills[s] = forSkill(catalog.items, s);
  for (const c of certs) found.certs[c] = certificationNamed(catalog.items, c);
  return NextResponse.json({ available: true, ...found }, { headers: { "cache-control": "private, max-age=3600" } });
}
