// encrypts tools/members.json with the passphrase in tools/.members-pass into
// assets/members.enc.json. run: node tools/seal-members.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
const root = new URL("..", import.meta.url);
const pass = readFileSync(new URL("tools/.members-pass", root), "utf8").trim();
const plain = readFileSync(new URL("tools/members.json", root));
const iter = 310000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
  base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
const b64 = (u) => Buffer.from(u).toString("base64");
writeFileSync(new URL("assets/members.enc.json", root), JSON.stringify({ iter, salt: b64(salt), iv: b64(iv), data: b64(data) }));
console.log("sealed", plain.length, "bytes");
