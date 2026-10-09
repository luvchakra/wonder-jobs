import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyContactRecipients, parseEmailList, smtpConfig } from "./notify";

describe("parseEmailList", () => {
  it("returns an empty list for unset or blank input", () => {
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
    expect(parseEmailList("   ")).toEqual([]);
  });

  it("splits, trims and lower-cases a comma-separated list", () => {
    expect(parseEmailList(" Ops@Example.com , founder@example.com ,hello@example.co.in ")).toEqual(["ops@example.com", "founder@example.com", "hello@example.co.in"]);
  });

  it("drops invalid entries instead of throwing", () => {
    expect(parseEmailList("ops@example.com, not-an-email, ,@example.com,x@y")).toEqual(["ops@example.com"]);
  });

  it("dedupes case-insensitively", () => {
    expect(parseEmailList("ops@example.com, OPS@example.com, ops@example.com")).toEqual(["ops@example.com"]);
  });
});

/** A minimal SMTP server on loopback that records the login and the message it is handed. */
function smtpSink(opts: { rejectAuth?: boolean } = {}) {
  const seen = { auth: "", mailFrom: "", rcpt: [] as string[], data: "" };
  const server = net.createServer((sock) => {
    let buf = "";
    let inData = false;
    let authLogin: "user" | "pass" | null = null;
    let user = "";
    sock.write("220 sink ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString();
      let i: number;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            sock.write("250 queued\r\n");
          } else seen.data += line + "\n";
          continue;
        }
        if (authLogin === "user") {
          user = Buffer.from(line, "base64").toString();
          authLogin = "pass";
          sock.write("334 UGFzc3dvcmQ6\r\n");
          continue;
        }
        if (authLogin === "pass") {
          authLogin = null;
          seen.auth = `${user}:${Buffer.from(line, "base64").toString()}`;
          sock.write(opts.rejectAuth ? "535 Authentication failed\r\n" : "235 ok\r\n");
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO")) sock.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (cmd.startsWith("AUTH PLAIN")) {
          const [, u, p] = Buffer.from(line.split(" ")[2] ?? "", "base64").toString().split("\0");
          seen.auth = `${u}:${p}`;
          sock.write(opts.rejectAuth ? "535 Authentication failed\r\n" : "235 ok\r\n");
        } else if (cmd.startsWith("AUTH LOGIN")) {
          authLogin = "user";
          sock.write("334 VXNlcm5hbWU6\r\n");
        } else if (cmd.startsWith("MAIL FROM")) {
          seen.mailFrom = line;
          sock.write("250 ok\r\n");
        } else if (cmd.startsWith("RCPT TO")) {
          seen.rcpt.push(line);
          sock.write("250 ok\r\n");
        } else if (cmd === "DATA") {
          inData = true;
          sock.write("354 go\r\n");
        } else if (cmd === "QUIT") {
          sock.write("221 bye\r\n");
          sock.end();
        } else sock.write("250 ok\r\n");
      }
    });
  });
  return new Promise<{ port: number; seen: typeof seen; close: () => void }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as net.AddressInfo).port, seen, close: () => server.close() })),
  );
}

const payload = { name: "Kunal", email: "visitor@example.com", topic: "general", message: "test message from the landing page", page: "/" };

describe("contact notifications over the operator's own mailbox (SMTP)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads SMTP settings, defaulting to implicit TLS on 465 and sending as the mailbox itself", () => {
    expect(smtpConfig({ SMTP_HOST: "smtpout.secureserver.net", SMTP_USER: "connect@wonderapps.biz", SMTP_PASS: "x" })).toEqual({ host: "smtpout.secureserver.net", port: 465, user: "connect@wonderapps.biz", pass: "x", from: "WonderJobs <connect@wonderapps.biz>" });
    expect(smtpConfig({ SMTP_HOST: "h", SMTP_USER: "u@x.co", SMTP_PASS: "x", SMTP_PORT: "587", CONTACT_FROM_EMAIL: "Team <u@x.co>" })).toMatchObject({ port: 587, from: "Team <u@x.co>" });
    expect(smtpConfig({ SMTP_HOST: "h", SMTP_USER: "u@x.co" })).toBeNull();
    expect(smtpConfig({ SMTP_HOST: "h", SMTP_USER: "u@x.co", SMTP_PASS: "x", SMTP_PORT: "nope" })).toBeNull();
  });

  it("doesn't pretend to deliver without a mailbox, and does nothing without recipients", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await notifyContactRecipients(payload, { CONTACT_NOTIFY_EMAILS: "ops@example.com" })).toEqual({ attempted: true, sent: false, recipients: ["ops@example.com"], reason: "no email provider configured" });
    expect(await notifyContactRecipients(payload, { SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p" })).toEqual({ attempted: false, sent: false, recipients: [] });
  });

  it("signs in as the mailbox and sends the message to every recipient, From WonderJobs, Reply-To the visitor", async () => {
    const sink = await smtpSink();
    try {
      const r = await notifyContactRecipients(payload, { CONTACT_NOTIFY_EMAILS: "ops@example.com, founder@example.com", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(sink.port), SMTP_USER: "connect@wonderapps.biz", SMTP_PASS: "mailbox-pass" });
      expect(r).toEqual({ attempted: true, sent: true, recipients: ["ops@example.com", "founder@example.com"] });
      expect(sink.seen.auth).toBe("connect@wonderapps.biz:mailbox-pass");
      expect(sink.seen.mailFrom).toContain("<connect@wonderapps.biz>");
      expect(sink.seen.rcpt.join(" ")).toContain("<ops@example.com>");
      expect(sink.seen.rcpt.join(" ")).toContain("<founder@example.com>");
      expect(sink.seen.data).toMatch(/^From: WonderJobs <connect@wonderapps\.biz>$/m);
      expect(sink.seen.data).toMatch(/^Reply-To: visitor@example\.com$/m);
      expect(sink.seen.data).toContain("test message from the landing page");
      // Plain text plus the branded HTML (server/email/layout.ts).
      expect(sink.seen.data).toMatch(/^Content-Type: text\/plain/m);
      expect(sink.seen.data).toMatch(/^Content-Type: text\/html/m);
    } finally {
      sink.close();
    }
  });

  it("reports a rejected login as not sent, never throws, and never logs the password", async () => {
    const sink = await smtpSink({ rejectAuth: true });
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errors.push(a.map(String).join(" ")));
    try {
      const r = await notifyContactRecipients(payload, { CONTACT_NOTIFY_EMAILS: "ops@example.com", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(sink.port), SMTP_USER: "connect@wonderapps.biz", SMTP_PASS: "secret-pass-123" });
      expect(r).toMatchObject({ attempted: true, sent: false, reason: "send failed" });
      expect(errors.join(" ")).toContain("535");
      expect(errors.join(" ")).not.toContain("secret-pass-123");
    } finally {
      sink.close();
    }
  });
});
