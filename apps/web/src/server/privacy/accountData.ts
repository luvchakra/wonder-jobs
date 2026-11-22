/**
 * Account data that deleting the tenant row does not reach: tables with no foreign key to `tenants`, so nothing
 * cascades. Each entry says what "Download my data" includes for it and how "Delete my account" removes it;
 * `subjectRights.ts` runs them all. A feature or module that stores a person's data in such a table adds its entry
 * here in the same PR (CLAUDE.md: Identity, tenant isolation and security).
 */
import { eraseHiring, exportHiring } from "../hiringAccount";
import { eraseCofounders, exportCofounders } from "../cofounders/account";
import { eraseContact, exportContact } from "../contact/exchange";
import { eraseSafety, exportSafety } from "../modules/safety";
import { eraseSent, exportSent } from "../sentAccount";
import { eraseMarketplace, exportMarketplace } from "../marketplace/account";
import { eraseNetwork, exportNetwork } from "../network/account";
import { eraseCommunities, exportCommunities } from "../network/communities";

export interface AccountData {
  /** The key this data has in the export. */
  key: string;
  export: (tenantId: string) => Promise<unknown>;
  erase: (tenantId: string) => Promise<void>;
}

export const ACCOUNT_DATA: AccountData[] = [
  { key: "network", export: exportNetwork, erase: eraseNetwork },
  // Network communities and discussions: owned communities pass on, the person's posts go (WJ-835).
  { key: "communities", export: exportCommunities, erase: eraseCommunities },
  { key: "marketplace", export: exportMarketplace, erase: eraseMarketplace },
  // Hiring workspaces stay (owner, 2026-11-21): only the person's own part is handed on (hiringAccount.ts).
  { key: "hiring", export: exportHiring, erase: eraseHiring },
  { key: "cofounders", export: exportCofounders, erase: eraseCofounders },
  // Phone and email offered in any module's conversation, and those offered to the person.
  { key: "contact", export: exportContact, erase: eraseContact },
  // Reports and blocks in every module (module_reports, module_blocks), not only Network's and Buy, Sell & Rent's.
  { key: "safety", export: exportSafety, erase: eraseSafety },
  // What the person sent to companies and schools: Easy Apply applications, module requests, bookings (owner,
  // 2026-11-22: deleted with the account, with a full warning first).
  { key: "sent", export: exportSent, erase: eraseSent },
];
