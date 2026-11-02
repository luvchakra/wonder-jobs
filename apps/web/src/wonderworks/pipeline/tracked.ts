"use client";
import { useMemo } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import type { ModuleState } from "@/wonderworks/store";
import { trackedOutside, type ProgressFlow } from "@/wonderworks/listing/progress";

/** A module Pipeline's outside listings the person is tracking themselves (listing/progress.ts), memoised on the store's slices. */
export function useTracked<T>(useStore: UseBoundStore<StoreApi<ModuleState>>, flow: ProgressFlow, isOutside: (id: string, item: T) => boolean) {
  const responses = useStore((s) => s.responses);
  const items = useStore((s) => s.items);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `isOutside` is a fixed test per module
  return useMemo(() => trackedOutside<T>(flow, responses, items, isOutside), [flow, responses, items]);
}
