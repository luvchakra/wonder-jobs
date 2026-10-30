import { hiringRoute } from "@/server/hiringRoute";
import { myBookings } from "@/server/teaching/bookings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The teacher's own demo classes (Pipeline → Demo-class bookings, and each application's page). */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ bookings: await myBookings(s) }));
}
