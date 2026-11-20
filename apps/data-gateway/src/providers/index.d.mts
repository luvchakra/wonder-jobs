/** A live prospect provider (WJ-822): an official API asked only when a search names it. Contact providers (WJ-825) serve the lookup routes. */
export interface LiveProvider { id: string; label: string; kinds: ("business" | "channel" | "contact")[]; paid: boolean; units: number; coverage: string[]; attribution: string; termsPending: boolean; cost: string; keys: string[]; maxPage?: number; defaultCacheHours: number }
export const LIVE_PROVIDERS: readonly LiveProvider[];
export const LOOKUP_PROVIDERS: readonly LiveProvider[];
export const ALL_PROVIDERS: readonly LiveProvider[];
export const PROVIDER_KEYS: readonly string[];
export const DEFAULT_PROVIDER_CACHE_HOURS: Readonly<Record<string, number>>;
export const MAX_PROVIDER_CACHE_HOURS: number;
export function providerReady(provider: LiveProvider, keys: Record<string, string | undefined>): boolean;
