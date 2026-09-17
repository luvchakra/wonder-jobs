import { cookies } from "next/headers";

/**
 * Session seam. The mock backend identifies a browser by an httpOnly cookie so
 * BYOK secrets are isolated per user/tenant (spec §46). Replace with the real
 * auth provider's session lookup; the rest of the server code only needs `userId`.
 */
export interface Session {
  userId: string;
  tenantId: string;
}

const COOKIE = "wj_uid";

export async function getSession(): Promise<Session> {
  const jar = await cookies();
  let uid = jar.get(COOKIE)?.value;
  if (!uid || !/^[a-z0-9_-]{8,64}$/i.test(uid)) {
    uid = `u_${crypto.randomUUID().replace(/-/g, "")}`;
    try {
      jar.set(COOKIE, uid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    } catch {
      /* cookies() is read-only in some contexts; the id is still valid for this request */
    }
  }
  return { userId: uid, tenantId: uid };
}
