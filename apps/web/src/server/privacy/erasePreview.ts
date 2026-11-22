/**
 * What deleting this account will do, in the person's own numbers, shown before they confirm (owner, 2026-11-22:
 * "give full warning at the time of delete"). Read-only; each part that can't be read is left out rather than guessed.
 */
import { table } from "../db/table";
import { sentSummary } from "../sentAccount";
import type { ErasePreview } from "@/domain/privacy/erasePreview";

export type { ErasePreview };


const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);

export async function erasePreview(tenantId: string): Promise<ErasePreview> {
  const [sent, owned, links1, links2, posts, ownedCommunities] = await Promise.all([
    sentSummary(tenantId),
    safe(table<{ org_id: string; tenant_id: string; role: string }>("hiring_members").find({ tenant_id: tenantId, role: "owner" }, { limit: 500 })),
    safe(table<{ id: string; status: string; requester: string }>("network_connections").find({ requester: tenantId, status: "connected" }, { limit: 5000 })),
    safe(table<{ id: string; status: string; recipient: string }>("network_connections").find({ recipient: tenantId, status: "connected" }, { limit: 5000 })),
    safe(table<{ id: string; tenant_id: string }>("network_updates").find({ tenant_id: tenantId }, { limit: 5000 })),
    safe(table<{ community_id: string; tenant_id: string; role: string; status: string }>("network_community_members").find({ tenant_id: tenantId, role: "owner", status: "member" }, { limit: 500 })),
  ]);
  let workspacesHandedOn = 0;
  let workspacesClosed = 0;
  for (const o of owned) {
    const others = (await safe(table<{ org_id: string; tenant_id: string }>("hiring_members").find({ org_id: o.org_id }, { limit: 500 }))).filter((m) => m.tenant_id !== tenantId);
    if (others.length) workspacesHandedOn++;
    else workspacesClosed++;
  }
  let communitiesHandedOn = 0;
  let communitiesDeleted = 0;
  for (const c of ownedCommunities) {
    const others = (await safe(table<{ community_id: string; tenant_id: string; status: string }>("network_community_members").find({ community_id: c.community_id, status: "member" }, { limit: 10000 }))).filter((m) => m.tenant_id !== tenantId);
    if (others.length) communitiesHandedOn++;
    else communitiesDeleted++;
  }
  return { ...sent, workspacesHandedOn, workspacesClosed, connections: links1.length + links2.length, posts: posts.length, communitiesHandedOn, communitiesDeleted };
}
