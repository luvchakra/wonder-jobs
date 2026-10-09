/**
 * WonderJobs helper on an employer's application page.
 *
 * With an Apply with Wonder session for this site (paired from WonderJobs), it:
 *   1. reads the form's STRUCTURE — labels, types, options, whether a field has something in it —
 *      never a value the candidate typed, and never anything from a password, one-time-code or
 *      payment field (it only notices that one exists);
 *   2. sends that structure to WonderJobs, which decides what may be filled (the candidate's own
 *      profile, résumé and approved answers) and what needs the candidate;
 *   3. fills only what WonderJobs returns, when the candidate chooses Fill (or automatically when
 *      their own policy allows), highlights what needs them, and reports what happened;
 *   4. notices — passively — when the candidate presses the employer's submit button and when a
 *      confirmation page appears, and tells WonderJobs as evidence.
 *
 * It presses two kinds of button, each under its own gate from WonderJobs:
 *   - a page's own next-page button ("Next", "Continue", "Save and continue") after filling that page,
 *     when `plan.advance` allows it (WJ-239);
 *   - the employer's final button ("Submit", "Apply", …) only when `plan.submit` is true — the candidate
 *     turned on "Submit applications" for this application or their account (WJ-249) — and only once
 *     every required field on the page has something in it and the form says it's valid. Once per page
 *     session; reported to WonderJobs (APPLICATION_SUBMITTED) before the press.
 * Never in WonderJobs' cloud browser. Without `plan.submit`, on a page whose way on is a final button it stops and the candidate submits. A
 * unit test in the web app holds the helper to exactly these two guarded presses.
 *
 * It reads what the candidate types only into questions WonderJobs flagged as needing them (never a
 * password, code, payment, ID, demographic, legal or right-to-work question), so the answer can be
 * remembered for the next form.
 *
 * Without a session, the original "Fill with WonderJobs" button remains: name, email, phone,
 * LinkedIn, résumé and cover letter from the prepared materials, and nothing else.
 */
(() => {
  if (window.__wonderjobsHelper) return;
  window.__wonderjobsHelper = true;

  const PANEL_ID = "wonderjobs-autofill-root";
  const ask = (type, payload) => chrome.runtime.sendMessage({ type, payload }).catch(() => null);
  const api = (sessionId, path, method = "GET", body) => ask("jobsApplyCall", { sessionId, path, method, body });

  /* ------------------------------------------------------------ page reading */

  function visible(el) {
    if (!el || el.disabled) return false;
    if (el.type === "hidden") return false;
    if (el.closest(`#${PANEL_ID}`)) return false;
    // A file input is often visually hidden behind a styled button — still fillable, still counts —
    // but not when the whole section it's in is hidden (a later step the candidate hasn't reached).
    if (el.type === "file") {
      if (el.closest("[hidden], [aria-hidden='true']")) return false;
      const host = el.parentElement;
      return !host || (typeof host.checkVisibility === "function" ? host.checkVisibility() : host.getClientRects().length > 0);
    }
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  // Icon fallbacks and required-markers that end up in a label's text ("*First nameSVGs not supported by this browser.").
  const cleanLabel = (s) =>
    clean(String(s || "").replace(/SVGs? (are )?not supported by this browser\.?/gi, " ").replace(/your browser does not support (svg|images?)\.?/gi, " "))
      .replace(/^\*+\s*|\s*\*+$/g, "")
      .trim();

  /** A label's words without its icons: SVG titles, scripts and decorative (aria-hidden) parts aren't the question. */
  function textOf(node) {
    if (!node) return "";
    const copy = node.cloneNode(true);
    copy.querySelectorAll("svg, script, style, [aria-hidden='true']").forEach((n) => n.remove());
    return copy.textContent;
  }

  /** The text a person reads as this field's question: the first source that says something once icon noise is removed. */
  function labelOf(el) {
    const tries = [];
    if (el.id) tries.push(textOf(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)));
    tries.push(textOf(el.closest("label")));
    const by = el.getAttribute("aria-labelledby");
    if (by)
      tries.push(
        by
          .split(/\s+/)
          .map((id) => textOf(document.getElementById(id)))
          .filter(Boolean)
          .join(" "),
      );
    tries.push(el.getAttribute("aria-label"));
    tries.push(nearestLabel(el));
    tries.push(el.getAttribute("placeholder"));
    for (const t of tries) {
      const c = cleanLabel(t);
      if (c) return c.slice(0, 300);
    }
    return "";
  }

  /**
   * Workday, Workable and most custom forms keep the question in the field's container rather than a
   * <label for>. The nearest label-like element before the field, a few levels up — never one that
   * belongs to another field.
   */
  function nearestLabel(el) {
    const SEL = "label, legend, [data-automation-id='formLabel'], .label, .field-label, [data-ui='label'], h3, h4";
    let box = el.parentElement;
    for (let i = 0; box && i < 5; i++, box = box.parentElement) {
      const before = [...box.querySelectorAll(SEL)].filter((l) => !l.contains(el) && !(l.htmlFor && l.htmlFor !== el.id) && l.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      const lab = before.pop();
      if (lab && cleanLabel(textOf(lab))) return textOf(lab);
    }
    return "";
  }

  /**
   * The heading of the part of the form a field sits in ("Education 1", "Work Experience", "Address"): the
   * nearest heading before it, walking out through its containers. It tells "Start date" under Education
   * from the date you can start. Structure only — never a value.
   */
  const HEADING = "h1, h2, h3, h4, h5, legend, [role=heading], [data-automation-id*='sectionheader' i]";
  function sectionOf(el, label) {
    let box = el.parentElement;
    for (let i = 0; box && box !== document.body && i < 10; i++, box = box.parentElement) {
      const before = [...box.querySelectorAll(HEADING)].filter((h) => !h.contains(el) && h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      for (let j = before.length - 1; j >= 0; j--) {
        const t = cleanLabel(textOf(before[j]));
        if (t && t !== label && t.length <= 80) return t;
      }
    }
    return "";
  }

  function groupLabel(inputs) {
    const fs = inputs[0].closest("fieldset");
    const legend = fs?.querySelector("legend");
    if (legend && cleanLabel(legend.textContent)) return cleanLabel(legend.textContent);
    const by = inputs[0].closest("[role=radiogroup], [role=group]")?.getAttribute("aria-labelledby");
    if (by && cleanLabel(document.getElementById(by)?.textContent)) return cleanLabel(document.getElementById(by)?.textContent);
    const box = inputs[0].closest(".field, .form-group, .application-question, [data-automation-id]");
    const lab = box?.querySelector("label, .label, [data-automation-id='formLabel']");
    return cleanLabel(lab?.textContent) || cleanLabel(nearestLabel(inputs[0])) || clean(inputs[0].name);
  }

  function typeOf(el) {
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (ac === "one-time-code") return "otp";
    if (el.tagName === "TEXTAREA") return "textarea";
    if (el.tagName === "SELECT") return "select";
    if (el.getAttribute("role") === "combobox" && el.tagName !== "INPUT") return "combobox";
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (t === "tel") return "phone";
    if (["text", "email", "url", "number", "date", "file", "password", "radio", "checkbox"].includes(t)) return t;
    if (t === "search") return "text";
    return "unknown";
  }

  function hasValue(el, type) {
    if (type === "password" || type === "otp") return undefined; // never looked at
    if (type === "file") return !!el.files?.length;
    if (type === "checkbox") return el.checked;
    if (type === "select") return el.selectedIndex > 0 || (el.selectedIndex === 0 && !!el.value && !/select|choose/i.test(el.options[0]?.text || ""));
    return !!(el.value && el.value.trim());
  }

  const PROVIDERS = [
    ["greenhouse", /(^|\.)greenhouse\.io$/],
    ["lever", /(^|\.)lever\.co$/],
    ["ashby", /(^|\.)ashbyhq\.com$/],
    ["workday", /(^|\.)(myworkdayjobs|myworkday|myworkdaysite)\.com$/],
    ["smartrecruiters", /(^|\.)smartrecruiters\.com$/],
    ["workable", /(^|\.)workable\.com$/],
    ["teamtailor", /(^|\.)teamtailor\.com$/],
    ["recruitee", /(^|\.)recruitee\.com$/],
    ["personio", /(^|\.)personio\.(de|com)$/],
  ];
  function provider() {
    const host = location.hostname.toLowerCase();
    const hit = PROVIDERS.find(([, re]) => re.test(host));
    if (hit) return hit[0];
    // Test portals and white-labelled boards can declare themselves.
    const meta = document.querySelector('meta[name="wonderjobs-ats"]')?.getAttribute("content");
    return PROVIDERS.some(([p]) => p === meta) ? meta : undefined;
  }

  function stepInfo() {
    const text = clean(document.querySelector("[data-automation-id='progressBar'], [aria-label*='step' i], .progress, .steps, [data-step]")?.textContent || document.body.innerText.slice(0, 4000));
    const m = /step\s+(\d{1,2})\s*(?:of|\/)\s*(\d{1,2})/i.exec(text);
    return m ? { step: Number(m[1]), stepCount: Number(m[2]) } : { step: 1 };
  }

  function signals() {
    const out = [];
    const vis = (sel) => [...document.querySelectorAll(sel)].some((e) => visible(e));
    if (vis("input[type=password]")) out.push("login_form");
    // A challenge the candidate already solved leaves its token in the page; it no longer needs them.
    const solved = [...document.querySelectorAll("textarea[name='g-recaptcha-response'], textarea[name='h-captcha-response'], input[name='cf-turnstile-response']")].some((e) => (e.value || "").length > 20);
    const captcha = [...document.querySelectorAll("iframe")].some((f) => {
      const id = `${f.getAttribute("title") || ""} ${f.getAttribute("src") || ""}`;
      if (!/captcha|challenge|turnstile|hcaptcha/i.test(id)) return false;
      const r = f.getBoundingClientRect();
      return r.width >= 100 && r.height >= 40 && getComputedStyle(f).visibility !== "hidden";
    });
    state.challenge = !solved && (captcha || vis(".cf-turnstile, .h-captcha:not([data-size=invisible])"));
    if (state.challenge) out.push("captcha");
    if (vis("input[autocomplete='one-time-code']") || [...document.querySelectorAll("input")].some((e) => visible(e) && /verification code|one[- ]time|otp|security code/i.test(labelOf(e)))) out.push("otp");
    if (vis("input[autocomplete^='cc-']") || [...document.querySelectorAll("input")].some((e) => visible(e) && /card number|\bcvv\b|\bcvc\b|expiry date/i.test(labelOf(e)))) out.push("payment");
    return out;
  }

  /** fieldId → element(s); rebuilt on every read so fills always target the current page. */
  let fieldEls = new Map();

  function readForm() {
    fieldEls = new Map();
    const fields = [];
    const used = new Set();
    const uid = (base) => {
      let id = (base || "field").slice(0, 150);
      let n = 2;
      while (used.has(id)) id = `${base}_${n++}`;
      used.add(id);
      return id;
    };
    const { step, stepCount } = stepInfo();
    const radios = new Map();
    const els = [...document.querySelectorAll("input, textarea, select, [role=combobox]")].filter((el) => visible(el) && !["submit", "button", "reset", "image", "hidden"].includes((el.type || "").toLowerCase()));
    for (const el of els) {
      const type = typeOf(el);
      if (type === "radio") {
        const key = el.name || el.id;
        if (!radios.has(key)) radios.set(key, []);
        radios.get(key).push(el);
        continue;
      }
      if (type === "password" || type === "otp") continue; // noticed via signals only; never read
      if ((el.getAttribute("autocomplete") || "").startsWith("cc-")) continue;
      const id = uid(el.id || el.name || `f${fields.length}`);
      fieldEls.set(id, [el]);
      const label = labelOf(el);
      const f = { id, label: label.slice(0, 480), type, required: !!(el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label)), step };
      const hints = {};
      if (el.name) hints.name = el.name.slice(0, 190);
      if (el.id) hints.id = el.id.slice(0, 190);
      if (el.getAttribute("autocomplete")) hints.autocomplete = el.getAttribute("autocomplete").slice(0, 70);
      if (el.getAttribute("placeholder")) hints.placeholder = el.getAttribute("placeholder").slice(0, 190);
      if (el.getAttribute("aria-label")) hints.aria = el.getAttribute("aria-label").slice(0, 290);
      const section = sectionOf(el, label);
      if (section) hints.section = section.slice(0, 190);
      if (Object.keys(hints).length) f.hints = hints;
      if (type === "select") f.options = [...el.options].filter((o) => o.value !== "" || o.index > 0).slice(0, 290).map((o) => ({ label: clean(o.text).slice(0, 190), value: String(o.value).slice(0, 190) }));
      const hv = hasValue(el, type);
      if (hv !== undefined) f.hasValue = hv;
      fields.push(f);
    }
    for (const [name, group] of radios) {
      const id = uid(name || `radio${fields.length}`);
      fieldEls.set(id, group);
      const label = groupLabel(group);
      const section = sectionOf(group[0], label);
      fields.push({
        id,
        label: label.slice(0, 480),
        type: "radio",
        required: group.some((r) => r.required) || /\*\s*$/.test(label),
        step,
        options: group.slice(0, 290).map((r) => ({ label: labelOf(r).slice(0, 190) || r.value, value: String(r.value).slice(0, 190) })),
        hasValue: group.some((r) => r.checked),
        ...(name || section ? { hints: { ...(name ? { name: name.slice(0, 190) } : {}), ...(section ? { section: section.slice(0, 190) } : {}) } } : {}),
      });
    }
    const p = provider();
    return { url: location.href, ...(p ? { provider: p } : {}), adapter: p ? `adapter:${p}` : "generic", step, ...(stepCount ? { stepCount } : {}), fields: fields.slice(0, 300), signals: signals() };
  }

  /* ----------------------------------------------------------------- filling */

  function setNative(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function b64ToFile(b64, filename, mime) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  }

  /* --------------------------------------------- the form's own verdict on a value */

  const ERR_TEXT = /\b(invalid|not valid|enter a valid|valid (format|number|phone|date|email)|incorrect|wrong format|format|must be|should be)\b/i;

  /** The form's own complaint about a field just filled: browser validity, aria-invalid, or an error shown beside it. */
  function fieldError(el) {
    if (el.willValidate && el.validity && !el.validity.valid && !el.validity.valueMissing) return true;
    if (el.getAttribute("aria-invalid") === "true") return true;
    for (const id of (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean)) {
      if (ERR_TEXT.test(document.getElementById(id)?.textContent || "")) return true;
    }
    let box = el.parentElement;
    for (let i = 0; box && i < 4; i++, box = box.parentElement) {
      // Stop before a container that holds other fields — their errors aren't this field's.
      if (box.querySelectorAll("input, textarea, select").length > 1) break;
      const err = [...box.querySelectorAll("[role=alert], [aria-live], .error, [class*='error' i], [data-automation-id*='error' i]")].find((e) => !e.contains(el) && visible(e) && ERR_TEXT.test(e.textContent || ""));
      if (err) return true;
    }
    return false;
  }

  /** Other ways to write the same value: a phone without its country code or spaces, a month and year another way round. */
  function formatVariants(value) {
    const v = String(value).trim();
    const out = [];
    const intl = /^\+(\d{1,3})[\s.-]*([\d\s().-]{6,})$/.exec(v);
    if (intl) {
      const n = intl[2].replace(/\D/g, "");
      out.push(n, `+${intl[1]}${n}`, `${intl[1]}${n}`, `+${intl[1]}-${n}`, `0${n}`);
    } else if (/^[\d\s().-]{8,}$/.test(v) && /\D/.test(v)) out.push(v.replace(/\D/g, ""));
    const my = /^(\d{2})\/(\d{4})$/.exec(v);
    if (my) out.push(`${my[2]}-${my[1]}`, `${my[1]}-${my[2]}`, `${my[1]}${my[2]}`);
    return [...new Set(out)].filter((x) => x && x !== v);
  }

  /** Does a value fit the field's own declared limits (maxlength, pattern)? */
  function fitsField(el, x) {
    if (el.maxLength > 0 && x.length > el.maxLength) return false;
    if (el.pattern) {
      try {
        return new RegExp(`^(?:${el.pattern})$`).test(x);
      } catch {
        return true;
      }
    }
    return true;
  }

  /**
   * Put a value in, then let the form judge it. When the form flags it and the value has other
   * spellings, try them — the field's declared limits first — and keep the first the form accepts.
   * Same value, other format: nothing is invented. When none is accepted, the candidate's own value stays.
   */
  async function setChecked(el, value) {
    const variants = formatVariants(value);
    setNative(el, value);
    if (!variants.length || el.tagName === "SELECT") return el.value === value;
    await new Promise((r) => setTimeout(r, 350));
    if (el.value === value && !fieldError(el)) return true;
    const ordered = [...variants.filter((x) => fitsField(el, x)), ...variants.filter((x) => !fitsField(el, x))];
    for (const candidate of ordered) {
      setNative(el, candidate);
      if (el.value !== candidate) continue;
      await new Promise((r) => setTimeout(r, 350));
      if (!fieldError(el)) return true;
    }
    setNative(el, value);
    return false;
  }

  async function fillOne(sessionId, item) {
    const els = fieldEls.get(item.fieldId);
    if (!els?.length || !els[0].isConnected) return { fieldId: item.fieldId, ok: false, error: "not_found" };
    const el = els[0];
    const type = typeOf(el);
    try {
      if (item.file) {
        if (type !== "file") return { fieldId: item.fieldId, ok: false, error: "changed" };
        // Without a session the plan carries the file itself (the candidate's own latest résumé).
        const r = item.fileData ? { data: item.fileData } : await api(sessionId, `/api/jobs-apply/extension/file?kind=${item.file}`);
        if (!r?.data?.base64) return { fieldId: item.fieldId, ok: false, error: "file_failed" };
        const dt = new DataTransfer();
        dt.items.add(b64ToFile(r.data.base64, r.data.filename, r.data.mime));
        el.files = dt.files;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { fieldId: item.fieldId, ok: el.files.length === 1, ...(el.files.length === 1 ? {} : { error: "file_failed" }) };
      }
      if (typeof item.value !== "string") return { fieldId: item.fieldId, ok: false, error: "rejected" };
      if (type === "radio") {
        const target = els.find((r) => r.value === item.value);
        if (!target) return { fieldId: item.fieldId, ok: false, error: "rejected" };
        // Selecting a radio by property, not by clicking: nothing on the page is pressed.
        target.checked = true;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return { fieldId: item.fieldId, ok: target.checked };
      }
      // A consent box is ticked only when the plan says "checked" — the candidate turned on Legal declarations in
      // Automation. Set by property, like a radio: nothing on the page is pressed.
      if (type === "checkbox" && item.value === "checked") {
        if (!el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return { fieldId: item.fieldId, ok: el.checked };
      }
      if (type === "checkbox" || type === "password" || type === "otp" || type === "combobox") return { fieldId: item.fieldId, ok: false, error: "rejected" };
      if (type === "select" && ![...el.options].some((o) => o.value === item.value)) return { fieldId: item.fieldId, ok: false, error: "rejected" };
      const accepted = await setChecked(el, item.value);
      return { fieldId: item.fieldId, ok: accepted, ...(accepted ? {} : { error: "rejected" }) };
    } catch {
      return { fieldId: item.fieldId, ok: false, error: "rejected" };
    }
  }

  /* ----------------------------------------------------------- highlights */

  const MARK = "data-wonderjobs-mark";
  function highlight(view) {
    document.querySelectorAll(`[${MARK}]`).forEach((e) => {
      e.style.outline = "";
      e.style.outlineOffset = "";
      e.removeAttribute(MARK);
    });
    for (const m of view?.mappings ?? []) {
      const el = fieldEls.get(m.fieldId)?.[0];
      if (!el || el.type === "file") continue;
      const color = m.status === "filled" ? "#16a34a" : m.status === "needs_you" ? (m.classification === "human-only" ? "#7c3aed" : "#d97706") : m.status === "failed" ? "#dc2626" : null;
      if (!color) continue;
      el.setAttribute(MARK, m.status);
      el.style.outline = `2px solid ${color}`;
      el.style.outlineOffset = "2px";
      el.title = m.status === "needs_you" ? (m.classification === "human-only" ? "WonderJobs: only you can answer this" : "WonderJobs: needs you") : m.status === "filled" ? "Filled by WonderJobs from your profile" : "WonderJobs couldn't fill this";
    }
  }

  /* ------------------------------------------------------------------ panel */

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function shadow() {
    let host = document.getElementById(PANEL_ID);
    if (host) return host.shadowRoot;
    host = document.createElement("div");
    host.id = PANEL_ID;
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
        .pill { display:inline-flex; align-items:center; gap:8px; border:0; border-radius:999px; padding:10px 16px; background:#6d4cf5; color:#fff; font-size:13px; font-weight:600; cursor:pointer; box-shadow:0 6px 20px rgba(17,24,39,.25); }
        .pill:hover { background:#5b3ae0; } .pill[disabled] { opacity:.6; cursor:default; }
        .ghost { background:#fff; color:#374151; border:1px solid #d1d5db; box-shadow:none; }
        .ghost:hover { background:#f9fafb; }
        .card { width:340px; max-width:calc(100vw - 32px); max-height:calc(100vh - 32px); overflow:auto; background:#fff; color:#111827; border-radius:16px; box-shadow:0 12px 40px rgba(17,24,39,.28); padding:14px; font-size:13px; line-height:1.45; }
        h2 { margin:0; font-size:14px; } h3 { margin:12px 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#6b7280; }
        .muted { color:#6b7280; font-size:12px; } .warn { color:#b45309; } .bad { color:#b91c1c; } .ok { color:#15803d; }
        ul { margin:4px 0 0; padding-left:18px; } li { margin:2px 0; }
        li button { all:unset; cursor:pointer; color:#4338ca; text-decoration:underline; }
        .row { display:flex; gap:8px; align-items:center; justify-content:space-between; margin-top:10px; flex-wrap:wrap; }
        .box { margin-top:10px; padding:10px; border-radius:12px; background:#fef3c7; }
        .box.bad { background:#fee2e2; color:#111827; }
        .close { border:0; background:transparent; color:#6b7280; cursor:pointer; font-size:18px; line-height:1; }
        .bar { height:6px; border-radius:99px; background:#eef2ff; overflow:hidden; margin-top:8px; } .bar > div { height:100%; background:#6d4cf5; }
      </style>
      <div id="slot"></div>`;
    document.documentElement.appendChild(host);
    return root;
  }
  const slot = () => shadow().getElementById("slot");

  /* ------------------------------------------------------ JobsApply session */

  // Inside WonderJobs' cloud browser (a server-hosted page behind the message shim) the helper never
  // submits: final submission happens only in the candidate's own browser (CLAUDE.md, WJ-249).
  const IN_CLOUD = !!(window.chrome && window.chrome.runtime && window.chrome.runtime.__wonder);
  const state = { offDestination: false, sessionId: null, view: null, busy: false, minimized: false, submitted: false, detected: false, lastSig: "", lastUrl: location.href, stopped: false, advance: false, submit: false, keepGoing: false, advances: 0, notice: null, challenge: false };

  function sigOf(form) {
    return JSON.stringify([form.step, form.signals, form.fields.map((f) => [f.id, f.type, f.hasValue, f.options?.length])]);
  }

  async function inspect(force = false) {
    if (!state.sessionId || state.stopped || state.offDestination) return;
    // Our own fills change the page; re-reading it mid-fill would plan the same fields again and loop.
    // applyPlan reads the page once more when it's done.
    if (state.busy && !force) return;
    const form = readForm();
    const sig = sigOf(form);
    if (!force && sig === state.lastSig) return;
    state.lastSig = sig;
    // A frame with nothing to report stays quiet; the top page reports "no form" once, after a grace period.
    if (!form.fields.length && !form.signals.length && window.top !== window) return;
    const r = await api(state.sessionId, "/api/jobs-apply/extension/inspect", "POST", form);
    if (!r || r.error) return render(r);
    state.view = r.data;
    highlight(state.view);
    if (r.data.plan?.allowed) {
      state.advance = !!r.data.plan.advance;
      state.submit = !IN_CLOUD && !!r.data.plan.submit;
    }
    if (r.data.plan?.allowed && r.data.plan.fills.length) return applyPlan(r.data.plan);
    render();
    // The candidate chose Fill on an earlier page of this form: keep filling page after page.
    if (state.keepGoing && !r.data.plan?.allowed && (r.data.progress?.fillable ?? 0) > 0) return fillClicked();
    if (state.advance) scheduleAdvance();
  }

  /* step-classifier:start */
  // A page's way on, by its button's words. "final" is never pressed; "next" may be, after filling.
  const STEP_FINAL = /\b(submit|apply|send|finish|complete|confirm|done|pay|purchase|place order|sign)\b/i;
  const STEP_NEXT = /^(next|continue|proceed|save (and|&) (continue|next|proceed)|next (step|page)|go to (the )?next (step|page)|continue to [a-z ]{1,30})$/i;
  function stepKind(label) {
    const t = String(label || "").replace(/[›»→>]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (!t || t.length > 40) return null;
    if (STEP_FINAL.test(t)) return "final";
    if (STEP_NEXT.test(t)) return "next";
    return null;
  }
  /* step-classifier:end */

  function stepButtons() {
    const out = { next: [], final: [] };
    for (const b of document.querySelectorAll("button, input[type=submit], input[type=button], [role=button]")) {
      if (b.closest(`#${PANEL_ID}`) || b.disabled || b.getAttribute("aria-disabled") === "true" || !b.getClientRects().length) continue;
      const kind = stepKind(b.textContent || b.value || b.getAttribute("aria-label"));
      if (kind) out[kind].push(b);
    }
    return out;
  }

  /** Required questions on this page that are still empty — Wonder waits for them. */
  function openRequired() {
    return (state.view?.mappings ?? []).filter((m) => {
      if (!m.required || m.status !== "needs_you") return false;
      const els = fieldEls.get(m.fieldId) ?? [];
      if (!els.length) return false;
      return !els.some((el) => (el.type === "checkbox" || el.type === "radio" ? el.checked : el.type === "file" ? (el.files?.length ?? 0) > 0 : !!(el.value && String(el.value).trim())));
    });
  }

  let advanceTimer = null;
  function scheduleAdvance() {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => void maybeAdvance(), 1200);
  }

  async function maybeAdvance() {
    if (!state.advance || state.stopped || state.offDestination || state.busy || state.submitted || window.top !== window) return;
    const waiting = openRequired();
    const answer = waiting.length === 1 ? "the highlighted question" : `the ${waiting.length} highlighted questions`;
    const { next, final } = stepButtons();
    // A page whose way on is a submit. With "Submit applications" on for this application, Wonder submits
    // once the page is complete; otherwise Wonder's part is done and the candidate submits.
    if (final.length) {
      const finalLabel = clean(final[0].textContent || final[0].value || final[0].getAttribute("aria-label")).slice(0, 80);
      if (state.submit && !waiting.length && final.length === 1 && pageComplete(final[0])) return submitFinal(final[0], finalLabel);
      state.keepGoing = false;
      state.notice = state.submit
        ? `Last step: ${waiting.length ? `answer ${answer} — ` : "fill every required field — "}Wonder submits once the form is complete.`
        : `Last step: ${waiting.length ? `answer ${answer}, ` : ""}review the form, then press “${finalLabel.slice(0, 40)}” yourself.`;
      return render();
    }
    if (waiting.length) {
      state.notice = `Answer ${answer} — Wonder moves on when ${waiting.length === 1 ? "it's" : "they're"} done.`;
      return render();
    }
    if (next.length !== 1 || state.advances >= 15) return;
    const button = next[0];
    const label = clean(button.textContent || button.value || button.getAttribute("aria-label")).slice(0, 80);
    const before = sigOf(readForm());
    await sendEvent({ type: "STEP_ADVANCED", label });
    if (state.stopped) return;
    state.advances++;
    state.notice = null;
    if (stepKind(label) === "next") button.click(); // the helper's only button press: a page's own next-page button
    setTimeout(() => {
      if (sigOf(readForm()) !== before) return;
      state.keepGoing = false;
      state.notice = "The page didn't move on — check the form for a message, then press its button yourself.";
      render();
    }, 4000);
  }

  /** Every required field on the page has something in it, and the employer's own form says it's valid. */
  function pageComplete(button) {
    const filled = (el) => (el.type === "checkbox" ? el.checked : el.type === "radio" ? !!document.querySelector(`input[type=radio][name="${CSS.escape(el.name)}"]:checked`) : el.type === "file" ? (el.files?.length ?? 0) > 0 : !!(el.value && String(el.value).trim()));
    for (const el of document.querySelectorAll("input[required], select[required], textarea[required], input[aria-required=true], select[aria-required=true], textarea[aria-required=true]")) {
      if (el.closest(`#${PANEL_ID}`) || el.type === "hidden" || !el.getClientRects().length) continue;
      if (!filled(el)) return false;
    }
    const form = button.form || button.closest("form");
    return !form || form.checkValidity();
  }

  /** The final press, under "Submit applications" (WJ-249): reported first, once per page session. */
  async function submitFinal(button, label) {
    if (state.submitted) return;
    state.submitted = true; // also keeps the passive submit watcher from reporting this press as the candidate's
    state.keepGoing = false;
    const r = await sendEvent({ type: "APPLICATION_SUBMITTED", label });
    if (state.stopped || !r?.data) {
      state.submitted = false;
      state.notice = "Wonder didn't submit — check the form, then press its button yourself.";
      return render();
    }
    state.notice = `Submitting to ${state.view?.company ?? "the employer"} — Submit applications is on for this application.`;
    render();
    if (stepKind(label) === "final" && state.submit) button.click(); // the final press: only under plan.submit, on a complete page
  }

  // Learning: an answer the candidate types into a question Wonder flagged as needing them is remembered
  // for the next form. Only those questions, and never a sensitive one.
  // Right-to-work questions are "human-only" too; WonderJobs refuses them again on its side.
  const NEVER_LEARN = new Set(["CREDENTIAL", "EEO", "LEGAL", "SPONSORSHIP"]);
  document.addEventListener(
    "change",
    (e) => {
      if (!state.sessionId || state.offDestination || !(e.target instanceof Element) || e.target.closest(`#${PANEL_ID}`)) return;
      const el = e.target;
      const fieldId = [...fieldEls.entries()].find(([, els]) => els.includes(el))?.[0];
      const m = fieldId && state.view?.mappings?.find((x) => x.fieldId === fieldId);
      if (!m || m.status !== "needs_you" || m.classification === "human-only" || NEVER_LEARN.has(m.category)) return;
      if (["password", "otp", "file", "hidden", "checkbox"].includes((el.type || "").toLowerCase())) return;
      const value = el.tagName === "SELECT" ? clean(el.selectedOptions?.[0]?.textContent) : el.type === "radio" ? (el.checked ? clean(labelOf(el)) || clean(el.value) : "") : String(el.value || "").trim();
      if (value && value.length <= 500) void sendEvent({ type: "ANSWER_LEARNED", fieldId, value });
      if (state.advance) scheduleAdvance();
    },
    true,
  );

  async function applyPlan(plan) {
    if (state.busy) return; // one fill at a time
    state.busy = true;
    render();
    const results = [];
    for (const item of plan.fills) {
      if (state.stopped) break; // Stop means stop: no further field actions.
      results.push(await fillOne(state.sessionId, item));
    }
    if (results.length) {
      const r = await api(state.sessionId, "/api/jobs-apply/extension/events", "POST", { events: [{ type: "FIELD_RESULTS", results }] });
      if (r?.data) state.view = r.data;
    }
    state.busy = false;
    state.lastSig = "";
    await inspect(true);
  }

  async function fillClicked() {
    const r = await api(state.sessionId, "/api/jobs-apply/extension/fill-plan", "POST", { host: location.hostname, clicked: true });
    if (!r?.data) return render(r);
    if (!r.data.allowed) {
      state.notice = r.data.reason;
      return render();
    }
    state.keepGoing = true;
    state.advance = !!r.data.advance;
    state.submit = !IN_CLOUD && !!r.data.submit;
    await applyPlan(r.data);
  }

  async function sendEvent(ev) {
    const r = await api(state.sessionId, "/api/jobs-apply/extension/events", "POST", { events: [ev] });
    if (r?.data) state.view = r.data;
    return r;
  }

  const SUCCESS = /(thank(s| you)[^.!\n]{0,40}(for )?(applying|your application|your interest)|application (has been |was )?(received|submitted|sent)|we('ve| have) received your application|successfully (applied|submitted))/i;
  const CONF_ID = /(?:confirmation|reference|application)\s*(?:number|no\.?|id|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,39})/i;

  function watchSubmission() {
    // Signing in (a form with a password field) is not submitting an application.
    const isSignIn = (el) => {
      const form = el?.closest?.("form") ?? (el instanceof HTMLFormElement ? el : null);
      return !!form?.querySelector("input[type=password]");
    };
    const onSubmitIntent = (e) => {
      if (state.submitted || !state.sessionId || state.offDestination) return;
      if (isSignIn(e?.target)) return;
      state.submitted = true;
      void sendEvent({ type: "SUBMIT_CLICKED" });
    };
    // Passive: these listeners only observe the candidate's own submit; they never cause one.
    document.addEventListener("submit", onSubmitIntent, true);
    document.addEventListener(
      "click",
      (e) => {
        const b = e.target instanceof Element ? e.target.closest("button, input[type=submit], [role=button]") : null;
        if (!b || b.closest(`#${PANEL_ID}`)) return;
        const text = clean(b.textContent || b.value || b.getAttribute("aria-label"));
        if (b.type === "submit" || /^(submit|apply|send)( application| my application| now)?$/i.test(text)) onSubmitIntent(e);
      },
      true,
    );
  }

  function checkConfirmation() {
    if (state.detected || !state.sessionId) return;
    const text = document.body?.innerText?.slice(0, 20000) || "";
    const m = SUCCESS.exec(text);
    if (!m) return;
    // A confirmation page usually has few inputs; a form that merely says "thank you for your interest" still has many.
    if (readForm().fields.length > 3) return;
    state.detected = true;
    const start = Math.max(0, m.index - 40);
    const excerpt = clean(text.slice(start, m.index + m[0].length + 120)).slice(0, 200);
    const id = CONF_ID.exec(text)?.[1];
    void sendEvent({ type: "SUBMISSION_DETECTED", url: location.href, excerpt, ...(id ? { confirmationId: id } : {}) }).then(render);
  }

  function statusBlock(v) {
    const f = v.failure;
    if (v.stopped) return `<div class="box"><strong>You stopped Wonder.</strong><div class="muted">Fields already entered stay on the page. Nothing was submitted. Continue from WonderJobs when you're ready.</div></div>`;
    if (f === "DOMAIN_CHANGED") return `<div class="box bad"><strong>${v.jobTitle ? `Is this your application for ${esc(v.jobTitle)}${v.company ? ` at ${esc(v.company)}` : ""}?` : "Wonder paused this application."}</strong><div>WonderJobs didn't open <strong>${esc(location.hostname)}</strong> for it. Continue here only if this is that job's form.</div><div class="row"><button class="pill ghost" id="approve">Continue here</button><button class="pill ghost" id="stop2">Stop</button></div></div>`;
    if (f === "PAYMENT_REQUESTED") return `<div class="box bad"><strong>Wonder found a payment request.</strong><div>Wonder will not enter payment information. Legitimate employers don't charge to apply — please verify the employer independently.</div></div>`;
    if (f === "CAPTCHA_REQUIRED") return `<div class="box"><strong>Verification required</strong><div>The portal is asking you to complete a verification challenge. Complete it, then continue.</div><div class="row"><button class="pill" id="resume">I've completed it</button></div></div>`;
    if (f === "MFA_REQUIRED") return `<div class="box"><strong>Sign-in verification required</strong><div>Complete the verification here. Wonder continues after you're signed in.</div><div class="row"><button class="pill" id="resume">I've completed it</button></div></div>`;
    if (v.status === "AUTHENTICATION_REQUIRED") return `<div class="box"><strong>You're not signed in to this portal.</strong><div>Sign in directly on this page. Wonder does not need your portal password and never reads it.</div></div>`;
    if (f === "FORM_NOT_FOUND") return `<div class="box"><strong>Wonder couldn't identify this application form yet.</strong><div class="muted">Your Application Pack in WonderJobs has every value ready to copy.</div></div>`;
    return "";
  }

  function render(err) {
    const s = slot();
    if (err?.error) {
      const revoked = err.error === "revoked" || err.error === "not_connected";
      s.__wjHtml = "";
      s.innerHTML = `<div class="card"><div class="row" style="margin:0"><h2>WonderJobs</h2><button class="close" id="x" aria-label="Close">&times;</button></div><p class="muted">${revoked ? "This application isn't connected any more. Reopen it from WonderJobs to continue." : "WonderJobs didn't answer. Your progress is saved — try again."}</p>${revoked ? "" : `<div class="row"><span></span><button class="pill" id="retry">Try again</button></div>`}</div>`;
      shadow().getElementById("x")?.addEventListener("click", () => (s.innerHTML = ""));
      shadow().getElementById("retry")?.addEventListener("click", () => inspect(true));
      return;
    }
    const v = state.view;
    if (!v) return;
    if (state.minimized) {
      s.__wjHtml = "";
      s.innerHTML = `<button class="pill" id="open">WonderJobs · ${v.progress.needsYou ? `${v.progress.needsYou} need you` : `${v.progress.filled} filled`}</button>`;
      shadow().getElementById("open").addEventListener("click", () => {
        state.minimized = false;
        render();
      });
      return;
    }
    const p = v.progress;
    const needs = (v.mappings || []).filter((m) => m.status === "needs_you");
    const fillable = p.fillable;
    const detected = v.status === "VERIFICATION";
    const html = `
      <div class="card" role="dialog" aria-label="WonderJobs application helper">
        <div class="row" style="margin:0"><h2>Apply with Wonder</h2><button class="close" id="min" aria-label="Minimise">&minus;</button></div>
        <div class="muted">${esc(v.jobTitle)} · ${esc(v.company)}</div>
        ${statusBlock(v)}
        ${
          v.mappings?.length
            ? `<div class="bar" role="progressbar" aria-valuenow="${p.percent}" aria-valuemin="0" aria-valuemax="100"><div style="width:${p.percent}%"></div></div>
               <p style="margin:8px 0 0">Wonder found ${p.total} field${p.total === 1 ? "" : "s"}. <span class="ok">✓ ${p.filled} filled</span>${fillable ? ` · ${fillable} ready to fill` : ""}${p.needsYou ? ` · <span class="warn">⚠ ${p.needsYou} need you</span>` : ""}</p>`
            : ""
        }
        ${state.notice ? `<p class="muted">${esc(state.notice)}</p>` : ""}
        ${fillable && !v.stopped && v.fill !== "skip" && !v.failure ? `<div class="row"><button class="pill" id="fill" ${state.busy ? "disabled" : ""}>${state.busy ? "Filling…" : `Fill ${fillable} field${fillable === 1 ? "" : "s"}`}</button></div>` : ""}
        ${v.fill === "skip" ? `<p class="muted">Filling forms is off in What Wonder can do — use guided mode in WonderJobs.</p>` : ""}
        ${needs.length ? `<h3>Needs you</h3><ul>${needs.map((m) => `<li><button data-field="${esc(m.fieldId)}">${esc(m.label || "Unlabelled field")}</button>${m.classification === "human-only" ? ' <span class="muted">— only you can answer</span>' : ""}</li>`).join("")}</ul><p class="muted">Answer here on the form, or in WonderJobs.</p>` : ""}
        ${v.resume ? `<h3>Résumé</h3><div>${esc(v.resume.filename)}</div>` : ""}
        ${detected ? `<div class="box" style="background:#dcfce7"><strong>Looks like it went through.</strong><div>Confirm in WonderJobs that you submitted it.</div></div>` : ""}
        <div class="row">
          <span class="muted">${state.challenge ? "Complete the page's verification, then press the employer's button yourself." : state.submit ? "Submit for me is on: Wonder submits once every required field is answered." : "Review, then press the employer's submit button yourself."}</span>
          ${v.stopped ? "" : `<button class="pill ghost" id="stop">Stop</button>`}
        </div>
      </div>`;
    // Identical content isn't re-drawn: rebuilding the panel restarts its buttons and makes it flicker.
    if (html === s.__wjHtml && s.firstElementChild) return;
    s.innerHTML = s.__wjHtml = html;
    const $ = (id) => shadow().getElementById(id);
    $("min")?.addEventListener("click", () => {
      state.minimized = true;
      render();
    });
    $("fill")?.addEventListener("click", () => void fillClicked());
    const doStop = async () => {
      state.stopped = true;
      await sendEvent({ type: "STOP" });
      state.view = { ...v, stopped: true };
      render();
    };
    $("stop")?.addEventListener("click", doStop);
    $("stop2")?.addEventListener("click", doStop);
    $("resume")?.addEventListener("click", async () => {
      await sendEvent({ type: "RESUME" });
      state.lastSig = "";
      await inspect(true);
    });
    $("approve")?.addEventListener("click", async () => {
      await sendEvent({ type: "APPROVE_DOMAIN", host: location.hostname });
      // The candidate vouched for this host: from now on it's part of the application.
      if (state.offDestination) {
        state.offDestination = false;
        watchSubmission();
      }
      state.lastSig = "";
      await inspect(true);
    });
    shadow()
      .querySelectorAll("[data-field]")
      .forEach((b) =>
        b.addEventListener("click", () => {
          const el = fieldEls.get(b.getAttribute("data-field"))?.[0];
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
          el?.focus({ preventScroll: true });
        }),
      );
  }

  async function startSession(sessionId) {
    state.sessionId = sessionId;
    const hasPassword = [...document.querySelectorAll("input[type=password]")].some((e) => visible(e));
    const nav = await sendEvent({ type: "NAVIGATION_CHANGED", url: location.href, passwordField: hasPassword });
    if (nav?.error) return render(nav);
    if (state.view?.stopped) {
      state.stopped = true;
      return render();
    }
    if (state.offDestination) {
      // Not the application's destination: WonderJobs has paused it; nothing on this page is read.
      return render();
    }
    watchSubmission();
    await inspect(true);
    checkConfirmation();
    if (window.top === window) {
      setTimeout(async () => {
        if (state.view?.mappings?.length || state.view?.failure) return;
        const form = readForm();
        if (!form.fields.length && !document.querySelector("iframe[src*='greenhouse'], iframe[src*='lever'], iframe[src*='ashby'], iframe[src*='workday']")) {
          const r = await api(state.sessionId, "/api/jobs-apply/extension/inspect", "POST", form);
          if (r?.data) state.view = r.data;
          render();
        }
      }, 6000);
    }
    // Dynamic fields, next steps and the candidate's own answers: re-read the structure when the page changes.
    let t = null;
    const later = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (location.href !== state.lastUrl) {
          state.lastUrl = location.href;
          void sendEvent({ type: "NAVIGATION_CHANGED", url: location.href, passwordField: [...document.querySelectorAll("input[type=password]")].some((e) => visible(e)) });
        }
        void inspect();
        checkConfirmation();
      }, 700);
    };
    new MutationObserver(later).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"] });
    // Answers approved in WonderJobs, a Stop pressed there, or a policy change: pick them up while the page is open.
    setInterval(async () => {
      if (document.visibilityState !== "visible" || state.busy || !state.sessionId || state.stopped) return;
      const r = await api(state.sessionId, "/api/jobs-apply/extension/session");
      if (!r || r.error) {
        if (r?.error === "revoked") {
          // Stopped or ended from WonderJobs: no more field actions until WonderJobs pairs again.
          state.stopped = true;
          render(r);
        }
        return;
      }
      const before = JSON.stringify([state.view?.progress, state.view?.stopped, state.view?.status, state.view?.fill]);
      state.view = { ...r.data, plan: undefined };
      if (r.data.stopped) state.stopped = true;
      if (JSON.stringify([r.data.progress, r.data.stopped, r.data.status, r.data.fill]) !== before) {
        highlight(state.view);
        render();
        if (r.data.fill === "run" && r.data.progress.fillable > 0 && !state.stopped) {
          const plan = await api(state.sessionId, "/api/jobs-apply/extension/fill-plan", "POST", { host: location.hostname, clicked: false });
          if (plan?.data?.allowed && plan.data.fills.length) await applyPlan(plan.data);
        }
      }
    }, 3000);
    document.addEventListener("change", later, true);
    setInterval(() => location.href !== state.lastUrl && later(), 1000);
  }

  /* ------------------------------------------------ fill without an application */

  /** Visible fields a person types into — enough of them means this page is a form worth offering Fill on. */
  function readFormEls() {
    return [...document.querySelectorAll("input, textarea")].filter((el) => visible(el) && !["submit", "button", "checkbox", "radio", "password", "hidden"].includes(el.type));
  }

  /**
   * Fill on a page WonderJobs has no application for: the form's structure goes to WonderJobs, which
   * reads every field the way Apply with Wonder does and answers with what the candidate's own Career
   * Profile, CV history, saved answers and latest résumé fill. Filled by the same routine as a session:
   * values set on fields, nothing pressed, nothing submitted.
   */
  async function legacyFill() {
    const form = readForm();
    const [planReply, applicationReply] = await Promise.all([ask("quickPlan", { form }), ask("application", { url: location.href })]);
    if (planReply?.error === "not_connected") return { error: "not_connected" };
    const plan = planReply?.data;
    if (!plan) return { error: "request_failed" };
    if (!plan.allowed) return { filled: [], missing: [], blocked: plan.reason };
    // A posting with prepared materials in WonderJobs uses its tailored résumé and cover letter.
    const application = applicationReply?.data?.matched ? applicationReply.data : null;
    const tailored = application?.resume ? { filename: application.resume.filename, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", base64: application.resume.base64 } : null;
    const filled = [];
    for (const item of plan.fills) {
      const fileData = item.file ? tailored ?? plan.resume : undefined;
      if (item.file && !fileData) continue;
      const res = await fillOne(null, item.file ? { ...item, fileData } : item);
      if (res.ok) filled.push(item.file ? `${item.label} (${fileData.filename})` : item.label);
    }
    const cover = [...document.querySelectorAll("textarea")].find((el) => visible(el) && /cover\s?letter/i.test(labelOf(el)) && !(el.value && el.value.trim()));
    if (cover && application?.coverLetter?.text) {
      setNative(cover, application.coverLetter.text);
      filled.push("Cover letter");
    }
    const missing = plan.needsYou.map((n) => n.label).filter((l) => !(cover && application?.coverLetter?.text && /cover\s?letter/i.test(l)));
    return { filled, missing, application };
  }

  function legacyButton() {
    slot().innerHTML = `<button class="pill" id="fill">Fill with WonderJobs</button>`;
    shadow().getElementById("fill").addEventListener("click", legacyRun);
  }
  async function legacyRun() {
    const b = shadow().getElementById("fill");
    if (b) {
      b.disabled = true;
      b.textContent = "Filling…";
    }
    let r;
    try {
      r = await legacyFill();
    } catch (e) {
      r = { error: String(e?.message ?? e) };
    }
    const s = slot();
    if (r.error) {
      s.innerHTML = `<div class="card"><div class="row" style="margin:0"><h2>${r.error === "not_connected" ? "Not connected" : "Couldn't fill this page"}</h2><button class="close" id="x">&times;</button></div><p class="muted">${r.error === "not_connected" ? "Open WonderJobs and sign in — the extension picks it up from there automatically." : "WonderJobs didn't answer. Check you're signed in, then try again."}</p></div>`;
    } else {
      s.innerHTML = `<div class="card"><div class="row" style="margin:0"><h2>${r.filled.length ? `Filled ${r.filled.length} field${r.filled.length === 1 ? "" : "s"}` : "Nothing to fill"}</h2><button class="close" id="x">&times;</button></div><p class="muted">${r.blocked ? esc(r.blocked) : r.application ? `Using your prepared materials for <strong>${esc(r.application.jobTitle || "this role")}</strong>.` : "From your Career Profile, CV and saved answers."}</p>${r.filled.length ? `<ul class="ok">${r.filled.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}${r.missing.length ? `<p class="muted">Left for you: ${r.missing.slice(0, 6).map(esc).join(", ")}${r.missing.length > 6 ? ` and ${r.missing.length - 6} more` : ""}.</p>` : ""}<p class="muted">Nothing is submitted for you. For step-by-step help, use Apply with Wonder from the job in WonderJobs.</p></div>`;
    }
    shadow().getElementById("x")?.addEventListener("click", legacyButton);
  }

  /* ------------------------------------------------------------------ start */

  async function boot() {
    const s = await ask("jobsApplyFor", { url: location.href });
    if (s?.sessionId) {
      state.offDestination = !!s.offDestination;
      return startSession(s.sessionId);
    }
    const hasForm = () => readFormEls().length >= 2;
    if (window.top !== window && !hasForm()) return;
    if (hasForm()) return legacyButton();
    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      if (document.getElementById(PANEL_ID) || tries > 10) return clearInterval(poll);
      if (hasForm()) {
        clearInterval(poll);
        legacyButton();
      }
    }, 700);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "fillNow") {
      (state.sessionId ? fillClicked() : legacyRun()).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === "jobsApplyAdopt" && message.sessionId) {
      // The candidate pressed Fill on a page their application didn't open: ask before anything is read.
      if (!state.sessionId) {
        state.offDestination = true;
        void startSession(message.sessionId);
      }
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "jobsApplyPaired" && message.sessionId) {
      if (!state.sessionId) void startSession(message.sessionId);
      else if (state.sessionId === message.sessionId) {
        // Continued from WonderJobs after a stop: re-read the page with the fresh connection.
        state.stopped = false;
        state.lastSig = "";
        void inspect(true);
      }
    }
    return false;
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else void boot();
})();
