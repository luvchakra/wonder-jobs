"use client";
import { create } from "zustand";
import type { MemberView } from "@/domain/network/network";
import { networkApi } from "@/services/network/client";

/**
 * The network's invitations, shared by the bell in the top bar and the My network page, so both show the same count
 * (owner, 2026-11-22: "put the invitations on the notifications"). Read when a network page opens and after an answer.
 */
interface Inbox {
  invitations: MemberView[] | null;
  load: () => Promise<void>;
  answer: (m: MemberView, action: "accept" | "ignore") => Promise<void>;
}

export const useNetworkInbox = create<Inbox>((set, get) => ({
  invitations: null,
  load: async () => {
    try {
      set({ invitations: (await networkApi.mine()).invitations });
    } catch {
      set({ invitations: [] });
    }
  },
  answer: async (m, action) => {
    if (!m.connectionId) return;
    await networkApi.act(m.connectionId, action);
    set({ invitations: (get().invitations ?? []).filter((x) => x.id !== m.id) });
  },
}));
