/**
 * The signed-in person's own photo address, unique to their account (2026-11-03: a newly signed-in account showed the
 * previous account's photo — the address was the same for everyone, so the browser served its cached copy). The server
 * answers only for the session's own account, so a cached copy can never belong to someone else.
 */
export const avatarUrl = (userId: string, version: number) => `/api/avatar?u=${encodeURIComponent(userId)}&v=${version}`;
