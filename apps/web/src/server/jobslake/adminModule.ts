import { MODULE_IDS, type ModuleId } from "@/modules/registry";

/** The module an admin page asked about (`?module=`), else Jobs; anything unknown is Jobs, never an error. */
export function adminModule(req: Request): ModuleId {
  const m = new URL(req.url).searchParams.get("module");
  return (MODULE_IDS as readonly string[]).includes(m ?? "") ? (m as ModuleId) : "jobs";
}
