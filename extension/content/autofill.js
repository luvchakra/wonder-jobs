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
 * It never submits. There is no code in this file that clicks a button, submits a form, or sends a
 * key press; a unit test in the web app scans for exactly that. The candidate submits.
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

  /** The text a person reads as this field's question. */
  function labelOf(el) {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return clean(l.textContent);
    }
    const wrap = el.closest("label");
    if (wrap) return clean(wrap.textContent);
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent)
        .filter(Boolean)
        .join(" ");
      if (clean(t)) return clean(t);
    }
    if (el.getAttribute("aria-label")) return clean(el.getAttribute("aria-label"));
    // Workday and many custom forms keep the label in the field's container.
    const box = el.closest("[data-automation-id], .field, .form-group, .application-question, .form-field, li, div");
    const lab = box?.querySelector("label, legend, [data-automation-id='formLabel'], .label, .field-label");
    if (lab && !lab.contains(el)) return clean(lab.textContent);
    return clean(el.getAttribute("placeholder") || "");
  }

  function groupLabel(inputs) {
    const fs = inputs[0].closest("fieldset");
    const legend = fs?.querySelector("legend");
    if (legend) return clean(legend.textContent);
    const by = inputs[0].closest("[role=radiogroup], [role=group]")?.getAttribute("aria-labelledby");
    if (by) return clean(document.getElementById(by)?.textContent);
    const box = inputs[0].closest(".field, .form-group, .application-question, [data-automation-id]");
    const lab = box?.querySelector("label, .label, [data-automation-id='formLabel']");
    return lab ? clean(lab.textContent) : clean(inputs[0].name);
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
    const captcha = [...document.querySelectorAll("iframe")].some((f) => {
      const id = `${f.getAttribute("title") || ""} ${f.getAttribute("src") || ""}`;
      if (!/captcha|challenge|turnstile|hcaptcha/i.test(id)) return false;
      const r = f.getBoundingClientRect();
      return r.width >= 100 && r.height >= 40 && getComputedStyle(f).visibility !== "hidden";
    });
    if (captcha || vis(".cf-turnstile, .h-captcha:not([data-size=invisible])")) out.push("captcha");
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
      fields.push({
        id,
        label: label.slice(0, 480),
        type: "radio",
        required: group.some((r) => r.required) || /\*\s*$/.test(label),
        step,
        options: group.slice(0, 290).map((r) => ({ label: labelOf(r).slice(0, 190) || r.value, value: String(r.value).slice(0, 190) })),
        hasValue: group.some((r) => r.checked),
        ...(name ? { hints: { name: name.slice(0, 190) } } : {}),
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

  async function fillOne(sessionId, item) {
    const els = fieldEls.get(item.fieldId);
    if (!els?.length || !els[0].isConnected) return { fieldId: item.fieldId, ok: false, error: "not_found" };
    const el = els[0];
    const type = typeOf(el);
    try {
      if (item.file) {
        if (type !== "file") return { fieldId: item.fieldId, ok: false, error: "changed" };
        const r = await api(sessionId, `/api/jobs-apply/extension/file?kind=${item.file}`);
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
      if (type === "checkbox" || type === "password" || type === "otp" || type === "combobox") return { fieldId: item.fieldId, ok: false, error: "rejected" };
      if (type === "select" && ![...el.options].some((o) => o.value === item.value)) return { fieldId: item.fieldId, ok: false, error: "rejected" };
      setNative(el, item.value);
      return { fieldId: item.fieldId, ok: el.value === item.value, ...(el.value === item.value ? {} : { error: "rejected" }) };
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

  const state = { offDestination: false, sessionId: null, view: null, busy: false, minimized: false, submitted: false, detected: false, lastSig: "", lastUrl: location.href, stopped: false };

  function sigOf(form) {
    return JSON.stringify([form.step, form.signals, form.fields.map((f) => [f.id, f.type, f.hasValue, f.options?.length])]);
  }

  async function inspect(force = false) {
    if (!state.sessionId || state.stopped || state.offDestination) return;
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
    if (r.data.plan?.allowed && r.data.plan.fills.length) await applyPlan(r.data.plan);
    render();
  }

  async function applyPlan(plan) {
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
    if (f === "DOMAIN_CHANGED") return `<div class="box bad"><strong>Wonder paused this application.</strong><div>The destination changed unexpectedly to <strong>${esc(location.hostname)}</strong>.</div><div class="row"><button class="pill ghost" id="approve">Continue here</button><button class="pill ghost" id="stop2">Stop</button></div></div>`;
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
      s.innerHTML = `<div class="card"><div class="row" style="margin:0"><h2>WonderJobs</h2><button class="close" id="x" aria-label="Close">&times;</button></div><p class="muted">${revoked ? "This application isn't connected any more. Reopen it from WonderJobs to continue." : "WonderJobs didn't answer. Your progress is saved — try again."}</p>${revoked ? "" : `<div class="row"><span></span><button class="pill" id="retry">Try again</button></div>`}</div>`;
      shadow().getElementById("x")?.addEventListener("click", () => (s.innerHTML = ""));
      shadow().getElementById("retry")?.addEventListener("click", () => inspect(true));
      return;
    }
    const v = state.view;
    if (!v) return;
    if (state.minimized) {
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
    s.innerHTML = `
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
          <span class="muted">Wonder never submits. Review, then press the employer's submit button yourself.</span>
          ${v.stopped ? "" : `<button class="pill ghost" id="stop">Stop</button>`}
        </div>
      </div>`;
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

  /* ------------------------------------------------------- legacy fallback */

  const LEGACY = {
    firstName: /\bfirst[\s_-]*name\b|\bgiven[\s_-]*name\b/i,
    lastName: /\blast[\s_-]*name\b|\bsurname\b|\bfamily[\s_-]*name\b/i,
    fullName: /\b(full[\s_-]*name|your[\s_-]*name|^name\*?$)/i,
    email: /e-?mail/i,
    phone: /\b(phone|mobile|telephone)\b/i,
    linkedin: /linked\s?in/i,
  };
  const REJECT = /company|employer|referr|school|university|manager|recruiter|emergency|preferred|sponsor/i;

  function legacyFind(re, file) {
    return readFormEls().find((el) => (file ? el.type === "file" && re.test(labelOf(el) + " " + el.name) : el.type !== "file" && re.test(labelOf(el)) && !REJECT.test(labelOf(el))));
  }
  function readFormEls() {
    return [...document.querySelectorAll("input, textarea")].filter((el) => visible(el) && !["submit", "button", "checkbox", "radio", "password", "hidden"].includes(el.type));
  }

  async function legacyFill() {
    const [profileReply, applicationReply] = await Promise.all([ask("profile"), ask("application", { url: location.href })]);
    if (profileReply?.error === "not_connected") return { error: "not_connected" };
    const profile = profileReply?.data;
    if (!profile) return { error: "request_failed" };
    const application = applicationReply?.data?.matched ? applicationReply.data : null;
    const filled = [];
    const put = (el, value, label) => {
      if (el && value && !(el.value && el.value.trim())) {
        setNative(el, value);
        filled.push(label);
      }
    };
    const first = legacyFind(LEGACY.firstName);
    const last = legacyFind(LEGACY.lastName);
    if (first && last) {
      put(first, profile.firstName, "First name");
      put(last, profile.lastName, "Last name");
    } else put(legacyFind(LEGACY.fullName), profile.fullName, "Name");
    put(legacyFind(LEGACY.email), profile.email, "Email");
    put(legacyFind(LEGACY.phone), profile.phone, "Phone");
    put(legacyFind(LEGACY.linkedin), profile.linkedinUrl, "LinkedIn");
    const resumeInput = legacyFind(/resume|\bcv\b|curriculum/i, true);
    if (resumeInput && application?.resume) {
      const dt = new DataTransfer();
      dt.items.add(b64ToFile(application.resume.base64, application.resume.filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
      resumeInput.files = dt.files;
      resumeInput.dispatchEvent(new Event("change", { bubbles: true }));
      filled.push(`Résumé (${application.resume.filename})`);
    }
    const cover = [...document.querySelectorAll("textarea")].find((el) => visible(el) && /cover\s?letter/i.test(labelOf(el)));
    if (cover && application?.coverLetter?.text) put(cover, application.coverLetter.text, "Cover letter");
    return { filled, missing: profile.missing ?? [], application };
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
      s.innerHTML = `<div class="card"><div class="row" style="margin:0"><h2>${r.filled.length ? `Filled ${r.filled.length} field${r.filled.length === 1 ? "" : "s"}` : "Nothing to fill"}</h2><button class="close" id="x">&times;</button></div><p class="muted">${r.application ? `Using your prepared materials for <strong>${esc(r.application.jobTitle || "this role")}</strong>.` : "WonderJobs has no application for this posting, so only your profile was used."}</p>${r.filled.length ? `<ul class="ok">${r.filled.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}${r.missing.length ? `<p class="muted">Fill these yourself — your Career Profile doesn't hold them: ${r.missing.map(esc).join(", ")}.</p>` : ""}<p class="muted">Nothing is submitted for you. For step-by-step help, use Apply with Wonder from the job in WonderJobs.</p></div>`;
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
