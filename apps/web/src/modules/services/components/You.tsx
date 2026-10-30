"use client";
import { useState, useSyncExternalStore } from "react";
import { Briefcase, MapPin } from "lucide-react";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { YouOverview } from "@/wonderworks/you/YouOverview";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { cleanProfile, EMPTY_PROFILE, type ClientProfile } from "../domain";
import { selectProfile, useServicesStore } from "../store";

const noop = () => () => undefined;

/** Talent & Services → You: Jobs' You page with this module's rows under it: the client's area, and listing services (for pros). */
export function ServicesYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useServicesStore(selectProfile);
  return (
    <YouOverview
      module={{
        label: "Talent & Services",
        rows: [
          { href: "/app/m/services/you/profile", label: "Your area", value: (mounted && saved?.area) || "Add it", icon: MapPin },
          { href: "/app/m/services/company", label: "Offer your services", value: "For pros", icon: Briefcase },
        ],
      }}
    />
  );
}

/** The client's city or pin code, their own words: pros' service areas are compared with it. */
export function ServicesProfile() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useServicesStore(selectProfile);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your area" back={{ href: "/app/m/services/you", label: "You" }} />
      {mounted && <AreaForm key={saved ? "saved" : "new"} initial={saved ?? EMPTY_PROFILE} />}
    </div>
  );
}

function AreaForm({ initial }: { initial: ClientProfile }) {
  const [area, setArea] = useState(initial.area);
  const [problem, setProblem] = useState<string | null>(null);
  const save = () => {
    const c = cleanProfile({ area });
    if ("problem" in c) return setProblem(c.problem);
    setProblem(null);
    useServicesStore.getState().setPersona({ ...c.value });
    toast.success("Saved", "Each pro's card says whether they serve this area.");
  };
  return (
    <form
      className="wj-card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Your city or pin code" htmlFor="sv-area" hint="Compared with the areas a pro says they serve" required>
        <Input id="sv-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Pune, or 411001" />
      </Field>
      {problem && <p className="text-[13px] text-danger-600">{problem}</p>}
      <Button type="submit" full>
        Save
      </Button>
    </form>
  );
}
