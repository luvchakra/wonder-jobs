import { NextResponse } from "next/server";
import { requireSession, type Session } from "../auth";
import { HiringError } from "../hiring";

/**
 * A response's résumé as a download, for every module's owner side: the signed-in caller's `read` checks their role
 * (applications.view) and the workspace; the file always downloads, never renders.
 */
export async function resumeDownload(read: (s: Session) => Promise<{ filename: string; mime: string; bytes: Buffer }>): Promise<NextResponse> {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const f = await read(session);
    return new NextResponse(new Uint8Array(f.bytes), {
      headers: {
        "content-type": f.mime,
        "content-disposition": `attachment; filename="${f.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
        "content-length": String(f.bytes.length),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[hiring] résumé read failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "That file couldn't be read just now." }, { status: 503 });
  }
}
