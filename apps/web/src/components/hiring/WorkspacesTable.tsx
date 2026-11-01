"use client";
import { BadgeCheck, Briefcase, ChevronRight, Inbox, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { can } from "@/domain/org/permissions";
import { ORG_ROLE_LABEL } from "@/domain/org/types";
import type { Workspace } from "@/services/hiring/client";
import { CompanyLogo } from "@/wonderworks/brand/CompanyLogo";

const domainOf = (website?: string | null) => website?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || undefined;

/** Totals across the person's workspaces, for Hiring's header. */
export function workspaceTotals(workspaces: Workspace[]) {
  return {
    companies: workspaces.length,
    openJobs: workspaces.reduce((n, w) => n + (w.stats?.openJobs ?? 0), 0),
    newApplications: workspaces.reduce((n, w) => n + (w.stats?.newApplications ?? 0), 0),
  };
}

/**
 * Every hiring workspace the person belongs to, the first thing Hiring shows (owner, 2026-10-25): one row each — the
 * company, verified or not, your role, and its open jobs, new applications and team. Tapping a row opens it; Edit and
 * Delete are folded under ⋯, for the workspace's Owners only (the server checks the role again).
 */
export function WorkspacesTable({ workspaces, onOpen, onEdit, onDelete }: { workspaces: Workspace[]; onOpen: (w: Workspace) => void; onEdit: (w: Workspace) => void; onDelete: (w: Workspace) => void }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[16px] border border-teal-200 bg-surface dark:border-teal-900">
      {workspaces.map((w) => {
        const owner = can(w.role, "org.manage");
        const s = w.stats;
        return (
          <li key={w.org.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-teal-50/60 dark:hover:bg-teal-950/30">
            <button type="button" onClick={() => onOpen(w)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${w.org.name}`}>
              <CompanyLogo name={w.org.name} domain={domainOf(w.org.website)} logo size={36} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="truncate text-[14px] font-semibold text-ink">{w.org.name}</span>
                  {w.org.verified ? <BadgeCheck className="size-4 shrink-0 text-teal-600" aria-label="Verified" /> : <span className="shrink-0 text-[11px] font-medium text-warning-600">Not verified</span>}
                </span>
                <span className="flex flex-wrap items-center gap-x-2.5 text-[12px] text-ink-3">
                  <span>{ORG_ROLE_LABEL[w.role]}</span>
                  {s?.openJobs !== undefined && (
                    <span className="inline-flex items-center gap-1" title="Open jobs">
                      <Briefcase className="size-3.5" aria-hidden /> {s.openJobs} open
                    </span>
                  )}
                  {s?.newApplications !== undefined && (
                    <span className={`inline-flex items-center gap-1 ${s.newApplications ? "font-semibold text-teal-700 dark:text-teal-300" : ""}`} title="New applications">
                      <Inbox className="size-3.5" aria-hidden /> {s.newApplications} new
                    </span>
                  )}
                  {s && (
                    <span className="inline-flex items-center gap-1" title="Team">
                      <Users className="size-3.5" aria-hidden /> {s.members}
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
            </button>
            {owner && (
              <details className="relative shrink-0">
                <summary aria-label={`More for ${w.org.name}`} className="grid size-8 cursor-pointer list-none place-items-center rounded-full text-ink-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  <MoreHorizontal className="size-4" aria-hidden />
                </summary>
                <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-[12px] border border-line bg-surface py-1 shadow-lg">
                  <button type="button" onClick={() => onEdit(w)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-2">
                    <Pencil className="size-4" aria-hidden /> Edit
                  </button>
                  <button type="button" onClick={() => onDelete(w)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-danger-600 hover:bg-danger-100">
                    <Trash2 className="size-4" aria-hidden /> Delete
                  </button>
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
