/** A live prospect provider (WJ-822): an official API asked only when a search names it. */
export interface LiveProvider { id: string; label: string; kinds: ("business" | "channel")[]; paid: boolean; units: number; coverage: string[]; attribution: string; termsPending: boolean; keys: string[]; maxPage: number; defaultCacheHours: number }
export const LIVE_PROVIDERS: readonly LiveProvider[];
export const DEFAULT_PROVIDER_CACHE_HOURS: Readonly<Record<string, number>>;
export const MAX_PROVIDER_CACHE_HOURS: number;
export function providerReady(provider: LiveProvider, keys: Record<string, string | undefined>): boolean;
