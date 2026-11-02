"use client";
import { useState } from "react";
import { Input, Select } from "@/components/common/Input";
import { countries, joinPlace, splitCountry } from "./place";

/**
 * A posting form's place: the town or area, then the country (owner, 2026-11-02: "make the posting forms ask for country
 * too"). Every module's form uses it, so every listing people post names its country. The value stays one string.
 */
export function PlaceField({ id, value, onChange, placeholder, required, maxLength = 120 }: { id?: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; maxLength?: number }) {
  const { place, country } = splitCountry(value);
  // What's typed, kept as typed (a comma mid-word survives); the stored value is the tidy joined string.
  const [text, setText] = useState(place);
  const shown = splitCountry(joinPlace(text, country)).place === place ? text : place;
  return (
    <div className="flex flex-wrap gap-2">
      <Input id={id} className="min-w-0 flex-[2_1_12rem]" value={shown} maxLength={maxLength} placeholder={placeholder} onChange={(e) => { setText(e.target.value); onChange(joinPlace(e.target.value, country)); }} />
      <Select aria-label="Country" className="flex-[1_1_9rem]" value={country} required={required} onChange={(e) => onChange(joinPlace(shown, e.target.value))}>
        <option value="">Country</option>
        {countries().map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
