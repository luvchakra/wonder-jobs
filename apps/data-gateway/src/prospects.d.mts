import type { GatewayState } from "./core.mjs";

/** The gateway's prospect settings as they apply now (stored ones, else defaults). */
export interface ProspectSettings { allowExternalConsumers: boolean; quotas: { search: number; paid: number }; paidPlatformCap: number }
export function prospectSettings(state: GatewayState): ProspectSettings;
export const DEFAULT_QUOTAS: { readonly search: number; readonly paid: number };
export const DEFAULT_PAID_PLATFORM_CAP: number;
export const CANDIDATE_CAP: number;
