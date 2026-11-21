/**
 * Account data that deleting the tenant row does not reach: tables with no foreign key to `tenants`, so nothing
 * cascades. Each entry says what "Download my data" includes for it and how "Delete my account" removes it;
 * `subjectRights.ts` runs them all. A feature or module that stores a person's data in such a table adds its entry
 * here in the same PR (CLAUDE.md: Identity, tenant isolation and security).
 */
import { eraseHiring, exportHiring } from "../hiringAccount";
import { eraseCofounders, exportCofounders } from "../cofounders/account";
import { eraseContact, exportContact } from "../contact/exchange";
import { eraseMarketplace, exportMarketplace } from "../marketplace/account";
import { eraseNetwork, exportNetwork } from "../network/account";

export interface AccountData {
  /** The key this data has in the export. */
  key: string;
  export: (tenantId: string) => Promise<unknown>;
  erase: (tenantId: string) => Promise<void>;
}

export const ACCOUNT_DATA: AccountData[] = [
  { key: "network", export: exportNetwork, erase: eraseNetwork },
  { key: "marketplace", export: exportMarketplace, erase: eraseMarketplace },
  // Hiring workspaces stay (owner, 2026-11-21): only the person's own part is handed on (hiringAccount.ts).
  { key: "hiring", export: exportHiring, erase: eraseHiring },
  { key: "cofounders", export: exportCofounders, erase: eraseCofounders },
  // Phone and email offered in any module's conversation, and those offered to the person.
  { key: "contact", export: exportContact, erase: eraseContact },
];
