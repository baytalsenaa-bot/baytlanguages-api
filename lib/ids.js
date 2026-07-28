// lib/ids.js — reference numbers & secure tokens
const crypto = require("crypto");

/** BL-REQ-2026-000128 style running request number. */
function makeRequestNumber(sequence) {
  const year = new Date().getFullYear();
  const padded = String(sequence).padStart(6, "0");
  return `BL-REQ-${year}-${padded}`;
}

/** BL-2026-000128 style document public reference. */
function makeDocumentReference(sequence) {
  const year = new Date().getFullYear();
  const padded = String(sequence).padStart(6, "0");
  return `BL-${year}-${padded}`;
}

/** Cryptographically random, unguessable verification token, e.g. "A7K9P4Q2XZ". */
function makeVerificationToken(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Random internal filename that reveals nothing about the original file. */
function makeStoredFilename(originalName) {
  const ext = (originalName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${crypto.randomUUID()}.${ext}`;
}

function sha256File(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Fast, deterministic hash used as an indexed lookup key for verification tokens.
 *  (Not bcrypt on purpose — tokens are already high-entropy random strings, and this
 *  needs to support a fast equality lookup by public_reference + token.) */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Splits a public verification code like "BL-2026-000128-A7K9P4"
 *  into { reference: "BL-2026-000128", token: "A7K9P4" }. */
function splitVerificationCode(code) {
  const parts = String(code).trim().split("-");
  const token = parts.pop();
  const reference = parts.join("-");
  return { reference, token };
}

module.exports = {
  makeRequestNumber,
  makeDocumentReference,
  makeVerificationToken,
  makeStoredFilename,
  sha256File,
  hashToken,
  splitVerificationCode,
};
