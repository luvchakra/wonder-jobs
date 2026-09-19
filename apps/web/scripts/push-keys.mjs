#!/usr/bin/env node
/**
 * Generates a VAPID key pair for Web Push and prints the two environment variables to set.
 *
 * Run once per deployment: `npm run push:keys`. Rotating the keys invalidates every existing
 * subscription — browsers tie a subscription to the public key it was created with — so candidates
 * would have to turn notifications on again. Keep the private key out of the repository.
 */
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const b64 = (s) => Buffer.from(s, "base64url");
const publicKey = Buffer.concat([Buffer.from([0x04]), b64(jwk.x), b64(jwk.y)]).toString("base64url");

console.log("Add these to your deployment's environment variables:\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log(`VAPID_SUBJECT=mailto:you@yourdomain.com\n`);
console.log("The public key is sent to browsers; the private key must stay on the server only.");
