import type { PostAudience } from "@/services/network/client";

/** Who sees a post, in the words the post shows (owner, 2026-11-22: Only me, and changing it after posting). */
export const AUDIENCE_LABEL: Record<PostAudience, string> = { connections: "Connections", everyone: "Everyone on the network", only_me: "Only me" };
export const AUDIENCE_SEEN: Record<PostAudience, string> = {
  connections: "Your connections can see it.",
  everyone: "Everyone on the network can see it.",
  only_me: "Only you can see it.",
};
