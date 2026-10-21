"use client";
import { BadgeCheck, Pencil, Trash2 } from "lucide-react";
import { can } from "@/domain/org/permissions";
import { ORG_ROLE_LABEL } from "@/domain/org/types";
import type { Workspace } from "@/services/hiring/client";

/**
 * Every hiring workspace the person belongs to, the first thing Hiring shows. Open goes into the workspace;
 * Edit and Delete, last in each row, are for the workspace's Owners (the server checks the role again).
 */
export function WorkspacesTable({ workspaces, onOpen, onEdit, onDelete }: { workspaces: Workspace[]; onOpen: (w: Workspace) => void; onEdit: (w: Workspace) => void; onDelete: (w: Workspace) => void }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-[16px] border border-line bg-surface">
      <table className="w-full text-left text-[14px]">
        <thead className="border-b border-line bg-surface-2 text-[12px] uppercase tracking-wide text-ink-3">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Company
            </th>
            <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
              Your role
            </th>
            <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((w) => {
            const owner = can(w.role, "org.manage");
            return (
              <tr key={w.org.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/60">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpen(w)} className="text-left font-semibold text-ink hover:text-brand-600 hover:underline">
                    {w.org.name}
                  </button>
                  {w.org.website && <span className="block text-[12px] text-ink-3">{w.org.website.replace(/^https?:\/\//, "")}</span>}
                  {/* On a phone the role and status sit here instead of in their own columns. */}
                  <span className="block text-[12px] text-ink-3 sm:hidden">
                    {ORG_ROLE_LABEL[w.role]} · {w.org.verified ? "Verified" : "Not verified"}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-ink-2 sm:table-cell">{ORG_ROLE_LABEL[w.role]}</td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  {w.org.verified ? (
                    <span className="inline-flex items-center gap-1 text-[13px] text-success-600">
                      <BadgeCheck className="size-4" aria-hidden /> Verified
                    </span>
                  ) : (
                    <span className="text-[13px] text-warning-600">Not verified</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => onOpen(w)} className="min-h-9 rounded-[10px] px-3 text-[13px] font-medium text-brand-600 hover:bg-brand-50">
                      Open
                    </button>
                    {owner ? (
                      <>
                        <button type="button" onClick={() => onEdit(w)} aria-label={`Edit ${w.org.name}`} title="Edit" className="grid size-9 place-items-center rounded-[10px] text-ink-3 hover:bg-surface-2 hover:text-ink">
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button type="button" onClick={() => onDelete(w)} aria-label={`Delete ${w.org.name}`} title="Delete" className="grid size-9 place-items-center rounded-[10px] text-ink-3 hover:bg-danger-100 hover:text-danger-600">
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </>
                    ) : (
                      <span className="w-[76px] text-center text-[12px] text-ink-4" title="Only Owners can edit or delete a workspace">
                        —
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
