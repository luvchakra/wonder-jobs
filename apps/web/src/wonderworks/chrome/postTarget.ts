"use client";
import { useEffect } from "react";
import { create } from "zustand";

/**
 * What a new network post can be about (owner, 2026-11-21: "creating post should be possible from various modules and
 * related artifacts"): the listing on screen, registered by its page while it is open, so the + can offer to attach it.
 * Only a listing with a public page (`/j/<id>`, `/s/<module>/<id>`) registers; nothing private ever does.
 */
export interface PostAbout {
  page: string;
  title: string;
  module: string;
}

interface PostTargetState {
  about: PostAbout | null;
  set: (a: PostAbout | null) => void;
  /** Bumped after a post is published, so an open feed reads itself again. */
  posted: number;
  bump: () => void;
}

export const usePostTarget = create<PostTargetState>((set) => ({
  about: null,
  set: (about) => set({ about }),
  posted: 0,
  bump: () => set((s) => ({ posted: s.posted + 1 })),
}));

const PUBLIC = /^\/(?:j|s\/[a-z]{2,20})\/[^/?#]+$/;

/** A listing page calls this with its public page and title; it is forgotten when the page closes. */
export function usePostAbout(about: PostAbout | null) {
  const set = usePostTarget((s) => s.set);
  const page = about && PUBLIC.test(about.page) ? about.page : null;
  const title = about?.title ?? "";
  const mod = about?.module ?? "";
  useEffect(() => {
    if (!page) return;
    set({ page, title, module: mod });
    return () => {
      if (usePostTarget.getState().about?.page === page) set(null);
    };
  }, [page, title, mod, set]);
}
