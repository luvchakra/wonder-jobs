import { stateStore, type StateStoreName } from "./state";

/**
 * Every client Zustand store persists as `{ state: <actual store data>, version: <schema version> }`
 * (the `zustand/middleware` `persist` wrapper) inside the JSON document `stateStore` holds per tenant.
 * Server code that needs to read or write the same data (calendar feed, push notifications, resume
 * import, the scheduled-run cron) goes through these two helpers instead of re-deriving the shape.
 */

export async function readClientState<T>(tenantId: string, store: StateStoreName): Promise<T | undefined> {
  const doc = await stateStore.get(tenantId, store);
  if (!doc) return undefined;
  const wrapped = doc.state as { state?: T } | undefined;
  return wrapped?.state;
}

/**
 * Writes a store's data with the given persist schema version (the same constant the client's
 * `persist(..., { version })` call for that store uses — check the store file, it's not derivable).
 * Also usable server-side with a *partial* merge: pass `merge: true` to shallow-merge `patch` onto the
 * current state instead of replacing it (the cron and resume-import routes use this so they never clobber
 * fields another part of the app owns).
 */
export async function writeClientState<T extends object>(tenantId: string, store: StateStoreName, persistVersion: number, patch: Partial<T>, opts: { merge?: boolean } = {}): Promise<T> {
  const current = opts.merge ? ((await readClientState<T>(tenantId, store)) ?? ({} as T)) : ({} as T);
  const next = { ...current, ...patch } as T;
  await stateStore.put(tenantId, store, { state: next, version: persistVersion });
  return next;
}
