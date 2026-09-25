/**
 * Request contracts for the JobsApply routes. The helper's form schema is `.strict()` on purpose:
 * it describes a page's *structure* only, so a payload that carries a field value, a cookie or a
 * token is rejected outright rather than silently stored (spec §48, SEC-006…009).
 */
import { z } from "zod";
import { MEMORY_KEYS, PROFILE_KEYS } from "@/domain/jobs-apply/types";

const str = (max: number) => z.string().max(max);
const provenance = z.enum(["VERIFIED", "USER_PROVIDED", "RESUME_IMPORTED", "LINKEDIN_IMPORTED", "USER_CONFIRMED", "AI_DERIVED", "AI_SUGGESTED"]);
const appValue = z.object({ value: str(500).min(1), provenance, confidence: z.number().min(0).max(1), confirmedAt: str(40).optional() });

const packFile = z.object({
  kind: z.enum(["resume", "cover_letter"]),
  filename: str(120).regex(/^[\w .()\-–—À-ž]+\.(pdf|docx)$/i, "A .pdf or .docx file name"),
  source: z.enum(["tailored-docx", "template-pdf"]),
  markdown: str(60_000).optional(),
  // ~650 KB of PDF; a template résumé is typically 60–200 KB.
  base64: str(900_000)
    .regex(/^JVBER[A-Za-z0-9+/=]*$/, "Not a PDF")
    .optional(),
  templateId: str(60).optional(),
  templateVersion: str(20).optional(),
  versionId: str(80).min(1),
  provenance: z.enum(["AI_GENERATED", "USER_MODIFIED", "USER_PROVIDED", "SYSTEM_DERIVED"]),
});

export const PackSchema = z.object({
  applicationId: str(80).min(1),
  jobId: str(200).min(1),
  jobTitle: str(300).min(1),
  company: str(200).min(1),
  profile: z.partialRecord(z.enum(PROFILE_KEYS), appValue),
  memory: z.array(z.object({ key: z.enum(MEMORY_KEYS), value: str(500).min(1), confirmedAt: str(40), source: z.literal("USER_PROVIDED") })).max(40),
  resume: packFile.optional(),
  coverLetter: packFile.extend({ text: str(20_000).optional() }).optional(),
  answers: z.array(z.object({ id: str(80), question: str(1000), answer: str(5000), provenance: z.enum(["AI_GENERATED", "USER_MODIFIED", "USER_PROVIDED"]) })).max(40),
  version: str(80).min(1),
  capturedAt: str(40),
});

export const CreateSchema = z.object({
  job: z.object({
    id: str(200).min(1),
    title: str(300),
    company: str(200),
    applyUrl: str(2000).url(),
    companyDomain: str(200).optional(),
    onEmployerSite: z.boolean(),
    lake: z
      .object({
        sightings: z.array(z.object({ url: str(2000), canonical: z.boolean(), employerSource: z.boolean() }).passthrough()).max(50),
      })
      .passthrough()
      .optional(),
  }),
  pack: PackSchema,
  mode: z.enum(["guided", "assisted", "fill"]),
  /** Start a fresh session even though one is in progress for this job ("Start over", §71). */
  startOver: z.boolean().optional(),
  /** The candidate saw the duplicate warning and chose "Continue anyway" (§57). */
  acknowledgeDuplicate: z.boolean().optional(),
});

const fieldType = z.enum(["text", "textarea", "email", "phone", "url", "select", "radio", "checkbox", "date", "file", "combobox", "number", "password", "otp", "unknown"]);

export const FieldSchema = z
  .object({
    id: str(200).min(1),
    label: str(500),
    type: fieldType,
    required: z.boolean(),
    options: z.array(z.object({ label: str(200), value: str(200) }).strict()).max(300).optional(),
    hints: z.object({ name: str(200).optional(), id: str(200).optional(), autocomplete: str(80).optional(), placeholder: str(200).optional(), aria: str(300).optional() }).strict().optional(),
    step: z.number().int().min(1).max(50).optional(),
    hasValue: z.boolean().optional(),
  })
  .strict();

export const FormSchema = z
  .object({
    url: str(2000).url(),
    provider: z.enum(["greenhouse", "lever", "ashby", "workday", "smartrecruiters", "workable", "teamtailor", "recruitee", "personio"]).optional(),
    adapter: str(60),
    step: z.number().int().min(1).max(50),
    stepCount: z.number().int().min(1).max(50).optional(),
    fields: z.array(FieldSchema).max(300),
    signals: z.array(z.enum(["login_form", "captcha", "otp", "payment", "unexpected_password", "suspicious_download"])).max(10),
  })
  .strict();

export const HelperEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("FIELD_RESULTS"), results: z.array(z.object({ fieldId: str(200), ok: z.boolean(), error: z.enum(["not_found", "rejected", "file_failed", "changed"]).optional() }).strict()).max(300) }).strict(),
  z.object({ type: z.literal("NAVIGATION_CHANGED"), url: str(2000).url(), passwordField: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("SUBMIT_CLICKED") }).strict(),
  z.object({ type: z.literal("SUBMISSION_DETECTED"), url: str(2000).url(), excerpt: str(400).optional(), confirmationId: str(80).optional() }).strict(),
  z.object({ type: z.literal("STOP") }).strict(),
  z.object({ type: z.literal("RESUME") }).strict(),
  z.object({ type: z.literal("APPROVE_DOMAIN"), host: str(253) }).strict(),
]);

export const EventsSchema = z.object({ events: z.array(HelperEventSchema).min(1).max(20) }).strict();

export const FillPlanSchema = z.object({ host: str(253), fieldIds: z.array(str(200)).max(300).optional(), clicked: z.boolean() }).strict();

export const InterventionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), value: str(5000), origin: z.enum(["ai", "ai_edited"]).optional() }),
  z.object({ action: z.literal("edit"), value: str(5000), origin: z.enum(["ai", "ai_edited"]).optional() }),
  z.object({ action: z.literal("choose") }),
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("answered_on_portal") }),
]);

export const ConfirmSchema = z.object({ answer: z.enum(["yes", "not_yet", "unsure"]) });
export const ModeSchema = z.object({ mode: z.enum(["guided", "assisted", "fill"]) });
export const DomainSchema = z.object({ host: str(253) });
