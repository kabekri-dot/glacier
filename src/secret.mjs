// Secret notes' encryption (#109, ADR 0012). A key is derived from the Glacier
// passcode with PBKDF2-SHA-256 and a random salt; the note's text is
// encrypted with AES-GCM. Web Crypto works the same in the browser and in
// Node, so this needs nothing plugged in. The passcode itself is never kept:
// a short known text encrypted with the key (the check) tells whether a
// typed passcode is right.

const ROUNDS = 310000;
const CHECK_TEXT = "glacier passcode";
const FENCE = "```glacier-secret";

const subtle = () => globalThis.crypto.subtle;

function toBase64(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

async function deriveKey(passcode, salt) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations: ROUNDS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// The text encrypted, as the 12-byte iv followed by the ciphertext, in base64.
async function encrypt(key, text) {
  const iv = randomBytes(12);
  const data = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  const both = new Uint8Array(iv.length + data.length);
  both.set(iv);
  both.set(data, iv.length);
  return toBase64(both);
}

// The text back, or null when the key doesn't open it.
async function decrypt(key, sealed) {
  try {
    const bytes = fromBase64(sealed);
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

// A new passcode: its record `{ salt, check }`, kept in storage and in every
// secret file, and its key, kept only in memory.
export async function newPasscode(passcode) {
  const salt = toBase64(randomBytes(16));
  const key = await deriveKey(passcode, salt);
  return { record: { salt, check: await encrypt(key, CHECK_TEXT) }, key };
}

// The key for a typed passcode, or null when the record's check says it is
// the wrong one.
export async function openPasscode(passcode, record) {
  const key = await deriveKey(passcode, record.salt);
  return (await decrypt(key, record.check)) === CHECK_TEXT ? key : null;
}

// A secret note's body: one fenced block with the passcode's record and the
// encrypted text.
export async function sealText(key, record, text) {
  return `${FENCE}\nsalt: ${record.salt}\ncheck: ${record.check}\ntext: ${await encrypt(key, text)}\n\`\`\`\n`;
}

// What a secret note's body holds: `{ record, text }` with the text still
// encrypted, or null when the body is no such block.
export function readSealed(body) {
  const lines = (body ?? "").trim().split("\n");
  if (lines[0] !== FENCE || lines.at(-1) !== "```") return null;
  const fields = {};
  for (const line of lines.slice(1, -1)) {
    const at = line.indexOf(": ");
    if (at > 0) fields[line.slice(0, at)] = line.slice(at + 2).trim();
  }
  if (!fields.salt || !fields.check || !fields.text) return null;
  return { record: { salt: fields.salt, check: fields.check }, text: fields.text };
}

// The plain text of a sealed body, or null when the key doesn't open it.
export function openSealed(key, sealed) {
  return decrypt(key, sealed.text);
}
