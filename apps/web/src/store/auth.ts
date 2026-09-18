"use client";
import { create } from "zustand";
import type { ClientMode } from "@/lib/mode";

/** Who is using the product in this browser (not persisted; derived at boot from cookies + the auth session). */
interface AuthState {
  mode: ClientMode["mode"];
  userId: string | null;
  email: string | null;
  set: (patch: Partial<Omit<AuthState, "set">>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  mode: "local",
  userId: null,
  email: null,
  set: (patch) => set(patch),
}));
