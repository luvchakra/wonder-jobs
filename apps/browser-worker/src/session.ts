/**
 * One cloud session: an isolated browser context (its own cookies and storage, discarded when the
 * session ends) on the employer's page, streamed to the candidate as JPEG frames over a WebSocket,
 * driven only by what the candidate taps and types, with the WonderJobs helper script in every page.
 *
 * Wonder's part — reading the form and filling what the candidate's own profile can fill — happens
 * inside the helper script, gated by the app on every call. Nothing in this file clicks or submits; a
 * searchable dropdown the helper asks about is opened and chosen in picker.ts (WJ-312).
 * With no viewer attached nothing is streamed: that is a background fill (WJ-311), driven from WonderJobs.
 */
import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, CDPSession, Frame, Page } from "playwright";
import type { WebSocket } from "ws";
import { hostMatches, jobsApplyCall } from "./appClient.js";
import type { Config } from "./config.js";
import { pageScript } from "./helperScript.js";
import { parseInput, relayInput } from "./input.js";
import { comboOptions, comboPick } from "./picker.js";
import { followListing } from "./listing.js";
import { portalSignIn, type SignInMode, type SignInResult } from "./portal.js";

export interface SessionInit {
  /** The WonderJobs Apply with Wonder session this browser belongs to. */
  sessionId: string;
  tenantId: string;
  url: string;
  /** The session's helper bearer token — used only for the helper routes, only from this session. */
  helperToken: string;
  /** Destination, related and approved hosts: pages elsewhere are reported as off-destination, never read. */
  domains: string[];
  /** A job board's listing: its own Apply link is followed to the employer first (listing.ts, WJ-315). */
  followListing?: boolean;
}

type ServerMessage = { t: "frame"; data: string; w: number; h: number } | { t: "status"; url: string; host: string } | { t: "ended"; reason: string };

export class CloudSession {
  readonly id = randomUUID();
  readonly createdAt = Date.now();
  lastActivity = Date.now();
  ended = false;
  private clients = new Set<WebSocket>();
  private page!: Page;
  private cdp: CDPSession | null = null;
  private domains: Set<string>;
  /** Following a listing's Apply link: the helper stays out of every page until the employer's page is known. */
  private following = false;

  private constructor(
    readonly init: SessionInit,
    private readonly context: BrowserContext,
    private readonly config: Config,
  ) {
    this.domains = new Set(init.domains.map((d) => d.toLowerCase()).filter(Boolean));
  }

  static async open(browser: Browser, init: SessionInit, config: Config): Promise<CloudSession> {
    const context = await browser.newContext({ viewport: config.viewport, deviceScaleFactor: 1, locale: "en-IN", acceptDownloads: false });
    const s = new CloudSession(init, context, config);
    await context.exposeBinding("__wonderAsk", (source: { frame: Frame }, raw: string) => s.ask(raw, source.frame));
    await context.addInitScript(pageScript());
    s.page = await context.newPage();
    s.wire(s.page);
    // A sign-in or an ATS that opens the form in a new tab: the stream follows the newest page.
    context.on("page", (p) => void s.use(p));
    s.following = !!init.followListing;
    const opened = s.page.goto(init.url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    if (init.followListing) void opened.then(() => s.followListingLink());
    return s;
  }

  get clientCount() {
    return this.clients.size;
  }

  /** After a stop, "Continue" rotates the session's helper token; the browser stays, the token moves on. */
  updateToken(token: string) {
    this.init.helperToken = token;
  }

  /* ----------------------------------------------------------- helper line */

  /** Open the listing's Apply link, tell WonderJobs where it led, then let the helper start on that page. */
  private async followListingLink(): Promise<void> {
    try {
      const followed = await followListing(this.page).catch((e: unknown) => ({ url: null, note: `follow failed: ${e instanceof Error ? e.message.slice(0, 120) : "error"}` }));
      const landed = followed.url ?? this.page.url();
      try {
        this.domains.add(new URL(landed).hostname.toLowerCase());
      } catch {
        /* about:blank */
      }
      await jobsApplyCall(this.config.appOrigin, this.init.helperToken, "/api/jobs-apply/extension/events", "POST", { events: [{ type: "LISTING_FOLLOWED", url: landed, ...(followed.note ? { note: followed.note } : {}) }] });
    } finally {
      this.following = false;
      await this.deliver({ type: "jobsApplyPaired", sessionId: this.init.sessionId });
    }
  }

  private onDestination(url: unknown): boolean {
    if (!this.domains.size) return true;
    try {
      const host = new URL(String(url)).hostname.toLowerCase();
      return [...this.domains].some((d) => hostMatches(host, d));
    } catch {
      return false;
    }
  }

  /** `chrome.runtime.sendMessage` from the helper script, routed like the extension's background script would. */
  private async ask(raw: string, frame?: Frame): Promise<string | null> {
    // The helper working on the page is activity: a background fill nobody watches (WJ-311) isn't idle.
    this.lastActivity = Date.now();
    let m: { type?: string; payload?: Record<string, unknown> };
    try {
      m = JSON.parse(raw);
    } catch {
      return null;
    }
    if (m.type === "jobsApplyFor") {
      // A third-party frame inside the employer's page (a file picker, a tracker, a bot check) isn't the
      // application and never speaks for it: leaving it out keeps it from pausing the fill as "elsewhere".
      const offSite = !this.onDestination(m.payload?.url);
      if (this.following || (offSite && frame && frame.parentFrame())) return JSON.stringify({ sessionId: null });
      return JSON.stringify({ sessionId: this.init.sessionId, offDestination: offSite });
    }
    if (m.type === "jobsApplyCall") {
      const p = m.payload ?? {};
      const r = await jobsApplyCall(this.config.appOrigin, this.init.helperToken, p.path, typeof p.method === "string" ? p.method : "GET", p.body);
      if ("approvedDomains" in r && r.approvedDomains) for (const d of r.approvedDomains) this.domains.add(d.toLowerCase());
      return JSON.stringify(r);
    }
    // A searchable dropdown the helper can't open itself (picker.ts): only on the application's own site.
    if ((m.type === "comboOptions" || m.type === "comboPick") && frame && this.onDestination(frame.url())) {
      const mark = String(m.payload?.mark ?? "");
      try {
        if (m.type === "comboOptions") return JSON.stringify({ options: await comboOptions(frame, mark) });
        return JSON.stringify(await comboPick(frame, mark, String(m.payload?.value ?? "")));
      } catch {
        return JSON.stringify(m.type === "comboOptions" ? { options: [] } : { ok: false });
      }
    }
    // The legacy "Fill with WonderJobs" button has no place here: every cloud page belongs to a session.
    if (m.type === "profile" || m.type === "application") return JSON.stringify({ error: "not_connected" });
    return null;
  }

  /** Sign in (or create the account) on the portal page this session is on — only on the application's own site. */
  async signIn(mode: SignInMode, email: string, password: string): Promise<SignInResult> {
    if (this.ended) return { result: "failed", message: "The cloud browser closed." };
    if (!this.onDestination(this.page.url())) return { result: "no_form", message: "This page isn't the application's site." };
    this.lastActivity = Date.now();
    const r = await portalSignIn(this.page, mode, email, password).catch(() => ({ result: "failed" as const, message: "The sign-in didn't go through." }));
    // The helper reads the page it lands on (the application form, or a verification notice).
    await this.deliver({ type: "jobsApplyPaired", sessionId: this.init.sessionId });
    return r;
  }

  /** A message to the helper in every frame: `fillNow` (the candidate chose Fill in the app) or `jobsApplyPaired` (continue after a stop). */
  async deliver(message: Record<string, unknown>): Promise<void> {
    if (this.ended) return;
    this.lastActivity = Date.now();
    // Only the page and its frames on the application's own site: a third-party frame (a file picker, a tracker)
    // that heard "paired" would start a session of its own and report the application as elsewhere.
    const frames = this.page.frames().filter((f) => f === this.page.mainFrame() || this.onDestination(f.url()));
    await Promise.all(frames.map((f) => f.evaluate((m) => (window as unknown as { __wonderDeliver?: (m: unknown) => void }).__wonderDeliver?.(m), message).catch(() => undefined)));
  }

  /* ------------------------------------------------------------- stream */

  async attach(ws: WebSocket): Promise<void> {
    if (this.ended) {
      ws.close(1000, "ended");
      return;
    }
    this.clients.add(ws);
    this.lastActivity = Date.now();
    ws.on("message", (data) => void this.onClientMessage(data.toString()));
    ws.on("close", () => void this.detach(ws));
    ws.on("error", () => void this.detach(ws));
    this.sendStatus(ws);
    if (!this.cdp) await this.startCast().catch(() => undefined);
  }

  private async detach(ws: WebSocket) {
    this.clients.delete(ws);
    if (!this.clients.size) await this.stopCast();
  }

  private async onClientMessage(text: string) {
    if (this.ended) return;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    const msg = parseInput(raw, this.config.viewport);
    if (!msg) return;
    this.lastActivity = Date.now();
    await relayInput(this.page, msg).catch(() => undefined);
  }

  private send(ws: WebSocket, m: ServerMessage) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
  }
  private broadcast(m: ServerMessage) {
    for (const ws of this.clients) this.send(ws, m);
  }
  private sendStatus(ws?: WebSocket) {
    let url = "";
    try {
      url = this.page.url();
    } catch {
      /* page gone */
    }
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      /* about:blank */
    }
    const m: ServerMessage = { t: "status", url, host };
    if (ws) this.send(ws, m);
    else this.broadcast(m);
  }

  private wire(p: Page) {
    p.on("framenavigated", (f) => {
      if (f === p.mainFrame() && p === this.page) this.sendStatus();
    });
    p.on("close", () => {
      if (this.page !== p || this.ended) return;
      const left = this.context.pages();
      if (left.length) void this.use(left[left.length - 1]);
      else void this.end("page_closed");
    });
  }

  private async use(p: Page) {
    if (p === this.page || this.ended) return;
    await this.stopCast();
    this.page = p;
    this.wire(p);
    if (this.clients.size) await this.startCast().catch(() => undefined);
    this.sendStatus();
  }

  private async startCast() {
    const cdp = await this.context.newCDPSession(this.page);
    this.cdp = cdp;
    cdp.on("Page.screencastFrame", (ev: { data: string; sessionId: number; metadata: { deviceWidth: number; deviceHeight: number } }) => {
      this.broadcast({ t: "frame", data: ev.data, w: ev.metadata.deviceWidth, h: ev.metadata.deviceHeight });
      cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => undefined);
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: this.config.viewport.width, maxHeight: this.config.viewport.height, everyNthFrame: 1 });
  }

  private async stopCast() {
    const cdp = this.cdp;
    this.cdp = null;
    if (!cdp) return;
    await cdp.send("Page.stopScreencast").catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }

  /** Closes the browser context: cookies, storage and the page go with it. */
  async end(reason: string): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    await this.stopCast();
    for (const ws of this.clients) {
      this.send(ws, { t: "ended", reason });
      ws.close(1000, reason);
    }
    this.clients.clear();
    await this.context.close().catch(() => undefined);
  }
}
