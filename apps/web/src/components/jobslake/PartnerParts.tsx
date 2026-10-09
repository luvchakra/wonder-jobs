"use client";
import { useState } from "react";
import { Power } from "lucide-react";
import { AUTH_LABEL, FORMAT_LABEL, type ConnectorAuth, type PartnerAuthType, type PartnerConnection, type PartnerFormat, type PartnerPreset } from "@/domain/jobslake/partners";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input, Select } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { Note } from "./ui";

/** The editable shape of a connection: every field a string, so the form can hold half-typed values. */
interface Draft {
  format: PartnerFormat;
  endpoint: string;
  authType: PartnerAuthType | "";
  header: string;
  prefix: string;
  param: string;
  tokenUrl: string;
  clientId: string;
  scope: string;
  clientAuth: "basic" | "body";
  queryParam: string;
  locationParam: string;
  defaultEmployer: string;
}

function toDraft(c: PartnerConnection | undefined, preset: PartnerPreset | undefined): Draft {
  const a = c?.auth;
  return {
    format: c?.format ?? preset?.format ?? "json_api",
    endpoint: c?.endpoint ?? "",
    authType: a?.type ?? preset?.authType ?? "",
    header: a?.type === "header" ? a.header : "",
    prefix: a?.type === "header" ? (a.prefix ?? "") : "",
    param: a?.type === "query" ? a.param : "",
    tokenUrl: a?.type === "oauth2" ? a.tokenUrl : "",
    clientId: a?.type === "oauth2" ? a.clientId : "",
    scope: a?.type === "oauth2" ? (a.scope ?? "") : "",
    clientAuth: a?.type === "oauth2" ? (a.clientAuth ?? "basic") : "basic",
    queryParam: c?.queryParam ?? "",
    locationParam: c?.locationParam ?? "",
    defaultEmployer: c?.defaultEmployer ?? "",
  };
}

const opt = (v: string) => v.trim() || undefined;

function toConnection(d: Draft, existing: PartnerConnection | undefined): PartnerConnection | string {
  if (!d.endpoint.trim()) return "Enter the endpoint the partner gave you.";
  let auth: ConnectorAuth;
  switch (d.authType) {
    case "header":
      if (!d.header.trim()) return "Enter the header name the partner uses for the key.";
      auth = { type: "header", header: d.header.trim(), prefix: d.prefix || undefined };
      break;
    case "bearer":
      auth = { type: "bearer" };
      break;
    case "query":
      if (!d.param.trim()) return "Enter the URL parameter name the partner uses for the key.";
      auth = { type: "query", param: d.param.trim() };
      break;
    case "oauth2":
      if (!d.tokenUrl.trim() || !d.clientId.trim()) return "Enter the token URL and client ID.";
      auth = { type: "oauth2", tokenUrl: d.tokenUrl.trim(), clientId: d.clientId.trim(), scope: opt(d.scope), clientAuth: d.clientAuth };
      break;
    default:
      return "Choose how the partner authenticates.";
  }
  return {
    format: d.format,
    endpoint: d.endpoint.trim(),
    queryParam: opt(d.queryParam),
    locationParam: opt(d.locationParam),
    auth,
    ...(d.format === "json_api" ? { mapping: existing?.mapping ?? { itemsPath: "", fields: {} } } : { defaultEmployer: opt(d.defaultEmployer) }),
  };
}

/**
 * The partner connection form: what a partnership hands over (endpoint, format, auth), entered once.
 * The secret goes in the credential form below it — never in this config.
 */
export function PartnerConnectionEditor({ name, preset, connection, onSave }: { name: string; preset?: PartnerPreset; connection?: PartnerConnection; onSave: (c: PartnerConnection) => Promise<string | null> }) {
  const [d, setD] = useState<Draft>(() => toDraft(connection, preset));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const mono = "font-mono text-[13px]";
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const c = toConnection(d, connection);
        if (typeof c === "string") return setMsg({ tone: "danger", text: c });
        setBusy(true);
        const err = await onSave(c);
        setBusy(false);
        setMsg(err ? { tone: "danger", text: err } : { tone: "success", text: "Saved. Store the credential, then run a test." });
      }}
    >
      {preset && (
        <p className="text-[13px] text-ink-3">
          {preset.hint}
          {preset.docsUrl && (
            <>
              {" "}
              <a href={preset.docsUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                {preset.programme ?? `${name} partner docs`}
              </a>
            </>
          )}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Delivery format" htmlFor="pc-format">
          <Select id="pc-format" value={d.format} onChange={set("format")}>
            {(Object.keys(FORMAT_LABEL) as PartnerFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Authentication" htmlFor="pc-auth">
          <Select id="pc-auth" value={d.authType} onChange={set("authType")}>
            <option value="">Choose…</option>
            {(Object.keys(AUTH_LABEL) as PartnerAuthType[]).map((a) => (
              <option key={a} value={a}>
                {AUTH_LABEL[a]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Endpoint (https)" htmlFor="pc-endpoint" className="md:col-span-2">
          <Input id="pc-endpoint" value={d.endpoint} onChange={set("endpoint")} placeholder="From the partner's integration spec" className={mono} />
        </Field>
        {d.authType === "header" && (
          <Field label="Header name" htmlFor="pc-header">
            <Input id="pc-header" value={d.header} onChange={set("header")} className={mono} />
          </Field>
        )}
        {d.authType === "query" && (
          <Field label="Key parameter" htmlFor="pc-param">
            <Input id="pc-param" value={d.param} onChange={set("param")} className={mono} />
          </Field>
        )}
        {d.authType === "oauth2" && (
          <>
            <Field label="Token URL (https)" htmlFor="pc-token">
              <Input id="pc-token" value={d.tokenUrl} onChange={set("tokenUrl")} className={mono} />
            </Field>
            <Field label="Client ID" htmlFor="pc-client">
              <Input id="pc-client" value={d.clientId} onChange={set("clientId")} className={mono} autoComplete="off" />
            </Field>
          </>
        )}
      </div>
      <Fold title="Search parameters and more" hint="Leave empty for a full feed — JobsLake filters it locally.">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Search parameter" htmlFor="pc-q">
            <Input id="pc-q" value={d.queryParam} onChange={set("queryParam")} className={mono} />
          </Field>
          <Field label="Location parameter" htmlFor="pc-l">
            <Input id="pc-l" value={d.locationParam} onChange={set("locationParam")} className={mono} />
          </Field>
          {d.authType === "header" && (
            <Field label="Key prefix" hint="e.g. “Token ” (with the space)" htmlFor="pc-prefix">
              <Input id="pc-prefix" value={d.prefix} onChange={set("prefix")} className={mono} />
            </Field>
          )}
          {d.authType === "oauth2" && (
            <>
              <Field label="Scope" htmlFor="pc-scope">
                <Input id="pc-scope" value={d.scope} onChange={set("scope")} className={mono} />
              </Field>
              <Field label="Client authentication" htmlFor="pc-cauth">
                <Select id="pc-cauth" value={d.clientAuth} onChange={set("clientAuth")}>
                  <option value="basic">HTTP Basic (standard)</option>
                  <option value="body">In the request body</option>
                </Select>
              </Field>
            </>
          )}
          {d.format === "feed" && (
            <Field label="Employer when an item has none" htmlFor="pc-emp">
              <Input id="pc-emp" value={d.defaultEmployer} onChange={set("defaultEmployer")} />
            </Field>
          )}
        </div>
      </Fold>
      <div>
        <Button type="submit" size="sm" loading={busy}>
          Save connection
        </Button>
      </div>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </form>
  );
}

/**
 * Activating a partner portal: the admin states that a signed agreement permits this use. The
 * server records who and when, audits it, and refuses activation without it.
 */
export function PartnerActivate({ name, label, disabled, title, onActivate }: { name: string; label: string; disabled: boolean; title?: string; onActivate: (reference: string) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setAgreed(false);
    setError(null);
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled} title={title} icon={<Power className="size-3.5" aria-hidden />}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={`${label} ${name}?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!agreed}
              onClick={async () => {
                setBusy(true);
                const err = await onActivate(reference.trim());
                setBusy(false);
                if (err) setError(err);
                else close();
              }}
            >
              {label}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-[14px] text-ink-2">
          <p>From now on, candidate searches will include {name} jobs, each linking to its own apply page.</p>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4" />
            <span>A signed agreement with {name} permits WonderJobs to show these jobs to candidates and link to apply. Your name and the time are recorded.</span>
          </label>
          <Field label="Agreement reference (optional)" htmlFor="agr-ref">
            <Input id="agr-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />
          </Field>
          {error && <Note tone="danger">{error}</Note>}
        </div>
      </Modal>
    </>
  );
}
