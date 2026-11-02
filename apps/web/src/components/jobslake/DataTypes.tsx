"use client";
import { MODULE_DATA } from "@/domain/jobslake/moduleData";
import { MODULES } from "@/modules/registry";
import { Fold } from "@/components/common/Fold";

/** What each module's sources fetch: the category shown beside every source. */
export function DataTypes() {
  return (
    <Fold title="What each module's sources fetch" className="mt-4">
      <dl className="flex flex-col gap-2.5 text-[13px]">
        {MODULES.map((m) => (
          <div key={m.id}>
            <dt className="font-medium text-ink">
              {m.label} · {MODULE_DATA[m.id].type}
            </dt>
            <dd className="text-[12.5px] text-ink-3">{MODULE_DATA[m.id].info}</dd>
          </div>
        ))}
      </dl>
    </Fold>
  );
}
